import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { TreeProvider } from '@/context/tree-context.tsx';

// Mock the AI client
vi.mock('@/ai/ai-client.ts', () => ({
  getApiKey: vi.fn(() => 'test-key'),
  sendMessage: vi.fn(async () => ({
    text: '{"plausibility":"plausible","narrative":"A notable figure.","issues":[],"suggestedTier":2}',
    inputTokens: 1500,
    outputTokens: 500,
  })),
}));

// Must import AFTER mocks
const { useReport } = await import('./use-report.ts');

function wrapper({ children }: { children: ReactNode }) {
  return createElement(TreeProvider, null, children);
}

describe('useReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useReport(), { wrapper });

    expect(result.current.activeReport).toBeNull();
    expect(result.current.reportProgress).toBeNull();
    expect(result.current.isGenerating).toBe(false);
  });

  it('has all expected methods', () => {
    const { result } = renderHook(() => useReport(), { wrapper });

    expect(typeof result.current.generateReport).toBe('function');
    expect(typeof result.current.cancelReport).toBe('function');
    expect(typeof result.current.estimateCost).toBe('function');
  });

  it('estimateCost returns null when no graph', () => {
    const { result } = renderHook(() => useReport(), { wrapper });

    const estimate = result.current.estimateCost({
      reportType: 'notable_women',
      scope: { mode: 'full_tree', rootPersonId: null, sexFilter: 'F', minConfidenceTier: null, generationRange: null },
      aiDepth: 'none',
    });

    expect(estimate).toBeNull();
  });

  it('cancelReport does not throw when nothing is running', () => {
    const { result } = renderHook(() => useReport(), { wrapper });

    expect(() => {
      act(() => result.current.cancelReport());
    }).not.toThrow();
  });
});
