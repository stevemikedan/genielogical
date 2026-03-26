import type { ConfidenceTier } from './common.ts';

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
