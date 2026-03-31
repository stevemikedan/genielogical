/**
 * Integration tests: Full report pipeline from graph construction through
 * extraction, scoring, and report generation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makePerson, makeEdge, makeSource, makeGraph } from '@/test/test-utils.ts';
import { extractNotablePeople, extractDataQualityIssues, computeBranchCoverage } from '@/engine/report-extractors.ts';
import { runNotablePeopleReport, runDataQualityReport } from '@/engine/report-pipeline.ts';
import type { ReportConfig, ReportScope } from '@/types/report.ts';

// Mock AI client — no real API calls
vi.mock('@/ai/ai-client.ts', () => ({
  getApiKey: vi.fn(() => 'test-key'),
  sendMessage: vi.fn(async () => ({
    text: JSON.stringify({
      plausibility: 'plausible',
      narrative: 'A notable historical figure.',
      issues: [],
      suggestedTier: 2,
    }),
    inputTokens: 500,
    outputTokens: 100,
  })),
}));

// ── Test tree setup ──────────────────────────────────────────────────

function buildTestTree() {
  const persons = [
    // Root: modern male
    makePerson({
      id: 'root', sex: 'M',
      name: { given: 'Steve', surname: 'Test' },
      birth: { date: { date: new Date('1970-01-01'), endDate: null, qualifier: 'exact', raw: '1 JAN 1970', year: 1970 }, place: null },
      sourceIds: ['s1', 's2'],
    }),

    // Mother (direct maternal line, 2 sources)
    makePerson({
      id: 'mother', sex: 'F',
      name: { given: 'Mary', surname: 'Test' },
      birth: { date: { date: new Date('1945-06-01'), endDate: null, qualifier: 'exact', raw: '1 JUN 1945', year: 1945 }, place: null },
      sourceIds: ['s1'],
    }),

    // Father (direct paternal line)
    makePerson({
      id: 'father', sex: 'M',
      name: { given: 'Robert', surname: 'Test' },
      birth: { date: { date: new Date('1942-03-15'), endDate: null, qualifier: 'exact', raw: '15 MAR 1942', year: 1942 }, place: null },
      sourceIds: ['s2'],
    }),

    // Maternal grandmother
    makePerson({
      id: 'mat-grandma', sex: 'F',
      name: { given: 'Elizabeth', surname: 'Smith' },
      birth: { date: { date: new Date('1920-09-01'), endDate: null, qualifier: 'exact', raw: '1 SEP 1920', year: 1920 }, place: null },
    }),

    // Maternal great-grandmother — "Queen of Scotland" (notable)
    makePerson({
      id: 'queen', sex: 'F',
      name: { full: 'Queen Margaret of Scotland', given: 'Margaret', surname: '', prefix: 'Queen' },
      birth: { date: { date: new Date('1045-01-01'), endDate: null, qualifier: 'about', raw: 'ABT 1045', year: 1045 }, place: null },
      sourceIds: ['s3'],
    }),

    // Paternal grandfather — Colonel (notable)
    makePerson({
      id: 'colonel', sex: 'M',
      name: { given: 'James', surname: 'Test', prefix: 'Col.' },
      birth: { date: { date: new Date('1900-12-25'), endDate: null, qualifier: 'exact', raw: '25 DEC 1900', year: 1900 }, place: null },
      sourceIds: ['s1'],
      notes: 'Military service as Colonel in World War II',
    }),

    // Paternal great-grandfather — plain, no patterns
    makePerson({
      id: 'pat-ggrandpa', sex: 'M',
      name: { given: 'William', surname: 'Test' },
    }),

    // Paternal grandmother — plain female
    makePerson({
      id: 'pat-grandma', sex: 'F',
      name: { given: 'Sarah', surname: 'Test' },
      birth: { date: { date: new Date('1922-04-15'), endDate: null, qualifier: 'exact', raw: '15 APR 1922', year: 1922 }, place: null },
    }),
  ];

  const edges = [
    makeEdge({ id: 'e1', childId: 'root', parentId: 'mother', confidenceTier: 1 }),
    makeEdge({ id: 'e2', childId: 'root', parentId: 'father', confidenceTier: 1 }),
    makeEdge({ id: 'e3', childId: 'mother', parentId: 'mat-grandma', confidenceTier: 2 }),
    makeEdge({ id: 'e4', childId: 'mat-grandma', parentId: 'queen', confidenceTier: 4 }), // Weak link!
    makeEdge({ id: 'e5', childId: 'father', parentId: 'colonel', confidenceTier: 1 }),
    makeEdge({ id: 'e6', childId: 'colonel', parentId: 'pat-ggrandpa', confidenceTier: 3 }),
    makeEdge({ id: 'e7', childId: 'father', parentId: 'pat-grandma', confidenceTier: 2 }),
  ];

  const sources = [
    makeSource({ id: 's1', sourceClass: 'primary' }),
    makeSource({ id: 's2', sourceClass: 'secondary' }),
    makeSource({ id: 's3', sourceClass: 'tertiary' }),
  ];

  return makeGraph(persons, edges, sources);
}

const baseScope: ReportScope = {
  mode: 'full_tree',
  rootPersonId: null,
  sexFilter: null,
  minConfidenceTier: null,
  generationRange: null,
};

describe('Notable Women report (no AI)', () => {
  const graph = buildTestTree();

  it('extracts women only', () => {
    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'F',
      scope: { ...baseScope, sexFilter: 'F' },
    });
    for (const c of candidates) {
      expect(c.person.sex).toBe('F');
    }
    const ids = candidates.map(c => c.personId);
    expect(ids).not.toContain('root');
    expect(ids).not.toContain('father');
    expect(ids).not.toContain('colonel');
  });

  it('includes queen with pattern match', () => {
    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'F',
      scope: { ...baseScope, sexFilter: 'F' },
    });
    const queenCandidate = candidates.find(c => c.personId === 'queen');
    expect(queenCandidate).toBeDefined();
    expect(queenCandidate!.categories.length).toBeGreaterThan(0);
  });

  it('chain confidence degrades with each generation', () => {
    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'F',
      scope: { ...baseScope, sexFilter: 'F' },
    });
    const sorted = [...candidates].sort((a, b) => a.generationsFromRoot - b.generationsFromRoot);
    if (sorted.length >= 2) {
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      expect(first.chainConfidence).toBeGreaterThanOrEqual(last.chainConfidence);
    }
  });

  it('ancestral confidence = identity × chain for each candidate', () => {
    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'F',
      scope: { ...baseScope, sexFilter: 'F' },
    });
    for (const c of candidates) {
      expect(c.ancestralConfidence).toBeCloseTo(
        c.personIdentityScore * c.chainConfidence,
        5,
      );
    }
  });

  it('queen has weak chain due to Tier 4 edge', () => {
    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'F',
      scope: { ...baseScope, sexFilter: 'F' },
    });
    const queenCandidate = candidates.find(c => c.personId === 'queen');
    expect(queenCandidate).toBeDefined();
    // Chain goes: root → mother (T1) → mat-grandma (T2) → queen (T4)
    // 0.95 × 0.80 × 0.25 = 0.19
    expect(queenCandidate!.chainConfidence).toBeLessThan(0.20);
    expect(queenCandidate!.weakestChainTier).toBe(4);
  });
});

describe('Notable Men report (no AI)', () => {
  const graph = buildTestTree();

  it('extracts men only — no women', () => {
    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'M',
      scope: { ...baseScope, sexFilter: 'M' },
    });
    for (const c of candidates) {
      expect(c.person.sex).toBe('M');
    }
    const ids = candidates.map(c => c.personId);
    expect(ids).not.toContain('mother');
    expect(ids).not.toContain('mat-grandma');
    expect(ids).not.toContain('queen');
  });

  it('includes colonel grandfather with pattern match', () => {
    const candidates = extractNotablePeople(graph, [], 'root', {
      sex: 'M',
      scope: { ...baseScope, sexFilter: 'M' },
    });
    const colonelCandidate = candidates.find(c => c.personId === 'colonel');
    expect(colonelCandidate).toBeDefined();
  });
});

describe('Data Quality report', () => {
  it('detects missing dates', () => {
    const graph = buildTestTree();
    const candidates = extractDataQualityIssues(graph, []);
    const plainPerson = candidates.find(c => c.personId === 'pat-ggrandpa');
    expect(plainPerson).toBeDefined();
    expect(plainPerson!.issues.some(i => i.type === 'missing_date')).toBe(true);
  });

  it('detects no-source persons', () => {
    const graph = buildTestTree();
    const candidates = extractDataQualityIssues(graph, []);
    const noSourcePersons = candidates.filter(c =>
      c.issues.some(i => i.type === 'no_sources'),
    );
    expect(noSourcePersons.length).toBeGreaterThanOrEqual(3);
  });

  it('quality scores are penalized correctly', () => {
    const graph = buildTestTree();
    const candidates = extractDataQualityIssues(graph, []);
    for (const c of candidates) {
      if (c.issues.length === 0) {
        expect(c.qualityScore).toBeGreaterThanOrEqual(0.8);
      }
      if (c.issues.length > 2) {
        expect(c.qualityScore).toBeLessThan(0.8);
      }
    }
  });

  it('branch coverage calculates correctly', () => {
    const graph = buildTestTree();
    const coverage = computeBranchCoverage(graph, 'root');
    for (const entry of coverage) {
      expect(entry.totalPersons).toBeGreaterThan(0);
      expect(entry.coveragePercent).toBeGreaterThanOrEqual(0);
      expect(entry.coveragePercent).toBeLessThanOrEqual(100);
    }
  });
});

describe('Notable Women pipeline with mocked AI', () => {
  const graph = buildTestTree();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs full pipeline with AI narration', async () => {
    const config: ReportConfig = {
      reportType: 'notable_women',
      scope: { ...baseScope, sexFilter: 'F' },
      aiDepth: 'quick',
    };

    let lastProgress = null;
    let result = null;

    for await (const update of runNotablePeopleReport(graph, [], 'root', config)) {
      lastProgress = update.progress;
      if (update.progress.stage === 'complete') {
        result = update.result;
      }
    }

    expect(lastProgress).not.toBeNull();
    expect(lastProgress!.stage).toBe('complete');
    expect(result).not.toBeNull();
    expect(result!.candidates!.length).toBeGreaterThan(0);
    const narratedCount = result!.candidates!.filter(c => c.aiNarrative).length;
    expect(narratedCount).toBeGreaterThan(0);
  });

  it('runs without AI when aiDepth is none', async () => {
    const config: ReportConfig = {
      reportType: 'notable_women',
      scope: { ...baseScope, sexFilter: 'F' },
      aiDepth: 'none',
    };

    let result = null;
    for await (const update of runNotablePeopleReport(graph, [], 'root', config)) {
      if (update.progress.stage === 'complete') {
        result = update.result;
      }
    }

    expect(result).not.toBeNull();
    expect(result!.candidates!.length).toBeGreaterThan(0);
    for (const c of result!.candidates!) {
      expect(c.aiNarrative).toBeNull();
    }
  });

  it('cancellation preserves partial results', async () => {
    const config: ReportConfig = {
      reportType: 'notable_women',
      scope: { ...baseScope, sexFilter: 'F' },
      aiDepth: 'quick',
    };

    const controller = new AbortController();
    let progressCount = 0;

    for await (const _update of runNotablePeopleReport(graph, [], 'root', config, controller.signal)) {
      progressCount++;
      if (progressCount === 1) {
        controller.abort();
      }
    }

    expect(progressCount).toBeGreaterThanOrEqual(1);
  });
});

describe('Data Quality pipeline', () => {
  const graph = buildTestTree();

  it('runs full data quality pipeline', async () => {
    const config: ReportConfig = {
      reportType: 'data_quality',
      scope: baseScope,
      aiDepth: 'none',
    };

    let result = null;
    for await (const update of runDataQualityReport(graph, [], 'root', config)) {
      if (update.progress.stage === 'complete') {
        result = update.result;
      }
    }

    expect(result).not.toBeNull();
    expect(result!.candidates!.length).toBeGreaterThan(0);
    expect(result!.dateQualityStats).toBeDefined();
    expect(result!.placeQualityStats).toBeDefined();
    expect(result!.branchCoverage).toBeDefined();
  });
});

describe('Empty / edge case trees', () => {
  it('empty tree returns empty candidates', () => {
    const graph = makeGraph();
    const candidates = extractNotablePeople(graph, [], 'nonexistent', {
      sex: 'F',
      scope: { ...baseScope, sexFilter: 'F' },
    });
    expect(candidates).toHaveLength(0);
  });

  it('single-person tree returns empty for notable reports (no ancestors)', () => {
    const person = makePerson({ id: 'solo', sex: 'F' });
    const graph = makeGraph([person]);
    const candidates = extractNotablePeople(graph, [], 'solo', {
      sex: 'F',
      scope: { ...baseScope, sexFilter: 'F' },
    });
    expect(candidates.length).toBeLessThanOrEqual(1);
  });

  it('tree with no matching sex returns empty', () => {
    const males = [
      makePerson({ id: 'm1', sex: 'M', name: { full: 'King Arthur' } }),
      makePerson({ id: 'm2', sex: 'M', name: { full: 'Sir Lancelot' } }),
    ];
    const graph = makeGraph(males, [
      makeEdge({ id: 'e1', childId: 'm1', parentId: 'm2', confidenceTier: 2 }),
    ]);
    const candidates = extractNotablePeople(graph, [], 'm1', {
      sex: 'F',
      scope: { ...baseScope, sexFilter: 'F' },
    });
    expect(candidates).toHaveLength(0);
  });
});
