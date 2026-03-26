import { describe, it, expect } from 'vitest';
import { findNotableAncestors } from './story-paths.ts';
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

describe('findNotableAncestors', () => {
  it('returns empty result for unknown subject', () => {
    const graph = new TreeGraph();
    const result = findNotableAncestors(graph, 'unknown');
    expect(result.notableAncestors).toHaveLength(0);
  });

  it('detects a royal ancestor by title in name', () => {
    const persons = [
      makePerson('s1', 'John Smith'),
      makePerson('p1', 'Mary Stewart'),
      makePerson('gp1', 'Duncan Mitchell King of Scotland', 1500),
    ];
    const edges = [
      makeEdge('e1', 'p1', 's1'),
      makeEdge('e2', 'gp1', 'p1'),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = findNotableAncestors(graph, 's1');

    expect(result.notableAncestors).toHaveLength(1);
    expect(result.notableAncestors[0].name).toBe('Duncan Mitchell King of Scotland');
    expect(result.notableAncestors[0].category).toBe('royalty');
    expect(result.notableAncestors[0].generationsFromSubject).toBe(2);
  });

  it('detects Knight Templar title', () => {
    const persons = [
      makePerson('s1', 'Sarah Mitchell'),
      makePerson('p1', 'Sir Archibald Mitchell Knight Templar'),
    ];
    const edges = [makeEdge('e1', 'p1', 's1')];
    const graph = buildTestGraph(persons, edges);
    const result = findNotableAncestors(graph, 's1');

    expect(result.notableAncestors).toHaveLength(1);
    expect(result.notableAncestors[0].category).toBe('military_order');
  });

  it('computes chain confidence as weakest edge tier', () => {
    const persons = [
      makePerson('s1', 'John Smith'),
      makePerson('p1', 'Father Smith'),
      makePerson('gp1', 'King of England', 1200),
    ];
    const edges = [
      makeEdge('e1', 'p1', 's1', 1),
      makeEdge('e2', 'gp1', 'p1', 4),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = findNotableAncestors(graph, 's1');

    expect(result.notableAncestors).toHaveLength(1);
    expect(result.notableAncestors[0].chainConfidence).toBe(4);
  });

  it('deduplicates by person ID', () => {
    // A person whose full name and raw name both match should only appear once
    const persons = [
      makePerson('s1', 'John Smith'),
      makePerson('p1', 'King of England Queen of England'), // Matches two patterns
    ];
    const edges = [makeEdge('e1', 'p1', 's1')];
    const graph = buildTestGraph(persons, edges);
    const result = findNotableAncestors(graph, 's1');

    // Should appear once (deduplicated by personId), not twice
    expect(result.notableAncestors).toHaveLength(1);
  });

  it('groups results by category', () => {
    const persons = [
      makePerson('s1', 'John Smith'),
      makePerson('p1', 'King of Scotland', 1300),
      makePerson('p2', 'Bishop John', 1400),
    ];
    const edges = [
      makeEdge('e1', 'p1', 's1'),
      makeEdge('e2', 'p2', 's1'),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = findNotableAncestors(graph, 's1');

    expect(result.notableAncestors.length).toBeGreaterThanOrEqual(2);
    expect(result.byCategory.get('royalty')).toHaveLength(1);
    expect(result.byCategory.get('clergy')).toHaveLength(1);
  });

  it('does not match the subject themselves', () => {
    const persons = [
      makePerson('s1', 'King of Scotland'),
    ];
    const graph = buildTestGraph(persons, []);
    const result = findNotableAncestors(graph, 's1');
    expect(result.notableAncestors).toHaveLength(0);
  });
});
