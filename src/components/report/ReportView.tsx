import { useState, useMemo } from 'react';
import type { ReportResult } from '@/types/report.ts';
import { formatCost } from '@/ai/cost-estimator.ts';
import { ReportCandidateCard } from './ReportCandidateCard.tsx';
import { ReportMethodology } from './ReportMethodology.tsx';

interface ReportViewProps {
  report: ReportResult;
  onSelectPerson: (personId: string) => void;
  onNewReport: () => void;
}

type SectionFilter = 'all' | 'direct_line' | 'historical';
type SortField = 'ancestralConfidence' | 'name' | 'generation';

const REPORT_TITLES: Record<string, string> = {
  notable_women: 'Notable Women in Your Ancestry',
  notable_men: 'Notable Men in Your Ancestry',
};

export function ReportView({ report, onSelectPerson, onNewReport }: ReportViewProps) {
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');
  const [sortField, setSortField] = useState<SortField>('ancestralConfidence');

  const filtered = useMemo(() => {
    let candidates = report.candidates;
    if (sectionFilter !== 'all') {
      candidates = candidates.filter(c => c.section === sectionFilter);
    }

    const sorted = [...candidates];
    switch (sortField) {
      case 'ancestralConfidence':
        sorted.sort((a, b) => b.ancestralConfidence - a.ancestralConfidence);
        break;
      case 'name':
        sorted.sort((a, b) => a.person.name.full.localeCompare(b.person.name.full));
        break;
      case 'generation':
        sorted.sort((a, b) => a.generationsFromRoot - b.generationsFromRoot);
        break;
    }
    return sorted;
  }, [report.candidates, sectionFilter, sortField]);

  const stats = report.aggregateStats;
  const title = REPORT_TITLES[report.config.reportType] ?? 'Report';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-brand)] text-2xl text-gold">{title}</h2>
          <div className="flex gap-4 mt-1 text-xs text-text-dim">
            <span>{report.generatedAt.toLocaleDateString()}</span>
            <span>{stats.totalCandidates} candidates</span>
            {report.costUsd > 0 && <span>Cost: {formatCost(report.costUsd)}</span>}
            <span>{report.durationMs}ms</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onNewReport}
          className="text-sm text-gold hover:text-gold-light transition-colors"
        >
          New Report
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Direct Line" value={stats.directLineCandidates} />
        <StatCard label="Historical" value={stats.historicalCandidates} />
        <StatCard label="Avg Confidence" value={`${Math.round(stats.averageAncestralConfidence * 100)}%`} />
        <StatCard label="Source Coverage" value={`${Math.round(stats.sourceCoverage)}%`} />
      </div>

      {/* Methodology */}
      <ReportMethodology methodology={report.methodology} />

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1">
          {(['all', 'direct_line', 'historical'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setSectionFilter(f)}
              className={`px-3 py-1 rounded-md text-xs transition-colors ${
                sectionFilter === f
                  ? 'bg-gold text-bg font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {f === 'all' ? 'All' : f === 'direct_line' ? 'Direct Line' : 'Historical'}
            </button>
          ))}
        </div>
        <select
          value={sortField}
          onChange={e => setSortField(e.target.value as SortField)}
          className="text-xs bg-surface border border-border rounded-md px-2 py-1 text-text-secondary"
        >
          <option value="ancestralConfidence">Sort: Confidence</option>
          <option value="name">Sort: Name</option>
          <option value="generation">Sort: Generation</option>
        </select>
      </div>

      {/* Candidate cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(c => (
            <ReportCandidateCard
              key={c.personId}
              candidate={c}
              onSelectPerson={onSelectPerson}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-text-dim">
          <p className="text-lg mb-2">No results</p>
          <p className="text-sm">No candidates match the current filter.</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-surface text-center">
      <div className="text-lg font-mono text-text-primary">{value}</div>
      <div className="text-xs text-text-dim">{label}</div>
    </div>
  );
}
