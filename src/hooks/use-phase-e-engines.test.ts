import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePhaseEEngines } from './use-phase-e-engines.ts';
import { makeGraph, makePerson, makeEdge } from '@/test/test-utils.ts';

// Mock the engine modules
vi.mock('@/engine/story-paths.ts', () => ({
  findNotableAncestors: vi.fn().mockReturnValue({ subjectId: 'p1', notableAncestors: [], byCategory: new Map() }),
}));
vi.mock('@/engine/deep-scanner.ts', () => ({
  runDeepScan: vi.fn().mockReturnValue({ subjectId: 'p1', totalUniqueAncestors: 0, maxGenerationReached: 0, branches: [], generationDistribution: new Map(), allNotableFigures: [] }),
}));
vi.mock('@/engine/impact-scorer.ts', () => ({
  computeResearchPriorities: vi.fn().mockReturnValue([]),
}));

import { findNotableAncestors } from '@/engine/story-paths.ts';
import { runDeepScan } from '@/engine/deep-scanner.ts';
import { computeResearchPriorities } from '@/engine/impact-scorer.ts';

describe('usePhaseEEngines', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('runs engines when rootPersonId changes', async () => {
    vi.useFakeTimers();
    const graph = makeGraph(
      [makePerson({ id: 'p1' }), makePerson({ id: 'p2' })],
      [makeEdge({ id: 'e1', parentId: 'p2', childId: 'p1' })],
    );
    const dispatch = vi.fn();

    renderHook(() => usePhaseEEngines('p1', graph, dispatch));

    // Wait for debounce
    await vi.advanceTimersByTimeAsync(400);

    expect(findNotableAncestors).toHaveBeenCalled();
    expect(runDeepScan).toHaveBeenCalled();
    expect(computeResearchPriorities).toHaveBeenCalled();
  });

  it('dispatches SET_STORY_PATHS, SET_DEEP_SCAN, SET_RESEARCH_PRIORITIES', async () => {
    vi.useFakeTimers();
    const graph = makeGraph([makePerson({ id: 'p1' })]);
    const dispatch = vi.fn();

    renderHook(() => usePhaseEEngines('p1', graph, dispatch));
    await vi.advanceTimersByTimeAsync(400);

    const actionTypes = dispatch.mock.calls.map(c => c[0].type);
    expect(actionTypes).toContain('SET_STORY_PATHS');
    expect(actionTypes).toContain('SET_DEEP_SCAN');
    expect(actionTypes).toContain('SET_RESEARCH_PRIORITIES');
  });

  it('does not run when rootPersonId is null', async () => {
    vi.useFakeTimers();
    const graph = makeGraph([makePerson({ id: 'p1' })]);
    const dispatch = vi.fn();

    renderHook(() => usePhaseEEngines(null, graph, dispatch));
    await vi.advanceTimersByTimeAsync(400);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not run when graph is null', async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();

    renderHook(() => usePhaseEEngines('p1', null, dispatch));
    await vi.advanceTimersByTimeAsync(400);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('debounces rapid changes', async () => {
    vi.useFakeTimers();
    const graph = makeGraph([makePerson({ id: 'p1' }), makePerson({ id: 'p2' })]);
    const dispatch = vi.fn();

    const { rerender } = renderHook(
      ({ rootId }) => usePhaseEEngines(rootId, graph, dispatch),
      { initialProps: { rootId: 'p1' } },
    );

    await vi.advanceTimersByTimeAsync(100);
    rerender({ rootId: 'p2' });
    await vi.advanceTimersByTimeAsync(400);

    // Should only have run once (for p2, not p1)
    expect(vi.mocked(runDeepScan).mock.calls.length).toBeLessThanOrEqual(1);
  });
});
