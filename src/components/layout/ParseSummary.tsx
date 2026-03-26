import type { ParseStats } from '@/types/index.ts';

interface ParseSummaryProps {
  stats: ParseStats;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 text-center">
      <div className="font-[family-name:var(--font-display)] text-2xl text-gold">{value}</div>
      <div className="text-sm text-text-secondary mt-1">{label}</div>
      {sub && <div className="text-xs text-text-dim mt-0.5">{sub}</div>}
    </div>
  );
}

export function ParseSummary({ stats }: ParseSummaryProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl text-text-primary">Parse Summary</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Individuals"
          value={stats.individualCount.toLocaleString()}
        />
        <StatCard
          label="Families"
          value={stats.familyCount.toLocaleString()}
        />
        <StatCard
          label="Sources"
          value={stats.sourceCount.toLocaleString()}
        />
        <StatCard
          label="Generations"
          value={stats.generationCount}
          sub={stats.generationCount === 0 ? 'estimate' : undefined}
        />
        <StatCard
          label="Parse Time"
          value={`${(stats.parseTimeMs / 1000).toFixed(2)}s`}
        />
      </div>
      {(stats.warningCount > 0 || stats.errorCount > 0) && (
        <div className="flex gap-4 text-sm">
          {stats.errorCount > 0 && (
            <span className="text-tier4">{stats.errorCount} error{stats.errorCount !== 1 ? 's' : ''}</span>
          )}
          {stats.warningCount > 0 && (
            <span className="text-tier3">{stats.warningCount} warning{stats.warningCount !== 1 ? 's' : ''}</span>
          )}
        </div>
      )}
      {stats.software && (
        <p className="text-xs text-text-dim">
          Exported from {stats.software}
          {stats.gedcomVersion ? ` (GEDCOM ${stats.gedcomVersion})` : ''}
        </p>
      )}
    </div>
  );
}
