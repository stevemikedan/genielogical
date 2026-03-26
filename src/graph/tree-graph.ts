import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { ParseResult } from '@/types/parse-result.ts';

/**
 * Core in-memory graph structure for genealogical data.
 *
 * Storage is three flat Maps (persons, edges, sources) plus derived
 * index maps that enable O(1) traversal lookups.  The graph is populated
 * via `loadFromParseResult()` — which clears all existing data first — and
 * thereafter provides read-only traversal helpers.
 */
export class TreeGraph {
  // ── Primary storage ──────────────────────────────────────────────
  persons: Map<string, Person> = new Map();
  edges: Map<string, Edge> = new Map();
  sources: Map<string, Source> = new Map();

  // ── Derived indices (rebuilt on load) ────────────────────────────
  /** Edges keyed by childId — "who are this person's parents?" */
  parentEdges: Map<string, Edge[]> = new Map();
  /** Edges keyed by parentId — "who are this person's children?" */
  childEdges: Map<string, Edge[]> = new Map();
  /** Spouse IDs for a given person, derived from shared parentage. */
  spouseMap: Map<string, string[]> = new Map();
  /** Edges grouped by the GEDCOM family xref they belong to. */
  familyIndex: Map<string, Edge[]> = new Map();

  // ── Loading ──────────────────────────────────────────────────────

  /**
   * Populate the graph from a GEDCOM parse result.
   * Clears all existing data before loading.
   */
  loadFromParseResult(result: ParseResult): void {
    this.clear();

    // Persons & sources come as Maps already.
    this.persons = new Map(result.persons);
    this.sources = new Map(result.sources);

    // Edges come as an array — index them.
    for (const edge of result.edges) {
      this.edges.set(edge.id, edge);
      this.indexEdge(edge);
    }

    this.buildSpouseMap();
  }

  // ── Person accessors ─────────────────────────────────────────────

  getPersonById(id: string): Person | undefined {
    return this.persons.get(id);
  }

  getEdgeById(id: string): Edge | undefined {
    return this.edges.get(id);
  }

  getSourceById(id: string): Source | undefined {
    return this.sources.get(id);
  }

  // ── Traversal ────────────────────────────────────────────────────

  /**
   * Return the parents of `personId`.
   * By default only primary edges (isPrimary === true) are followed.
   */
  getParents(personId: string): Person[] {
    const edges = this.parentEdges.get(personId);
    if (!edges) return [];

    const parents: Person[] = [];
    for (const edge of edges) {
      if (!edge.isPrimary) continue;
      const parent = this.persons.get(edge.parentId);
      if (parent) parents.push(parent);
    }
    return parents;
  }

  /** Return all children of `personId`. */
  getChildren(personId: string): Person[] {
    const edges = this.childEdges.get(personId);
    if (!edges) return [];

    const children: Person[] = [];
    for (const edge of edges) {
      const child = this.persons.get(edge.childId);
      if (child) children.push(child);
    }
    return children;
  }

  /**
   * Siblings: persons who share at least one parent with `personId`.
   * The person themselves is excluded and duplicates are removed.
   */
  getSiblings(personId: string): Person[] {
    const parents = this.getParents(personId);
    const seen = new Set<string>();
    const siblings: Person[] = [];

    for (const parent of parents) {
      for (const child of this.getChildren(parent.id)) {
        if (child.id !== personId && !seen.has(child.id)) {
          seen.add(child.id);
          siblings.push(child);
        }
      }
    }
    return siblings;
  }

  /** Return the spouses of `personId`. */
  getSpouses(personId: string): Person[] {
    const ids = this.spouseMap.get(personId);
    if (!ids) return [];

    const spouses: Person[] = [];
    for (const id of ids) {
      const person = this.persons.get(id);
      if (person) spouses.push(person);
    }
    return spouses;
  }

  /**
   * BFS upward through primary parent edges.
   * Returns a flat (deduplicated) array of all ancestors.
   */
  getAncestors(personId: string, maxGenerations?: number): Person[] {
    const ancestors: Person[] = [];
    const visited = new Set<string>();
    let frontier: string[] = [personId];
    visited.add(personId);

    let generation = 0;
    while (frontier.length > 0) {
      if (maxGenerations !== undefined && generation >= maxGenerations) break;
      const nextFrontier: string[] = [];

      for (const id of frontier) {
        for (const parent of this.getParents(id)) {
          if (!visited.has(parent.id)) {
            visited.add(parent.id);
            ancestors.push(parent);
            nextFrontier.push(parent.id);
          }
        }
      }

      frontier = nextFrontier;
      generation++;
    }
    return ancestors;
  }

  /**
   * BFS downward through child edges.
   * Returns a flat (deduplicated) array of all descendants.
   */
  getDescendants(personId: string, maxGenerations?: number): Person[] {
    const descendants: Person[] = [];
    const visited = new Set<string>();
    let frontier: string[] = [personId];
    visited.add(personId);

    let generation = 0;
    while (frontier.length > 0) {
      if (maxGenerations !== undefined && generation >= maxGenerations) break;
      const nextFrontier: string[] = [];

      for (const id of frontier) {
        for (const child of this.getChildren(id)) {
          if (!visited.has(child.id)) {
            visited.add(child.id);
            descendants.push(child);
            nextFrontier.push(child.id);
          }
        }
      }

      frontier = nextFrontier;
      generation++;
    }
    return descendants;
  }

  /** Persons with no parent edges (or an empty parent-edge list). */
  getRoots(): Person[] {
    const roots: Person[] = [];
    for (const person of this.persons.values()) {
      const edges = this.parentEdges.get(person.id);
      if (!edges || edges.length === 0) {
        roots.push(person);
      }
    }
    return roots;
  }

  /** Persons with no child edges. */
  getLeaves(): Person[] {
    const leaves: Person[] = [];
    for (const person of this.persons.values()) {
      const edges = this.childEdges.get(person.id);
      if (!edges || edges.length === 0) {
        leaves.push(person);
      }
    }
    return leaves;
  }

  /** All edges where `personId` appears as either parent or child. */
  getEdgesForPerson(personId: string): Edge[] {
    const result: Edge[] = [];
    const parentE = this.parentEdges.get(personId);
    if (parentE) result.push(...parentE);
    const childE = this.childEdges.get(personId);
    if (childE) result.push(...childE);
    return result;
  }

  /**
   * Maximum depth from any root to any leaf.
   * Uses simultaneous BFS from all roots.
   * Returns 0 for an empty graph, 1 for a single person, etc.
   */
  getGenerationDepth(): number {
    if (this.persons.size === 0) return 0;

    const roots = this.getRoots();
    if (roots.length === 0) {
      // Every person has a parent — graph is cyclic or degenerate.
      // Return 0 rather than blow up.
      return 0;
    }

    const visited = new Set<string>();
    let frontier: string[] = [];
    for (const root of roots) {
      visited.add(root.id);
      frontier.push(root.id);
    }

    let depth = 1; // roots themselves are generation 1
    while (frontier.length > 0) {
      const nextFrontier: string[] = [];
      for (const id of frontier) {
        const edges = this.childEdges.get(id);
        if (!edges) continue;
        for (const edge of edges) {
          if (!visited.has(edge.childId)) {
            visited.add(edge.childId);
            nextFrontier.push(edge.childId);
          }
        }
      }
      if (nextFrontier.length > 0) depth++;
      frontier = nextFrontier;
    }

    return depth;
  }

  // ── Mutation methods ────────────────────────────────────────────

  /** Add a person to the graph. */
  addPerson(person: Person): void {
    this.persons.set(person.id, person);
  }

  /** Update fields on an existing person. */
  updatePerson(id: string, updates: Partial<Omit<Person, 'id'>>): void {
    const person = this.persons.get(id);
    if (!person) return;
    Object.assign(person, updates, { updatedAt: new Date() });
  }

  /**
   * Remove a person and cascade: removes all edges involving this person,
   * detaches sources, and rebuilds spouse map.
   */
  removePerson(id: string): void {
    if (!this.persons.has(id)) return;

    // Collect edges to remove
    const edgesToRemove: string[] = [];
    const parentE = this.parentEdges.get(id);
    if (parentE) {
      for (const e of parentE) edgesToRemove.push(e.id);
    }
    const childE = this.childEdges.get(id);
    if (childE) {
      for (const e of childE) edgesToRemove.push(e.id);
    }

    // Remove edges (this handles un-indexing)
    for (const eid of edgesToRemove) {
      this.removeEdge(eid);
    }

    // Detach sources that reference this person
    for (const source of this.sources.values()) {
      source.attachedToPersonIds = source.attachedToPersonIds.filter(pid => pid !== id);
    }

    this.persons.delete(id);
  }

  /** Add an edge to the graph and rebuild indices. */
  addEdge(edge: Edge): void {
    this.edges.set(edge.id, edge);
    this.indexEdge(edge);
    this.buildSpouseMap();
  }

  /** Remove an edge and rebuild indices. */
  removeEdge(id: string): void {
    const edge = this.edges.get(id);
    if (!edge) return;

    this.edges.delete(id);
    this.unindexEdge(edge);
    this.buildSpouseMap();
  }

  /** Full rebuild of all derived index maps from the edges map. */
  rebuildIndices(): void {
    this.parentEdges.clear();
    this.childEdges.clear();
    this.familyIndex.clear();
    this.spouseMap.clear();

    for (const edge of this.edges.values()) {
      this.indexEdge(edge);
    }
    this.buildSpouseMap();
  }

  // ── Private helpers ──────────────────────────────────────────────

  private clear(): void {
    this.persons.clear();
    this.edges.clear();
    this.sources.clear();
    this.parentEdges.clear();
    this.childEdges.clear();
    this.spouseMap.clear();
    this.familyIndex.clear();
  }

  /** Add a single edge to all index maps. */
  private indexEdge(edge: Edge): void {
    // parentEdges: keyed by childId
    const pEdges = this.parentEdges.get(edge.childId);
    if (pEdges) {
      pEdges.push(edge);
    } else {
      this.parentEdges.set(edge.childId, [edge]);
    }

    // childEdges: keyed by parentId
    const cEdges = this.childEdges.get(edge.parentId);
    if (cEdges) {
      cEdges.push(edge);
    } else {
      this.childEdges.set(edge.parentId, [edge]);
    }

    // familyIndex: keyed by familyGedcomXref
    if (edge.familyGedcomXref) {
      const fEdges = this.familyIndex.get(edge.familyGedcomXref);
      if (fEdges) {
        fEdges.push(edge);
      } else {
        this.familyIndex.set(edge.familyGedcomXref, [edge]);
      }
    }
  }

  /** Remove a single edge from all index maps. */
  private unindexEdge(edge: Edge): void {
    // parentEdges: keyed by childId
    const pEdges = this.parentEdges.get(edge.childId);
    if (pEdges) {
      const filtered = pEdges.filter(e => e.id !== edge.id);
      if (filtered.length > 0) {
        this.parentEdges.set(edge.childId, filtered);
      } else {
        this.parentEdges.delete(edge.childId);
      }
    }

    // childEdges: keyed by parentId
    const cEdges = this.childEdges.get(edge.parentId);
    if (cEdges) {
      const filtered = cEdges.filter(e => e.id !== edge.id);
      if (filtered.length > 0) {
        this.childEdges.set(edge.parentId, filtered);
      } else {
        this.childEdges.delete(edge.parentId);
      }
    }

    // familyIndex: keyed by familyGedcomXref
    if (edge.familyGedcomXref) {
      const fEdges = this.familyIndex.get(edge.familyGedcomXref);
      if (fEdges) {
        const filtered = fEdges.filter(e => e.id !== edge.id);
        if (filtered.length > 0) {
          this.familyIndex.set(edge.familyGedcomXref, filtered);
        } else {
          this.familyIndex.delete(edge.familyGedcomXref);
        }
      }
    }
  }

  /**
   * Build the spouse map.
   * Two persons are spouses if they are both parents of the same child
   * (i.e. there exist edges with the same childId pointing to each).
   */
  private buildSpouseMap(): void {
    this.spouseMap.clear();

    // For each child, collect the set of parent IDs.
    const childToParents = new Map<string, Set<string>>();

    for (const edge of this.edges.values()) {
      const parentSet = childToParents.get(edge.childId);
      if (parentSet) {
        parentSet.add(edge.parentId);
      } else {
        childToParents.set(edge.childId, new Set([edge.parentId]));
      }
    }

    // For each child with 2+ parents, each pair of parents are spouses.
    const spouseSetMap = new Map<string, Set<string>>();

    for (const parentIds of childToParents.values()) {
      if (parentIds.size < 2) continue;
      const arr = [...parentIds];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i];
          const b = arr[j];
          if (!spouseSetMap.has(a)) spouseSetMap.set(a, new Set());
          if (!spouseSetMap.has(b)) spouseSetMap.set(b, new Set());
          spouseSetMap.get(a)!.add(b);
          spouseSetMap.get(b)!.add(a);
        }
      }
    }

    // Convert sets to arrays.
    for (const [personId, spouseSet] of spouseSetMap) {
      this.spouseMap.set(personId, [...spouseSet]);
    }
  }
}
