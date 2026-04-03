import type { Flag } from '@/types/flag.ts';
import type { Source } from '@/types/source.ts';
import type {
  ReportConfig, ReportResult, ReportCandidate,
  ReportProgress, ReportStats, ReportMethodology,
  DataQualityReport, ReportStatus,
} from '@/types/report.ts';
import type { CostEstimate } from '@/types/ai.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { extractNotablePeople, extractDataQualityIssues, computeBranchCoverage } from './report-extractors.ts';
import { estimateQuickCheckCost } from '@/ai/cost-estimator.ts';
import { getApiKey, sendMessage } from '@/ai/ai-client.ts';
import { buildReportNarrativePrompt, parseReportNarrativeResult } from '@/ai/prompts/report-prompts.ts';
import { computeEraTag } from '@/ai/era-context.ts';
import { generateReportId } from '@/utils/id-generator.ts';

const MAX_CONCURRENT = 5;
const DELAY_MS = 500;
const INPUT_PRICE_PER_1M = 3.0;
const OUTPUT_PRICE_PER_1M = 15.0;

// ── Cost Estimation ─────────────────────────────────────────────────

export function estimateReportCost(
  candidateCount: number,
  aiDepth: 'none' | 'quick',
): CostEstimate {
  if (aiDepth === 'none') {
    return { personCount: candidateCount, estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0 };
  }
  return estimateQuickCheckCost(candidateCount);
}

// ── Notable People Report Pipeline ──────────────────────────────────

export async function* runNotablePeopleReport(
  graph: TreeGraph,
  flags: Flag[],
  rootPersonId: string,
  config: ReportConfig,
  signal?: AbortSignal,
): AsyncGenerator<{ progress: ReportProgress; result: Partial<ReportResult> }> {
  const startTime = Date.now();
  const sex = config.scope.sexFilter ?? 'M';

  // Stage 1: Extract
  const candidates = extractNotablePeople(graph, flags, rootPersonId, {
    sex,
    scope: config.scope,
  });

  const estimate = estimateReportCost(candidates.length, config.aiDepth);

  const progress: ReportProgress = {
    stage: 'extracting',
    candidatesFound: candidates.length,
    narratedCount: 0,
    totalToNarrate: config.aiDepth !== 'none' ? candidates.length : 0,
    estimatedCostUsd: estimate.estimatedCostUsd,
    actualCostUsd: 0,
    error: null,
  };

  yield { progress: { ...progress, stage: 'scoring' }, result: { candidates } };

  // Stage 2: AI Narration (if enabled)
  if (config.aiDepth !== 'none' && candidates.length > 0) {
    progress.stage = 'narrating';
    const apiKey = getApiKey();

    if (apiKey) {
      for (let i = 0; i < candidates.length; i += MAX_CONCURRENT) {
        if (signal?.aborted) {
          progress.stage = 'cancelled';
          yield { progress: { ...progress }, result: buildPartialResult(config, rootPersonId, candidates, startTime, progress.actualCostUsd, 'cancelled') };
          return;
        }

        const batch = candidates.slice(i, i + MAX_CONCURRENT);
        const results = await Promise.all(
          batch.map(c => narrateCandidate(c, graph, config, apiKey)),
        );

        for (const r of results) {
          if (r.narrative) {
            r.candidate.aiNarrative = r.narrative;
          }
          progress.actualCostUsd += r.cost;
          progress.narratedCount++;
        }

        yield { progress: { ...progress }, result: { candidates } };

        if (i + MAX_CONCURRENT < candidates.length) {
          await new Promise(r => setTimeout(r, DELAY_MS));
        }
      }
    }
  }

  // Stage 3: Finalize
  const finalResult = buildFinalResult(config, rootPersonId, candidates, startTime, progress.actualCostUsd);

  progress.stage = 'complete';
  yield { progress: { ...progress }, result: finalResult };
}

// ── Data Quality Report Pipeline ────────────────────────────────────

export async function* runDataQualityReport(
  graph: TreeGraph,
  flags: Flag[],
  rootPersonId: string,
  config: ReportConfig,
  signal?: AbortSignal,
): AsyncGenerator<{ progress: ReportProgress; result: Partial<DataQualityReport> }> {
  const startTime = Date.now();

  // Stage 1: Extract
  const candidates = extractDataQualityIssues(graph, flags);
  const branchCoverage = computeBranchCoverage(graph, rootPersonId);

  if (signal?.aborted) {
    yield {
      progress: { stage: 'cancelled', candidatesFound: 0, narratedCount: 0, totalToNarrate: 0, estimatedCostUsd: 0, actualCostUsd: 0, error: null },
      result: {},
    };
    return;
  }

  // Stage 2: Compute stats
  const dateStats = { valid: 0, approximate: 0, missing: 0, impossible: 0 };
  const placeStats = { normalized: 0, raw_only: 0, missing: 0 };

  for (const person of graph.persons.values()) {
    // Date stats
    if (person.birth.date?.year) {
      if (person.birth.date.qualifier === 'exact') dateStats.valid++;
      else dateStats.approximate++;
    } else {
      dateStats.missing++;
    }

    // Place stats
    if (person.birth.place) {
      if (person.birth.place.city || person.birth.place.state || person.birth.place.country) {
        placeStats.normalized++;
      } else {
        placeStats.raw_only++;
      }
    } else {
      placeStats.missing++;
    }
  }

  const impossibleFlags = flags.filter(f => f.ruleId.startsWith('CHRONO_') && f.userStatus !== 'dismissed' && f.userStatus !== 'resolved');
  dateStats.impossible = impossibleFlags.length;

  const finalResult: DataQualityReport = {
    id: generateReportId(),
    config,
    generatedAt: new Date(),
    rootPersonId,
    candidates,
    branchCoverage,
    dateQualityStats: dateStats,
    placeQualityStats: placeStats,
    methodology: buildDataQualityMethodology(),
    aggregateStats: buildDataQualityStats(candidates),
    status: 'complete',
    costUsd: 0,
    durationMs: Date.now() - startTime,
  };

  yield {
    progress: { stage: 'complete', candidatesFound: candidates.length, narratedCount: 0, totalToNarrate: 0, estimatedCostUsd: 0, actualCostUsd: 0, error: null },
    result: finalResult,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

async function narrateCandidate(
  candidate: ReportCandidate,
  graph: TreeGraph,
  config: ReportConfig,
  apiKey: string,
): Promise<{ candidate: ReportCandidate; narrative: string | null; cost: number }> {
  try {
    const person = candidate.person;
    const parentEdges = graph.parentEdges.get(person.id) ?? [];
    const fatherEdge = parentEdges.find(e => {
      const p = graph.persons.get(e.parentId);
      return p && p.sex === 'M';
    });
    const motherEdge = parentEdges.find(e => {
      const p = graph.persons.get(e.parentId);
      return p && p.sex === 'F';
    });
    const parents = {
      father: fatherEdge ? graph.persons.get(fatherEdge.parentId) ?? null : null,
      mother: motherEdge ? graph.persons.get(motherEdge.parentId) ?? null : null,
    };
    const sources = person.sourceIds
      .map(id => graph.sources.get(id))
      .filter((s): s is Source => s !== undefined);
    const eraTag = computeEraTag(person);

    const { system, user } = buildReportNarrativePrompt(
      person, parents, sources,
      config.reportType, candidate.matchReasons,
      candidate.ancestralConfidence, eraTag,
    );

    const response = await sendMessage(apiKey, system, user);
    const parsed = parseReportNarrativeResult(response.text);
    const cost = (response.inputTokens / 1_000_000) * INPUT_PRICE_PER_1M
      + (response.outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;

    return {
      candidate,
      narrative: parsed?.narrative ?? response.text.slice(0, 500),
      cost,
    };
  } catch {
    return { candidate, narrative: null, cost: 0 };
  }
}

function buildPartialResult(
  config: ReportConfig,
  rootPersonId: string,
  candidates: ReportCandidate[],
  startTime: number,
  costUsd: number,
  status: ReportStatus,
): Partial<ReportResult> {
  return {
    id: generateReportId(),
    config,
    generatedAt: new Date(),
    rootPersonId,
    candidates,
    methodology: buildNotableMethodology(config),
    aggregateStats: buildNotableStats(candidates),
    status,
    costUsd,
    durationMs: Date.now() - startTime,
  };
}

function buildFinalResult(
  config: ReportConfig,
  rootPersonId: string,
  candidates: ReportCandidate[],
  startTime: number,
  costUsd: number,
): ReportResult {
  return {
    id: generateReportId(),
    config,
    generatedAt: new Date(),
    rootPersonId,
    candidates,
    methodology: buildNotableMethodology(config),
    aggregateStats: buildNotableStats(candidates),
    status: 'complete',
    costUsd,
    durationMs: Date.now() - startTime,
  };
}

function buildNotableMethodology(config: ReportConfig): ReportMethodology {
  const sex = config.scope.sexFilter === 'F' ? 'women' : 'men';
  return {
    description: `This report identifies notable ${sex} in your ancestry using pattern matching on names, titles, and roles, combined with a three-metric confidence scoring system.`,
    personIdentityFactors: [
      'Source count and quality (primary > secondary > tertiary)',
      'Name consistency (no embedded titles)',
      'Date plausibility (has birth date, not flagged impossible)',
      'Absence of critical flags',
    ],
    chainExplanation: `Chain confidence is computed by multiplying the probability of each edge in the path from you to the ancestor. Tier 1 edges have 95% probability, Tier 2 = 80%, Tier 3 = 55%, Tier 4 = 25%. Over many generations, even strong chains degrade — a 19-generation all-Tier-1 chain yields ~38%.`,
    tierDefinitions: [
      'Tier 1 (Documented): Primary source confirms the connection.',
      'Tier 2 (Supported): Secondary sources corroborate.',
      'Tier 3 (Provisional): No strong sources; plausible but unverified.',
      'Tier 4 (Unverified/Speculative): Unsourced, flagged, or chronologically impossible.',
    ],
  };
}

function buildNotableStats(candidates: ReportCandidate[]): ReportStats {
  const directLine = candidates.filter(c => c.section === 'direct_line');
  const historical = candidates.filter(c => c.section === 'historical');
  const withSources = candidates.filter(c => c.person.sourceIds.length > 0);
  const bridgeCount = candidates.reduce((sum, c) => sum + c.bridgeZones.length, 0);

  const byCategory: Record<string, number> = {};
  for (const c of candidates) {
    for (const cat of c.categories) {
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }
  }

  const byTier: Record<number, number> = {};
  for (const c of candidates) {
    byTier[c.personTier] = (byTier[c.personTier] ?? 0) + 1;
  }

  const totalAncestral = candidates.reduce((sum, c) => sum + c.ancestralConfidence, 0);
  const totalIdentity = candidates.reduce((sum, c) => sum + c.personIdentityScore, 0);

  return {
    totalCandidates: candidates.length,
    directLineCandidates: directLine.length,
    historicalCandidates: historical.length,
    averageAncestralConfidence: candidates.length > 0 ? totalAncestral / candidates.length : 0,
    averagePersonIdentity: candidates.length > 0 ? totalIdentity / candidates.length : 0,
    sourceCoverage: candidates.length > 0 ? (withSources.length / candidates.length) * 100 : 0,
    bridgeZoneCount: bridgeCount,
    duplicateSuspectCount: 0,
    byCategory,
    byTier,
  };
}

function buildDataQualityMethodology(): ReportMethodology {
  return {
    description: 'This report analyzes data quality across your tree, identifying missing data, inconsistencies, and areas needing attention.',
    personIdentityFactors: ['Presence of birth date', 'Presence of birth place', 'Source attachment', 'Name formatting'],
    chainExplanation: 'Not applicable for data quality reports.',
    tierDefinitions: [
      'Critical: Missing sources (no evidence for this person)',
      'Warning: Missing dates, orphaned persons, duplicate suspects',
      'Info: Missing places, approximate dates',
    ],
  };
}

function buildDataQualityStats(candidates: Array<{ qualityScore: number; issues: Array<{ severity: string }> }>): ReportStats {
  const totalQuality = candidates.reduce((sum, c) => sum + c.qualityScore, 0);
  const criticalCount = candidates.filter(c => c.issues.some(i => i.severity === 'critical')).length;

  return {
    totalCandidates: candidates.length,
    directLineCandidates: 0,
    historicalCandidates: 0,
    averageAncestralConfidence: 0,
    averagePersonIdentity: candidates.length > 0 ? totalQuality / candidates.length : 0,
    sourceCoverage: candidates.length > 0 ? ((candidates.length - criticalCount) / candidates.length) * 100 : 0,
    bridgeZoneCount: 0,
    duplicateSuspectCount: 0,
    byCategory: {},
    byTier: {},
  };
}
