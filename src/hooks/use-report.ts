import { useRef, useCallback, useMemo } from 'react';
import { useTree } from './use-tree.ts';
import type { ReportConfig, ReportResult, DataQualityReport } from '@/types/report.ts';
import type { CostEstimate } from '@/types/ai.ts';
import {
  runNotablePeopleReport,
  runDataQualityReport,
  estimateReportCost,
} from '@/engine/report-pipeline.ts';
import { extractNotablePeople } from '@/engine/report-extractors.ts';

export function useReport() {
  const { state, dispatch } = useTree();
  const abortRef = useRef<AbortController | null>(null);

  const isGenerating = useMemo(
    () => state.reportProgress !== null && state.reportProgress.stage !== 'complete' && state.reportProgress.stage !== 'cancelled' && state.reportProgress.stage !== 'error',
    [state.reportProgress],
  );

  /**
   * Pre-narration cost estimate: runs extract only (fast, deterministic).
   */
  const estimateCost = useCallback((config: ReportConfig): { candidateCount: number; estimate: CostEstimate } | null => {
    if (!state.graph) return null;

    const rootId = config.scope.rootPersonId ?? state.selectedPersonId;
    if (!rootId) return null;

    if (config.reportType === 'data_quality') {
      const count = state.graph.persons.size;
      return { candidateCount: count, estimate: estimateReportCost(count, config.aiDepth) };
    }

    const sex = config.scope.sexFilter ?? (config.reportType === 'notable_women' ? 'F' : 'M');
    const candidates = extractNotablePeople(state.graph, state.flags, rootId, {
      sex,
      scope: config.scope,
    });

    return {
      candidateCount: candidates.length,
      estimate: estimateReportCost(candidates.length, config.aiDepth),
    };
  }, [state.graph, state.flags, state.selectedPersonId]);

  /**
   * Start report generation (full pipeline).
   */
  const generateReport = useCallback(async (config: ReportConfig) => {
    if (!state.graph) return;

    const rootId = config.scope.rootPersonId ?? state.selectedPersonId;
    if (!rootId) return;

    // Cancel any in-progress report
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    dispatch({ type: 'CLEAR_REPORT' });

    try {
      if (config.reportType === 'data_quality') {
        for await (const update of runDataQualityReport(state.graph, state.flags, rootId, config, controller.signal)) {
          if (controller.signal.aborted) break;
          dispatch({ type: 'SET_REPORT_PROGRESS', progress: update.progress });
          if (update.progress.stage === 'complete' && update.result.candidates) {
            dispatch({ type: 'SET_REPORT', report: update.result as DataQualityReport });
          }
        }
      } else {
        for await (const update of runNotablePeopleReport(state.graph, state.flags, rootId, config, controller.signal)) {
          if (controller.signal.aborted) break;
          dispatch({ type: 'SET_REPORT_PROGRESS', progress: update.progress });
          if (update.progress.stage === 'complete' && update.result.candidates) {
            dispatch({ type: 'SET_REPORT', report: update.result as ReportResult });
          }
        }
      }
    } catch (err) {
      dispatch({
        type: 'SET_REPORT_PROGRESS',
        progress: {
          stage: 'error',
          candidatesFound: 0,
          narratedCount: 0,
          totalToNarrate: 0,
          estimatedCostUsd: 0,
          actualCostUsd: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      });
    }
  }, [state.graph, state.flags, state.selectedPersonId, dispatch]);

  /**
   * Cancel in-progress report.
   */
  const cancelReport = useCallback(() => {
    abortRef.current?.abort();
    if (state.reportProgress) {
      dispatch({
        type: 'SET_REPORT_PROGRESS',
        progress: { ...state.reportProgress, stage: 'cancelled' },
      });
    }
  }, [state.reportProgress, dispatch]);

  return {
    generateReport,
    cancelReport,
    estimateCost,
    activeReport: state.activeReport,
    reportProgress: state.reportProgress,
    isGenerating,
  };
}
