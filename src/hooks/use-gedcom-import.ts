import { useCallback } from 'react';
import { useTree } from './use-tree.ts';
import { parseGedcom } from '@/parser/index.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import { runFlagEngine, scoreAllConfidence, runDeepScan, findNotableAncestors, computeResearchPriorities } from '@/engine/index.ts';
import { generateResearchSteps } from '@/engine/research-recommender.ts';

export function useGedcomImport() {
  const { dispatch } = useTree();

  const importFile = useCallback(async (file: File) => {
    dispatch({ type: 'PARSE_START' });

    try {
      const text = await file.text();
      const result = parseGedcom(text);

      const graph = new TreeGraph();
      graph.loadFromParseResult(result);

      // Run flag engine and confidence scorer
      const flags = runFlagEngine(graph);
      scoreAllConfidence(graph, flags);

      dispatch({ type: 'PARSE_SUCCESS', graph, stats: result.stats });
      dispatch({ type: 'SET_FLAGS', flags });

      // Run Phase E engines on the first leaf (default subject)
      const leaves = graph.getLeaves();
      if (leaves.length > 0) {
        const subjectId = leaves[0].id;

        const storyResult = findNotableAncestors(graph, subjectId);
        dispatch({ type: 'SET_STORY_PATHS', result: storyResult });

        const deepScanResult = runDeepScan(graph, subjectId);
        dispatch({ type: 'SET_DEEP_SCAN', result: deepScanResult });

        const priorities = computeResearchPriorities(graph, storyResult.notableAncestors);
        dispatch({ type: 'SET_RESEARCH_PRIORITIES', priorities });
      }

      // Run rule-based research recommender
      const researchSteps = generateResearchSteps(graph, flags);
      dispatch({ type: 'SET_RESEARCH_STEPS', steps: researchSteps });
    } catch (err) {
      dispatch({
        type: 'PARSE_ERROR',
        error: err instanceof Error ? err.message : 'Unknown error during import',
      });
    }
  }, [dispatch]);

  return { importFile };
}
