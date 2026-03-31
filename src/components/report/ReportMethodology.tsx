import { useState } from 'react';
import type { ReportMethodology as ReportMethodologyType } from '@/types/report.ts';

interface ReportMethodologyProps {
  methodology: ReportMethodologyType;
}

export function ReportMethodology({ methodology }: ReportMethodologyProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 flex items-center justify-between text-sm text-text-secondary hover:bg-surface transition-colors"
      >
        <span>Methodology</span>
        <span className="text-xs">{isOpen ? '▼' : '▶'}</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-3 text-sm text-text-secondary border-t border-border">
          <p className="mt-3">{methodology.description}</p>

          <div>
            <h4 className="text-text-primary font-medium mb-1">Person Identity Factors</h4>
            <ul className="list-disc list-inside space-y-0.5">
              {methodology.personIdentityFactors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-text-primary font-medium mb-1">Chain Confidence</h4>
            <p>{methodology.chainExplanation}</p>
          </div>

          <div>
            <h4 className="text-text-primary font-medium mb-1">Tier Definitions</h4>
            <ul className="space-y-0.5">
              {methodology.tierDefinitions.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
