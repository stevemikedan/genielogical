import { describe, it, expect } from 'vitest';
import type { ConfidenceTier } from '@/types/common.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import type { ReportScope } from '@/types/report.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import {
  extractNotablePeople,
  extractDataQualityIssues,
  computeBranchCoverage,
} from './report-extractors.ts';

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

function makeSource(id: string): Source {
  return {
    id,
    origin: 'user_added',
    sourceClass: 'secondary',
    sourceType: 'vital_record',
    title: `Source ${id}`,
    citation: '',
    notes: '',
    url: null,
    repository: null,
    provesWhat: ['identity'],
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
    description: 'Test',
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

function defaultScope(overrides: Partial<ReportScope> = {}): ReportScope {
  return {
    mode: 'full_tree',
    rootPersonId: null,
    sexFilter: null,
    minConfidenceTier: null,
    generationRange: null,
    ...overrides,
  };
}

// ── Notable Women Tests ─────────────────────────────────────────────

describe('extractNotablePeople — Notable Women', () => {
  it('extracts women matching title patterns', () => {
    const root = makePerson('root', { sex: 'M' });
    const mother = makePerson('mother', {
      sex: 'F',
      name: { full: 'Jane Smith', given: 'Jane', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'Jane /Smith/' },
      sourceIds: ['s1'],
    });
    const grandmother = makePerson('grandma', {
      sex: 'F',
      name: { full: 'Queen of Scotland', given: 'Margaret', middle: '', surname: '', maidenName: '', prefix: 'Queen', suffix: '', raw: 'Queen of Scotland' },
    });
    const grandfather = makePerson('grandpa', {
      sex: 'M',
      name: { full: 'Colonel James', given: 'James', middle: '', surname: '', maidenName: '', prefix: 'Colonel', suffix: '', raw: 'Colonel James' },
    });
    const reverend = makePerson('rev', {
      sex: 'F',
      notes: 'She was a Reverend in the local parish',
    });

    const s1 = makeSource('s1');
    const edges = [
      makeEdge('e1', 'root', 'mother', 1),
      makeEdge('e2', 'root', 'grandpa', 1),
      makeEdge('e3', 'mother', 'grandma', 2),
      makeEdge('e4', 'mother', 'rev', 2),
    ];

    const graph = buildGraph([root, mother, grandmother, grandfather, reverend], edges, [s1]);
    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'F',
      scope: defaultScope(),
    });

    // Should find queen, reverend, and mother (documented with source)
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const personIds = candidates.map(c => c.personId);
    expect(personIds).toContain('grandma');
    expect(personIds).toContain('rev');
    // Mother has a source so she's a "documented ancestor"
    expect(personIds).toContain('mother');
    // Males excluded
    expect(personIds).not.toContain('grandpa');
    expect(personIds).not.toContain('root');
  });

  it('splits direct_line vs historical', () => {
    const root = makePerson('root', { sex: 'M' });
    const mother = makePerson('mother', { sex: 'F', sourceIds: ['s1'] });
    const grandma = makePerson('grandma', { sex: 'F', sourceIds: ['s1'] });
    // Grandfather is male — not in maternal direct line but has a female parent
    const grandpa = makePerson('grandpa', { sex: 'M' });
    const queenAncestor = makePerson('queen', {
      sex: 'F',
      name: { full: 'Queen of England', given: 'Elizabeth', middle: '', surname: '', maidenName: '', prefix: '', suffix: '', raw: 'Queen of England' },
    });

    const s1 = makeSource('s1');
    const edges = [
      makeEdge('e1', 'root', 'mother', 1),
      makeEdge('e2', 'root', 'grandpa', 1),
      makeEdge('e3', 'mother', 'grandma', 1),
      // Queen is grandpa's parent — different branch from maternal line
      makeEdge('e4', 'grandpa', 'queen', 2),
    ];

    const graph = buildGraph([root, mother, grandma, grandpa, queenAncestor], edges, [s1]);
    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'F',
      scope: defaultScope(),
    });

    const directLine = candidates.filter(c => c.section === 'direct_line');
    const historical = candidates.filter(c => c.section === 'historical');

    // Mother and grandma are direct line (maternal line)
    expect(directLine.map(c => c.personId)).toContain('mother');
    expect(directLine.map(c => c.personId)).toContain('grandma');
    // Queen is through paternal line — not maternal direct line
    expect(historical.map(c => c.personId)).toContain('queen');
  });

  it('filters by direct_line scope mode', () => {
    const root = makePerson('root', { sex: 'M' });
    const mother = makePerson('mother', { sex: 'F', sourceIds: ['s1'] });
    const aunt = makePerson('aunt', {
      sex: 'F',
      name: { full: 'Queen of France', given: 'Marie', middle: '', surname: '', maidenName: '', prefix: '', suffix: '', raw: 'Queen of France' },
    });

    const s1 = makeSource('s1');
    const edges = [
      makeEdge('e1', 'root', 'mother', 1),
      makeEdge('e2', 'root', 'aunt', 1),
    ];

    const graph = buildGraph([root, mother, aunt], edges, [s1]);
    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'F',
      scope: defaultScope({ mode: 'direct_line' }),
    });

    // Only direct line (maternal line) included
    const ids = candidates.map(c => c.personId);
    expect(ids).toContain('mother');
  });

  it('returns empty for tree with no women', () => {
    const root = makePerson('root', { sex: 'M' });
    const father = makePerson('father', { sex: 'M', sourceIds: ['s1'] });

    const s1 = makeSource('s1');
    const edges = [makeEdge('e1', 'root', 'father', 1)];
    const graph = buildGraph([root, father], edges, [s1]);

    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'F',
      scope: defaultScope(),
    });
    expect(candidates).toEqual([]);
  });

  it('returns empty for empty tree', () => {
    const graph = buildGraph([], []);
    const candidates = extractNotablePeople(graph, [], 'nonexistent', {
      sex: 'F',
      scope: defaultScope(),
    });
    expect(candidates).toEqual([]);
  });

  it('includes documented ancestor without pattern match', () => {
    const root = makePerson('root', { sex: 'M' });
    const mother = makePerson('mother', {
      sex: 'F',
      sourceIds: ['s1'],
      name: { full: 'Plain Jane', given: 'Jane', middle: '', surname: 'Doe', maidenName: '', prefix: '', suffix: '', raw: 'Jane /Doe/' },
    });

    const s1 = makeSource('s1');
    const edges = [makeEdge('e1', 'root', 'mother', 1)];
    const graph = buildGraph([root, mother], edges, [s1]);

    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'F',
      scope: defaultScope(),
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0].matchReasons).toContain('Documented ancestor');
  });

  it('sorts by ancestral confidence descending', () => {
    const root = makePerson('root', { sex: 'M' });
    const mother = makePerson('mother', {
      sex: 'F',
      sourceIds: ['s1'],
      birth: { date: { date: new Date(1800, 0, 1), endDate: null, qualifier: 'exact', raw: '1800', year: 1800 }, place: null },
    });
    const grandma = makePerson('grandma', {
      sex: 'F',
      name: { full: 'Queen of Scotland', given: 'Mary', middle: '', surname: '', maidenName: '', prefix: '', suffix: '', raw: 'Queen of Scotland' },
    });

    const s1 = makeSource('s1');
    const edges = [
      makeEdge('e1', 'root', 'mother', 1),
      makeEdge('e2', 'mother', 'grandma', 4),
    ];

    const graph = buildGraph([root, mother, grandma], edges, [s1]);
    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'F',
      scope: defaultScope(),
    });

    // First candidate should have higher ancestral confidence
    if (candidates.length >= 2) {
      expect(candidates[0].ancestralConfidence).toBeGreaterThanOrEqual(
        candidates[1].ancestralConfidence,
      );
    }
  });

  it('computes scoring metrics correctly', () => {
    const root = makePerson('root', { sex: 'M' });
    const mother = makePerson('mother', {
      sex: 'F',
      sourceIds: ['s1'],
      birth: { date: { date: new Date(1800, 0, 1), endDate: null, qualifier: 'exact', raw: '1800', year: 1800 }, place: null },
    });

    const s1 = makeSource('s1');
    const edges = [makeEdge('e1', 'root', 'mother', 1)];
    const graph = buildGraph([root, mother], edges, [s1]);

    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'F',
      scope: defaultScope(),
    });

    expect(candidates.length).toBe(1);
    const c = candidates[0];
    expect(c.personIdentityScore).toBeGreaterThan(0);
    expect(c.personIdentityScore).toBeLessThanOrEqual(1);
    expect(c.chainConfidence).toBeGreaterThan(0);
    expect(c.chainConfidence).toBeLessThanOrEqual(1);
    expect(c.ancestralConfidence).toBeCloseTo(c.personIdentityScore * c.chainConfidence, 4);
  });
});

// ── Notable Men Tests ───────────────────────────────────────────────

describe('extractNotablePeople — Notable Men', () => {
  it('extracts men matching patterns, excludes women', () => {
    const root = makePerson('root', { sex: 'M' });
    const father = makePerson('father', {
      sex: 'M',
      name: { full: 'Colonel James', given: 'James', middle: '', surname: '', maidenName: '', prefix: '', suffix: '', raw: 'Colonel James' },
    });
    const mother = makePerson('mother', {
      sex: 'F',
      name: { full: 'Queen of England', given: 'Elizabeth', middle: '', surname: '', maidenName: '', prefix: '', suffix: '', raw: 'Queen of England' },
    });

    const edges = [
      makeEdge('e1', 'root', 'father', 1),
      makeEdge('e2', 'root', 'mother', 1),
    ];

    const graph = buildGraph([root, father, mother], edges);
    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'M',
      scope: defaultScope(),
    });

    const ids = candidates.map(c => c.personId);
    expect(ids).toContain('father');
    expect(ids).not.toContain('mother');
  });
});

// ── Data Quality Tests ──────────────────────────────────────────────

describe('extractDataQualityIssues', () => {
  it('detects missing birth date', () => {
    const person = makePerson('p1', { birth: { date: null, place: null } });
    const graph = buildGraph([person], []);
    const candidates = extractDataQualityIssues(graph, []);

    const issues = candidates.find(c => c.personId === 'p1')?.issues ?? [];
    expect(issues.some(i => i.type === 'missing_date')).toBe(true);
  });

  it('detects no sources', () => {
    const person = makePerson('p1', { sourceIds: [] });
    const graph = buildGraph([person], []);
    const candidates = extractDataQualityIssues(graph, []);

    const issues = candidates.find(c => c.personId === 'p1')?.issues ?? [];
    expect(issues.some(i => i.type === 'no_sources')).toBe(true);
    expect(issues.find(i => i.type === 'no_sources')!.severity).toBe('critical');
  });

  it('detects impossible dates from flags', () => {
    const person = makePerson('p1');
    const graph = buildGraph([person], []);
    const flag = makeFlag('f1', ['p1'], { ruleId: 'CHRONO_IMPOSSIBLE', severity: 'critical' });

    const candidates = extractDataQualityIssues(graph, [flag]);
    const issues = candidates.find(c => c.personId === 'p1')?.issues ?? [];
    expect(issues.some(i => i.type === 'impossible_date')).toBe(true);
  });

  it('detects orphan persons', () => {
    const person = makePerson('p1');
    const graph = buildGraph([person], []);
    const candidates = extractDataQualityIssues(graph, []);

    const issues = candidates.find(c => c.personId === 'p1')?.issues ?? [];
    expect(issues.some(i => i.type === 'orphan')).toBe(true);
  });

  it('detects name overloading', () => {
    const person = makePerson('p1', {
      name: { full: 'King of Scotland', given: 'Kenneth', middle: '', surname: '', maidenName: '', prefix: '', suffix: '', raw: 'King of Scotland' },
    });
    const graph = buildGraph([person], []);
    const candidates = extractDataQualityIssues(graph, []);

    const issues = candidates.find(c => c.personId === 'p1')?.issues ?? [];
    expect(issues.some(i => i.type === 'name_overloading')).toBe(true);
  });

  it('computes quality score correctly', () => {
    const cleanPerson = makePerson('clean', {
      sourceIds: ['s1'],
      birth: { date: { date: new Date(1900, 0, 1), endDate: null, qualifier: 'exact', raw: '1900', year: 1900 }, place: { raw: 'London', city: 'London', county: null, state: null, country: 'England', parts: ['London'] } },
      death: { date: { date: new Date(1980, 0, 1), endDate: null, qualifier: 'exact', raw: '1980', year: 1980 }, place: null },
    });
    const dirtyPerson = makePerson('dirty');

    const s1 = makeSource('s1');
    const edges = [makeEdge('e1', 'dirty', 'clean', 1)];
    const graph = buildGraph([cleanPerson, dirtyPerson], edges, [s1]);

    const candidates = extractDataQualityIssues(graph, []);
    const clean = candidates.find(c => c.personId === 'clean')!;
    const dirty = candidates.find(c => c.personId === 'dirty')!;

    expect(clean.qualityScore).toBeGreaterThan(dirty.qualityScore);
    expect(dirty.qualityScore).toBeLessThan(1.0);
  });

  it('sorts by quality score ascending (worst first)', () => {
    const good = makePerson('good', {
      sourceIds: ['s1'],
      birth: { date: { date: new Date(1900, 0, 1), endDate: null, qualifier: 'exact', raw: '1900', year: 1900 }, place: null },
    });
    const bad = makePerson('bad');

    const s1 = makeSource('s1');
    const edges = [makeEdge('e1', 'bad', 'good', 1)];
    const graph = buildGraph([good, bad], edges, [s1]);

    const candidates = extractDataQualityIssues(graph, []);
    expect(candidates[0].qualityScore).toBeLessThanOrEqual(
      candidates[candidates.length - 1].qualityScore,
    );
  });
});

// ── Branch Coverage Tests ───────────────────────────────────────────

describe('computeBranchCoverage', () => {
  it('computes correct coverage percentages', () => {
    const root = makePerson('root');
    const father = makePerson('father');
    const mother = makePerson('mother');
    const gf = makePerson('gf');
    const gm = makePerson('gm');
    // 3 ancestors under gf, 1 with sources
    const ggf = makePerson('ggf', { sourceIds: ['s1'] });
    const ggm = makePerson('ggm');

    const s1 = makeSource('s1');
    const edges = [
      makeEdge('e1', 'root', 'father', 1),
      makeEdge('e2', 'root', 'mother', 1),
      makeEdge('e3', 'father', 'gf', 1),
      makeEdge('e4', 'father', 'gm', 1),
      makeEdge('e5', 'gf', 'ggf', 1),
      makeEdge('e6', 'gf', 'ggm', 1),
    ];

    const graph = buildGraph([root, father, mother, gf, gm, ggf, ggm], edges, [s1]);
    const coverage = computeBranchCoverage(graph, 'root');

    expect(coverage.length).toBeGreaterThan(0);
    // At least one branch should have coverage > 0
    const hasSourced = coverage.some(b => b.coveragePercent > 0);
    expect(hasSourced).toBe(true);
  });

  it('returns empty for empty tree', () => {
    const graph = buildGraph([], []);
    const coverage = computeBranchCoverage(graph, 'nonexistent');
    expect(coverage).toEqual([]);
  });
});
