import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  estimateQuickCheckCost,
  estimateValidationCost,
  estimateDeepResearchCost,
  formatCost,
} from './cost-estimator.ts';

// Mock provider-registry so tests don't depend on localStorage
vi.mock('./provider/provider-registry.ts', () => ({
  getProviderConfig: () => ({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    apiKey: null,
    baseUrl: null,
    enabled: false,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('estimateQuickCheckCost', () => {
  it('returns zero for zero persons', () => {
    const est = estimateQuickCheckCost(0);
    expect(est.personCount).toBe(0);
    expect(est.estimatedCostUsd).toBe(0);
  });

  it('scales linearly with person count', () => {
    const one = estimateQuickCheckCost(1);
    const ten = estimateQuickCheckCost(10);
    expect(ten.estimatedInputTokens).toBe(one.estimatedInputTokens * 10);
    expect(ten.estimatedOutputTokens).toBe(one.estimatedOutputTokens * 10);
    expect(ten.estimatedCostUsd).toBeCloseTo(one.estimatedCostUsd * 10, 6);
  });

  it('uses correct token estimates', () => {
    const est = estimateQuickCheckCost(1);
    expect(est.estimatedInputTokens).toBe(1_500);
    expect(est.estimatedOutputTokens).toBe(500);
  });

  it('calculates cost using Sonnet pricing', () => {
    // 1 person: 1500 input * $3/M + 500 output * $15/M
    // = 0.0045 + 0.0075 = 0.012
    const est = estimateQuickCheckCost(1);
    expect(est.estimatedCostUsd).toBeCloseTo(0.012, 6);
  });
});

describe('estimateValidationCost', () => {
  it('adds web search overhead by default', () => {
    const withSearch = estimateValidationCost(1);
    const withoutSearch = estimateValidationCost(1, false);
    expect(withSearch.estimatedInputTokens).toBeGreaterThan(withoutSearch.estimatedInputTokens);
    expect(withSearch.estimatedOutputTokens).toBe(withoutSearch.estimatedOutputTokens);
  });

  it('uses 3500 input tokens with web search', () => {
    const est = estimateValidationCost(1, true);
    expect(est.estimatedInputTokens).toBe(3_500);
  });

  it('uses 2500 input tokens without web search', () => {
    const est = estimateValidationCost(1, false);
    expect(est.estimatedInputTokens).toBe(2_500);
  });
});

describe('estimateDeepResearchCost', () => {
  it('defaults to 3 rounds', () => {
    const est = estimateDeepResearchCost();
    expect(est.estimatedInputTokens).toBe(15_000);
    expect(est.estimatedOutputTokens).toBe(9_000);
  });

  it('accepts custom round count', () => {
    const est = estimateDeepResearchCost(5);
    expect(est.estimatedInputTokens).toBe(25_000);
    expect(est.estimatedOutputTokens).toBe(15_000);
  });

  it('always reports personCount as 1', () => {
    const est = estimateDeepResearchCost(10);
    expect(est.personCount).toBe(1);
  });
});

describe('formatCost', () => {
  it('formats zero', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('formats sub-cent values with 4 decimals', () => {
    expect(formatCost(0.0045)).toBe('$0.0045');
  });

  it('formats sub-dollar values with 3 decimals', () => {
    expect(formatCost(0.123)).toBe('$0.123');
  });

  it('formats dollar values with 2 decimals', () => {
    expect(formatCost(18)).toBe('$18.00');
    expect(formatCost(1.5)).toBe('$1.50');
  });
});
