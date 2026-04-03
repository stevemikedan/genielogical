import { describe, it, expect, beforeEach } from 'vitest';
import { TreeGraph } from './tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { ParseResult } from '@/types/parse-result.ts';

// ── Test helpers ─────────────────────────────────────────────────────

function makePerson(id: string, name: string): Person {
  return {
    id,
    name: {
      full: name,
      given: name.split(' ')[0],
      middle: '',
      surname: name.split(' ').slice(1).join(' '),
      maidenName: '',
      prefix: '',
      suffix: '',
      raw: name,
    },
    alternateNames: [],
    sex: 'U',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 4,
    confidenceReason: 'test',
    status: 'tentative',
    sourceIds: [],
    flagIds: [],
    researchStepIds: [],
    conjectureIds: [],
    gedcomXref: null,
    familyIdAsSpouse: [],
    familyIdAsChild: [],
    identityHash: '',
    privacyLevel: 'public',
    externalIds: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEdge(
  id: string,
  parentId: string,
  childId: string,
  options?: Partial<Edge>,
): Edge {
  return {
    id,
    parentId,
    childId,
    relationshipType: 'biological',
    legitimacy: 'legitimate',
    marriage: null,
    confidenceTier: 4,
    confidenceReason: 'test',
    parallelGroupId: null,
    isPrimary: true,
    pathLabel: null,
    sourceIds: [],
    flagIds: [],
    familyGedcomXref: null,
    assertedBy: 'local_user',
    assertedAt: new Date(),
    createdAt: new Date(),
    ...options,
  };
}

function makeParseResult(
  persons: Person[],
  edges: Edge[],
  sources: Source[] = [],
): ParseResult {
  const personMap = new Map<string, Person>();
  for (const p of persons) personMap.set(p.id, p);

  const sourceMap = new Map<string, Source>();
  for (const s of sources) sourceMap.set(s.id, s);

  return {
    persons: personMap,
    edges,
    sources: sourceMap,
    families: [],
    stats: {
      individualCount: persons.length,
      familyCount: 0,
      sourceCount: sources.length,
      edgeCount: edges.length,
      generationCount: 0,
      parseTimeMs: 0,
      gedcomVersion: null,
      charset: null,
      software: null,
      warningCount: 0,
      errorCount: 0,
    },
    errors: [],
    warnings: [],
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('TreeGraph', () => {
  let graph: TreeGraph;
  let grandparent: Person;
  let parent: Person;
  let child: Person;
  let edgeGP: Edge;
  let edgePC: Edge;

  beforeEach(() => {
    graph = new TreeGraph();

    grandparent = makePerson('gp', 'Grand Parent');
    parent = makePerson('p', 'Parent Person');
    child = makePerson('c', 'Child Person');

    edgeGP = makeEdge('e1', 'gp', 'p');
    edgePC = makeEdge('e2', 'p', 'c');

    graph.loadFromParseResult(
      makeParseResult([grandparent, parent, child], [edgeGP, edgePC]),
    );
  });

  // ── loadFromParseResult ──────────────────────────────────────────

  describe('loadFromParseResult', () => {
    it('should populate persons, edges, and index maps', () => {
      expect(graph.persons.size).toBe(3);
      expect(graph.edges.size).toBe(2);
    });

    it('should clear existing data on re-load', () => {
      const newPerson = makePerson('x', 'Extra Person');
      graph.loadFromParseResult(makeParseResult([newPerson], []));

      expect(graph.persons.size).toBe(1);
      expect(graph.edges.size).toBe(0);
      expect(graph.getPersonById('gp')).toBeUndefined();
    });

    it('should build parentEdges index', () => {
      expect(graph.parentEdges.get('p')).toEqual([edgeGP]);
      expect(graph.parentEdges.get('c')).toEqual([edgePC]);
    });

    it('should build childEdges index', () => {
      expect(graph.childEdges.get('gp')).toEqual([edgeGP]);
      expect(graph.childEdges.get('p')).toEqual([edgePC]);
    });

    it('should load sources', () => {
      const source: Source = {
        id: 's1',
        origin: 'gedcom_import',
        sourceClass: 'tertiary',
        sourceType: 'other',
        title: 'Test Source',
        citation: '',
        notes: '',
        url: null,
        repository: null,
        provesWhat: [],
        attachedToPersonIds: [],
        attachedToEdgeIds: [],
        gedcomTag: null,
        sourceHash: '',
        addedAt: new Date(),
        addedBy: 'test',
      };

      graph.loadFromParseResult(
        makeParseResult([grandparent], [], [source]),
      );

      expect(graph.sources.size).toBe(1);
      expect(graph.getSourceById('s1')).toBeDefined();
    });
  });

  // ── getParents ───────────────────────────────────────────────────

  describe('getParents', () => {
    it('should return the parents of a person', () => {
      const parents = graph.getParents('p');
      expect(parents).toHaveLength(1);
      expect(parents[0].id).toBe('gp');
    });

    it('should return empty for a root person', () => {
      expect(graph.getParents('gp')).toHaveLength(0);
    });

    it('should return empty for a non-existent person', () => {
      expect(graph.getParents('nonexistent')).toHaveLength(0);
    });

    it('should only return parents from primary edges', () => {
      const altParent = makePerson('ap', 'Alt Parent');
      const altEdge = makeEdge('e3', 'ap', 'c', { isPrimary: false });

      graph.loadFromParseResult(
        makeParseResult(
          [grandparent, parent, child, altParent],
          [edgeGP, edgePC, altEdge],
        ),
      );

      const parents = graph.getParents('c');
      expect(parents).toHaveLength(1);
      expect(parents[0].id).toBe('p');
    });
  });

  // ── getChildren ──────────────────────────────────────────────────

  describe('getChildren', () => {
    it('should return the children of a person', () => {
      const children = graph.getChildren('p');
      expect(children).toHaveLength(1);
      expect(children[0].id).toBe('c');
    });

    it('should return empty for a leaf person', () => {
      expect(graph.getChildren('c')).toHaveLength(0);
    });

    it('should return empty for a non-existent person', () => {
      expect(graph.getChildren('nonexistent')).toHaveLength(0);
    });
  });

  // ── getSiblings ──────────────────────────────────────────────────

  describe('getSiblings', () => {
    it('should return siblings (children of same parents)', () => {
      const sibling = makePerson('s', 'Sibling Person');
      const sibEdge = makeEdge('e3', 'p', 's');

      graph.loadFromParseResult(
        makeParseResult(
          [grandparent, parent, child, sibling],
          [edgeGP, edgePC, sibEdge],
        ),
      );

      const siblings = graph.getSiblings('c');
      expect(siblings).toHaveLength(1);
      expect(siblings[0].id).toBe('s');
    });

    it('should return empty if person has no parents', () => {
      expect(graph.getSiblings('gp')).toHaveLength(0);
    });

    it('should not include the person themselves', () => {
      const siblings = graph.getSiblings('p');
      expect(siblings.every((s) => s.id !== 'p')).toBe(true);
    });

    it('should deduplicate siblings from multiple parents', () => {
      const mother = makePerson('m', 'Mother Person');
      const sibling = makePerson('s', 'Sibling Person');

      const edgeMC = makeEdge('e3', 'm', 'c');
      const edgeMS = makeEdge('e4', 'm', 's');
      const edgePS = makeEdge('e5', 'p', 's');

      graph.loadFromParseResult(
        makeParseResult(
          [grandparent, parent, child, mother, sibling],
          [edgeGP, edgePC, edgeMC, edgeMS, edgePS],
        ),
      );

      const siblings = graph.getSiblings('c');
      expect(siblings).toHaveLength(1);
      expect(siblings[0].id).toBe('s');
    });
  });

  // ── getSpouses ───────────────────────────────────────────────────

  describe('getSpouses', () => {
    it('should detect spouses from shared children', () => {
      const mother = makePerson('m', 'Mother Person');
      const edgeMC = makeEdge('e3', 'm', 'c');

      graph.loadFromParseResult(
        makeParseResult(
          [grandparent, parent, child, mother],
          [edgeGP, edgePC, edgeMC],
        ),
      );

      const spouses = graph.getSpouses('p');
      expect(spouses).toHaveLength(1);
      expect(spouses[0].id).toBe('m');

      // Symmetry: mother should also list parent as spouse.
      const motherSpouses = graph.getSpouses('m');
      expect(motherSpouses).toHaveLength(1);
      expect(motherSpouses[0].id).toBe('p');
    });

    it('should return empty when person has no spouse', () => {
      expect(graph.getSpouses('c')).toHaveLength(0);
    });

    it('should return empty for non-existent person', () => {
      expect(graph.getSpouses('nonexistent')).toHaveLength(0);
    });
  });

  // ── getAncestors ────────────────────────────────────────────────

  describe('getAncestors', () => {
    it('should return all ancestors', () => {
      const ancestors = graph.getAncestors('c');
      expect(ancestors).toHaveLength(2);

      const ids = ancestors.map((a) => a.id);
      expect(ids).toContain('p');
      expect(ids).toContain('gp');
    });

    it('should respect maxGenerations', () => {
      const ancestors = graph.getAncestors('c', 1);
      expect(ancestors).toHaveLength(1);
      expect(ancestors[0].id).toBe('p');
    });

    it('should return empty for root person', () => {
      expect(graph.getAncestors('gp')).toHaveLength(0);
    });

    it('should return empty for non-existent person', () => {
      expect(graph.getAncestors('nonexistent')).toHaveLength(0);
    });
  });

  // ── getDescendants ──────────────────────────────────────────────

  describe('getDescendants', () => {
    it('should return all descendants', () => {
      const desc = graph.getDescendants('gp');
      expect(desc).toHaveLength(2);

      const ids = desc.map((d) => d.id);
      expect(ids).toContain('p');
      expect(ids).toContain('c');
    });

    it('should respect maxGenerations', () => {
      const desc = graph.getDescendants('gp', 1);
      expect(desc).toHaveLength(1);
      expect(desc[0].id).toBe('p');
    });

    it('should return empty for leaf person', () => {
      expect(graph.getDescendants('c')).toHaveLength(0);
    });
  });

  // ── getRoots / getLeaves ────────────────────────────────────────

  describe('getRoots', () => {
    it('should return persons with no parents', () => {
      const roots = graph.getRoots();
      expect(roots).toHaveLength(1);
      expect(roots[0].id).toBe('gp');
    });
  });

  describe('getLeaves', () => {
    it('should return persons with no children', () => {
      const leaves = graph.getLeaves();
      expect(leaves).toHaveLength(1);
      expect(leaves[0].id).toBe('c');
    });
  });

  // ── getEdgesForPerson ───────────────────────────────────────────

  describe('getEdgesForPerson', () => {
    it('should return all edges involving a person', () => {
      const edges = graph.getEdgesForPerson('p');
      expect(edges).toHaveLength(2);

      const ids = edges.map((e) => e.id);
      expect(ids).toContain('e1'); // parent edge (gp -> p)
      expect(ids).toContain('e2'); // child edge (p -> c)
    });

    it('should return empty for non-existent person', () => {
      expect(graph.getEdgesForPerson('nonexistent')).toHaveLength(0);
    });
  });

  // ── getGenerationDepth ──────────────────────────────────────────

  describe('getGenerationDepth', () => {
    it('should return the correct depth for a 3-generation lineage', () => {
      expect(graph.getGenerationDepth()).toBe(3);
    });

    it('should return 0 for an empty graph', () => {
      const emptyGraph = new TreeGraph();
      expect(emptyGraph.getGenerationDepth()).toBe(0);
    });

    it('should return 1 for a single person with no edges', () => {
      const singleGraph = new TreeGraph();
      singleGraph.loadFromParseResult(
        makeParseResult([makePerson('solo', 'Solo Person')], []),
      );
      expect(singleGraph.getGenerationDepth()).toBe(1);
    });

    it('should handle multiple disconnected lineages', () => {
      const a1 = makePerson('a1', 'A1');
      const a2 = makePerson('a2', 'A2');
      const a3 = makePerson('a3', 'A3');
      const a4 = makePerson('a4', 'A4');

      const b1 = makePerson('b1', 'B1');
      const b2 = makePerson('b2', 'B2');

      // Lineage A: 4 generations
      const ea1 = makeEdge('ea1', 'a1', 'a2');
      const ea2 = makeEdge('ea2', 'a2', 'a3');
      const ea3 = makeEdge('ea3', 'a3', 'a4');

      // Lineage B: 2 generations
      const eb1 = makeEdge('eb1', 'b1', 'b2');

      const multiGraph = new TreeGraph();
      multiGraph.loadFromParseResult(
        makeParseResult(
          [a1, a2, a3, a4, b1, b2],
          [ea1, ea2, ea3, eb1],
        ),
      );

      expect(multiGraph.getGenerationDepth()).toBe(4);
    });
  });

  // ── Accessors ───────────────────────────────────────────────────

  describe('accessors', () => {
    it('getPersonById returns the correct person', () => {
      expect(graph.getPersonById('p')?.name.full).toBe('Parent Person');
    });

    it('getPersonById returns undefined for missing ID', () => {
      expect(graph.getPersonById('missing')).toBeUndefined();
    });

    it('getEdgeById returns the correct edge', () => {
      expect(graph.getEdgeById('e1')?.parentId).toBe('gp');
    });

    it('getEdgeById returns undefined for missing ID', () => {
      expect(graph.getEdgeById('missing')).toBeUndefined();
    });
  });

  // ── familyIndex ─────────────────────────────────────────────────

  describe('familyIndex', () => {
    it('should index edges by familyGedcomXref', () => {
      const p1 = makePerson('p1', 'Parent1');
      const c1 = makePerson('c1', 'Child1');
      const e1 = makeEdge('e1', 'p1', 'c1', {
        familyGedcomXref: '@F1@',
      });

      graph.loadFromParseResult(makeParseResult([p1, c1], [e1]));

      const familyEdges = graph.familyIndex.get('@F1@');
      expect(familyEdges).toHaveLength(1);
      expect(familyEdges![0].id).toBe('e1');
    });
  });
});
