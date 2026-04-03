import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutoSave } from './auto-save.ts';
import { makeGraph, makePerson } from '@/test/test-utils.ts';
import type { Flag } from '@/types/flag.ts';

vi.mock('./tree-repository.ts', () => ({
  saveTreeGraph: vi.fn().mockResolvedValue(undefined),
}));

import { saveTreeGraph } from './tree-repository.ts';

const mockSave = vi.mocked(saveTreeGraph);

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSave.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not save immediately on mount', () => {
    const graph = makeGraph([makePerson({ id: 'p1' })]);
    renderHook(() => useAutoSave('tree-1', graph, []));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('saves after 2 second debounce', async () => {
    const graph = makeGraph([makePerson({ id: 'p1' })]);
    renderHook(() => useAutoSave('tree-1', graph, []));

    await vi.advanceTimersByTimeAsync(2000);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith('tree-1', graph, []);
  });

  it('reports unsaved then saved status', async () => {
    const graph = makeGraph([makePerson({ id: 'p1' })]);
    const statusChanges: string[] = [];
    const onStatus = (s: string) => statusChanges.push(s);

    renderHook(() => useAutoSave('tree-1', graph, [], onStatus));

    // Should immediately report unsaved
    expect(statusChanges).toContain('unsaved');

    await vi.advanceTimersByTimeAsync(2000);
    expect(statusChanges).toContain('saving');
    expect(statusChanges).toContain('saved');
  });

  it('does not save when treeId is null', async () => {
    const graph = makeGraph([makePerson({ id: 'p1' })]);
    renderHook(() => useAutoSave(null, graph, []));
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('does not save when graph is null', async () => {
    renderHook(() => useAutoSave('tree-1', null, []));
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('debounces rapid changes', async () => {
    const graph = makeGraph([makePerson({ id: 'p1' })]);
    const flags1: Flag[] = [];
    const flags2: Flag[] = [];

    const { rerender } = renderHook(
      ({ flags }) => useAutoSave('tree-1', graph, flags),
      { initialProps: { flags: flags1 } },
    );

    // Trigger a change before debounce fires
    await vi.advanceTimersByTimeAsync(1000);
    rerender({ flags: flags2 });

    // The first timer was cleared; only the second one fires
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });
});
