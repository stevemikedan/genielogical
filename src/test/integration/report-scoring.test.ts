/**
 * Integration tests: Mathematical model validation for three-metric confidence scoring.
 * Verifies chain degradation, person identity ranges, and ancestral confidence products.
 */
import { describe, it, expect } from 'vitest';
import { makePerson, makeEdge, makeSource, makeGraph, makeFlag } from '@/test/test-utils.ts';
import {
  computePersonIdentityScore,
  computeChainConfidence,
  computeAncestralConfidence,
  TIER_TO_PROBABILITY,
} from '@/engine/report-scorer.ts';
import type { ConfidenceTier } from '@/types/common.ts';

// ── Helper: Build a linear ancestor chain ──────────────────────────

function buildLinearChain(length: number, tier: ConfidenceTier) {
  const persons = [];
  const edges = [];
  for (let i = 0; i <= length; i++) {
    persons.push(makePerson({ id: `p${i}` }));
  }
  for (let i = 0; i < length; i++) {
    edges.push(makeEdge({
      id: `e${i}`,
      childId: `p${i}`,
      parentId: `p${i + 1}`,
      confidenceTier: tier,
    }));
  }
  return makeGraph(persons, edges);
}

describe('Chain Degradation Verification', () => {
  it('19-generation chain, all Tier 1 → ~0.377', () => {
    const graph = buildLinearChain(19, 1);
    const result = computeChainConfidence('p0', 'p19', graph);
    const expected = Math.pow(0.95, 19);
    expect(result.score).toBeCloseTo(expected, 3);
    expect(result.score).toBeGreaterThan(0.35);
    expect(result.score).toBeLessThan(0.40);
    expect(result.weakestTier).toBe(1);
  });

  it('19-generation chain, all Tier 2 → ~0.014', () => {
    const graph = buildLinearChain(19, 2);
    const result = computeChainConfidence('p0', 'p19', graph);
    const expected = Math.pow(0.80, 19);
    expect(result.score).toBeCloseTo(expected, 3);
    expect(result.score).toBeLessThan(0.02);
    expect(result.weakestTier).toBe(2);
  });

  it('19-generation chain, all Tier 3 → very small', () => {
    const graph = buildLinearChain(19, 3);
    const result = computeChainConfidence('p0', 'p19', graph);
    const expected = Math.pow(0.55, 19);
    expect(result.score).toBeCloseTo(expected, 5);
    expect(result.score).toBeLessThan(0.001);
  });

  it('19-generation chain, all Tier 4 → effectively zero', () => {
    const graph = buildLinearChain(19, 4);
    const result = computeChainConfidence('p0', 'p19', graph);
    const expected = Math.pow(0.25, 19);
    expect(result.score).toBeCloseTo(expected, 10);
    expect(result.score).toBeLessThan(0.000001);
  });

  it('single Tier-4 edge in 10-link chain dramatically reduces confidence', () => {
    const persons = [];
    const edges = [];
    for (let i = 0; i <= 10; i++) persons.push(makePerson({ id: `p${i}` }));
    for (let i = 0; i < 10; i++) {
      edges.push(makeEdge({
        id: `e${i}`,
        childId: `p${i}`,
        parentId: `p${i + 1}`,
        confidenceTier: i === 5 ? 4 : 1,
      }));
    }
    const graph = makeGraph(persons, edges);

    const result = computeChainConfidence('p0', 'p10', graph);
    const allTier1 = Math.pow(0.95, 10);
    const withOneTier4 = Math.pow(0.95, 9) * 0.25;

    expect(result.score).toBeCloseTo(withOneTier4, 3);
    expect(result.score / allTier1).toBeCloseTo(0.25 / 0.95, 2);
    expect(result.weakestTier).toBe(4);
  });

  it('5-link all-Tier-1 chain → ~0.774', () => {
    const graph = buildLinearChain(5, 1);
    const result = computeChainConfidence('p0', 'p5', graph);
    expect(result.score).toBeCloseTo(Math.pow(0.95, 5), 3);
    expect(result.score).toBeGreaterThan(0.77);
  });

  it('single-edge chain = edge tier probability', () => {
    for (const tier of [1, 2, 3, 4] as ConfidenceTier[]) {
      const graph = buildLinearChain(1, tier);
      const result = computeChainConfidence('p0', 'p1', graph);
      expect(result.score).toBeCloseTo(TIER_TO_PROBABILITY[tier], 5);
    }
  });

  it('root person (start = target) → chain = 1.0', () => {
    const graph = buildLinearChain(3, 1);
    const result = computeChainConfidence('p0', 'p0', graph);
    expect(result.score).toBe(1.0);
    expect(result.weakestTier).toBe(1);
  });
});

describe('Person Identity Scoring Ranges', () => {
  it('well-documented modern person with 3 primary sources → 0.85-1.0', () => {
    const sources = [
      makeSource({ id: 's1', sourceClass: 'primary' }),
      makeSource({ id: 's2', sourceClass: 'primary' }),
      makeSource({ id: 's3', sourceClass: 'primary' }),
    ];
    const person = makePerson({
      id: 'modern',
      name: { given: 'John', surname: 'Smith' },
      birth: { date: { date: new Date('1950-01-01'), endDate: null, qualifier: 'exact', raw: '1 JAN 1950', year: 1950 }, place: null },
      sourceIds: ['s1', 's2', 's3'],
    });
    const graph = makeGraph([person], [], sources);
    const score = computePersonIdentityScore(person, graph, []);
    expect(score).toBeGreaterThanOrEqual(0.85);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('unsourced medieval person with embedded title → 0.05-0.25', () => {
    const person = makePerson({
      id: 'medieval',
      name: { full: 'King of Norway', given: '', surname: '' },
    });
    const graph = makeGraph([person]);
    const flag = makeFlag({
      id: 'f1',
      ruleId: 'PRESTIGE_TITLE_IN_NAME',
      severity: 'warning',
      affectedPersonIds: ['medieval'],
    });
    const score = computePersonIdentityScore(person, graph, [flag]);
    expect(score).toBeGreaterThanOrEqual(0.05);
    expect(score).toBeLessThanOrEqual(0.25);
  });

  it('average person with 1 secondary source and birth date → 0.55-0.85', () => {
    // secondary=0.2, name(given+surname)=0.2, birth date=0.2, no flags=0.2 → 0.8
    const sources = [makeSource({ id: 's1', sourceClass: 'secondary' })];
    const person = makePerson({
      id: 'avg',
      name: { given: 'Jane', surname: 'Doe' },
      birth: { date: { date: new Date('1820-06-15'), endDate: null, qualifier: 'exact', raw: '15 JUN 1820', year: 1820 }, place: null },
      sourceIds: ['s1'],
    });
    const graph = makeGraph([person], [], sources);
    const score = computePersonIdentityScore(person, graph, []);
    expect(score).toBeGreaterThanOrEqual(0.55);
    expect(score).toBeLessThanOrEqual(0.85);
  });

  it('person with critical flag gets lower score', () => {
    const person = makePerson({
      id: 'flagged',
      name: { given: 'Bob', surname: 'Test' },
      birth: { date: { date: new Date('1800-01-01'), endDate: null, qualifier: 'exact', raw: '1800', year: 1800 }, place: null },
    });
    const graph = makeGraph([person]);
    const critFlag = makeFlag({
      id: 'f1',
      ruleId: 'CHRONO_IMPOSSIBLE',
      severity: 'critical',
      affectedPersonIds: ['flagged'],
    });
    const scoreWithFlag = computePersonIdentityScore(person, graph, [critFlag]);
    const scoreNoFlag = computePersonIdentityScore(person, graph, []);
    expect(scoreWithFlag).toBeLessThan(scoreNoFlag);
  });
});

describe('Ancestral Confidence Products', () => {
  it('high identity × high chain → high ancestral (modern documented parent)', () => {
    const ancestral = computeAncestralConfidence(0.9, 0.95);
    expect(ancestral).toBeCloseTo(0.855, 3);
    expect(ancestral).toBeGreaterThan(0.8);
  });

  it('high identity × low chain → low ancestral (well-documented but far away)', () => {
    const ancestral = computeAncestralConfidence(0.9, 0.1);
    expect(ancestral).toBeCloseTo(0.09, 3);
    expect(ancestral).toBeLessThan(0.1);
  });

  it('low identity × high chain → low ancestral (close but poorly documented)', () => {
    const ancestral = computeAncestralConfidence(0.15, 0.95);
    expect(ancestral).toBeCloseTo(0.1425, 3);
    expect(ancestral).toBeLessThan(0.15);
  });

  it('0 × anything = 0', () => {
    expect(computeAncestralConfidence(0, 0.9)).toBe(0);
    expect(computeAncestralConfidence(0, 1.0)).toBe(0);
  });

  it('anything × 0 = 0', () => {
    expect(computeAncestralConfidence(0.9, 0)).toBe(0);
    expect(computeAncestralConfidence(1.0, 0)).toBe(0);
  });

  it('1 × 1 = 1', () => {
    expect(computeAncestralConfidence(1, 1)).toBe(1);
  });

  it('realistic end-to-end: 19-gen chain with avg identity', () => {
    const chain = Math.pow(0.95, 19); // ~0.377
    const ancestral = computeAncestralConfidence(0.9, chain);
    expect(ancestral).toBeCloseTo(0.9 * chain, 3);
    expect(ancestral).toBeGreaterThan(0.30);
    expect(ancestral).toBeLessThan(0.40);
  });
});
