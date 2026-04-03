import { describe, it, expect } from 'vitest';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import { scoreEdgeConfidence, scorePersonConfidence, scoreAllConfidence } from './confidence-scorer.ts';

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

function makeSource(overrides: Partial<Source> & { id: string }): Source {
  return {
    origin: 'user_added',
    sourceClass: 'tertiary',
    sourceType: 'other',
    title: 'Test Source',
    citation: '',
    notes: '',
    url: null,
    repository: null,
    provesWhat: [],
    attachedToPersonIds: [],
    attachedToEdgeIds: [],
    gedcomTag: null,
    sourceHash: '',
    addedAt: new Date(),
    addedBy: 'test',
    ...overrides,
  };
}

function makeFlag(overrides: Partial<Flag> & { id: string }): Flag {
  return {
    category: 'data_quality',
    severity: 'warning',
    ruleId: 'TEST',
    title: 'Test Flag',
    description: '',
    suggestedAction: '',
    affectedPersonIds: [],
    affectedEdgeIds: [],
    userStatus: 'new',
    userNote: null,
    detectedAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

function makeDate(year: number) {
  return { date: new Date(year, 0, 1), endDate: null, qualifier: 'exact' as const, raw: String(year), year };
}

function buildGraph(persons: Person[], edges: Edge[], sources: Source[] = []): TreeGraph {
  const graph = new TreeGraph();
  for (const p of persons) graph.persons.set(p.id, p);
  for (const s of sources) graph.sources.set(s.id, s);
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

// ── Edge Confidence Tests ────────────────────────────────────────────

describe('scoreEdgeConfidence', () => {
  it('returns Tier 1 for edge with primary source proving parentage', () => {
    const source = makeSource({
      id: 's1',
      sourceClass: 'primary',
      provesWhat: ['parentage'],
    });
    const parent = makePerson({ id: 'parent', birth: { date: makeDate(1800), place: null } });
    const child = makePerson({ id: 'child' });
    const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child', sourceIds: ['s1'] });
    const graph = buildGraph([parent, child], [edge], [source]);
    const result = scoreEdgeConfidence(edge, graph);
    expect(result.tier).toBe(1);
  });

  it('returns Tier 2 for edge with secondary source', () => {
    const source = makeSource({
      id: 's1',
      sourceClass: 'secondary',
      provesWhat: ['parentage'],
    });
    const parent = makePerson({ id: 'parent', birth: { date: makeDate(1800), place: null } });
    const child = makePerson({ id: 'child' });
    const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child', sourceIds: ['s1'] });
    const graph = buildGraph([parent, child], [edge], [source]);
    const result = scoreEdgeConfidence(edge, graph);
    expect(result.tier).toBe(2);
  });

  it('returns Tier 3 for edge with no sources', () => {
    const parent = makePerson({ id: 'parent', birth: { date: makeDate(1800), place: null } });
    const child = makePerson({ id: 'child' });
    const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child' });
    const graph = buildGraph([parent, child], [edge]);
    const result = scoreEdgeConfidence(edge, graph);
    expect(result.tier).toBe(3);
  });

  it('returns at least Tier 3 for edge with critical flag', () => {
    const source = makeSource({
      id: 's1',
      sourceClass: 'primary',
      provesWhat: ['parentage'],
    });
    const parent = makePerson({ id: 'parent', birth: { date: makeDate(1800), place: null } });
    const child = makePerson({ id: 'child' });
    const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child', sourceIds: ['s1'] });
    const graph = buildGraph([parent, child], [edge], [source]);
    const flag = makeFlag({
      id: 'f1',
      severity: 'critical',
      affectedEdgeIds: ['e1'],
    });
    const result = scoreEdgeConfidence(edge, graph, [flag]);
    expect(result.tier).toBeGreaterThanOrEqual(3);
  });

  it('returns Tier 4 for chronological impossibility', () => {
    const parent = makePerson({ id: 'parent', birth: { date: makeDate(1800), place: null } });
    const child = makePerson({ id: 'child' });
    const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child' });
    const graph = buildGraph([parent, child], [edge]);
    const flag = makeFlag({
      id: 'f1',
      severity: 'critical',
      ruleId: 'CHRONO_BIRTH_BEFORE_PARENT',
      affectedEdgeIds: ['e1'],
    });
    const result = scoreEdgeConfidence(edge, graph, [flag]);
    expect(result.tier).toBe(4);
  });

  it('caps at Tier 2 for pre-1500 era', () => {
    const source = makeSource({
      id: 's1',
      sourceClass: 'primary',
      provesWhat: ['parentage'],
    });
    const parent = makePerson({ id: 'parent', birth: { date: makeDate(1400), place: null } });
    const child = makePerson({ id: 'child' });
    const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child', sourceIds: ['s1'] });
    const graph = buildGraph([parent, child], [edge], [source]);
    const result = scoreEdgeConfidence(edge, graph);
    expect(result.tier).toBeGreaterThanOrEqual(2);
  });

  it('caps at Tier 3 for pre-800 era', () => {
    const source = makeSource({
      id: 's1',
      sourceClass: 'primary',
      provesWhat: ['parentage'],
    });
    const parent = makePerson({ id: 'parent', birth: { date: makeDate(700), place: null } });
    const child = makePerson({ id: 'child' });
    const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child', sourceIds: ['s1'] });
    const graph = buildGraph([parent, child], [edge], [source]);
    const result = scoreEdgeConfidence(edge, graph);
    expect(result.tier).toBeGreaterThanOrEqual(3);
  });

  it('returns Tier 4 for unsourced edge with flags', () => {
    const parent = makePerson({ id: 'parent', birth: { date: makeDate(1800), place: null } });
    const child = makePerson({ id: 'child' });
    const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child' });
    const graph = buildGraph([parent, child], [edge]);
    const flag = makeFlag({
      id: 'f1',
      severity: 'warning',
      affectedEdgeIds: ['e1'],
    });
    const result = scoreEdgeConfidence(edge, graph, [flag]);
    expect(result.tier).toBe(4);
  });
});

// ── Person Confidence Tests ──────────────────────────────────────────

describe('scorePersonConfidence', () => {
  it('root with primary birth source gets Tier 1', () => {
    const source = makeSource({
      id: 's1',
      sourceClass: 'primary',
      provesWhat: ['birth'],
    });
    const person = makePerson({ id: 'p1', sourceIds: ['s1'] });
    const graph = buildGraph([person], [], [source]);
    const result = scorePersonConfidence(person, graph);
    expect(result.tier).toBe(1);
  });

  it('root with secondary source gets Tier 2', () => {
    const source = makeSource({
      id: 's1',
      sourceClass: 'secondary',
      provesWhat: ['identity'],
    });
    const person = makePerson({ id: 'p1', sourceIds: ['s1'] });
    const graph = buildGraph([person], [], [source]);
    const result = scorePersonConfidence(person, graph);
    expect(result.tier).toBe(2);
  });

  it('root with no sources gets Tier 3', () => {
    const person = makePerson({ id: 'p1' });
    const graph = buildGraph([person], []);
    const result = scorePersonConfidence(person, graph);
    expect(result.tier).toBe(3);
  });

  it('person inherits worst parent edge tier', () => {
    const parent1 = makePerson({ id: 'p1' });
    const parent2 = makePerson({ id: 'p2' });
    const child = makePerson({ id: 'child' });
    const e1 = makeEdge({ id: 'e1', parentId: 'p1', childId: 'child', confidenceTier: 1 as ConfidenceTier });
    const e2 = makeEdge({ id: 'e2', parentId: 'p2', childId: 'child', confidenceTier: 3 as ConfidenceTier });
    const graph = buildGraph([parent1, parent2, child], [e1, e2]);
    const result = scorePersonConfidence(child, graph);
    expect(result.tier).toBe(3);
  });

  it('self-sourcing bonus improves by 1 tier', () => {
    const source = makeSource({
      id: 's1',
      sourceClass: 'primary',
      provesWhat: ['identity'],
    });
    const parent = makePerson({ id: 'parent' });
    const child = makePerson({ id: 'child', sourceIds: ['s1'] });
    const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child', confidenceTier: 3 as ConfidenceTier });
    const graph = buildGraph([parent, child], [edge], [source]);
    const result = scorePersonConfidence(child, graph);
    expect(result.tier).toBe(2);
  });

  it('self-sourcing bonus cannot improve past Tier 2', () => {
    const source = makeSource({
      id: 's1',
      sourceClass: 'primary',
      provesWhat: ['identity'],
    });
    const parent = makePerson({ id: 'parent' });
    const child = makePerson({ id: 'child', sourceIds: ['s1'] });
    // Edge at tier 2 — bonus would try to make it tier 1 but can't
    const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child', confidenceTier: 2 as ConfidenceTier });
    const graph = buildGraph([parent, child], [edge], [source]);
    const result = scorePersonConfidence(child, graph);
    expect(result.tier).toBe(2); // stays at 2, bonus doesn't apply since not tier 3-4
  });

  it('critical flag pushes person to at least Tier 3', () => {
    const source = makeSource({
      id: 's1',
      sourceClass: 'primary',
      provesWhat: ['birth'],
    });
    const person = makePerson({ id: 'p1', sourceIds: ['s1'] });
    const graph = buildGraph([person], [], [source]);
    const flag = makeFlag({
      id: 'f1',
      severity: 'critical',
      affectedPersonIds: ['p1'],
    });
    const result = scorePersonConfidence(person, graph, [flag]);
    expect(result.tier).toBeGreaterThanOrEqual(3);
  });
});

// ── Score All Tests ──────────────────────────────────────────────────

describe('scoreAllConfidence', () => {
  it('mutates graph edges and persons in place', () => {
    const source = makeSource({
      id: 's1',
      sourceClass: 'primary',
      provesWhat: ['parentage'],
    });
    const parent = makePerson({ id: 'parent', birth: { date: makeDate(1800), place: null } });
    const child = makePerson({ id: 'child' });
    const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child', sourceIds: ['s1'] });
    const graph = buildGraph([parent, child], [edge], [source]);

    scoreAllConfidence(graph, []);

    expect(edge.confidenceTier).toBe(1);
    expect(edge.confidenceReason).toContain('Documented');
    // Child inherits from parent edge
    expect(child.confidenceTier).toBe(1);
  });
});
