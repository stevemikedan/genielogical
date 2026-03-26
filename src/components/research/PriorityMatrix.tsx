import type { ResearchPriority } from '@/types/research.ts';
import { TIER_BG_CLASSES, getTierLabel } from '@/types/tier-labels.ts';
import type { ConfidenceTier } from '@/types/common.ts';

interface PriorityMatrixProps {
  priorities: ResearchPriority[];
  onSelectPerson?: (personId: string) => void;
}

export function PriorityMatrix({ priorities, onSelectPerson }: PriorityMatrixProps) {
  if (priorities.length === 0) {
    return (
      <div className="text-center py-12 text-text-dim">
        <p className="text-lg mb-2">No research priorities identified</p>
        <p className="text-sm">Load a tree with notable ancestors to see prioritized research actions.</p>
      </div>
    );
  }

  const maxScore = priorities[0]?.impactScore ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-serif text-lg text-text-primary">Research Priorities</h3>
        <span className="text-xs text-text-dim">{priorities.length} action{priorities.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-2">
        {priorities.map((priority, index) => {
          const barWidth = Math.max(8, (priority.impactScore / maxScore) * 100);
          const tierClass = TIER_BG_CLASSES[priority.currentTier as ConfidenceTier] ?? TIER_BG_CLASSES[4];
          const tierLabel = getTierLabel(priority.currentTier as ConfidenceTier);

          return (
            <div
              key={priority.edgeId}
              className="rounded-lg border border-border bg-surface p-3 hover:border-gold/40 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-text-dim text-sm font-mono w-6 shrink-0 text-right">
                  #{index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary mb-1">{priority.description}</p>
                  <div className="flex items-center gap-3 text-xs mb-2">
                    <span className={`px-1.5 py-0.5 rounded font-medium ${tierClass}`}>
                      {tierLabel}
                    </span>
                    <span className="text-text-dim">
                      Impact: {priority.impactScore}
                    </span>
                    <span className="text-text-dim">
                      {priority.affectedPathCount} path{priority.affectedPathCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {/* Impact score bar */}
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gold rounded-full transition-all"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  {priority.affectedNotablePaths.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {priority.affectedNotablePaths.slice(0, 4).map(name => (
                        <span key={name} className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-text-secondary">
                          {name}
                        </span>
                      ))}
                      {priority.affectedNotablePaths.length > 4 && (
                        <span className="text-xs text-text-dim">
                          +{priority.affectedNotablePaths.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    className="text-xs text-gold hover:text-gold-light transition-colors"
                    onClick={() => onSelectPerson?.(priority.parentId)}
                    title="View parent"
                  >
                    Parent
                  </button>
                  <span className="text-text-dim text-xs">/</span>
                  <button
                    type="button"
                    className="text-xs text-gold hover:text-gold-light transition-colors"
                    onClick={() => onSelectPerson?.(priority.childId)}
                    title="View child"
                  >
                    Child
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
