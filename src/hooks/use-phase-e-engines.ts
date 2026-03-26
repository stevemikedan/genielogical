import { useEffect, useRef } from 'react';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { TreeAction } from '@/context/tree-state.ts';
import { runDeepScan, findNotableAncestors, computeResearchPriorities } from '@/engine/index.ts';

/**
 * Re-run Phase E engines when the root person changes.
 * Debounced to avoid running on rapid changes.
 */
export function usePhaseEEngines(
  rootPersonId: string | null,
  graph: TreeGraph | null,
  dispatch: React.Dispatch<TreeAction>,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!rootPersonId || !graph) return;

    // Clear any pending debounce
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      const storyResult = findNotableAncestors(graph, rootPersonId);
      dispatch({ type: 'SET_STORY_PATHS', result: storyResult });

      const deepScanResult = runDeepScan(graph, rootPersonId);
      dispatch({ type: 'SET_DEEP_SCAN', result: deepScanResult });

      const priorities = computeResearchPriorities(graph, storyResult.notableAncestors);
      dispatch({ type: 'SET_RESEARCH_PRIORITIES', priorities });
    }, 300);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [rootPersonId, graph, dispatch]);
}
