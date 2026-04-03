import { useState } from 'react';
import { useTree } from '@/hooks/use-tree.ts';
import type { AncestryConflict } from '@/types/conflict.ts';
import type { MergeDecision } from '@/types/conflict.ts';

interface ConflictResolutionSectionProps {
  personId: string;
  onNavigate?: (personId: string) => void;
}

const CONFLICT_TYPE_LABELS: Record<string, string> = {
  different_parents: 'Different Parents',
  different_father: 'Different Father',
  different_mother: 'Different Mother',
  additional_parents: 'Additional Parents',
  upstream_divergence: 'Upstream Divergence',
};

const CONFLICT_SEVERITY: Record<string, string> = {
  different_parents: 'bg-tier4-bg text-tier4',
  different_father: 'bg-tier4-bg text-tier4',
  different_mother: 'bg-tier4-bg text-tier4',
  additional_parents: 'bg-tier3-bg text-tier3',
  upstream_divergence: 'bg-tier3-bg text-tier3',
};

export function ConflictResolutionSection({ personId, onNavigate }: ConflictResolutionSectionProps) {
  const { state, dispatch } = useTree();

  const conflicts = state.ancestryConflicts.filter(
    c => c.personIdA === personId || c.personIdB === personId,
  );

  if (conflicts.length === 0) return null;

  return (
    <div>
      <h3 className="font-[family-name:var(--font-heading)] text-sm font-medium text-text-secondary mb-2">
        Ancestry Conflicts ({conflicts.length})
      </h3>

      <div className="space-y-2">
        {conflicts.map((conflict, i) => (
          <ConflictCard
            key={i}
            conflict={conflict}
            currentPersonId={personId}
            onNavigate={onNavigate}
            onResolve={(decision) => dispatch({ type: 'RESOLVE_ANCESTRY_CONFLICT', decision })}
          />
        ))}
      </div>
    </div>
  );
}

function ConflictCard({
  conflict,
  currentPersonId,
  onNavigate,
  onResolve,
}: {
  conflict: AncestryConflict;
  currentPersonId: string;
  onNavigate?: (id: string) => void;
  onResolve: (decision: MergeDecision) => void;
}) {
  const [confirmAction, setConfirmAction] = useState<'merge_a' | 'merge_b' | 'parallel' | null>(null);
  const otherPersonId = conflict.personIdA === currentPersonId ? conflict.personIdB : conflict.personIdA;

  const handleResolve = (action: 'merge_a' | 'merge_b' | 'parallel') => {
    if (action === 'parallel') {
      onResolve({
        winnerPersonId: conflict.personIdA,
        loserPersonId: conflict.personIdB,
        action: 'convert_to_parallel',
        preserveLoserSources: true,
        preserveLoserNotes: true,
        reparentDescendants: false,
        orphanUpstream: false,
      });
    } else {
      const winnerId = action === 'merge_a' ? conflict.personIdA : conflict.personIdB;
      const loserId = action === 'merge_a' ? conflict.personIdB : conflict.personIdA;
      onResolve({
        winnerPersonId: winnerId,
        loserPersonId: loserId,
        action: 'merge_keep_winner',
        preserveLoserSources: true,
        preserveLoserNotes: true,
        reparentDescendants: true,
        orphanUpstream: false,
      });
    }
    setConfirmAction(null);
  };

  return (
    <div className="rounded border border-border bg-bg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${CONFLICT_SEVERITY[conflict.conflictType] ?? 'bg-tier3-bg text-tier3'}`}>
          {CONFLICT_TYPE_LABELS[conflict.conflictType] ?? conflict.conflictType}
        </span>
        <span className="text-xs text-text-dim">
          {conflict.sharedDescendants.length} shared descendant{conflict.sharedDescendants.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <VersionPanel
          label="Version A"
          path={conflict.pathA}
          sourceCount={conflict.sourceCountA}
          tier={conflict.confidenceTierA}
          onNavigate={onNavigate}
        />
        <VersionPanel
          label="Version B"
          path={conflict.pathB}
          sourceCount={conflict.sourceCountB}
          tier={conflict.confidenceTierB}
          onNavigate={onNavigate}
        />
      </div>

      {/* Actions */}
      {confirmAction === null ? (
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate(otherPersonId)}
              className="text-xs text-gold hover:text-gold-light transition-colors"
            >
              View other version
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmAction('merge_a')}
            className="text-xs px-2 py-0.5 border border-tier1 text-tier1 rounded hover:bg-tier1/10 transition-colors"
          >
            Keep A
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction('merge_b')}
            className="text-xs px-2 py-0.5 border border-tier2 text-tier2 rounded hover:bg-tier2/10 transition-colors"
          >
            Keep B
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction('parallel')}
            className="text-xs px-2 py-0.5 border border-border text-text-secondary rounded hover:bg-surface transition-colors"
          >
            Keep both (parallel)
          </button>
        </div>
      ) : (
        <div className="pt-1 space-y-1.5">
          <p className="text-xs text-tier3">
            {confirmAction === 'parallel'
              ? 'Mark as parallel paths? Both versions will be kept with the loser marked non-primary.'
              : `Merge into Version ${confirmAction === 'merge_a' ? 'A' : 'B'}? The other version will be removed and its sources preserved.`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleResolve(confirmAction)}
              className="text-xs px-2.5 py-1 bg-gold text-bg rounded font-medium hover:bg-gold-light transition-colors"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="text-xs px-2.5 py-1 border border-border text-text-secondary rounded hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function VersionPanel({
  label,
  path,
  sourceCount,
  tier,
  onNavigate,
}: {
  label: string;
  path: AncestryConflict['pathA'];
  sourceCount: number;
  tier: number;
  onNavigate?: (id: string) => void;
}) {
  return (
    <div className="rounded border border-border bg-surface p-2">
      <p className="text-text-dim mb-1">{label}</p>
      {path.fatherId && (
        <p>
          Father:{' '}
          <PersonLink id={path.fatherId} name={path.fatherName} onNavigate={onNavigate} />
        </p>
      )}
      {path.motherId && (
        <p>
          Mother:{' '}
          <PersonLink id={path.motherId} name={path.motherName} onNavigate={onNavigate} />
        </p>
      )}
      <p className="text-text-dim mt-1">
        {sourceCount} source{sourceCount !== 1 ? 's' : ''} | Tier {tier}
      </p>
    </div>
  );
}

function PersonLink({
  id,
  name,
  onNavigate,
}: {
  id: string;
  name: string | null;
  onNavigate?: (id: string) => void;
}) {
  if (!onNavigate) return <span className="text-text-secondary">{name ?? id}</span>;
  return (
    <button
      type="button"
      onClick={() => onNavigate(id)}
      className="text-gold hover:text-gold-light transition-colors"
    >
      {name ?? id}
    </button>
  );
}
