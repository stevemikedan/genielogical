import type { ReportProgress as ReportProgressType } from '@/types/report.ts';
import { formatCost } from '@/ai/cost-estimator.ts';

interface ReportProgressProps {
  progress: ReportProgressType;
  onCancel: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  extracting: 'Extracting candidates...',
  scoring: 'Computing confidence scores...',
  narrating: 'AI narration in progress...',
  complete: 'Report complete',
  cancelled: 'Report cancelled',
  error: 'Error',
};

export function ReportProgress({ progress, onCancel }: ReportProgressProps) {
  const isRunning = progress.stage === 'extracting' || progress.stage === 'scoring' || progress.stage === 'narrating';
  const percent = progress.totalToNarrate > 0
    ? Math.round((progress.narratedCount / progress.totalToNarrate) * 100)
    : progress.stage === 'complete' ? 100 : 0;

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="text-center">
        <div className="text-sm text-text-secondary mb-2">
          {STAGE_LABELS[progress.stage] ?? progress.stage}
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-surface-alt rounded-full overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all ${
              progress.stage === 'error' ? 'bg-tier4' :
              progress.stage === 'cancelled' ? 'bg-tier3' :
              'bg-gold'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-4 text-xs text-text-dim">
          <span>{progress.candidatesFound} candidates</span>
          {progress.totalToNarrate > 0 && (
            <span>{progress.narratedCount}/{progress.totalToNarrate} narrated</span>
          )}
          {progress.actualCostUsd > 0 && (
            <span className="text-gold">{formatCost(progress.actualCostUsd)}</span>
          )}
        </div>

        {progress.error && (
          <div className="text-xs text-tier4 mt-2">{progress.error}</div>
        )}
      </div>

      {/* Cancel button */}
      {isRunning && (
        <div className="text-center">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-text-secondary hover:text-tier4 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
