import { useState } from 'react';
import type { ReportCandidate } from '@/types/report.ts';
import { TIER_CSS_CLASSES, TIER_BG_CLASSES, getTierLabel } from '@/types/tier-labels.ts';
import { ConfidenceBar } from './ConfidenceBar.tsx';

interface ReportCandidateCardProps {
  candidate: ReportCandidate;
  onSelectPerson: (personId: string) => void;
}

export function ReportCandidateCard({ candidate, onSelectPerson }: ReportCandidateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const person = candidate.person;
  const birthYear = person.birth.date?.year;
  const deathYear = person.death.date?.year;
  const dates = birthYear || deathYear
    ? `${birthYear ?? '?'}–${deathYear ?? '?'}`
    : '';
  const ancestralPercent = Math.round(candidate.ancestralConfidence * 100);

  return (
    <div className="border border-border rounded-lg bg-surface p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <button
            type="button"
            onClick={() => onSelectPerson(candidate.personId)}
            className="font-[family-name:var(--font-heading)] text-gold hover:text-gold-light transition-colors text-left"
          >
            {person.name.full}
          </button>
          {dates && (
            <span className="ml-2 text-sm text-text-dim font-mono">{dates}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-lg font-bold font-mono ${TIER_CSS_CLASSES[candidate.personTier]}`}>
            {ancestralPercent}%
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${TIER_BG_CLASSES[candidate.personTier]}`}>
            {getTierLabel(candidate.personTier)}
          </span>
        </div>
      </div>

      {/* Category badges */}
      <div className="flex flex-wrap gap-1.5">
        {candidate.categories.map(cat => (
          <span key={cat} className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/20">
            {cat.replace(/_/g, ' ')}
          </span>
        ))}
        <span className="text-xs px-2 py-0.5 rounded-full bg-surface-alt text-text-dim">
          Gen {candidate.generationsFromRoot}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-surface-alt text-text-dim">
          {candidate.section === 'direct_line' ? 'Direct line' : 'Historical'}
        </span>
      </div>

      {/* Confidence bars */}
      <div className="space-y-1.5">
        <ConfidenceBar score={candidate.personIdentityScore} label="Identity" />
        <ConfidenceBar score={candidate.chainConfidence} label="Chain" />
      </div>

      {/* Match reasons */}
      <div className="text-xs text-text-secondary">
        {candidate.matchReasons.join(' · ')}
      </div>

      {/* Bridge zone warning */}
      {candidate.bridgeZones.length > 0 && (
        <div className="text-xs text-tier4 bg-tier4-bg/20 px-2 py-1 rounded">
          ⚠ {candidate.bridgeZones.length} bridge zone{candidate.bridgeZones.length > 1 ? 's' : ''} in chain
        </div>
      )}

      {/* AI Narrative (expandable) */}
      {candidate.aiNarrative && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gold hover:text-gold-light transition-colors"
          >
            {expanded ? '▼ Hide narrative' : '▶ AI narrative'}
          </button>
          {expanded && (
            <p className="mt-1 text-sm text-text-secondary italic">
              {candidate.aiNarrative}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
