import { describe, it, expect } from 'vitest';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import { detectBridgeZones } from './bridge-detector.ts';

// ── Test helpers ─────────────────────────────────────────────────────

function makePerson(id: string, name = 'Test Person'): Person {
  return {
    id,
    name: { full: name, given: 'Test', middle: '', surname: 'Person', maidenName: '', prefix: '', suffix: '', raw: `Test /${name}/` },
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEdge(
  id: string,
  childId: string,
  parentId: string,
  tier: ConfidenceTier,
): Edge {
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

// ── Tests ────────────────────────────────────────────────────────────

describe('Bridge Detector', () => {
  it('returns empty array with no weak edges', () => {
    // Path: p0 → p1 → p2 → p3, all tier 1 (strong)
    const persons = [makePerson('p0'), makePerson('p1'), makePerson('p2'), makePerson('p3')];
    const edges = [
      makeEdge('e01', 'p0', 'p1', 1),
      makeEdge('e12', 'p1', 'p2', 1),
      makeEdge('e23', 'p2', 'p3', 1),
    ];
    const graph = buildGraph(persons, edges);

    const zones = detectBridgeZones(graph, ['p0', 'p1', 'p2', 'p3']);
    expect(zones).toEqual([]);
  });

  it('returns empty array for a single weak edge (needs 2+)', () => {
    // Path: p0 → p1 → p2 → p3, only e12 is tier 3
    const persons = [makePerson('p0'), makePerson('p1'), makePerson('p2'), makePerson('p3')];
    const edges = [
      makeEdge('e01', 'p0', 'p1', 1),
      makeEdge('e12', 'p1', 'p2', 3),
      makeEdge('e23', 'p2', 'p3', 1),
    ];
    const graph = buildGraph(persons, edges);

    const zones = detectBridgeZones(graph, ['p0', 'p1', 'p2', 'p3']);
    expect(zones).toEqual([]);
  });

  it('detects 2 consecutive weak edges as a bridge zone', () => {
    // Path: p0 → p1 → p2 → p3, e01 tier 1, e12 + e23 tier 3
    const persons = [makePerson('p0'), makePerson('p1'), makePerson('p2'), makePerson('p3')];
    const edges = [
      makeEdge('e01', 'p0', 'p1', 1),
      makeEdge('e12', 'p1', 'p2', 3),
      makeEdge('e23', 'p2', 'p3', 3),
    ];
    const graph = buildGraph(persons, edges);

    const zones = detectBridgeZones(graph, ['p0', 'p1', 'p2', 'p3']);
    expect(zones).toHaveLength(1);
    expect(zones[0]).toEqual({
      startPersonId: 'p1',
      endPersonId: 'p3',
      startGen: 1,
      endGen: 3,
      edgeCount: 2,
      averageTier: 3,
      description: '2 consecutive unsourced links between Gen 1–3',
    });
  });

  it('detects 3 consecutive weak edges as a single bridge zone', () => {
    // Path: p0 → p1 → p2 → p3 → p4, e01 tier 1, e12 + e23 + e34 tier 4
    const persons = [
      makePerson('p0'), makePerson('p1'), makePerson('p2'),
      makePerson('p3'), makePerson('p4'),
    ];
    const edges = [
      makeEdge('e01', 'p0', 'p1', 1),
      makeEdge('e12', 'p1', 'p2', 4),
      makeEdge('e23', 'p2', 'p3', 4),
      makeEdge('e34', 'p3', 'p4', 4),
    ];
    const graph = buildGraph(persons, edges);

    const zones = detectBridgeZones(graph, ['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(zones).toHaveLength(1);
    expect(zones[0].edgeCount).toBe(3);
    expect(zones[0].startPersonId).toBe('p1');
    expect(zones[0].endPersonId).toBe('p4');
    expect(zones[0].averageTier).toBe(4);
  });

  it('detects two separate runs of weak edges as 2 bridge zones', () => {
    // Path: p0 → p1 → p2 → p3 → p4 → p5 → p6
    // Weak: e01 tier 3, e12 tier 3 (run 1), e23 tier 1 (break),
    //        e34 tier 4, e45 tier 3 (run 2), e56 tier 1
    const persons = [
      makePerson('p0'), makePerson('p1'), makePerson('p2'),
      makePerson('p3'), makePerson('p4'), makePerson('p5'),
      makePerson('p6'),
    ];
    const edges = [
      makeEdge('e01', 'p0', 'p1', 3),
      makeEdge('e12', 'p1', 'p2', 3),
      makeEdge('e23', 'p2', 'p3', 1),
      makeEdge('e34', 'p3', 'p4', 4),
      makeEdge('e45', 'p4', 'p5', 3),
      makeEdge('e56', 'p5', 'p6', 1),
    ];
    const graph = buildGraph(persons, edges);

    const zones = detectBridgeZones(graph, ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(zones).toHaveLength(2);

    // First zone: p0–p2
    expect(zones[0].startPersonId).toBe('p0');
    expect(zones[0].endPersonId).toBe('p2');
    expect(zones[0].edgeCount).toBe(2);
    expect(zones[0].averageTier).toBe(3);

    // Second zone: p3–p5
    expect(zones[1].startPersonId).toBe('p3');
    expect(zones[1].endPersonId).toBe('p5');
    expect(zones[1].edgeCount).toBe(2);
    expect(zones[1].averageTier).toBe(3.5);
  });

  it('returns empty array for empty path', () => {
    const graph = new TreeGraph();
    const zones = detectBridgeZones(graph, []);
    expect(zones).toEqual([]);
  });

  it('returns empty array for single-person path', () => {
    const graph = buildGraph([makePerson('p0')], []);
    const zones = detectBridgeZones(graph, ['p0']);
    expect(zones).toEqual([]);
  });

  it('uses custom threshold', () => {
    // Path: p0 → p1 → p2 → p3, all tier 2
    // With default threshold 3, these are strong. With threshold 2, they are weak.
    const persons = [makePerson('p0'), makePerson('p1'), makePerson('p2'), makePerson('p3')];
    const edges = [
      makeEdge('e01', 'p0', 'p1', 2),
      makeEdge('e12', 'p1', 'p2', 2),
      makeEdge('e23', 'p2', 'p3', 2),
    ];
    const graph = buildGraph(persons, edges);

    // Default threshold (3): tier 2 edges are strong → no zones
    const zonesDefault = detectBridgeZones(graph, ['p0', 'p1', 'p2', 'p3']);
    expect(zonesDefault).toEqual([]);

    // Threshold 2: tier 2 edges are weak → one zone
    const zonesStrict = detectBridgeZones(graph, ['p0', 'p1', 'p2', 'p3'], 2);
    expect(zonesStrict).toHaveLength(1);
    expect(zonesStrict[0].edgeCount).toBe(3);
  });

  it('treats missing edges as worst tier', () => {
    // Path: p0 → p1 → p2 → p3, but no edges exist for p1→p2 and p2→p3
    const persons = [makePerson('p0'), makePerson('p1'), makePerson('p2'), makePerson('p3')];
    const edges = [
      makeEdge('e01', 'p0', 'p1', 1),
      // No edges for p1→p2 and p2→p3
    ];
    const graph = buildGraph(persons, edges);

    const zones = detectBridgeZones(graph, ['p0', 'p1', 'p2', 'p3']);
    expect(zones).toHaveLength(1);
    expect(zones[0].edgeCount).toBe(2);
    expect(zones[0].averageTier).toBe(4);
  });
});
