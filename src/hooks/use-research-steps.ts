import { useEffect } from 'react';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { Flag } from '@/types/flag.ts';
import type { TreeAction } from '@/context/tree-state.ts';
import { generateResearchSteps } from '@/engine/research-recommender.ts';

export function useResearchSteps(
  graph: TreeGraph | null,
  flags: Flag[],
  dispatch: React.Dispatch<TreeAction>,
): void {
  useEffect(() => {
    if (!graph) return;
    const steps = generateResearchSteps(graph, flags);
    dispatch({ type: 'SET_RESEARCH_STEPS', steps });
  }, [graph, flags, dispatch]);
}
