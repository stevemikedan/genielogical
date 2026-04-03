import { describe, it, expect } from 'vitest';
import { runDeepScan } from './deep-scanner.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';

function makePerson(id: string, name: string, birthYear: number | null = null): Person {
  return {
    id,
    name: { full: name, given: name.split(' ')[0], middle: '', surname: name.split(' ').slice(1).join(' '), maidenName: '', prefix: '', suffix: '', raw: name },
    alternateNames: [],
    sex: 'U',
    birth: { date: birthYear ? { date: null, endDate: null, qualifier: 'about', raw: `ABT ${birthYear}`, year: birthYear } : null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 3,
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
  };
}

function makeEdge(id: string, parentId: string, childId: string, tier: 1 | 2 | 3 | 4 = 3): Edge {
  return {
    id,
    parentId,
    childId,
    relationshipType: 'biological',
    legitimacy: 'legitimate',
    marriage: null,
    confidenceTier: tier,
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
  };
}

function buildTestGraph(persons: Person[], edges: Edge[]): TreeGraph {
  const graph = new TreeGraph();
  for (const p of persons) graph.persons.set(p.id, p);
  for (const e of edges) {
    graph.edges.set(e.id, e);
    const existing = graph.parentEdges.get(e.childId) ?? [];
    existing.push(e);
    graph.parentEdges.set(e.childId, existing);
    const childExisting = graph.childEdges.get(e.parentId) ?? [];
    childExisting.push(e);
    graph.childEdges.set(e.parentId, childExisting);
  }
  return graph;
}

describe('runDeepScan', () => {
  it('returns empty result for unknown subject', () => {
    const graph = new TreeGraph();
    const result = runDeepScan(graph, 'unknown');
    expect(result.totalUniqueAncestors).toBe(0);
    expect(result.branches).toHaveLength(0);
  });

  it('returns subject only for person with no parents', () => {
    const persons = [makePerson('s1', 'Sarah Mitchell', 1990)];
    const graph = buildTestGraph(persons, []);
    const result = runDeepScan(graph, 's1');
    expect(result.totalUniqueAncestors).toBe(1);
    expect(result.branches).toHaveLength(0);
  });

  it('handles 3-generation tree (no great-grandparents)', () => {
    const persons = [
      makePerson('s1', 'Sarah', 1990),
      makePerson('f1', 'Father', 1960),
      makePerson('m1', 'Mother', 1962),
      makePerson('gf1', 'Grandfather', 1930),
      makePerson('gm1', 'Grandmother', 1932),
    ];
    const edges = [
      makeEdge('e1', 'f1', 's1'),
      makeEdge('e2', 'm1', 's1'),
      makeEdge('e3', 'gf1', 'f1'),
      makeEdge('e4', 'gm1', 'f1'),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = runDeepScan(graph, 's1');
    // 5 total: subject + 2 parents + 2 grandparents, no great-grandparents
    expect(result.totalUniqueAncestors).toBe(5);
    expect(result.branches).toHaveLength(0);
  });

  it('creates branch analysis for great-grandparents', () => {
    // Build a tree: subject → father → grandfather → great-grandfather → ancestor
    const persons = [
      makePerson('s1', 'Sarah', 1990),
      makePerson('f1', 'Father', 1960),
      makePerson('gf1', 'Grandfather', 1930),
      makePerson('ggf1', 'Great-Grandfather', 1900),
      makePerson('a1', 'Ancestor', 1870),
    ];
    const edges = [
      makeEdge('e1', 'f1', 's1'),
      makeEdge('e2', 'gf1', 'f1'),
      makeEdge('e3', 'ggf1', 'gf1'),
      makeEdge('e4', 'a1', 'ggf1'),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = runDeepScan(graph, 's1');

    expect(result.branches).toHaveLength(1);
    expect(result.branches[0].greatGrandparentName).toBe('Great-Grandfather');
    expect(result.branches[0].ancestorCount).toBe(2); // ggf1 + a1
    expect(result.branches[0].maxDepth).toBe(4); // relative to subject
    expect(result.branches[0].deepestAncestorName).toBe('Ancestor');
  });

  it('computes generation distribution', () => {
    const persons = [
      makePerson('s1', 'Sarah', 1990),
      makePerson('f1', 'Father', 1960),
      makePerson('gf1', 'GF', 1930),
      makePerson('ggf1', 'GGF', 1900),
    ];
    const edges = [
      makeEdge('e1', 'f1', 's1'),
      makeEdge('e2', 'gf1', 'f1'),
      makeEdge('e3', 'ggf1', 'gf1'),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = runDeepScan(graph, 's1');

    expect(result.generationDistribution.get(0)).toBe(1); // subject
    expect(result.generationDistribution.get(1)).toBe(1); // parent
    expect(result.generationDistribution.get(2)).toBe(1); // grandparent
    expect(result.generationDistribution.get(3)).toBe(1); // great-grandparent
  });

  it('sorts branches by richness score descending', () => {
    // Build a tree with 2 great-grandparents, one deeper than the other
    const persons = [
      makePerson('s1', 'Sarah', 1990),
      makePerson('f1', 'Father', 1960),
      makePerson('m1', 'Mother', 1962),
      makePerson('gf1', 'GF1', 1930),
      makePerson('gm1', 'GM1', 1932),
      makePerson('ggf1', 'GGF1', 1900),
      makePerson('ggm1', 'GGM1', 1902),
      makePerson('deep1', 'Deep1', 1870),
      makePerson('deep2', 'Deep2', 1840),
    ];
    const edges = [
      makeEdge('e1', 'f1', 's1'),
      makeEdge('e2', 'm1', 's1'),
      makeEdge('e3', 'gf1', 'f1'),
      makeEdge('e4', 'gm1', 'f1'),
      makeEdge('e5', 'ggf1', 'gf1'),
      makeEdge('e6', 'ggm1', 'gm1'),
      makeEdge('e7', 'deep1', 'ggf1'),
      makeEdge('e8', 'deep2', 'deep1'),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = runDeepScan(graph, 's1');

    expect(result.branches.length).toBeGreaterThanOrEqual(1);
    // The deeper branch should be first (higher richness score)
    if (result.branches.length >= 2) {
      expect(result.branches[0].richnessScore).toBeGreaterThanOrEqual(result.branches[1].richnessScore);
    }
  });
});
