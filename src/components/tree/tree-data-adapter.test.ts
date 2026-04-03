import { describe, it, expect } from 'vitest';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import { buildPedigreeHierarchy, buildDescendantHierarchy } from './tree-data-adapter.ts';

// ── Test helpers ─────────────────────────────────────────────────────

function makePerson(overrides: Partial<Person> & { id: string }): Person {
  return {
    name: { full: 'Test Person', given: 'Test', middle: '', surname: 'Person', maidenName: '', prefix: '', suffix: '', raw: 'Test /Person/' },
    alternateNames: [],
    sex: 'M',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 3 as ConfidenceTier,
    confidenceReason: '',
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
    ...overrides,
  };
}

function makeEdge(overrides: Partial<Edge> & { id: string; parentId: string; childId: string }): Edge {
  return {
    relationshipType: 'biological',
    legitimacy: 'unknown',
    marriage: null,
    confidenceTier: 3 as ConfidenceTier,
    confidenceReason: '',
    parallelGroupId: null,
    isPrimary: true,
    pathLabel: null,
    sourceIds: [],
    flagIds: [],
    familyGedcomXref: null,
    assertedBy: 'local_user',
    assertedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function buildGraph(persons: Person[], edges: Edge[]): TreeGraph {
  const graph = new TreeGraph();
  for (const p of persons) graph.persons.set(p.id, p);
  for (const e of edges) {
    graph.edges.set(e.id, e);
    const pEdges = graph.parentEdges.get(e.childId) ?? [];
    pEdges.push(e);
    graph.parentEdges.set(e.childId, pEdges);
    const cEdges = graph.childEdges.get(e.parentId) ?? [];
    cEdges.push(e);
    graph.childEdges.set(e.parentId, cEdges);
  }
  return graph;
}

// ── Pedigree Hierarchy Tests ─────────────────────────────────────────

describe('buildPedigreeHierarchy', () => {
  it('returns null for nonexistent person', () => {
    const graph = buildGraph([], []);
    expect(buildPedigreeHierarchy('nonexistent', graph)).toBeNull();
  });

  it('returns root node with no children for person with no parents', () => {
    const person = makePerson({ id: 'root' });
    const graph = buildGraph([person], []);
    const result = buildPedigreeHierarchy('root', graph);
    expect(result).not.toBeNull();
    expect(result!.person.id).toBe('root');
    expect(result!.children).toBeUndefined();
  });

  it('builds correct ancestor chain: root → 2 parents → 4 grandparents', () => {
    const root = makePerson({ id: 'root' });
    const father = makePerson({ id: 'father' });
    const mother = makePerson({ id: 'mother', sex: 'F' });
    const pgf = makePerson({ id: 'pgf' }); // paternal grandfather
    const pgm = makePerson({ id: 'pgm', sex: 'F' });
    const mgf = makePerson({ id: 'mgf' });
    const mgm = makePerson({ id: 'mgm', sex: 'F' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'root' }),
      makeEdge({ id: 'e2', parentId: 'mother', childId: 'root' }),
      makeEdge({ id: 'e3', parentId: 'pgf', childId: 'father' }),
      makeEdge({ id: 'e4', parentId: 'pgm', childId: 'father' }),
      makeEdge({ id: 'e5', parentId: 'mgf', childId: 'mother' }),
      makeEdge({ id: 'e6', parentId: 'mgm', childId: 'mother' }),
    ];

    const graph = buildGraph([root, father, mother, pgf, pgm, mgf, mgm], edges);
    const result = buildPedigreeHierarchy('root', graph, 10);

    expect(result!.person.id).toBe('root');
    expect(result!.children).toHaveLength(2);

    const fatherNode = result!.children!.find(c => c.person.id === 'father')!;
    const motherNode = result!.children!.find(c => c.person.id === 'mother')!;
    expect(fatherNode.children).toHaveLength(2);
    expect(motherNode.children).toHaveLength(2);
  });

  it('respects maxGenerations limit', () => {
    const root = makePerson({ id: 'root' });
    const father = makePerson({ id: 'father' });
    const grandfather = makePerson({ id: 'gf' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'root' }),
      makeEdge({ id: 'e2', parentId: 'gf', childId: 'father' }),
    ];

    const graph = buildGraph([root, father, grandfather], edges);

    // maxGenerations = 1: root only (no parents)
    const limited = buildPedigreeHierarchy('root', graph, 1);
    expect(limited!.children).toHaveLength(1); // father is included (depth 0 -> depth 1)
    expect(limited!.children![0].children).toBeUndefined(); // grandfather NOT included

    // maxGenerations = 0: just root
    const zeroGen = buildPedigreeHierarchy('root', graph, 0);
    expect(zeroGen!.children).toBeUndefined();
  });

  it('handles cycles without infinite loop', () => {
    // Create a cycle: A is parent of B, B is parent of A
    const a = makePerson({ id: 'a' });
    const b = makePerson({ id: 'b' });
    const edges = [
      makeEdge({ id: 'e1', parentId: 'b', childId: 'a' }),
      makeEdge({ id: 'e2', parentId: 'a', childId: 'b' }),
    ];
    const graph = buildGraph([a, b], edges);

    // Should not hang — visited set prevents infinite recursion
    const result = buildPedigreeHierarchy('a', graph, 10);
    expect(result).not.toBeNull();
    expect(result!.children).toHaveLength(1);
    expect(result!.children![0].person.id).toBe('b');
    // b should NOT have 'a' as a child again (cycle broken)
    expect(result!.children![0].children).toBeUndefined();
  });

  it('detects parallel paths', () => {
    const child = makePerson({ id: 'child' });
    const bio = makePerson({ id: 'bio' });
    const step = makePerson({ id: 'step' });
    const edges = [
      makeEdge({ id: 'e1', parentId: 'bio', childId: 'child', parallelGroupId: 'pg1', isPrimary: true }),
      makeEdge({ id: 'e2', parentId: 'step', childId: 'child', parallelGroupId: 'pg1', isPrimary: false }),
    ];
    const graph = buildGraph([child, bio, step], edges);

    const result = buildPedigreeHierarchy('child', graph);
    expect(result!.hasParallelPaths).toBe(true);
    // Only primary edge is followed
    expect(result!.children).toHaveLength(1);
    expect(result!.children![0].person.id).toBe('bio');
  });

  it('marks hasFlags when person has flagIds', () => {
    const person = makePerson({ id: 'p1', flagIds: ['f1', 'f2'] });
    const graph = buildGraph([person], []);
    const result = buildPedigreeHierarchy('p1', graph);
    expect(result!.hasFlags).toBe(true);
  });

  // ── expandableDepth tests ────────────────────────────────────────

  it('sets expandableDepth on leaf nodes at generation limit', () => {
    // root → father → grandfather → great-gf
    const root = makePerson({ id: 'root' });
    const father = makePerson({ id: 'father' });
    const gf = makePerson({ id: 'gf' });
    const ggf = makePerson({ id: 'ggf' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'root' }),
      makeEdge({ id: 'e2', parentId: 'gf', childId: 'father' }),
      makeEdge({ id: 'e3', parentId: 'ggf', childId: 'gf' }),
    ];

    const graph = buildGraph([root, father, gf, ggf], edges);

    // maxGenerations=2: root(0) + father(1) + gf(2=limit, stops)
    // gf is at the limit with ggf beyond → expandable
    const result = buildPedigreeHierarchy('root', graph, 2);
    const fatherNode = result!.children![0];
    expect(fatherNode.isExpandable).toBe(false); // depth 1, not at limit
    const gfNode = fatherNode.children![0];
    expect(gfNode.isExpandable).toBe(true);
    // gf → ggf = 1 more generation
    expect(gfNode.expandableDepth).toBe(1);
  });

  it('sets expandableDepth=0 for nodes with no more ancestors', () => {
    const root = makePerson({ id: 'root' });
    const father = makePerson({ id: 'father' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'root' }),
    ];

    const graph = buildGraph([root, father], edges);
    const result = buildPedigreeHierarchy('root', graph, 10);
    // father has no parents, so not expandable at all
    const fatherNode = result!.children![0];
    expect(fatherNode.isExpandable).toBe(false);
    expect(fatherNode.expandableDepth).toBe(0);
  });

  it('sets expandableDepth=1 for node with exactly one hidden ancestor', () => {
    const root = makePerson({ id: 'root' });
    const father = makePerson({ id: 'father' });
    const gf = makePerson({ id: 'gf' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'root' }),
      makeEdge({ id: 'e2', parentId: 'gf', childId: 'father' }),
    ];

    const graph = buildGraph([root, father, gf], edges);
    // maxGenerations=1: only root shown (father at depth 1 is the limit)
    const result = buildPedigreeHierarchy('root', graph, 1);
    const fatherNode = result!.children![0];
    expect(fatherNode.isExpandable).toBe(true);
    expect(fatherNode.expandableDepth).toBe(1);
  });

  // ── expandedAncestors tests ──────────────────────────────────────

  it('expandedAncestors allows expanding past generation limit', () => {
    const root = makePerson({ id: 'root' });
    const father = makePerson({ id: 'father' });
    const gf = makePerson({ id: 'gf' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'root' }),
      makeEdge({ id: 'e2', parentId: 'gf', childId: 'father' }),
    ];

    const graph = buildGraph([root, father, gf], edges);

    // Without expansion: maxGen=1, father visible but gf not
    const limited = buildPedigreeHierarchy('root', graph, 1);
    expect(limited!.children![0].children).toBeUndefined();

    // With expansion: father is in expandedAncestors, so gf appears
    const expanded = buildPedigreeHierarchy('root', graph, 1, new Set(['father']));
    expect(expanded!.children![0].children).toHaveLength(1);
    expect(expanded!.children![0].children![0].person.id).toBe('gf');
  });

  it('expanded node is no longer marked as expandable', () => {
    const root = makePerson({ id: 'root' });
    const father = makePerson({ id: 'father' });
    const gf = makePerson({ id: 'gf' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'root' }),
      makeEdge({ id: 'e2', parentId: 'gf', childId: 'father' }),
    ];

    const graph = buildGraph([root, father, gf], edges);

    const expanded = buildPedigreeHierarchy('root', graph, 1, new Set(['father']));
    expect(expanded!.children![0].isExpandable).toBe(false);
  });

  it('expanding one branch does not expand parallel branches', () => {
    const root = makePerson({ id: 'root' });
    const father = makePerson({ id: 'father' });
    const mother = makePerson({ id: 'mother', sex: 'F' });
    const pgf = makePerson({ id: 'pgf' });
    const mgf = makePerson({ id: 'mgf' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'root' }),
      makeEdge({ id: 'e2', parentId: 'mother', childId: 'root' }),
      makeEdge({ id: 'e3', parentId: 'pgf', childId: 'father' }),
      makeEdge({ id: 'e4', parentId: 'mgf', childId: 'mother' }),
    ];

    const graph = buildGraph([root, father, mother, pgf, mgf], edges);

    // maxGen=1: only root → father + mother visible
    // Expand only father
    const result = buildPedigreeHierarchy('root', graph, 1, new Set(['father']));
    const fatherNode = result!.children!.find(c => c.person.id === 'father')!;
    const motherNode = result!.children!.find(c => c.person.id === 'mother')!;

    // Father branch expanded: pgf visible
    expect(fatherNode.children).toHaveLength(1);
    expect(fatherNode.children![0].person.id).toBe('pgf');

    // Mother branch NOT expanded: mgf not visible
    expect(motherNode.children).toBeUndefined();
    expect(motherNode.isExpandable).toBe(true);
  });
});

// ── Descendant Hierarchy Tests ───────────────────────────────────────

describe('buildDescendantHierarchy', () => {
  it('returns null for nonexistent person', () => {
    const graph = buildGraph([], []);
    expect(buildDescendantHierarchy('nonexistent', graph)).toBeNull();
  });

  it('builds descendant tree', () => {
    const ancestor = makePerson({ id: 'ancestor' });
    const child1 = makePerson({ id: 'c1' });
    const child2 = makePerson({ id: 'c2' });
    const grandchild = makePerson({ id: 'gc1' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'ancestor', childId: 'c1' }),
      makeEdge({ id: 'e2', parentId: 'ancestor', childId: 'c2' }),
      makeEdge({ id: 'e3', parentId: 'c1', childId: 'gc1' }),
    ];

    const graph = buildGraph([ancestor, child1, child2, grandchild], edges);
    const result = buildDescendantHierarchy('ancestor', graph, 10);

    expect(result!.person.id).toBe('ancestor');
    expect(result!.children).toHaveLength(2);

    const c1Node = result!.children!.find(c => c.person.id === 'c1')!;
    expect(c1Node.children).toHaveLength(1);
    expect(c1Node.children![0].person.id).toBe('gc1');
  });

  it('expandedAncestors allows expanding descendant tree past limit', () => {
    const ancestor = makePerson({ id: 'ancestor' });
    const child = makePerson({ id: 'child' });
    const grandchild = makePerson({ id: 'gc' });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'ancestor', childId: 'child' }),
      makeEdge({ id: 'e2', parentId: 'child', childId: 'gc' }),
    ];

    const graph = buildGraph([ancestor, child, grandchild], edges);

    // maxGen=1: only ancestor → child
    const limited = buildDescendantHierarchy('ancestor', graph, 1);
    expect(limited!.children![0].children).toBeUndefined();
    expect(limited!.children![0].isExpandable).toBe(true);

    // Expand child
    const expanded = buildDescendantHierarchy('ancestor', graph, 1, new Set(['child']));
    expect(expanded!.children![0].children).toHaveLength(1);
    expect(expanded!.children![0].children![0].person.id).toBe('gc');
  });
});
