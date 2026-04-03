import { describe, it, expect } from 'vitest';
import { buildProofLadder } from './proof-ladder.ts';
import { TreeGraph } from './tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { ConfidenceTier } from '@/types/common.ts';

function makePerson(id: string, name: string): Person {
  return {
    id,
    name: { full: name, given: name, middle: '', surname: '', maidenName: '', prefix: '', suffix: '', raw: name },
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
    identityHash: '',
    privacyLevel: 'public',
    externalIds: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEdge(id: string, parentId: string, childId: string, tier: ConfidenceTier = 3): Edge {
  return {
    id,
    parentId,
    childId,
    relationshipType: 'biological',
    legitimacy: 'unknown',
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
    // Index edges
    const pEdges = graph.parentEdges.get(e.childId) ?? [];
    pEdges.push(e);
    graph.parentEdges.set(e.childId, pEdges);
    const cEdges = graph.childEdges.get(e.parentId) ?? [];
    cEdges.push(e);
    graph.childEdges.set(e.parentId, cEdges);
  }
  return graph;
}

describe('buildProofLadder', () => {
  it('returns null for unknown person', () => {
    const graph = new TreeGraph();
    expect(buildProofLadder('unknown', graph)).toBeNull();
  });

  it('returns single-link chain for a root person', () => {
    const graph = buildTestGraph([makePerson('A', 'Alice')], []);
    const ladder = buildProofLadder('A', graph);
    expect(ladder).not.toBeNull();
    expect(ladder!.links).toHaveLength(1);
    expect(ladder!.links[0].personId).toBe('A');
    expect(ladder!.links[0].edge).toBeNull();
    expect(ladder!.weakestTier).toBe(1);
  });

  it('builds root→child chain', () => {
    const persons = [makePerson('root', 'Root'), makePerson('child', 'Child')];
    const edges = [makeEdge('e1', 'root', 'child', 2)];
    const graph = buildTestGraph(persons, edges);

    const ladder = buildProofLadder('child', graph);
    expect(ladder).not.toBeNull();
    expect(ladder!.links).toHaveLength(2);
    expect(ladder!.links[0].personId).toBe('root');
    expect(ladder!.links[0].edge).toBeNull();
    expect(ladder!.links[1].personId).toBe('child');
    expect(ladder!.links[1].edgeTier).toBe(2);
    expect(ladder!.weakestTier).toBe(2);
    expect(ladder!.weakestPersonId).toBe('child');
  });

  it('identifies weakest link in multi-generation chain', () => {
    const persons = [
      makePerson('A', 'Grandpa'),
      makePerson('B', 'Dad'),
      makePerson('C', 'Me'),
    ];
    const edges = [
      makeEdge('e1', 'A', 'B', 1),
      makeEdge('e2', 'B', 'C', 4),
    ];
    const graph = buildTestGraph(persons, edges);

    const ladder = buildProofLadder('C', graph);
    expect(ladder!.links).toHaveLength(3);
    expect(ladder!.weakestTier).toBe(4);
    expect(ladder!.weakestPersonId).toBe('C');
  });

  it('follows only primary edges', () => {
    const persons = [
      makePerson('bioParent', 'Bio Parent'),
      makePerson('stepParent', 'Step Parent'),
      makePerson('child', 'Child'),
    ];
    const primaryEdge = makeEdge('e1', 'bioParent', 'child', 2);
    const altEdge = makeEdge('e2', 'stepParent', 'child', 1);
    altEdge.isPrimary = false;

    const graph = buildTestGraph(persons, [primaryEdge, altEdge]);
    const ladder = buildProofLadder('child', graph);
    expect(ladder!.links).toHaveLength(2);
    expect(ladder!.links[0].personId).toBe('bioParent');
  });

  it('handles cycles gracefully', () => {
    const persons = [makePerson('A', 'A'), makePerson('B', 'B')];
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'B', 'A'),
    ];
    const graph = buildTestGraph(persons, edges);

    // Should not infinite loop
    const ladder = buildProofLadder('A', graph);
    expect(ladder).not.toBeNull();
    expect(ladder!.links.length).toBeGreaterThan(0);
    expect(ladder!.links.length).toBeLessThanOrEqual(2);
  });
});
