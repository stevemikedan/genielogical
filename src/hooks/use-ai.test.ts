import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { TreeProvider } from '@/context/tree-context.tsx';

// Mock all AI dependencies
vi.mock('@/ai/ai-client.ts', () => ({
  getApiKey: vi.fn().mockReturnValue('test-key'),
  sendMessage: vi.fn().mockResolvedValue({ text: '{"plausibility":"plausible","issues":[],"suggestedTier":3,"tierReason":"ok","quickWin":null}', inputTokens: 100, outputTokens: 50 }),
  sendAgentSearchMessage: vi.fn().mockResolvedValue({ text: '{"identifiedAs":"Test Person","summary":"Summary","suggestions":[],"sourcesSearched":[],"webCitations":[]}', citations: [], inputTokens: 200, outputTokens: 100 }),
  sendSearchConversation: vi.fn().mockResolvedValue({ text: '{"personAssessment":"ok","parentalLink":null,"recordsFound":[],"recordsExpectedButNotFound":[],"dateDiscrepancies":[],"suggestedTier":2,"nextStep":null}', inputTokens: 300, outputTokens: 150 }),
}));

vi.mock('@/ai/prompts/prompts.ts', () => ({
  QUICK_CHECK_SYSTEM_PROMPT: 'test prompt',
  STANDARD_VALIDATION_SYSTEM_PROMPT: 'test prompt',
  DEEP_RESEARCH_SYSTEM_PROMPT: 'test prompt',
}));

vi.mock('@/ai/result-parser.ts', () => ({
  parseQuickCheckResult: vi.fn().mockReturnValue({ plausibility: 'plausible', issues: [], suggestedTier: 3, tierReason: 'ok', quickWin: null }),
  parseValidationReport: vi.fn().mockReturnValue({ personAssessment: 'ok', parentalLink: null, recordsFound: [], recordsExpectedButNotFound: [], dateDiscrepancies: [], suggestedTier: 2, nextStep: null }),
  parseDeepResearchRound: vi.fn().mockReturnValue({ round: 1, searchesPerformed: [], findings: [], status: 'COMPLETE' }),
  parseEnrichResult: vi.fn().mockReturnValue({ personId: 'p1', identifiedAs: 'Test', summary: 'Summary', suggestions: [], sourcesSearched: [], webCitations: [], generatedAt: new Date(), modelId: 'test' }),
}));

vi.mock('@/ai/era-context/era-detection.ts', () => ({
  detectEra: vi.fn().mockReturnValue('modern'),
}));

vi.mock('@/ai/era-context/location-context.ts', () => ({
  getLocationContext: vi.fn().mockReturnValue('United States'),
}));

vi.mock('@/ai/era-context/question-generator.ts', () => ({
  generateResearchQuestions: vi.fn().mockReturnValue([]),
}));

vi.mock('@/ai/validation-prompts.ts', () => ({
  buildNotableContextPrompt: vi.fn().mockReturnValue('test'),
  parseNotableContext: vi.fn().mockReturnValue({ personId: 'p1', historicalContext: 'ctx', connectionPlausibility: 'plausible', suggestedReadings: [], generatedAt: new Date() }),
}));

vi.mock('@/ai/source-importer.ts', () => ({
  convertDiscoveredSource: vi.fn().mockReturnValue({
    id: 'src-new', origin: 'user_added', sourceClass: 'secondary', sourceType: 'census',
    title: 'Imported', citation: '', notes: '', url: null, repository: null,
    provesWhat: [], attachedToPersonIds: [], attachedToEdgeIds: [],
    gedcomTag: null, addedAt: new Date(), addedBy: 'ai',
  }),
}));

import { getApiKey } from '@/ai/ai-client.ts';
import { useAI } from './use-ai.ts';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(TreeProvider, null, children);
}

describe('useAI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports hasApiKey correctly', () => {
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(result.current.hasApiKey).toBe(true);
  });

  it('reports hasApiKey false when no key', () => {
    vi.mocked(getApiKey).mockReturnValue(null);
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(result.current.hasApiKey).toBe(false);
  });

  it('getQuickCheck returns undefined for uncached person', () => {
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(result.current.getQuickCheck('unknown')).toBeUndefined();
  });

  it('getEnrichResult returns undefined for uncached person', () => {
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(result.current.getEnrichResult('unknown')).toBeUndefined();
  });

  it('getValidationReport returns undefined for uncached person', () => {
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(result.current.getValidationReport('unknown')).toBeUndefined();
  });

  it('getDeepResearchRounds returns undefined for uncached person', () => {
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(result.current.getDeepResearchRounds('unknown')).toBeUndefined();
  });

  it('exposes importDiscoveredSource function', () => {
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(typeof result.current.importDiscoveredSource).toBe('function');
  });

  it('exposes quickCheck function', () => {
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(typeof result.current.quickCheck).toBe('function');
  });

  it('exposes validateStandard function', () => {
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(typeof result.current.validateStandard).toBe('function');
  });

  it('exposes startDeepResearch function', () => {
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(typeof result.current.startDeepResearch).toBe('function');
  });

  it('exposes enrichPerson function', () => {
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(typeof result.current.enrichPerson).toBe('function');
  });

  it('exposes getNotableContext function', () => {
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(typeof result.current.getNotableContext).toBe('function');
  });

  it('exposes getCachedNotableContext function', () => {
    const { result } = renderHook(() => useAI(), { wrapper });
    expect(typeof result.current.getCachedNotableContext).toBe('function');
  });
});
