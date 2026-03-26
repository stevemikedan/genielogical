import { useState, useCallback, useRef } from 'react';
import { useTree } from '@/hooks/use-tree.ts';
import { getApiKey } from '@/ai/ai-client.ts';
import { estimateCost, runBatchValidation } from '@/ai/batch-validator.ts';
import type { BatchValidationScope, CostEstimate, BatchProgress } from '@/types/ai.ts';

interface BatchValidationPanelProps {
  onOpenSettings: () => void;
}

export function BatchValidationPanel({ onOpenSettings }: BatchValidationPanelProps) {
  const { state, dispatch } = useTree();
  const [scope, setScope] = useState<BatchValidationScope>('all_flagged');
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const hasKey = getApiKey() !== null;
  const graph = state.graph;
  const flags = state.flags;

  const handleEstimate = useCallback(() => {
    if (!graph) return;
    const est = estimateCost(scope, graph, flags);
    setEstimate(est);
    setConfirmOpen(true);
  }, [scope, graph, flags]);

  const handleStart = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey || !graph) return;

    setConfirmOpen(false);
    const controller = new AbortController();
    abortRef.current = controller;

    const gen = runBatchValidation(scope, graph, flags, apiKey, dispatch, controller.signal);

    for await (const prog of gen) {
      setProgress({ ...prog });
      dispatch({ type: 'SET_BATCH_PROGRESS', progress: { ...prog } });
    }

    abortRef.current = null;
  }, [scope, graph, flags, dispatch]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const isRunning = progress?.status === 'running';
  const isComplete = progress?.status === 'complete';
  const isCancelled = progress?.status === 'cancelled';

  const SCOPE_LABELS: Record<BatchValidationScope, string> = {
    all_flagged: 'All Flagged',
    tier3_4: 'Tier 3-4',
    whole_tree: 'Whole Tree',
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="font-serif text-base text-text-primary mb-3">Batch AI Validation</h3>

      {!hasKey && (
        <div className="text-sm text-text-dim">
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-gold hover:text-gold-light transition-colors"
          >
            Configure your API key
          </button>
          {' '}to enable batch validation.
        </div>
      )}

      {hasKey && !isRunning && !isComplete && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">Scope:</label>
            <select
              value={scope}
              onChange={e => { setScope(e.target.value as BatchValidationScope); setEstimate(null); }}
              className="bg-bg border border-border rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-gold/50"
            >
              {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleEstimate}
            className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary
                       hover:text-gold hover:border-gold/40 transition-colors"
          >
            Estimate Cost
          </button>
        </div>
      )}

      {/* Cost confirmation */}
      {confirmOpen && estimate && (
        <div className="mt-3 p-3 rounded border border-gold/30 bg-gold/5">
          <p className="text-sm text-text-primary mb-2">
            <span className="font-mono text-gold">{estimate.personCount}</span> people
            {' '}· estimated <span className="font-mono text-gold">${estimate.estimatedCostUsd.toFixed(2)}</span>
          </p>
          <p className="text-xs text-text-dim mb-3">
            ~{estimate.estimatedInputTokens.toLocaleString()} input + ~{estimate.estimatedOutputTokens.toLocaleString()} output tokens
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleStart}
              className="px-3 py-1.5 text-sm rounded bg-gold text-bg font-medium hover:bg-gold-light transition-colors"
            >
              Start Validation
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Progress */}
      {isRunning && progress && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">
              {progress.completed + progress.failed} / {progress.total}
            </span>
            <span className="text-xs font-mono text-text-dim">
              ${progress.actualCostUsd.toFixed(3)}
            </span>
          </div>
          <div className="h-2 bg-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-gold transition-all duration-300"
              style={{ width: `${((progress.completed + progress.failed) / progress.total) * 100}%` }}
            />
          </div>
          {progress.failed > 0 && (
            <p className="text-xs text-tier4">{progress.failed} failed</p>
          )}
          <button
            type="button"
            onClick={handleCancel}
            className="text-xs text-tier4 hover:text-tier4-text transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Complete / Cancelled */}
      {(isComplete || isCancelled) && progress && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-text-primary">
            {isComplete ? 'Validation complete.' : 'Validation cancelled.'}
          </p>
          <div className="flex gap-4 text-xs text-text-secondary">
            <span>{progress.completed} validated</span>
            {progress.failed > 0 && <span className="text-tier4">{progress.failed} failed</span>}
            <span className="font-mono">${progress.actualCostUsd.toFixed(3)} spent</span>
          </div>
          <button
            type="button"
            onClick={() => { setProgress(null); setEstimate(null); }}
            className="text-xs text-text-dim hover:text-text-secondary transition-colors"
          >
            Run again
          </button>
        </div>
      )}
    </div>
  );
}
