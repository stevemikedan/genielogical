import type { DataQualityReport } from '@/types/report.ts';

interface DataQualityReportViewProps {
  report: DataQualityReport;
  onSelectPerson: (personId: string) => void;
  onNewReport: () => void;
}

export function DataQualityReportView({ report, onSelectPerson, onNewReport }: DataQualityReportViewProps) {
  const dateStats = report.dateQualityStats;
  const placeStats = report.placeQualityStats;
  const totalDates = dateStats.valid + dateStats.approximate + dateStats.missing;
  const totalPlaces = placeStats.normalized + placeStats.raw_only + placeStats.missing;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-brand)] text-2xl text-gold">
            Data Quality Dashboard
          </h2>
          <div className="flex gap-4 mt-1 text-xs text-text-dim">
            <span>{report.generatedAt.toLocaleDateString()}</span>
            <span>{report.candidates.length} persons analyzed</span>
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

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QualityStatCard
          label="Date Quality"
          good={dateStats.valid}
          total={totalDates}
          badLabel={`${dateStats.missing} missing, ${dateStats.impossible} impossible`}
        />
        <QualityStatCard
          label="Place Quality"
          good={placeStats.normalized}
          total={totalPlaces}
          badLabel={`${placeStats.missing} missing`}
        />
        <div className="border border-border rounded-lg p-3 bg-surface text-center">
          <div className="text-lg font-mono text-text-primary">
            {Math.round(report.aggregateStats.sourceCoverage)}%
          </div>
          <div className="text-xs text-text-dim">Source Coverage</div>
        </div>
        <div className="border border-border rounded-lg p-3 bg-surface text-center">
          <div className="text-lg font-mono text-text-primary">
            {Math.round(report.aggregateStats.averagePersonIdentity * 100)}%
          </div>
          <div className="text-xs text-text-dim">Avg Quality Score</div>
        </div>
      </div>

      {/* Branch coverage */}
      {report.branchCoverage.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-[family-name:var(--font-heading)] text-lg text-text-primary">
            Branch Coverage
          </h3>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-alt text-text-secondary">
                  <th className="text-left px-3 py-2">Branch</th>
                  <th className="text-right px-3 py-2">Persons</th>
                  <th className="text-right px-3 py-2">Sourced</th>
                  <th className="text-right px-3 py-2">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {report.branchCoverage.map(b => (
                  <tr key={b.ancestorId} className="border-t border-border">
                    <td className="px-3 py-2 text-text-primary">{b.branchLabel}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-dim">{b.totalPersons}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-dim">{b.withSources}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span className={b.coveragePercent >= 50 ? 'text-tier1' : b.coveragePercent >= 20 ? 'text-tier3' : 'text-tier4'}>
                        {Math.round(b.coveragePercent)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Issue list */}
      <div className="space-y-2">
        <h3 className="font-[family-name:var(--font-heading)] text-lg text-text-primary">
          Issues by Person
        </h3>
        <div className="space-y-2">
          {report.candidates
            .filter(c => c.issues.length > 0)
            .slice(0, 50)
            .map(c => (
              <div key={c.personId} className="border border-border rounded-lg p-3 bg-surface">
                <div className="flex items-center justify-between mb-1">
                  <button
                    type="button"
                    onClick={() => onSelectPerson(c.personId)}
                    className="text-sm font-[family-name:var(--font-heading)] text-gold hover:text-gold-light transition-colors"
                  >
                    {c.person.name.full}
                  </button>
                  <span className="text-xs font-mono text-text-dim">
                    Quality: {Math.round(c.qualityScore * 100)}%
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.issues.map((issue, i) => (
                    <span
                      key={i}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        issue.severity === 'critical' ? 'bg-tier4-bg text-tier4' :
                        issue.severity === 'warning' ? 'bg-tier3-bg text-tier3' :
                        'bg-surface-alt text-text-dim'
                      }`}
                      title={issue.suggestedFix}
                    >
                      {issue.type.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            ))}
        </div>
        {report.candidates.filter(c => c.issues.length > 0).length > 50 && (
          <p className="text-xs text-text-dim text-center">
            Showing top 50 of {report.candidates.filter(c => c.issues.length > 0).length} persons with issues
          </p>
        )}
      </div>
    </div>
  );
}

function QualityStatCard({ label, good, total, badLabel }: { label: string; good: number; total: number; badLabel: string }) {
  const percent = total > 0 ? Math.round((good / total) * 100) : 0;
  return (
    <div className="border border-border rounded-lg p-3 bg-surface text-center">
      <div className="text-lg font-mono text-text-primary">{percent}%</div>
      <div className="text-xs text-text-dim">{label}</div>
      <div className="text-xs text-text-dim mt-0.5">{badLabel}</div>
    </div>
  );
}
