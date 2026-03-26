import type { Person } from '@/types/person.ts';
import type { NodeStatus } from '@/types/common.ts';
import type { TreeAction } from '@/context/tree-state.ts';
import { ConfidenceBadge } from './ConfidenceBadge.tsx';

const STATUS_DISPLAY: Record<NodeStatus, { icon: string; label: string }> = {
  tentative: { icon: '○', label: 'Tentative' },
  under_review: { icon: '◐', label: 'Under Review' },
  validated: { icon: '●', label: 'Validated' },
  disputed: { icon: '⚠', label: 'Disputed' },
  rejected: { icon: '✕', label: 'Rejected' },
};

// Valid transitions from each status
const TRANSITIONS: Record<NodeStatus, NodeStatus[]> = {
  tentative: ['under_review', 'disputed'],
  under_review: ['validated', 'disputed'],
  validated: ['under_review', 'disputed'],
  disputed: ['under_review', 'rejected'],
  rejected: ['disputed', 'under_review'],
};

interface StatusConfidenceSectionProps {
  person: Person;
  dispatch: React.Dispatch<TreeAction>;
}

export function StatusConfidenceSection({ person, dispatch }: StatusConfidenceSectionProps) {
  const current = STATUS_DISPLAY[person.status];
  const transitions = TRANSITIONS[person.status];

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
          Status & Confidence
        </h3>
        <ConfidenceBadge tier={person.confidenceTier} reason={person.confidenceReason} size="md" />
      </div>

      {/* Current status */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{current.icon}</span>
        <span className="text-sm text-text-primary">{current.label}</span>
      </div>

      {/* Confidence reason */}
      <p className="text-xs text-text-dim mb-3">{person.confidenceReason}</p>

      {/* Transition buttons */}
      <div className="flex flex-wrap gap-2">
        {transitions.map(target => {
          const targetDisplay = STATUS_DISPLAY[target];
          return (
            <button
              key={target}
              type="button"
              onClick={() => dispatch({
                type: 'UPDATE_PERSON_STATUS',
                personId: person.id,
                status: target,
              })}
              className="text-xs px-2 py-1 rounded border border-border text-text-secondary
                         hover:text-text-primary hover:border-text-secondary transition-colors"
            >
              {targetDisplay.icon} {targetDisplay.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
