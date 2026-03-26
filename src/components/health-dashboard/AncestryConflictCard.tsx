import type { AncestryConflict } from '@/types/conflict.ts';

interface AncestryConflictCardProps {
  conflicts: AncestryConflict[];
  onSelectPerson?: (personId: string) => void;
}

export function AncestryConflictCard({ conflicts, onSelectPerson }: AncestryConflictCardProps) {
  if (conflicts.length === 0) return null;

  const critical = conflicts.filter(c =>
    c.conflictType === 'different_parents' ||
    c.conflictType === 'different_father' ||
    c.conflictType === 'different_mother',
  ).length;
  const warning = conflicts.length - critical;

  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text-primary">Ancestry Conflicts</h3>
        <span className="text-lg font-bold text-tier4">{conflicts.length}</span>
      </div>

      <div className="flex gap-3 text-xs mb-3">
        {critical > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-tier4-bg text-tier4">
            {critical} critical
          </span>
        )}
        {warning > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-tier3-bg text-tier3">
            {warning} warning
          </span>
        )}
      </div>

      <ul className="space-y-1.5 text-xs">
        {conflicts.slice(0, 5).map((c, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${
              c.conflictType.includes('different') ? 'bg-tier4' : 'bg-tier3'
            }`} />
            <span className="text-text-secondary truncate">
              {c.pathA.fatherName ?? c.pathA.motherId ?? 'Unknown'} vs{' '}
              {c.pathB.fatherName ?? c.pathB.motherId ?? 'Unknown'}
            </span>
            {onSelectPerson && (
              <button
                type="button"
                onClick={() => onSelectPerson(c.personIdA)}
                className="text-gold hover:text-gold-light transition-colors ml-auto shrink-0"
              >
                View
              </button>
            )}
          </li>
        ))}
      </ul>

      {conflicts.length > 5 && (
        <p className="text-xs text-text-dim mt-2">
          +{conflicts.length - 5} more conflicts
        </p>
      )}
    </div>
  );
}
