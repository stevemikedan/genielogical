import { describe, it, expect } from 'vitest';
import type { ConfidenceTier } from '@/types/common.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import {
  computePersonIdentityScore,
  computeChainConfidence,
  computeAncestralConfidence,
  TIER_TO_PROBABILITY,
} from './report-scorer.ts';

// ── Helpers ─────────────────────────────────────────────────────────

function makePerson(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
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

function makeEdge(id: string, childId: string, parentId: string, tier: ConfidenceTier): Edge {
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

function makeSource(id: string, sourceClass: Source['sourceClass'], provesWhat: Source['provesWhat'] = ['identity']): Source {
  return {
    id,
    origin: 'user_added',
    sourceClass,
    sourceType: 'vital_record',
    title: `Source ${id}`,
    citation: '',
    notes: '',
    url: null,
    repository: null,
    provesWhat,
    attachedToPersonIds: [],
    attachedToEdgeIds: [],
    gedcomTag: null,
    sourceHash: '',
    addedAt: new Date(),
    addedBy: 'test',
  };
}

function makeFlag(id: string, personIds: string[], overrides: Partial<Flag> = {}): Flag {
  return {
    id,
    category: 'chronological',
    severity: 'warning',
    title: 'Test flag',
    description: 'Test description',
    suggestedAction: '',
    ruleId: 'TEST_RULE',
    affectedPersonIds: personIds,
    affectedEdgeIds: [],
    userStatus: 'new',
    userNote: null,
    detectedAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
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

// ── Tests ───────────────────────────────────────────────────────────

describe('computePersonIdentityScore', () => {
  it('returns high score (~0.85-1.0) for well-documented person', () => {
    const s1 = makeSource('s1', 'primary', ['identity']);
    const s2 = makeSource('s2', 'primary', ['birth']);
    const s3 = makeSource('s3', 'secondary', ['death']);
    const person = makePerson('p1', {
      sourceIds: ['s1', 's2', 's3'],
      name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
      birth: { date: { date: new Date(1800, 0, 1), endDate: null, qualifier: 'exact', raw: '1 Jan 1800', year: 1800 }, place: null },
    });
    const graph = buildGraph([person], [], [s1, s2, s3]);

    const score = computePersonIdentityScore(person, graph, []);
    expect(score).toBeGreaterThanOrEqual(0.85);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('returns moderate-low score for unsourced person with no date', () => {
    const person = makePerson('p1');
    const graph = buildGraph([person], []);

    const score = computePersonIdentityScore(person, graph, []);
    // Gets name consistency + no-flag bonus but nothing for sources/dates
    expect(score).toBeGreaterThanOrEqual(0.2);
    expect(score).toBeLessThanOrEqual(0.5);
  });

  it('penalizes persons with critical flags', () => {
    const s1 = makeSource('s1', 'secondary', ['identity']);
    const person = makePerson('p1', {
      sourceIds: ['s1'],
      birth: { date: { date: new Date(1800, 0, 1), endDate: null, qualifier: 'exact', raw: '1800', year: 1800 }, place: null },
    });
    const graph = buildGraph([person], [], [s1]);
    const flag = makeFlag('f1', ['p1'], { severity: 'critical', ruleId: 'CHRONO_IMPOSSIBLE' });

    const scoreNoFlag = computePersonIdentityScore(person, graph, []);
    const scoreWithFlag = computePersonIdentityScore(person, graph, [flag]);

    expect(scoreWithFlag).toBeLessThan(scoreNoFlag);
  });

  it('penalizes embedded titles in name', () => {
    const person = makePerson('p1', {
      name: { full: 'King of Scotland', given: 'Kenneth', middle: '', surname: '', maidenName: '', prefix: 'King', suffix: '', raw: 'King of Scotland' },
      birth: { date: { date: new Date(800, 0, 1), endDate: null, qualifier: 'about', raw: 'abt 800', year: 800 }, place: null },
    });
    const graph = buildGraph([person], []);

    const score = computePersonIdentityScore(person, graph, []);
    // Embedded title reduces name consistency bonus
    expect(score).toBeLessThan(0.5);
  });

  it('ignores dismissed/resolved flags', () => {
    const person = makePerson('p1', {
      birth: { date: { date: new Date(1800, 0, 1), endDate: null, qualifier: 'exact', raw: '1800', year: 1800 }, place: null },
    });
    const graph = buildGraph([person], []);
    const dismissedFlag = makeFlag('f1', ['p1'], { severity: 'critical', userStatus: 'dismissed' });

    const scoreNoFlag = computePersonIdentityScore(person, graph, []);
    const scoreWithDismissed = computePersonIdentityScore(person, graph, [dismissedFlag]);

    expect(scoreWithDismissed).toBe(scoreNoFlag);
  });

  it('returns 0-1 range always', () => {
    const person = makePerson('p1');
    const graph = buildGraph([person], []);

    const score = computePersonIdentityScore(person, graph, []);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('computeChainConfidence', () => {
  it('returns 1.0 for root person (no chain)', () => {
    const root = makePerson('root');
    const graph = buildGraph([root], []);

    const result = computeChainConfidence('root', 'root', graph);
    expect(result.score).toBe(1.0);
    expect(result.weakestTier).toBe(1);
    expect(result.path).toEqual(['root']);
  });

  it('computes correct product for 5 Tier-1 edges', () => {
    const persons = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'].map(id => makePerson(id));
    const edges = [
      makeEdge('e1', 'p1', 'p0', 1),
      makeEdge('e2', 'p2', 'p1', 1),
      makeEdge('e3', 'p3', 'p2', 1),
      makeEdge('e4', 'p4', 'p3', 1),
      makeEdge('e5', 'p5', 'p4', 1),
    ];
    const graph = buildGraph(persons, edges);

    const result = computeChainConfidence('p5', 'p0', graph);
    const expected = Math.pow(0.95, 5);
    expect(result.score).toBeCloseTo(expected, 4);
    expect(result.weakestTier).toBe(1);
  });

  it('dramatically drops with one Tier-4 edge', () => {
    const persons = ['p0', 'p1', 'p2', 'p3'].map(id => makePerson(id));
    const edges = [
      makeEdge('e1', 'p1', 'p0', 1),
      makeEdge('e2', 'p2', 'p1', 4), // weak link
      makeEdge('e3', 'p3', 'p2', 1),
    ];
    const graph = buildGraph(persons, edges);

    const result = computeChainConfidence('p3', 'p0', graph);
    const expected = 0.95 * 0.25 * 0.95;
    expect(result.score).toBeCloseTo(expected, 4);
    expect(result.weakestTier).toBe(4);
  });

  it('single edge returns tier probability', () => {
    const persons = ['p0', 'p1'].map(id => makePerson(id));
    const edges = [makeEdge('e1', 'p1', 'p0', 2)];
    const graph = buildGraph(persons, edges);

    const result = computeChainConfidence('p1', 'p0', graph);
    expect(result.score).toBeCloseTo(0.80, 4);
  });

  it('returns 0 when person not in graph', () => {
    const graph = buildGraph([], []);
    const result = computeChainConfidence('nonexistent', 'root', graph);
    expect(result.score).toBe(0);
  });

  it('returns 0 when no path exists to root', () => {
    const p0 = makePerson('p0');
    const p1 = makePerson('p1');
    // No edges connecting them
    const graph = buildGraph([p0, p1], []);

    const result = computeChainConfidence('p1', 'p0', graph);
    expect(result.score).toBe(0);
  });

  it('detects bridge zones in chain', () => {
    const persons = ['p0', 'p1', 'p2', 'p3', 'p4'].map(id => makePerson(id));
    const edges = [
      makeEdge('e1', 'p1', 'p0', 1),
      makeEdge('e2', 'p2', 'p1', 4),
      makeEdge('e3', 'p3', 'p2', 3),
      makeEdge('e4', 'p4', 'p3', 1),
    ];
    const graph = buildGraph(persons, edges);

    const result = computeChainConfidence('p4', 'p0', graph);
    expect(result.bridgeZones.length).toBeGreaterThanOrEqual(1);
  });

  it('guards against cycles', () => {
    const p0 = makePerson('p0');
    const p1 = makePerson('p1');
    // p0 -> p1 -> p0 (cycle)
    const edges = [
      makeEdge('e1', 'p1', 'p0', 1),
      makeEdge('e2', 'p0', 'p1', 1),
    ];
    const graph = buildGraph([p0, p1], edges);

    const result = computeChainConfidence('p1', 'someRoot', graph);
    expect(result.score).toBe(0);
  });

  it('computes 19-generation all-Tier-1 chain correctly', () => {
    const persons = Array.from({ length: 20 }, (_, i) => makePerson(`p${i}`));
    const edges = Array.from({ length: 19 }, (_, i) =>
      makeEdge(`e${i}`, `p${i + 1}`, `p${i}`, 1),
    );
    const graph = buildGraph(persons, edges);

    const result = computeChainConfidence('p19', 'p0', graph);
    const expected = Math.pow(0.95, 19);
    expect(result.score).toBeCloseTo(expected, 4);
    // Spec example: ~0.38
    expect(result.score).toBeGreaterThan(0.35);
    expect(result.score).toBeLessThan(0.42);
  });

  it('computes 19-generation all-Tier-2 chain correctly', () => {
    const persons = Array.from({ length: 20 }, (_, i) => makePerson(`p${i}`));
    const edges = Array.from({ length: 19 }, (_, i) =>
      makeEdge(`e${i}`, `p${i + 1}`, `p${i}`, 2),
    );
    const graph = buildGraph(persons, edges);

    const result = computeChainConfidence('p19', 'p0', graph);
    const expected = Math.pow(0.80, 19);
    expect(result.score).toBeCloseTo(expected, 4);
    expect(result.score).toBeLessThan(0.02);
  });
});

describe('computeAncestralConfidence', () => {
  it('returns product of identity and chain', () => {
    expect(computeAncestralConfidence(0.8, 0.5)).toBeCloseTo(0.4, 4);
  });

  it('returns 0 when identity is 0', () => {
    expect(computeAncestralConfidence(0, 0.9)).toBe(0);
  });

  it('returns 0 when chain is 0', () => {
    expect(computeAncestralConfidence(0.9, 0)).toBe(0);
  });

  it('returns 1 when both are 1', () => {
    expect(computeAncestralConfidence(1, 1)).toBe(1);
  });

  it('high identity × low chain → low ancestral', () => {
    const result = computeAncestralConfidence(0.9, 0.1);
    expect(result).toBeCloseTo(0.09, 4);
    expect(result).toBeLessThan(0.15);
  });

  it('low identity × high chain → low ancestral', () => {
    const result = computeAncestralConfidence(0.2, 0.9);
    expect(result).toBeCloseTo(0.18, 4);
    expect(result).toBeLessThan(0.25);
  });
});

describe('TIER_TO_PROBABILITY', () => {
  it('has correct values', () => {
    expect(TIER_TO_PROBABILITY[1]).toBe(0.95);
    expect(TIER_TO_PROBABILITY[2]).toBe(0.80);
    expect(TIER_TO_PROBABILITY[3]).toBe(0.55);
    expect(TIER_TO_PROBABILITY[4]).toBe(0.25);
  });

  it('is monotonically decreasing', () => {
    expect(TIER_TO_PROBABILITY[1]).toBeGreaterThan(TIER_TO_PROBABILITY[2]);
    expect(TIER_TO_PROBABILITY[2]).toBeGreaterThan(TIER_TO_PROBABILITY[3]);
    expect(TIER_TO_PROBABILITY[3]).toBeGreaterThan(TIER_TO_PROBABILITY[4]);
  });
});
