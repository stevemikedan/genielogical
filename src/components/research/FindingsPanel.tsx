import type { ValidationReport, FoundRecord, DiscoveredSourceImport } from '@/types/ai.ts';
import { TIER_BG_CLASSES, getTierLabel } from '@/types/tier-labels.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import { foundRecordToImport } from '@/ai/source-importer.ts';

interface FindingsPanelProps {
  report: ValidationReport;
  personId: string;
  onImportSource?: (source: DiscoveredSourceImport, personIds: string[]) => void;
}

const RECORD_TYPE_LABELS: Record<string, string> = {
  census: 'Census',
  vital: 'Vital Record',
  church: 'Church',
  military: 'Military',
  land: 'Land',
  probate: 'Probate',
  published_genealogy: 'Published',
  peerage: 'Peerage',
  other: 'Other',
};

export function FindingsPanel({ report, personId, onImportSource }: FindingsPanelProps) {
  return (
    <div className="space-y-3">
      {/* Assessment */}
      <div className="rounded border border-border bg-bg p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TIER_BG_CLASSES[report.suggestedTier as ConfidenceTier]}`}>
            {getTierLabel(report.suggestedTier)}
          </span>
          <span className={`text-xs ${plausibilityColor(report.personAssessment.plausibility)}`}>
            {report.personAssessment.plausibility}
          </span>
        </div>
        <p className="text-sm text-text-secondary">{report.personAssessment.summary}</p>
      </div>

      {/* Parental link */}
      {report.parentalLink && (
        <div className="rounded border border-border bg-bg p-3">
          <p className="text-xs text-text-dim mb-1">Parental connection</p>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium ${plausibilityColor(report.parentalLink.status)}`}>
              {report.parentalLink.status}
            </span>
          </div>
          <p className="text-sm text-text-secondary">{report.parentalLink.summary}</p>
        </div>
      )}

      {/* Records found */}
      {report.recordsFound.length > 0 && (
        <div>
          <p className="text-xs text-text-dim mb-1">Records found ({report.recordsFound.length})</p>
          <div className="space-y-1">
            {report.recordsFound.map((record, i) => (
              <RecordCard
                key={i}
                record={record}
                onImport={onImportSource ? () => {
                  onImportSource(foundRecordToImport(record), [personId]);
                } : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Missing records */}
      {report.recordsExpectedButNotFound.length > 0 && (
        <div>
          <p className="text-xs text-text-dim mb-1">Expected but not found ({report.recordsExpectedButNotFound.length})</p>
          <ul className="space-y-1">
            {report.recordsExpectedButNotFound.map((r, i) => (
              <li key={i} className="text-xs text-text-secondary pl-2 border-l-2 border-tier3/30">
                <span className="font-medium">{r.type}:</span> {r.description}
                <span className="text-text-dim block">{r.significance}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Date discrepancies */}
      {report.dateDiscrepancies.length > 0 && (
        <div>
          <p className="text-xs text-text-dim mb-1">Date discrepancies</p>
          <ul className="space-y-1">
            {report.dateDiscrepancies.map((d, i) => (
              <li key={i} className="text-xs text-text-secondary pl-2 border-l-2 border-tier4/30">
                GEDCOM: <span className="font-mono">{d.gedcomClaim}</span>
                {' '}vs evidence: <span className="font-mono">{d.evidenceSays}</span>
                <span className="text-text-dim block">Source: {d.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next step */}
      {report.nextStep && (
        <div className="rounded border border-gold/20 bg-gold/5 p-3">
          <p className="text-xs text-gold mb-1">Recommended next step</p>
          <p className="text-sm text-text-primary">{report.nextStep.action}</p>
          <p className="text-xs text-text-dim mt-1">
            {report.nextStep.repository} — {report.nextStep.expectedCost}
          </p>
          {report.nextStep.impactIfFound && (
            <p className="text-xs text-text-secondary mt-0.5">
              Impact: {report.nextStep.impactIfFound}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RecordCard({ record, onImport }: { record: FoundRecord; onImport?: () => void }) {
  return (
    <div className="rounded border border-border bg-surface p-2 text-xs">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="px-1 py-0.5 rounded bg-bg text-text-dim">
            {RECORD_TYPE_LABELS[record.type] ?? record.type}
          </span>
          <span className={`px-1 py-0.5 rounded ${
            record.sourceClass === 'primary' ? 'bg-tier1-bg text-tier1'
              : record.sourceClass === 'secondary' ? 'bg-tier2-bg text-tier2'
                : 'bg-tier3-bg text-tier3'
          }`}>
            {record.sourceClass}
          </span>
        </div>
        {onImport && (
          <button
            type="button"
            onClick={onImport}
            className="text-gold hover:text-gold-light transition-colors"
          >
            Import
          </button>
        )}
      </div>
      <p className="text-text-primary font-medium">{record.title}</p>
      <p className="text-text-dim">{record.repository}</p>
      {record.url && (
        <a href={record.url} target="_blank" rel="noopener noreferrer"
           className="text-gold hover:text-gold-light">
          View record
        </a>
      )}
      {record.confirms.length > 0 && (
        <p className="text-tier1 mt-1">Confirms: {record.confirms.join(', ')}</p>
      )}
      {record.contradicts.length > 0 && (
        <p className="text-tier4 mt-0.5">Contradicts: {record.contradicts.join(', ')}</p>
      )}
    </div>
  );
}

function plausibilityColor(p: string): string {
  switch (p) {
    case 'confirmed': return 'text-tier1';
    case 'plausible': return 'text-tier2';
    case 'questionable': return 'text-tier3';
    case 'implausible':
    case 'contradicted': return 'text-tier4';
    default: return 'text-text-dim';
  }
}
