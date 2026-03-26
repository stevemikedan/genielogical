import { describe, it, expect } from 'vitest';
import { generateResearchSteps } from './research-recommender.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
    alternateNames: [],
    sex: 'M',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 4,
    confidenceReason: 'Unsourced',
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
    ...overrides,
  };
}

function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: 'e1',
    parentId: 'p1',
    childId: 'p2',
    relationshipType: 'biological',
    legitimacy: 'legitimate',
    marriage: null,
    confidenceTier: 4,
    confidenceReason: 'Unsourced',
    parallelGroupId: null,
    isPrimary: true,
    pathLabel: null,
    sourceIds: [],
    flagIds: [],
    familyGedcomXref: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function buildGraph(persons: Person[], edges: Edge[] = []): TreeGraph {
  const graph = new TreeGraph();
  for (const p of persons) graph.persons.set(p.id, p);
  for (const e of edges) {
    graph.edges.set(e.id, e);
    const parentEdges = graph.parentEdges.get(e.childId) ?? [];
    parentEdges.push(e);
    graph.parentEdges.set(e.childId, parentEdges);
    const childEdges = graph.childEdges.get(e.parentId) ?? [];
    childEdges.push(e);
    graph.childEdges.set(e.parentId, childEdges);
  }
  return graph;
}

describe('generateResearchSteps', () => {
  it('generates steps for US modern era persons', () => {
    const person = makePerson({
      id: 'p1',
      confidenceTier: 4,
      birth: {
        date: { date: null, endDate: null, qualifier: 'exact', raw: '1850', year: 1850 },
        place: { raw: 'Virginia, USA', city: null, county: null, state: 'Virginia', country: 'USA', parts: ['Virginia', 'USA'] },
      },
    });

    const graph = buildGraph([person]);
    const steps = generateResearchSteps(graph, []);

    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every(s => s.origin === 'rule_based')).toBe(true);
    expect(steps.some(s => s.suggestedSource?.includes('Census'))).toBe(true);
  });

  it('generates steps for Scottish medieval persons', () => {
    const person = makePerson({
      id: 'p1',
      confidenceTier: 3,
      birth: {
        date: { date: null, endDate: null, qualifier: 'about', raw: 'ABT 1400', year: 1400 },
        place: { raw: 'Edinburgh, Scotland', city: 'Edinburgh', county: null, state: null, country: 'Scotland', parts: ['Edinburgh', 'Scotland'] },
      },
    });

    const graph = buildGraph([person]);
    const steps = generateResearchSteps(graph, []);

    expect(steps.length).toBeGreaterThan(0);
    expect(steps.some(s => s.suggestedSource?.includes('ScotlandsPeople') || s.suggestedSource?.includes('NRS') || s.suggestedSource?.includes('National Records'))).toBe(true);
  });

  it('skips persons with tier 1-2 and sources', () => {
    const person = makePerson({
      id: 'p1',
      confidenceTier: 2,
      sourceIds: ['s1'],
      birth: {
        date: { date: null, endDate: null, qualifier: 'exact', raw: '1900', year: 1900 },
        place: { raw: 'New York, USA', city: null, county: null, state: 'New York', country: 'USA', parts: ['New York', 'USA'] },
      },
    });

    const graph = buildGraph([person]);
    const steps = generateResearchSteps(graph, []);
    expect(steps).toHaveLength(0);
  });

  it('assigns high impact for persons with many descendants', () => {
    const parent = makePerson({
      id: 'p0',
      confidenceTier: 4,
      birth: {
        date: { date: null, endDate: null, qualifier: 'exact', raw: '1800', year: 1800 },
        place: { raw: 'Virginia, USA', city: null, county: null, state: 'Virginia', country: 'USA', parts: ['Virginia', 'USA'] },
      },
    });

    const descendants: Person[] = [];
    const edges: Edge[] = [];
    // Create 60 descendants
    for (let i = 1; i <= 60; i++) {
      descendants.push(makePerson({ id: `d${i}`, confidenceTier: 2, sourceIds: ['s1'] }));
      edges.push(makeEdge({ id: `e${i}`, parentId: i === 1 ? 'p0' : `d${i - 1}`, childId: `d${i}` }));
    }

    const graph = buildGraph([parent, ...descendants], edges);
    const steps = generateResearchSteps(graph, []);

    const parentSteps = steps.filter(s => s.personId === 'p0');
    expect(parentSteps.length).toBeGreaterThan(0);
    expect(parentSteps[0].impact).toBe('high');
  });

  it('returns empty array when no persons need research', () => {
    const graph = buildGraph([]);
    const steps = generateResearchSteps(graph, []);
    expect(steps).toHaveLength(0);
  });

  it('generates steps for Irish persons', () => {
    const person = makePerson({
      id: 'p1',
      confidenceTier: 4,
      birth: {
        date: { date: null, endDate: null, qualifier: 'exact', raw: '1840', year: 1840 },
        place: { raw: 'Cork, Ireland', city: 'Cork', county: null, state: null, country: 'Ireland', parts: ['Cork', 'Ireland'] },
      },
    });

    const graph = buildGraph([person]);
    const steps = generateResearchSteps(graph, []);
    expect(steps.some(s => s.suggestedSource?.includes('IrishGenealogy'))).toBe(true);
  });
});
