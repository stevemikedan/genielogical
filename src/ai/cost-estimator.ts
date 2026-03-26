import type { CostEstimate } from '@/types/ai.ts';
import type { AITaskType } from './provider/types.ts';
import { getProviderConfig } from './provider/provider-registry.ts';

// ── Token estimates per mode ────────────────────────────────────────

/** Approximate tokens for a Mode 1 quick check */
const QUICK_CHECK_INPUT = 1_500;
const QUICK_CHECK_OUTPUT = 500;

/** Approximate tokens for a Mode 2 validation (with web search overhead) */
const VALIDATION_INPUT = 2_500;
const VALIDATION_OUTPUT = 1_500;
const WEB_SEARCH_OVERHEAD_INPUT = 1_000;

/** Approximate tokens for a Mode 3 deep research round */
const DEEP_RESEARCH_INPUT_PER_ROUND = 5_000;
const DEEP_RESEARCH_OUTPUT_PER_ROUND = 3_000;

/** Default pricing (Sonnet) — used when no provider is configured */
const DEFAULT_INPUT_PER_MILLION = 3;
const DEFAULT_OUTPUT_PER_MILLION = 15;

// ── Provider-aware pricing lookup ───────────────────────────────────

interface Pricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

function getPricing(task: AITaskType): Pricing {
  try {
    const config = getProviderConfig(task);
    if (config.providerId === 'anthropic') {
      return { inputPerMillion: DEFAULT_INPUT_PER_MILLION, outputPerMillion: DEFAULT_OUTPUT_PER_MILLION };
    }
  } catch {
    // Fall through to defaults
  }
  return { inputPerMillion: DEFAULT_INPUT_PER_MILLION, outputPerMillion: DEFAULT_OUTPUT_PER_MILLION };
}

function calculateCost(inputTokens: number, outputTokens: number, pricing: Pricing): number {
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

// ── Public estimators ───────────────────────────────────────────────

/**
 * Estimate cost for Mode 1 quick checks.
 */
export function estimateQuickCheckCost(personCount: number): CostEstimate {
  const pricing = getPricing('quickCheck');
  const inputTokens = personCount * QUICK_CHECK_INPUT;
  const outputTokens = personCount * QUICK_CHECK_OUTPUT;
  return {
    personCount,
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCostUsd: calculateCost(inputTokens, outputTokens, pricing),
  };
}

/**
 * Estimate cost for Mode 2 validation reports.
 */
export function estimateValidationCost(
  personCount: number,
  withWebSearch = true,
): CostEstimate {
  const pricing = getPricing('validation');
  const inputTokens = personCount * (VALIDATION_INPUT + (withWebSearch ? WEB_SEARCH_OVERHEAD_INPUT : 0));
  const outputTokens = personCount * VALIDATION_OUTPUT;
  return {
    personCount,
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCostUsd: calculateCost(inputTokens, outputTokens, pricing),
  };
}

/**
 * Estimate cost for a Mode 3 deep research session.
 */
export function estimateDeepResearchCost(
  estimatedRounds = 3,
): CostEstimate {
  const pricing = getPricing('deepResearch');
  const inputTokens = estimatedRounds * DEEP_RESEARCH_INPUT_PER_ROUND;
  const outputTokens = estimatedRounds * DEEP_RESEARCH_OUTPUT_PER_ROUND;
  return {
    personCount: 1,
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCostUsd: calculateCost(inputTokens, outputTokens, pricing),
  };
}

/**
 * Format a USD cost for display.
 * Sub-cent values show 3-4 decimals; larger values show 2.
 */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
