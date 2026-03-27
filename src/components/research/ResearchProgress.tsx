import type { DeepResearchRound } from '@/types/ai.ts';
import { formatCost } from '@/ai/cost-estimator.ts';

interface ResearchProgressProps {
  rounds: DeepResearchRound[];
  running: boolean;
  estimatedCostUsd: number;
  onCancel: () => void;
}

export function ResearchProgress({ rounds, running, estimatedCostUsd, onCancel }: ResearchProgressProps) {
  const totalFindings = rounds.reduce((sum, r) => sum + r.findings.length, 0);
  const lastRound = rounds[rounds.length - 1];
  const status = lastRound?.status ?? 'CONTINUE';

  return (
    <div className="rounded border border-border bg-bg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-text-primary">Deep Research</h4>
        {running && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-tier4 hover:text-tier4/80 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map(r => (
          <div
            key={r}
            className={`h-1.5 flex-1 rounded-full ${
              r <= rounds.length
                ? 'bg-gold'
                : running && r === rounds.length + 1
                  ? 'bg-gold/40 animate-pulse'
                  : 'bg-border'
            }`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-text-dim">
        <span>
          Round {rounds.length}/5
          {running && (
            <span className="ml-1">
              <span className="inline-block w-2 h-2 border border-gold/50 border-t-gold rounded-full animate-spin align-middle" />
            </span>
          )}
        </span>
        <span>{totalFindings} finding{totalFindings !== 1 ? 's' : ''}</span>
        <span className="font-mono">{formatCost(estimatedCostUsd)}</span>
      </div>

      {!running && status !== 'CONTINUE' && (
        <p className={`text-xs ${status === 'COMPLETE' ? 'text-tier1' : 'text-tier3'}`}>
          {status === 'COMPLETE' ? 'Research complete' : 'Dead end reached — no more leads'}
        </p>
      )}
    </div>
  );
}
