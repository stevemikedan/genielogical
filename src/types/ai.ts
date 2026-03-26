import type { ConfidenceTier } from './common.ts';
import type { EraTag, LocationContext } from '@/ai/era-context.ts';

export interface AIPersonValidation {
  personId: string;
  summary: string;
  suggestedTier: ConfidenceTier;
  historicalNotes: string[];
  sourceSuggestions: AISourceSuggestion[];
  validatedAt: Date;
  modelId: string;
}

export interface AISourceSuggestion {
  sourceName: string;
  repository: string;
  url: string | null;
  reasoning: string;
}

export interface AIEdgeValidation {
  edgeId: string;
  parentId: string;
  childId: string;
  plausibility: 'confirmed' | 'plausible' | 'unlikely' | 'implausible';
  reasoning: string;
  suggestedSources: string[];
  validatedAt: Date;
}

export interface AINotableContext {
  personId: string;
  historicalContext: string;
  connectionPlausibility: string;
  suggestedReadings: string[];
  generatedAt: Date;
}

export type BatchValidationScope = 'all_flagged' | 'tier3_4' | 'whole_tree';

export interface BatchProgress {
  scope: BatchValidationScope;
  total: number;
  completed: number;
  failed: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  status: 'idle' | 'running' | 'paused' | 'complete' | 'cancelled';
  startedAt: Date | null;
}

export interface CostEstimate {
  personCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
}

// ── AI Enrich (Record Completion) ────────────────────────────────

export type EnrichFieldKey =
  | 'birthDate'
  | 'birthPlace'
  | 'deathDate'
  | 'deathPlace'
  | 'sex'
  | 'father'
  | 'mother'
  | 'spouse'
  | 'sibling'
  | 'occupation'
  | 'note';

export interface EnrichSuggestionField {
  field: EnrichFieldKey;
  label: string;
  value: string;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  sourceHint: string | null;
  /** URL to the search page or collection where the record was found */
  searchUrl: string | null;
  /** Direct URL to the specific record page the AI read (e.g. FindAGrave memorial) */
  recordUrl: string | null;
  /** Name of the database/collection the record was found in */
  sourceDatabase: string | null;
}

/** A citation from a web search result */
export interface WebSearchCitation {
  url: string;
  title: string | null;
  citedText: string;
}

export interface AIEnrichResult {
  personId: string;
  identifiedAs: string | null;
  summary: string;
  suggestions: EnrichSuggestionField[];
  /** Sources that were considered during enrichment */
  sourcesSearched: string[];
  /** Live web search citations from the agentic search */
  webCitations: WebSearchCitation[];
  generatedAt: Date;
  modelId: string;
}

// ── Three-Tier AI Modes (Phase 3) ────────────────────────────────

export type AIMode = 'quick' | 'standard' | 'deep';

export type Plausibility = 'confirmed' | 'plausible' | 'questionable' | 'implausible';

export type ParentalLinkStatus = 'confirmed' | 'plausible' | 'questionable' | 'implausible' | 'contradicted';

/** Mode 1: Quick plausibility check result */
export interface QuickCheckResult {
  plausibility: Plausibility;
  issues: QuickCheckIssue[];
  suggestedTier: ConfidenceTier;
  tierReason: string;
  quickWin: string | null;
}

export interface QuickCheckIssue {
  type: 'date' | 'place' | 'name' | 'connection' | 'title';
  description: string;
  correction: string | null;
}

/** Mode 2: Standard validation report */
export interface ValidationReport {
  personAssessment: {
    plausibility: Plausibility;
    summary: string;
  };
  parentalLink: {
    status: ParentalLinkStatus;
    summary: string;
  } | null;
  recordsFound: FoundRecord[];
  recordsExpectedButNotFound: MissingRecord[];
  dateDiscrepancies: DateDiscrepancy[];
  suggestedTier: ConfidenceTier;
  nextStep: ResearchNextStep | null;
}

export interface FoundRecord {
  type: 'census' | 'vital' | 'church' | 'military' | 'land' | 'probate' | 'published_genealogy' | 'peerage' | 'other';
  title: string;
  url: string | null;
  repository: string;
  confirms: string[];
  contradicts: string[];
  sourceClass: 'primary' | 'secondary' | 'tertiary';
}

export interface MissingRecord {
  type: string;
  description: string;
  significance: string;
}

export interface DateDiscrepancy {
  gedcomClaim: string;
  evidenceSays: string;
  source: string;
}

export interface ResearchNextStep {
  action: string;
  repository: string;
  expectedCost: 'free' | 'subscription' | 'archive_visit' | 'unknown';
  impactIfFound: string;
}

/** Mode 3: Deep research task */
export type DeepResearchTaskType =
  | 'verify_person'
  | 'verify_edge'
  | 'verify_bridge'
  | 'verify_notable_path'
  | 'find_parents'
  | 'resolve_duplicate'
  | 'resolve_date_conflict'
  | 'verify_title'
  | 'resolve_ancestry_conflict';

export interface DeepResearchTask {
  type: DeepResearchTaskType;
  primaryPersonId: string;
  secondaryPersonId: string | null;
  edgeIds: string[];
  eraTag: EraTag;
  locationContext: LocationContext;
  existingSources: string[];
  activeFlags: string[];
  researchQuestions: string[];
  pathPersonIds: string[] | null;
  notableAncestorName: string | null;
}

export type DeepResearchStatus = 'CONTINUE' | 'COMPLETE' | 'DEAD_END';

export interface DeepResearchFinding {
  type: 'confirmation' | 'contradiction' | 'new_lead' | 'absence';
  description: string;
  url: string | null;
  sourceClass: 'primary' | 'secondary' | 'tertiary' | null;
  relevantTo: string;
}

/** Mode 3: Single round result */
export interface DeepResearchRound {
  round: number;
  searchesPerformed: string[];
  findings: DeepResearchFinding[];
  status: DeepResearchStatus;
}

/** Source discovered by AI that can be imported */
export interface DiscoveredSourceImport {
  title: string;
  url: string | null;
  repository: string;
  sourceClass: 'primary' | 'secondary' | 'tertiary';
  sourceType: string;
  provesWhat: string[];
}
