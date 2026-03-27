import { describe, it, expect } from 'vitest';
import { computeFanChartLayout } from './fan-chart-layout.ts';

import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';

// --- Test Helpers ---

function makePerson(id: string, name: string, sex: 'M' | 'F' | 'U' = 'U'): Person {
  return {
    id,
    name: { prefix: '', given: name, middle: '', surname: '', suffix: '', full: name, maidenName: '', raw: name },
    alternateNames: [],
    sex,
    birth: { date: null, place: null },
    death: { date: null, place: null },
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
    confidenceReason: 'Test',
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
    const pEdges = graph.parentEdges.get(e.childId) ?? [];
    pEdges.push(e);
    graph.parentEdges.set(e.childId, pEdges);
    const cEdges = graph.childEdges.get(e.parentId) ?? [];
    cEdges.push(e);
    graph.childEdges.set(e.parentId, cEdges);
  }
  return graph;
}

// --- Tests ---

describe('computeFanChartLayout', () => {
  it('returns null for missing root person', () => {
    const graph = buildTestGraph([], []);
    const result = computeFanChartLayout('nonexistent', graph);
    expect(result).toBeNull();
  });

  it('creates layout for a single person (no ancestors)', () => {
    const persons = [makePerson('p1', 'Subject')];
    const graph = buildTestGraph(persons, []);
    const result = computeFanChartLayout('p1', graph, { maxGenerations: 3 });

    expect(result).not.toBeNull();
    expect(result!.nodes.length).toBeGreaterThanOrEqual(1);

    // Subject node at generation 0
    const subject = result!.nodes.find(n => n.generation === 0);
    expect(subject).toBeDefined();
    expect(subject!.personId).toBe('p1');
    expect(subject!.isEmpty).toBe(false);
  });

  it('creates wedges for parents (generation 1)', () => {
    const persons = [
      makePerson('child', 'Child', 'M'),
      makePerson('father', 'Father', 'M'),
      makePerson('mother', 'Mother', 'F'),
    ];
    const edges = [
      makeEdge('e1', 'father', 'child', 2),
      makeEdge('e2', 'mother', 'child', 1),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = computeFanChartLayout('child', graph, { maxGenerations: 3 });

    expect(result).not.toBeNull();

    const gen1 = result!.nodes.filter(n => n.generation === 1 && !n.isEmpty);
    expect(gen1.length).toBe(2);

    // Verify both parents are present
    const parentIds = gen1.map(n => n.personId).sort();
    expect(parentIds).toContain('father');
    expect(parentIds).toContain('mother');
  });

  it('creates empty slots for missing ancestors', () => {
    const persons = [
      makePerson('child', 'Child', 'M'),
      makePerson('father', 'Father', 'M'),
    ];
    const edges = [makeEdge('e1', 'father', 'child')];
    const graph = buildTestGraph(persons, edges);
    const result = computeFanChartLayout('child', graph, { maxGenerations: 3, showEmptySlots: true });

    expect(result).not.toBeNull();

    // Generation 1 should have 1 person + 1 empty slot
    const gen1 = result!.nodes.filter(n => n.generation === 1);
    const filled = gen1.filter(n => !n.isEmpty);
    const empty = gen1.filter(n => n.isEmpty);
    expect(filled.length).toBe(1);
    expect(empty.length).toBe(1);
  });

  it('does not create empty slots when showEmptySlots is false', () => {
    const persons = [
      makePerson('child', 'Child', 'M'),
      makePerson('father', 'Father', 'M'),
    ];
    const edges = [makeEdge('e1', 'father', 'child')];
    const graph = buildTestGraph(persons, edges);
    const result = computeFanChartLayout('child', graph, { maxGenerations: 3, showEmptySlots: false });

    expect(result).not.toBeNull();

    const gen1Empty = result!.nodes.filter(n => n.generation === 1 && n.isEmpty);
    expect(gen1Empty.length).toBe(0);
  });

  it('semicircle mode uses PI angular span', () => {
    const persons = [
      makePerson('c', 'C', 'M'),
      makePerson('f', 'F', 'M'),
      makePerson('m', 'M', 'F'),
    ];
    const edges = [
      makeEdge('e1', 'f', 'c'),
      makeEdge('e2', 'm', 'c'),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = computeFanChartLayout('c', graph, { maxGenerations: 3, mode: 'semi' });

    expect(result).not.toBeNull();
    expect(result!.mode).toBe('semi');

    // Each gen-1 wedge should span ~PI/2 (90 degrees)
    const gen1 = result!.nodes.filter(n => n.generation === 1 && !n.isEmpty);
    for (const node of gen1) {
      const span = node.endAngle - node.startAngle;
      expect(span).toBeCloseTo(Math.PI / 2, 5);
    }
  });

  it('full circle mode uses 2*PI angular span', () => {
    const persons = [
      makePerson('c', 'C', 'M'),
      makePerson('f', 'F', 'M'),
      makePerson('m', 'M', 'F'),
    ];
    const edges = [
      makeEdge('e1', 'f', 'c'),
      makeEdge('e2', 'm', 'c'),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = computeFanChartLayout('c', graph, { maxGenerations: 3, mode: 'full' });

    expect(result).not.toBeNull();
    expect(result!.mode).toBe('full');

    // Each gen-1 wedge should span ~PI (180 degrees)
    const gen1 = result!.nodes.filter(n => n.generation === 1 && !n.isEmpty);
    for (const node of gen1) {
      const span = node.endAngle - node.startAngle;
      expect(span).toBeCloseTo(Math.PI, 5);
    }
  });

  it('grandparent generation has 4 slots', () => {
    const persons = [
      makePerson('c', 'C', 'M'),
      makePerson('f', 'F', 'M'),
      makePerson('m', 'M', 'F'),
      makePerson('gf1', 'GF1', 'M'),
      makePerson('gm1', 'GM1', 'F'),
    ];
    const edges = [
      makeEdge('e1', 'f', 'c'),
      makeEdge('e2', 'm', 'c'),
      makeEdge('e3', 'gf1', 'f'),
      makeEdge('e4', 'gm1', 'f'),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = computeFanChartLayout('c', graph, { maxGenerations: 4, showEmptySlots: true });

    expect(result).not.toBeNull();

    // Generation 2 should have 4 slots total
    const gen2 = result!.nodes.filter(n => n.generation === 2);
    expect(gen2.length).toBe(4);

    // 2 filled, 2 empty (maternal grandparents unknown)
    const gen2Filled = gen2.filter(n => !n.isEmpty);
    const gen2Empty = gen2.filter(n => n.isEmpty);
    expect(gen2Filled.length).toBe(2);
    expect(gen2Empty.length).toBe(2);
  });

  it('wedge radii increase with generation', () => {
    const persons = [
      makePerson('c', 'C', 'M'),
      makePerson('f', 'F', 'M'),
      makePerson('m', 'M', 'F'),
      makePerson('gf', 'GF', 'M'),
    ];
    const edges = [
      makeEdge('e1', 'f', 'c'),
      makeEdge('e2', 'm', 'c'),
      makeEdge('e3', 'gf', 'f'),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = computeFanChartLayout('c', graph, { maxGenerations: 4 });

    expect(result).not.toBeNull();

    const gen1Node = result!.nodes.find(n => n.generation === 1 && !n.isEmpty);
    const gen2Node = result!.nodes.find(n => n.generation === 2 && !n.isEmpty);

    expect(gen1Node).toBeDefined();
    expect(gen2Node).toBeDefined();
    expect(gen2Node!.innerRadius).toBeGreaterThan(gen1Node!.outerRadius);
  });

  it('confidence tier comes from edge', () => {
    const persons = [
      makePerson('c', 'C', 'M'),
      makePerson('f', 'F', 'M'),
    ];
    const edges = [makeEdge('e1', 'f', 'c', 1)];
    const graph = buildTestGraph(persons, edges);
    const result = computeFanChartLayout('c', graph, { maxGenerations: 2 });

    expect(result).not.toBeNull();
    const fatherNode = result!.nodes.find(n => n.personId === 'f');
    expect(fatherNode).toBeDefined();
    expect(fatherNode!.confidenceTier).toBe(1);
  });

  it('respects maxGenerations limit', () => {
    const persons = [
      makePerson('c', 'C', 'M'),
      makePerson('f', 'F', 'M'),
      makePerson('gf', 'GF', 'M'),
      makePerson('ggf', 'GGF', 'M'),
    ];
    const edges = [
      makeEdge('e1', 'f', 'c'),
      makeEdge('e2', 'gf', 'f'),
      makeEdge('e3', 'ggf', 'gf'),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = computeFanChartLayout('c', graph, { maxGenerations: 2 });

    expect(result).not.toBeNull();

    // Should only have generations 0 and 1
    const maxGen = Math.max(...result!.nodes.map(n => n.generation));
    expect(maxGen).toBe(1);
  });

  it('totalRadius is positive', () => {
    const persons = [makePerson('c', 'C')];
    const graph = buildTestGraph(persons, []);
    const result = computeFanChartLayout('c', graph, { maxGenerations: 5 });

    expect(result).not.toBeNull();
    expect(result!.totalRadius).toBeGreaterThan(0);
  });

  it('handles 3-generation tree correctly', () => {
    const persons = [
      makePerson('c', 'Child', 'M'),
      makePerson('f', 'Father', 'M'),
      makePerson('m', 'Mother', 'F'),
      makePerson('pGF', 'Pat GF', 'M'),
      makePerson('pGM', 'Pat GM', 'F'),
      makePerson('mGF', 'Mat GF', 'M'),
      makePerson('mGM', 'Mat GM', 'F'),
    ];
    const edges = [
      makeEdge('e1', 'f', 'c'),
      makeEdge('e2', 'm', 'c'),
      makeEdge('e3', 'pGF', 'f'),
      makeEdge('e4', 'pGM', 'f'),
      makeEdge('e5', 'mGF', 'm'),
      makeEdge('e6', 'mGM', 'm'),
    ];
    const graph = buildTestGraph(persons, edges);
    const result = computeFanChartLayout('c', graph, { maxGenerations: 4 });

    expect(result).not.toBeNull();

    // All 7 persons should be in the layout
    const personNodes = result!.nodes.filter(n => !n.isEmpty);
    expect(personNodes.length).toBe(7);

    // Generations should be correct
    expect(personNodes.filter(n => n.generation === 0).length).toBe(1);
    expect(personNodes.filter(n => n.generation === 1).length).toBe(2);
    expect(personNodes.filter(n => n.generation === 2).length).toBe(4);
  });
});
