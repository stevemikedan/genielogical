import { describe, it, expect } from 'vitest';
import { buildChatContext, formatContextForPrompt, computeGenerationalDistribution, findDeepestAncestors, computeTierDistribution, computeDeepestChain } from './chat-context.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';

function makePerson(id: string, name: string, sex: 'M' | 'F' | 'U' = 'U'): Person {
  return {
    id,
    name: { prefix: '', given: name, middle: '', surname: '', suffix: '', full: name, maidenName: '', raw: name },
    alternateNames: [],
    sex,
    birth: { date: { raw: '1800', year: 1800, date: null, endDate: null, qualifier: 'exact' }, place: { raw: 'Scotland', country: 'Scotland', state: null, county: null, city: null, parts: ['Scotland'] } },
    death: { date: { raw: '1860', year: 1860, date: null, endDate: null, qualifier: 'exact' }, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 3,
    confidenceReason: 'Test',
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

function makeEdge(id: string, parentId: string, childId: string): Edge {
  return {
    id,
    parentId,
    childId,
    relationshipType: 'biological',
    legitimacy: 'legitimate',
    marriage: null,
    confidenceTier: 3,
    confidenceReason: 'Test',
    parallelGroupId: null,
    isPrimary: true,
    pathLabel: null,
    sourceIds: [],
    flagIds: [],
    familyGedcomXref: null,
    assertedBy: 'local_user',
    assertedAt: new Date(),
    createdAt: new Date(),
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

describe('buildChatContext', () => {
  it('builds context with empty tree', () => {
    const graph = new TreeGraph();
    const context = buildChatContext({
      graph,
      flags: [],
      selectedPersonId: null,
      activeView: 'tree',
      deepScanResult: null,
      storyPathResult: null,
    });

    expect(context.treeSummary.totalPeople).toBe(0);
    expect(context.treeSummary.overallHealthScore).toBe(100);
    expect(context.selectedPersonContext).toBeNull();
  });

  it('includes selected person context', () => {
    const persons = [
      makePerson('child', 'John Smith', 'M'),
      makePerson('father', 'James Smith', 'M'),
    ];
    const edges = [makeEdge('e1', 'father', 'child')];
    const graph = buildGraph(persons, edges);

    const context = buildChatContext({
      graph,
      flags: [],
      selectedPersonId: 'child',
      activeView: 'tree',
      deepScanResult: null,
      storyPathResult: null,
    });

    expect(context.selectedPersonContext).not.toBeNull();
    expect(context.selectedPersonContext!.name).toBe('John Smith');
    expect(context.selectedPersonContext!.parents.length).toBe(1);
    expect(context.selectedPersonContext!.parents[0].name).toBe('James Smith');
  });

  it('reports totalPeople correctly', () => {
    const persons = [
      makePerson('a', 'A'),
      makePerson('b', 'B'),
      makePerson('c', 'C'),
    ];
    const graph = buildGraph(persons, []);

    const context = buildChatContext({
      graph,
      flags: [],
      selectedPersonId: null,
      activeView: 'tree',
      deepScanResult: null,
      storyPathResult: null,
    });

    expect(context.treeSummary.totalPeople).toBe(3);
  });

  it('computes health score with flags', () => {
    const persons = [
      makePerson('a', 'A'),
      makePerson('b', 'B'),
    ];
    const graph = buildGraph(persons, []);

    const context = buildChatContext({
      graph,
      flags: [{
        id: 'f1',
        ruleId: 'test',
        title: 'Test flag',
        description: 'Test',
        severity: 'critical',
        category: 'chronological',
        suggestedAction: '',
        affectedPersonIds: ['a'],
        affectedEdgeIds: [],
        userStatus: 'new',
        userNote: null,
        detectedAt: new Date(),
        resolvedAt: null,
      }],
      selectedPersonId: null,
      activeView: 'tree',
      deepScanResult: null,
      storyPathResult: null,
    });

    expect(context.treeSummary.overallHealthScore).toBe(50);
  });
});

describe('formatContextForPrompt', () => {
  it('formats tree summary into text', () => {
    const context = buildChatContext({
      graph: buildGraph([makePerson('a', 'Alice')], []),
      flags: [],
      selectedPersonId: null,
      activeView: 'tree',
      deepScanResult: null,
      storyPathResult: null,
    });

    const text = formatContextForPrompt(context);
    expect(text).toContain('TREE:');
    expect(text).toContain('1 people');
    expect(text).toContain('SELECTED: None');
  });

  it('includes selected person in formatted text', () => {
    const graph = buildGraph([makePerson('a', 'Alice')], []);
    const context = buildChatContext({
      graph,
      flags: [],
      selectedPersonId: 'a',
      activeView: 'tree',
      deepScanResult: null,
      storyPathResult: null,
    });

    const text = formatContextForPrompt(context);
    expect(text).toContain('SELECTED: Alice');
    expect(text).toContain('Tier: 3');
  });

  it('includes generational distribution and tier distribution', () => {
    const persons = [
      makePerson('child', 'Child'),
      makePerson('parent', 'Parent'),
      makePerson('grandparent', 'Grandparent'),
    ];
    const edges = [
      makeEdge('e1', 'parent', 'child'),
      makeEdge('e2', 'grandparent', 'parent'),
    ];
    const graph = buildGraph(persons, edges);

    const text = formatContextForPrompt(buildChatContext({
      graph, flags: [], selectedPersonId: null, activeView: 'tree',
      deepScanResult: null, storyPathResult: null,
    }));

    expect(text).toContain('Ancestor distribution:');
    expect(text).toContain('Confidence:');
    expect(text).toContain('T3:');
  });

  it('includes deepest ancestors in formatted text', () => {
    const persons = [
      makePerson('a', 'Modern Person'),
      makePerson('b', 'Old Ancestor'),
      makePerson('c', 'Ancient Ancestor'),
    ];
    const edges = [
      makeEdge('e1', 'b', 'a'),
      makeEdge('e2', 'c', 'b'),
    ];
    const graph = buildGraph(persons, edges);

    const text = formatContextForPrompt(buildChatContext({
      graph, flags: [], selectedPersonId: null, activeView: 'tree',
      deepScanResult: null, storyPathResult: null,
    }));

    expect(text).toContain('Deepest ancestors:');
    expect(text).toContain('Ancient Ancestor');
  });

  it('includes ancestor chain depth for selected person', () => {
    const persons = [
      makePerson('a', 'Child'),
      makePerson('b', 'Parent'),
      makePerson('c', 'Grandparent'),
    ];
    const edges = [
      makeEdge('e1', 'b', 'a'),
      makeEdge('e2', 'c', 'b'),
    ];
    const graph = buildGraph(persons, edges);

    const text = formatContextForPrompt(buildChatContext({
      graph, flags: [], selectedPersonId: 'a', activeView: 'tree',
      deepScanResult: null, storyPathResult: null,
    }));

    expect(text).toContain('Ancestor chain depth: 2 generations');
    expect(text).toContain('deepest: Grandparent');
  });
});

describe('computeGenerationalDistribution', () => {
  it('returns empty for empty graph', () => {
    const graph = new TreeGraph();
    const result = computeGenerationalDistribution(graph);
    expect(result).toEqual([]);
  });

  it('buckets a 3-generation chain correctly', () => {
    const persons = [
      makePerson('a', 'Child'),
      makePerson('b', 'Parent'),
      makePerson('c', 'Grandparent'),
    ];
    const edges = [
      makeEdge('e1', 'b', 'a'),
      makeEdge('e2', 'c', 'b'),
    ];
    const graph = buildGraph(persons, edges);
    const result = computeGenerationalDistribution(graph);

    // All 3 persons should be in the 1-3 band
    expect(result).toEqual([{ band: '1-3', count: 3 }]);
  });
});

describe('findDeepestAncestors', () => {
  it('finds deepest ancestors in a chain', () => {
    const persons = [
      makePerson('a', 'Child'),
      makePerson('b', 'Parent'),
      makePerson('c', 'Grandparent'),
    ];
    const edges = [
      makeEdge('e1', 'b', 'a'),
      makeEdge('e2', 'c', 'b'),
    ];
    const graph = buildGraph(persons, edges);
    const result = findDeepestAncestors(graph, 2);

    expect(result.length).toBe(2);
    expect(result[0].name).toBe('Grandparent');
    expect(result[0].generation).toBe(3);
  });
});

describe('computeTierDistribution', () => {
  it('counts persons per tier', () => {
    const p1 = makePerson('a', 'A');
    p1.confidenceTier = 1;
    const p2 = makePerson('b', 'B');
    p2.confidenceTier = 3;
    const p3 = makePerson('c', 'C');
    p3.confidenceTier = 3;
    const graph = buildGraph([p1, p2, p3], []);
    const result = computeTierDistribution(graph);

    expect(result).toContainEqual({ tier: 1, count: 1 });
    expect(result).toContainEqual({ tier: 3, count: 2 });
  });
});

describe('computeDeepestChain', () => {
  it('returns 0 depth for person with no parents', () => {
    const graph = buildGraph([makePerson('a', 'Solo')], []);
    const result = computeDeepestChain('a', graph);
    expect(result.depth).toBe(0);
    expect(result.deepestName).toBe('Solo');
  });

  it('computes depth through a chain', () => {
    const persons = [
      makePerson('a', 'Child'),
      makePerson('b', 'Parent'),
      makePerson('c', 'Grandparent'),
      makePerson('d', 'Great-grandparent'),
    ];
    const edges = [
      makeEdge('e1', 'b', 'a'),
      makeEdge('e2', 'c', 'b'),
      makeEdge('e3', 'd', 'c'),
    ];
    const graph = buildGraph(persons, edges);
    const result = computeDeepestChain('a', graph);
    expect(result.depth).toBe(3);
    expect(result.deepestName).toBe('Great-grandparent');
  });

  it('follows non-primary edges too', () => {
    const persons = [
      makePerson('a', 'Child'),
      makePerson('b', 'Father'),
      makePerson('c', 'Mother'),
      makePerson('d', 'Maternal Grandparent'),
    ];
    const e1 = makeEdge('e1', 'b', 'a');
    const e2 = makeEdge('e2', 'c', 'a');
    e2.isPrimary = false;
    const e3 = makeEdge('e3', 'd', 'c');
    const graph = buildGraph(persons, [e1, e2, e3]);
    const result = computeDeepestChain('a', graph);
    expect(result.depth).toBe(2);
    expect(result.deepestName).toBe('Maternal Grandparent');
  });
});
