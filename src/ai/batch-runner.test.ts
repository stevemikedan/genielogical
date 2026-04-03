import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the ai-client module
vi.mock('./ai-client.ts', () => ({
  getApiKey: vi.fn().mockReturnValue('test-key'),
  sendMessage: vi.fn().mockResolvedValue({
    text: '{"plausibility":"plausible","issues":[],"suggestedTier":3,"tierReason":"ok","quickWin":null}',
    inputTokens: 100,
    outputTokens: 50,
  }),
}));

vi.mock('./prompts/index.ts', () => ({
  QUICK_CHECK_SYSTEM_PROMPT: 'test system prompt',
  buildQuickCheckUserPrompt: vi.fn().mockReturnValue('test user prompt'),
}));

vi.mock('./result-parser.ts', () => ({
  parseQuickCheckResult: vi.fn().mockReturnValue({
    plausibility: 'plausible',
    issues: [],
    suggestedTier: 3,
    tierReason: 'ok',
    quickWin: null,
  }),
}));

vi.mock('./era-context.ts', () => ({
  computeEraTag: vi.fn().mockReturnValue('modern'),
}));

import { runBatchQuickCheck } from './batch-runner.ts';
import { getApiKey, sendMessage } from './ai-client.ts';
import { makePerson, makeGraph } from '@/test/test-utils.ts';

describe('runBatchQuickCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiKey).mockReturnValue('test-key');
  });

  it('yields progress updates', async () => {
    const graph = makeGraph([makePerson({ id: 'p1' }), makePerson({ id: 'p2' })]);
    const updates = [];
    for await (const update of runBatchQuickCheck(['p1', 'p2'], graph, [])) {
      updates.push(update);
    }
    expect(updates.length).toBeGreaterThan(0);
  });

  it('processes all persons', async () => {
    const graph = makeGraph([makePerson({ id: 'p1' }), makePerson({ id: 'p2' }), makePerson({ id: 'p3' })]);
    let lastUpdate;
    for await (const update of runBatchQuickCheck(['p1', 'p2', 'p3'], graph, [])) {
      lastUpdate = update;
    }
    expect(lastUpdate!.progress.completed).toBe(3);
    expect(lastUpdate!.progress.status).toBe('complete');
  });

  it('tracks cost', async () => {
    const graph = makeGraph([makePerson({ id: 'p1' })]);
    let lastUpdate;
    for await (const update of runBatchQuickCheck(['p1'], graph, [])) {
      lastUpdate = update;
    }
    expect(lastUpdate!.progress.actualCostUsd).toBeGreaterThan(0);
  });

  it('handles individual failures without stopping batch', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce({ text: '{"plausibility":"plausible","issues":[],"suggestedTier":3,"tierReason":"ok","quickWin":null}', inputTokens: 100, outputTokens: 50 })
      .mockRejectedValueOnce(new Error('API error'));

    const graph = makeGraph([makePerson({ id: 'p1' }), makePerson({ id: 'p2' })]);
    let lastUpdate;
    for await (const update of runBatchQuickCheck(['p1', 'p2'], graph, [])) {
      lastUpdate = update;
    }
    // completed includes both successful and failed (all processed)
    expect(lastUpdate!.progress.completed).toBe(2);
    expect(lastUpdate!.progress.failed).toBe(1);
  });

  it('respects AbortSignal cancellation', async () => {
    const controller = new AbortController();
    controller.abort();

    const graph = makeGraph([makePerson({ id: 'p1' }), makePerson({ id: 'p2' })]);
    const updates = [];
    for await (const update of runBatchQuickCheck(['p1', 'p2'], graph, [], controller.signal)) {
      updates.push(update);
    }
    if (updates.length > 0) {
      expect(updates[updates.length - 1].progress.status).toBe('cancelled');
    }
  });

  it('returns nothing when no API key', async () => {
    vi.mocked(getApiKey).mockReturnValueOnce(null);
    const graph = makeGraph([makePerson({ id: 'p1' })]);
    const updates = [];
    for await (const update of runBatchQuickCheck(['p1'], graph, [])) {
      updates.push(update);
    }
    expect(updates).toHaveLength(0);
  });

  it('returns nothing when personIds is empty', async () => {
    const graph = makeGraph();
    const updates = [];
    for await (const update of runBatchQuickCheck([], graph, [])) {
      updates.push(update);
    }
    expect(updates).toHaveLength(0);
  });

  it('includes results array in each yield', async () => {
    const graph = makeGraph([makePerson({ id: 'p1' })]);
    for await (const update of runBatchQuickCheck(['p1'], graph, [])) {
      expect(update.results).toBeInstanceOf(Array);
      expect(update.results.length).toBeGreaterThan(0);
    }
  });
});
