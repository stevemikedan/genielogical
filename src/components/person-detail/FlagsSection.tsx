import type { Flag } from '@/types/flag.ts';
import type { TreeAction } from '@/context/tree-state.ts';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-tier4 bg-tier4-bg',
  warning: 'border-tier3 bg-tier3-bg',
  info: 'border-tier2 bg-tier2-bg',
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-tier4 text-bg',
  warning: 'bg-tier3 text-bg',
  info: 'bg-tier2 text-bg',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  investigating: 'Investigating',
  dismissed: 'Dismissed',
  resolved: 'Resolved',
};

interface FlagsSectionProps {
  flags: Flag[];
  dispatch: React.Dispatch<TreeAction>;
}

export function FlagsSection({ flags, dispatch }: FlagsSectionProps) {
  const activeFlags = flags.filter(f => f.userStatus !== 'dismissed' && f.userStatus !== 'resolved');
  const inactiveFlags = flags.filter(f => f.userStatus === 'dismissed' || f.userStatus === 'resolved');

  function updateFlag(flagId: string, userStatus: Flag['userStatus']) {
    dispatch({ type: 'UPDATE_FLAG_STATUS', flagId, userStatus, userNote: null });
  }

  return (
    <section>
      <h3 className="text-sm font-medium text-text-secondary mb-2 uppercase tracking-wide">
        Flags ({activeFlags.length} active)
      </h3>

      <div className="space-y-2">
        {activeFlags.map(flag => (
          <div key={flag.id} className={`border rounded p-2 text-sm ${SEVERITY_STYLES[flag.severity] ?? 'border-border'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs px-1 py-0.5 rounded font-medium ${SEVERITY_BADGE[flag.severity] ?? ''}`}>
                    {flag.severity}
                  </span>
                  <span className="text-text-primary font-medium">{flag.title}</span>
                </div>
                <p className="text-xs text-text-secondary mt-1">{flag.description}</p>
                {flag.suggestedAction && (
                  <p className="text-xs text-text-dim mt-0.5">Suggested: {flag.suggestedAction}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-text-dim mr-1">{STATUS_LABELS[flag.userStatus]}</span>
              {flag.userStatus === 'new' && (
                <button
                  type="button"
                  onClick={() => updateFlag(flag.id, 'acknowledged')}
                  className="text-xs px-1.5 py-0.5 rounded border border-border text-text-secondary hover:text-text-primary transition-colors"
                >
                  Acknowledge
                </button>
              )}
              {(flag.userStatus === 'new' || flag.userStatus === 'acknowledged') && (
                <button
                  type="button"
                  onClick={() => updateFlag(flag.id, 'dismissed')}
                  className="text-xs px-1.5 py-0.5 rounded border border-border text-text-secondary hover:text-text-primary transition-colors"
                >
                  Dismiss
                </button>
              )}
              {flag.userStatus !== 'resolved' && (
                <button
                  type="button"
                  onClick={() => updateFlag(flag.id, 'resolved')}
                  className="text-xs px-1.5 py-0.5 rounded border border-border text-text-secondary hover:text-text-primary transition-colors"
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {inactiveFlags.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-text-dim cursor-pointer hover:text-text-secondary">
            {inactiveFlags.length} dismissed/resolved
          </summary>
          <div className="space-y-1 mt-1">
            {inactiveFlags.map(flag => (
              <div key={flag.id} className="text-xs text-text-dim flex items-center gap-2 py-0.5">
                <span className="line-through">{flag.title}</span>
                <span className="text-text-dim">({STATUS_LABELS[flag.userStatus]})</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
