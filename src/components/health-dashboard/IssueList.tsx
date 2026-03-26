import { useState } from 'react';
import type { Flag, FlagCategory, FlagSeverity } from '@/types/flag.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { IssueCard } from './IssueCard.tsx';

interface IssueListProps {
  flags: Flag[];
  graph: TreeGraph;
  onSelectPerson: (id: string) => void;
}

const CATEGORY_LABELS: Record<FlagCategory, string> = {
  chronological: 'Chronological Issues',
  prestige_inflation: 'Prestige Inflation',
  duplicate_suspect: 'Duplicate Suspects',
  place_normalization: 'Place Issues',
  source_desert: 'Source Deserts',
  structural: 'Structural Issues',
  unresolved_parentage: 'Unresolved Parentage',
  data_quality: 'Data Quality',
};

const CATEGORY_ORDER: FlagCategory[] = [
  'chronological',
  'structural',
  'prestige_inflation',
  'source_desert',
  'duplicate_suspect',
  'unresolved_parentage',
  'place_normalization',
  'data_quality',
];

const SEVERITY_ORDER: Record<FlagSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function IssueList({ flags, graph, onSelectPerson }: IssueListProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<FlagCategory>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<Set<FlagSeverity>>(new Set(['critical', 'warning', 'info']));

  const filteredFlags = flags.filter(f => severityFilter.has(f.severity));

  const grouped = new Map<FlagCategory, Flag[]>();
  for (const flag of filteredFlags) {
    const list = grouped.get(flag.category) ?? [];
    list.push(flag);
    grouped.set(flag.category, list);
  }

  // Sort flags within each group by severity
  for (const [, list] of grouped) {
    list.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }

  function toggleCategory(cat: FlagCategory) {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function toggleSeverity(sev: FlagSeverity) {
    setSeverityFilter(prev => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  }

  return (
    <div>
      {/* Severity filters */}
      <div className="flex gap-2 mb-4">
        {(['critical', 'warning', 'info'] as const).map(sev => {
          const styles = {
            critical: 'bg-tier4-bg text-tier4-text border-tier4-border',
            warning: 'bg-tier3-bg text-tier3-text border-tier3-border',
            info: 'bg-tier2-bg text-tier2-text border-tier2-border',
          };
          const active = severityFilter.has(sev);
          return (
            <button
              key={sev}
              type="button"
              onClick={() => toggleSeverity(sev)}
              className={`px-3 py-1 rounded border text-xs font-medium transition-opacity ${styles[sev]} ${active ? 'opacity-100' : 'opacity-30'}`}
            >
              {sev} ({flags.filter(f => f.severity === sev).length})
            </button>
          );
        })}
      </div>

      {/* Category accordion */}
      <div className="space-y-2">
        {CATEGORY_ORDER.map(cat => {
          const categoryFlags = grouped.get(cat);
          if (!categoryFlags || categoryFlags.length === 0) return null;
          const isExpanded = expandedCategories.has(cat);

          return (
            <div key={cat} className="border border-border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <span className="font-[family-name:var(--font-display)] text-text-primary text-sm">
                  {CATEGORY_LABELS[cat]}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-[family-name:var(--font-mono)] text-gold text-sm">
                    {categoryFlags.length}
                  </span>
                  <span className="text-text-dim text-xs">{isExpanded ? '▾' : '▸'}</span>
                </div>
              </button>
              {isExpanded && (
                <div className="p-3 space-y-2 bg-bg">
                  {categoryFlags.map(flag => (
                    <IssueCard
                      key={flag.id}
                      flag={flag}
                      graph={graph}
                      onSelectPerson={onSelectPerson}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {filteredFlags.length === 0 && (
          <div className="text-center py-8 text-text-dim">
            No issues match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
