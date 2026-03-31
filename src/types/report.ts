import type { ConfidenceTier } from './common.ts';
import type { Person } from './person.ts';
import type { BridgeZone } from './bridge.ts';
import type { NotableCategory } from './story-path.ts';
import type { QuickCheckResult } from './ai.ts';

// ── Report Configuration ────────────────────────────────────────────

export type ReportType = 'notable_women' | 'notable_men' | 'data_quality';
export type ReportStatus = 'configuring' | 'extracting' | 'scoring' | 'narrating' | 'complete' | 'cancelled' | 'error';
export type AIDepth = 'none' | 'quick'; // R1 only; R2 adds 'standard', 'deep'

export interface ReportConfig {
  reportType: ReportType;
  scope: ReportScope;
  aiDepth: AIDepth;
}

export interface ReportScope {
  mode: 'full_tree' | 'direct_line' | 'branch';
  rootPersonId: string | null;
  sexFilter: 'M' | 'F' | null;
  minConfidenceTier: ConfidenceTier | null;
  generationRange: { min: number; max: number } | null;
}

// ── Notable People Report ───────────────────────────────────────────

export interface ReportCandidate {
  personId: string;
  person: Person;
  section: 'direct_line' | 'historical' | 'all';
  matchReasons: string[];
  categories: NotableCategory[];
  generationsFromRoot: number;
  pathToRoot: string[];

  // Three-metric scoring
  personIdentityScore: number;    // 0-1 float
  chainConfidence: number;        // 0-1 float (multiplicative product)
  ancestralConfidence: number;    // personIdentity × chain

  // Existing tier info
  personTier: ConfidenceTier;
  weakestChainTier: ConfidenceTier;
  bridgeZones: BridgeZone[];

  // AI narration (filled in Stage 4)
  aiNarrative: string | null;
  aiQuickCheck: QuickCheckResult | null;
}

export interface ReportResult {
  id: string;
  config: ReportConfig;
  generatedAt: Date;
  rootPersonId: string;
  candidates: ReportCandidate[];
  methodology: ReportMethodology;
  aggregateStats: ReportStats;
  status: ReportStatus;
  costUsd: number;
  durationMs: number;
}

export interface ReportMethodology {
  description: string;
  personIdentityFactors: string[];
  chainExplanation: string;
  tierDefinitions: string[];
}

export interface ReportStats {
  totalCandidates: number;
  directLineCandidates: number;
  historicalCandidates: number;
  averageAncestralConfidence: number;
  averagePersonIdentity: number;
  sourceCoverage: number;
  bridgeZoneCount: number;
  duplicateSuspectCount: number;
  byCategory: Record<string, number>;
  byTier: Record<number, number>;
}

// ── Data Quality Report ─────────────────────────────────────────────

export interface DataQualityCandidate {
  personId: string;
  person: Person;
  issues: DataQualityIssue[];
  qualityScore: number; // 0-1 (1 = perfect quality)
}

export type DataQualityIssueType =
  | 'missing_date'
  | 'missing_place'
  | 'no_sources'
  | 'name_overloading'
  | 'impossible_date'
  | 'missing_sex'
  | 'orphan'
  | 'duplicate_suspect';

export interface DataQualityIssue {
  type: DataQualityIssueType;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  suggestedFix: string;
}

export interface DataQualityReport extends Omit<ReportResult, 'candidates'> {
  candidates: DataQualityCandidate[];
  branchCoverage: BranchCoverageEntry[];
  dateQualityStats: { valid: number; approximate: number; missing: number; impossible: number };
  placeQualityStats: { normalized: number; raw_only: number; missing: number };
}

export interface BranchCoverageEntry {
  branchLabel: string;
  ancestorId: string;
  ancestorName: string;
  totalPersons: number;
  withSources: number;
  coveragePercent: number;
}

// ── Report Progress ─────────────────────────────────────────────────

export interface ReportProgress {
  stage: 'extracting' | 'scoring' | 'narrating' | 'complete' | 'cancelled' | 'error';
  candidatesFound: number;
  narratedCount: number;
  totalToNarrate: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  error: string | null;
}
