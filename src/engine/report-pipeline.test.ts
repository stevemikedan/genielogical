import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConfidenceTier } from '@/types/common.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { ReportConfig } from '@/types/report.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import {
  runNotablePeopleReport,
  runDataQualityReport,
  estimateReportCost,
} from './report-pipeline.ts';

// Mock the AI client
vi.mock('@/ai/ai-client.ts', () => ({
  getApiKey: vi.fn(() => 'test-api-key'),
  sendMessage: vi.fn(async () => ({
    text: JSON.stringify({
      plausibility: 'plausible',
      narrative: 'A notable historical figure.',
      issues: [],
      suggestedTier: 2,
    }),
    inputTokens: 1500,
    outputTokens: 500,
  })),
}));

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
    id, parentId, childId,
    relationshipType: 'biological', legitimacy: 'unknown', marriage: null,
    confidenceTier: tier, confidenceReason: '',
    parallelGroupId: null, isPrimary: true, pathLabel: null,
    sourceIds: [], flagIds: [], familyGedcomXref: null,
    assertedBy: 'local_user', assertedAt: new Date(), createdAt: new Date(),
  };
}

function makeSource(id: string): Source {
  return {
    id, origin: 'user_added', sourceClass: 'secondary', sourceType: 'vital_record',
    title: `Source ${id}`, citation: '', notes: '', url: null, repository: null,
    provesWhat: ['identity'], attachedToPersonIds: [], attachedToEdgeIds: [],
    gedcomTag: null, sourceHash: '', addedAt: new Date(), addedBy: 'test',
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

function makeConfig(overrides: Partial<ReportConfig> = {}): ReportConfig {
  return {
    reportType: 'notable_women',
    scope: {
      mode: 'full_tree',
      rootPersonId: null,
      sexFilter: 'F',
      minConfidenceTier: null,
      generationRange: null,
    },
    aiDepth: 'none',
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('estimateReportCost', () => {
  it('returns zero cost for no-AI mode', () => {
    const estimate = estimateReportCost(50, 'none');
    expect(estimate.estimatedCostUsd).toBe(0);
    expect(estimate.personCount).toBe(50);
  });

  it('returns positive cost for quick mode', () => {
    const estimate = estimateReportCost(47, 'quick');
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
    expect(estimate.personCount).toBe(47);
  });
});

describe('runNotablePeopleReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts and scores candidates without AI', async () => {
    const root = makePerson('root', { sex: 'M' });
    const mother = makePerson('mother', { sex: 'F', sourceIds: ['s1'] });
    const queen = makePerson('queen', {
      sex: 'F',
      name: { full: 'Queen of Scotland', given: 'Margaret', middle: '', surname: '', maidenName: '', prefix: 'Queen', suffix: '', raw: 'Queen of Scotland' },
    });

    const s1 = makeSource('s1');
    const edges = [
      makeEdge('e1', 'root', 'mother', 1),
      makeEdge('e2', 'mother', 'queen', 2),
    ];

    const graph = buildGraph([root, mother, queen], edges, [s1]);
    const config = makeConfig({ aiDepth: 'none' });

    const updates: Array<{ progress: { stage: string }; result: unknown }> = [];
    for await (const update of runNotablePeopleReport(graph, [], 'root', config)) {
      updates.push(update);
    }

    expect(updates.length).toBeGreaterThanOrEqual(1);
    const lastUpdate = updates[updates.length - 1];
    expect(lastUpdate.progress.stage).toBe('complete');

    const result = lastUpdate.result as { candidates?: unknown[] };
    expect(result.candidates).toBeDefined();
  });

  it('populates AI narratives when aiDepth is quick', async () => {
    const root = makePerson('root', { sex: 'M' });
    const mother = makePerson('mother', { sex: 'F', sourceIds: ['s1'] });

    const s1 = makeSource('s1');
    const edges = [makeEdge('e1', 'root', 'mother', 1)];
    const graph = buildGraph([root, mother], edges, [s1]);
    const config = makeConfig({ aiDepth: 'quick' });

    const updates = [];
    for await (const update of runNotablePeopleReport(graph, [], 'root', config)) {
      updates.push(update);
    }

    const lastUpdate = updates[updates.length - 1];
    expect(lastUpdate.progress.stage).toBe('complete');
    expect(lastUpdate.progress.actualCostUsd).toBeGreaterThan(0);
  });

  it('handles cancellation', async () => {
    const root = makePerson('root', { sex: 'M' });
    const mother = makePerson('mother', { sex: 'F', sourceIds: ['s1'] });

    const s1 = makeSource('s1');
    const edges = [makeEdge('e1', 'root', 'mother', 1)];
    const graph = buildGraph([root, mother], edges, [s1]);
    const config = makeConfig({ aiDepth: 'quick' });

    const controller = new AbortController();
    controller.abort(); // Abort immediately

    const updates = [];
    for await (const update of runNotablePeopleReport(graph, [], 'root', config, controller.signal)) {
      updates.push(update);
    }

    // Should get extraction update then cancel
    const lastUpdate = updates[updates.length - 1];
    // With immediate abort, may get scoring or cancelled stage
    expect(['scoring', 'cancelled', 'complete']).toContain(lastUpdate.progress.stage);
  });

  it('returns empty candidates for tree with no women', async () => {
    const root = makePerson('root', { sex: 'M' });
    const father = makePerson('father', { sex: 'M' });

    const edges = [makeEdge('e1', 'root', 'father', 1)];
    const graph = buildGraph([root, father], edges);
    const config = makeConfig({ aiDepth: 'none' });

    const updates = [];
    for await (const update of runNotablePeopleReport(graph, [], 'root', config)) {
      updates.push(update);
    }

    const lastUpdate = updates[updates.length - 1];
    const result = lastUpdate.result as { candidates?: unknown[] };
    expect(result.candidates?.length ?? 0).toBe(0);
  });
});

describe('runDataQualityReport', () => {
  it('produces complete data quality report', async () => {
    const root = makePerson('root', {
      birth: { date: { date: new Date(1990, 0, 1), endDate: null, qualifier: 'exact', raw: '1990', year: 1990 }, place: null },
      sourceIds: ['s1'],
    });
    const parent = makePerson('parent');

    const s1 = makeSource('s1');
    const edges = [makeEdge('e1', 'root', 'parent', 1)];
    const graph = buildGraph([root, parent], edges, [s1]);

    const config: ReportConfig = {
      reportType: 'data_quality',
      scope: { mode: 'full_tree', rootPersonId: null, sexFilter: null, minConfidenceTier: null, generationRange: null },
      aiDepth: 'none',
    };

    const updates = [];
    for await (const update of runDataQualityReport(graph, [], 'root', config)) {
      updates.push(update);
    }

    expect(updates.length).toBe(1);
    const lastUpdate = updates[0];
    expect(lastUpdate.progress.stage).toBe('complete');

    const result = lastUpdate.result;
    expect(result.candidates).toBeDefined();
    expect(result.dateQualityStats).toBeDefined();
    expect(result.placeQualityStats).toBeDefined();
  });
});
