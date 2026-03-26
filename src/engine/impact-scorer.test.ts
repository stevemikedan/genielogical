import { describe, it, expect } from 'vitest';
import { computeResearchPriorities } from './impact-scorer.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { NotableAncestor } from '@/types/story-path.ts';

function makePerson(id: string, name: string): Person {
  return {
    id,
    name: { full: name, given: name.split(' ')[0], middle: '', surname: name.split(' ').slice(1).join(' '), maidenName: '', prefix: '', suffix: '', raw: name },
    alternateNames: [],
    sex: 'U',
    birth: { date: null, place: null },
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
    createdAt: new Date(),
  };
}

function makeNotable(personId: string, name: string, path: string[]): NotableAncestor {
  return {
    personId,
    name,
    birthYear: null,
    deathYear: null,
    category: 'royalty',
    matchRule: 'test',
    significance: 'Test figure',
    generationsFromSubject: path.length - 1,
    pathToSubject: path,
    chainConfidence: 3,
    bridgeZone: null,
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
  }
  return graph;
}

describe('computeResearchPriorities', () => {
  it('returns empty for no notables', () => {
    const graph = new TreeGraph();
    const result = computeResearchPriorities(graph, []);
    expect(result).toHaveLength(0);
  });

  it('excludes tier 1 edges', () => {
    const persons = [makePerson('s1', 'Sarah'), makePerson('p1', 'King')];
    const edges = [makeEdge('e1', 'p1', 's1', 1)];
    const graph = buildTestGraph(persons, edges);
    const notable = makeNotable('p1', 'King', ['s1', 'p1']);

    const result = computeResearchPriorities(graph, [notable]);
    expect(result).toHaveLength(0); // Tier 1 edges don't need verification
  });

  it('ranks higher-tier edges higher', () => {
    const persons = [
      makePerson('s1', 'Sarah'),
      makePerson('p1', 'Parent'),
      makePerson('gp1', 'King'),
    ];
    const edges = [
      makeEdge('e1', 'p1', 's1', 2),
      makeEdge('e2', 'gp1', 'p1', 4),
    ];
    const graph = buildTestGraph(persons, edges);
    const notable = makeNotable('gp1', 'King', ['s1', 'p1', 'gp1']);

    const result = computeResearchPriorities(graph, [notable]);
    expect(result).toHaveLength(2);
    // Tier 4 edge should rank higher
    expect(result[0].edgeId).toBe('e2');
    expect(result[0].impactScore).toBeGreaterThan(result[1].impactScore);
  });

  it('counts multiple paths through the same edge', () => {
    const persons = [
      makePerson('s1', 'Sarah'),
      makePerson('p1', 'Parent'),
      makePerson('gp1', 'King1'),
      makePerson('gp2', 'King2'),
    ];
    const edges = [
      makeEdge('e1', 'p1', 's1', 3),
      makeEdge('e2', 'gp1', 'p1', 2),
      makeEdge('e3', 'gp2', 'p1', 2),
    ];
    const graph = buildTestGraph(persons, edges);
    const notable1 = makeNotable('gp1', 'King1', ['s1', 'p1', 'gp1']);
    const notable2 = makeNotable('gp2', 'King2', ['s1', 'p1', 'gp2']);

    const result = computeResearchPriorities(graph, [notable1, notable2]);
    // Edge e1 is traversed by both notable paths
    const e1Priority = result.find(r => r.edgeId === 'e1');
    expect(e1Priority).toBeDefined();
    expect(e1Priority!.affectedPathCount).toBe(2);
  });

  it('sorts by impact score descending', () => {
    const persons = [
      makePerson('s1', 'Sarah'),
      makePerson('p1', 'Parent'),
      makePerson('gp1', 'Notable'),
    ];
    const edges = [
      makeEdge('e1', 'p1', 's1', 4),
      makeEdge('e2', 'gp1', 'p1', 2),
    ];
    const graph = buildTestGraph(persons, edges);
    const notable = makeNotable('gp1', 'Notable', ['s1', 'p1', 'gp1']);

    const result = computeResearchPriorities(graph, [notable]);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].impactScore).toBeGreaterThanOrEqual(result[i].impactScore);
    }
  });
});
