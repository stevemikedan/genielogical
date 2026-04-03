import { describe, it, expect } from 'vitest';
import { buildNetworkGraph } from './network-map-data.ts';
import type { NetworkLayoutConfig } from './network-map-data.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { ConfidenceTier } from '@/types/common.ts';

function makePerson(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    name: { full: `Person ${id}`, given: 'Test', middle: '', surname: 'Person', maidenName: '', prefix: '', suffix: '', raw: `Test /Person/` },
    alternateNames: [],
    sex: 'M',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 4 as ConfidenceTier,
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

function makeEdge(id: string, parentId: string, childId: string, overrides: Partial<Edge> = {}): Edge {
  return {
    id,
    parentId,
    childId,
    relationshipType: 'biological',
    legitimacy: 'legitimate',
    marriage: null,
    confidenceTier: 4 as ConfidenceTier,
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
  for (const e of edges) graph.edges.set(e.id, e);
  graph.rebuildIndices();
  return graph;
}

function defaultConfig(overrides: Partial<NetworkLayoutConfig> = {}): NetworkLayoutConfig {
  return {
    generationRadius: 5,
    showParentChild: true,
    showSpouse: true,
    showSibling: true,
    visibleTiers: new Set<ConfidenceTier>([1, 2, 3, 4]),
    showRejected: true,
    ...overrides,
  };
}

describe('buildNetworkGraph', () => {
  it('returns empty result for nonexistent root', () => {
    const graph = buildGraph([], []);
    const result = buildNetworkGraph('nonexistent', graph, defaultConfig());
    expect(result.nodes).toHaveLength(0);
    expect(result.links).toHaveLength(0);
    expect(result.stats.totalPersons).toBe(0);
  });

  it('returns single node for lone root', () => {
    const p = makePerson('root');
    const graph = buildGraph([p], []);
    const result = buildNetworkGraph('root', graph, defaultConfig());
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('root');
    expect(result.links).toHaveLength(0);
    expect(result.stats.totalPersons).toBe(1);
  });

  it('creates parent-child link from edge', () => {
    const parent = makePerson('parent');
    const child = makePerson('child');
    const edge = makeEdge('e1', 'parent', 'child');
    const graph = buildGraph([parent, child], [edge]);

    const result = buildNetworkGraph('child', graph, defaultConfig());
    expect(result.nodes).toHaveLength(2);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].linkType).toBe('parent-child');
    expect(result.links[0].edge).toBe(edge);
    expect(result.stats.parentChildCount).toBe(1);
  });

  it('creates synthetic spouse links', () => {
    // Spouse links are derived from spouseMap (built from edges sharing a familyGedcomXref)
    const husband = makePerson('h', { familyIdAsSpouse: ['F1'] });
    const wife = makePerson('w', { familyIdAsSpouse: ['F1'] });
    const child = makePerson('c', { familyIdAsChild: ['F1'] });
    const e1 = makeEdge('e1', 'h', 'c', { familyGedcomXref: 'F1' });
    const e2 = makeEdge('e2', 'w', 'c', { familyGedcomXref: 'F1' });
    const graph = buildGraph([husband, wife, child], [e1, e2]);

    const result = buildNetworkGraph('c', graph, defaultConfig());
    const spouseLinks = result.links.filter(l => l.linkType === 'spouse');
    expect(spouseLinks).toHaveLength(1);
    expect(spouseLinks[0].edge).toBeNull();
    expect(result.stats.spouseCount).toBe(1);
  });

  it('creates synthetic sibling links', () => {
    const parent = makePerson('parent');
    const childA = makePerson('childA');
    const childB = makePerson('childB');
    const e1 = makeEdge('e1', 'parent', 'childA');
    const e2 = makeEdge('e2', 'parent', 'childB');
    const graph = buildGraph([parent, childA, childB], [e1, e2]);

    const result = buildNetworkGraph('parent', graph, defaultConfig());
    const sibLinks = result.links.filter(l => l.linkType === 'sibling');
    expect(sibLinks).toHaveLength(1);
    expect(sibLinks[0].edge).toBeNull();
    expect(result.stats.siblingCount).toBe(1);
  });

  it('respects generation radius cutoff', () => {
    const p1 = makePerson('p1');
    const p2 = makePerson('p2');
    const p3 = makePerson('p3');
    const e1 = makeEdge('e1', 'p2', 'p1');
    const e2 = makeEdge('e2', 'p3', 'p2');
    const graph = buildGraph([p1, p2, p3], [e1, e2]);

    // Radius 1: root + one hop
    const result = buildNetworkGraph('p1', graph, defaultConfig({ generationRadius: 1 }));
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.map(n => n.id).sort()).toEqual(['p1', 'p2']);
  });

  it('filters out nodes with invisible tiers', () => {
    const p1 = makePerson('p1', { confidenceTier: 1 as ConfidenceTier });
    const p2 = makePerson('p2', { confidenceTier: 4 as ConfidenceTier });
    const e = makeEdge('e1', 'p2', 'p1');
    const graph = buildGraph([p1, p2], [e]);

    const result = buildNetworkGraph('p1', graph, defaultConfig({
      visibleTiers: new Set<ConfidenceTier>([1, 2, 3]),
    }));
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('p1');
    // Link removed because p2 is not visible
    expect(result.links).toHaveLength(0);
  });

  it('filters rejected nodes when showRejected is false', () => {
    const p1 = makePerson('p1');
    const p2 = makePerson('p2', { status: 'rejected' });
    const e = makeEdge('e1', 'p2', 'p1');
    const graph = buildGraph([p1, p2], [e]);

    const result = buildNetworkGraph('p1', graph, defaultConfig({ showRejected: false }));
    expect(result.nodes).toHaveLength(1);
    expect(result.links).toHaveLength(0);
  });

  it('shows rejected nodes when showRejected is true', () => {
    const p1 = makePerson('p1');
    const p2 = makePerson('p2', { status: 'rejected' });
    const e = makeEdge('e1', 'p2', 'p1');
    const graph = buildGraph([p1, p2], [e]);

    const result = buildNetworkGraph('p1', graph, defaultConfig({ showRejected: true }));
    expect(result.nodes).toHaveLength(2);
    expect(result.links).toHaveLength(1);
  });

  it('respects link type toggles', () => {
    const parent = makePerson('parent');
    const childA = makePerson('childA');
    const childB = makePerson('childB');
    const e1 = makeEdge('e1', 'parent', 'childA');
    const e2 = makeEdge('e2', 'parent', 'childB');
    const graph = buildGraph([parent, childA, childB], [e1, e2]);

    // Parent-child off
    const r1 = buildNetworkGraph('parent', graph, defaultConfig({ showParentChild: false }));
    expect(r1.links.filter(l => l.linkType === 'parent-child')).toHaveLength(0);

    // Sibling off
    const r2 = buildNetworkGraph('parent', graph, defaultConfig({ showSibling: false }));
    expect(r2.links.filter(l => l.linkType === 'sibling')).toHaveLength(0);
  });

  it('deduplicates bidirectional sibling links', () => {
    const parent = makePerson('parent');
    const c1 = makePerson('c1');
    const c2 = makePerson('c2');
    const c3 = makePerson('c3');
    const e1 = makeEdge('e1', 'parent', 'c1');
    const e2 = makeEdge('e2', 'parent', 'c2');
    const e3 = makeEdge('e3', 'parent', 'c3');
    const graph = buildGraph([parent, c1, c2, c3], [e1, e2, e3]);

    const result = buildNetworkGraph('parent', graph, defaultConfig());
    const sibLinks = result.links.filter(l => l.linkType === 'sibling');
    // 3 children → 3 unique sibling pairs (c1-c2, c1-c3, c2-c3)
    expect(sibLinks).toHaveLength(3);
  });

  it('synthetic link tier is worst of two persons', () => {
    const parent = makePerson('parent', { confidenceTier: 1 as ConfidenceTier });
    const childA = makePerson('childA', { confidenceTier: 2 as ConfidenceTier });
    const childB = makePerson('childB', { confidenceTier: 3 as ConfidenceTier });
    const e1 = makeEdge('e1', 'parent', 'childA');
    const e2 = makeEdge('e2', 'parent', 'childB');
    const graph = buildGraph([parent, childA, childB], [e1, e2]);

    const result = buildNetworkGraph('parent', graph, defaultConfig());
    const sibLink = result.links.find(l => l.linkType === 'sibling');
    expect(sibLink?.confidenceTier).toBe(3);
  });

  it('handles cycles safely (person is both ancestor and descendant)', () => {
    // Simulate a cycle: p1→p2→p3→p1 (shouldn't happen in real data, but must not infinite loop)
    const p1 = makePerson('p1');
    const p2 = makePerson('p2');
    const p3 = makePerson('p3');
    const e1 = makeEdge('e1', 'p1', 'p2');
    const e2 = makeEdge('e2', 'p2', 'p3');
    const e3 = makeEdge('e3', 'p3', 'p1');
    const graph = buildGraph([p1, p2, p3], [e1, e2, e3]);

    const result = buildNetworkGraph('p1', graph, defaultConfig());
    expect(result.nodes).toHaveLength(3);
    // Should not hang
  });

  it('reports correct stats', () => {
    const parent = makePerson('parent');
    const child = makePerson('child');
    const spouse = makePerson('spouse', { familyIdAsSpouse: ['F1'] });
    const parentFam = makePerson('parent', { ...parent, familyIdAsSpouse: ['F1'] });
    // Rebuild: parent and spouse share F1, child is their child
    const e1 = makeEdge('e1', 'parent', 'child', { familyGedcomXref: 'F1' });
    const e2 = makeEdge('e2', 'spouse', 'child', { familyGedcomXref: 'F1' });
    const graph = buildGraph([parentFam, spouse, child], [e1, e2]);

    const result = buildNetworkGraph('child', graph, defaultConfig());
    expect(result.stats.totalPersons).toBe(3);
    expect(result.stats.parentChildCount).toBe(2);
    expect(result.stats.spouseCount).toBe(1);
  });

  it('hasFlags is true when person has flag IDs', () => {
    const p = makePerson('p1', { flagIds: ['f1', 'f2'] });
    const graph = buildGraph([p], []);
    const result = buildNetworkGraph('p1', graph, defaultConfig());
    expect(result.nodes[0].hasFlags).toBe(true);
  });

  it('marks parallel paths on parent-child links', () => {
    const parent = makePerson('parent');
    const child = makePerson('child');
    const e1 = makeEdge('e1', 'parent', 'child', { parallelGroupId: 'pg1', isPrimary: true });
    const graph = buildGraph([parent, child], [e1]);
    const result = buildNetworkGraph('child', graph, defaultConfig());
    expect(result.links[0].hasParallelPaths).toBe(true);
  });
});
