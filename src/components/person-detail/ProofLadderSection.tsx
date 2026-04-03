import { useState } from 'react';
import type { ProofLadder } from '@/graph/proof-ladder.ts';
import { generateSafeToShareText } from '@/graph/safe-to-share.ts';
import { ConfidenceBadge } from './ConfidenceBadge.tsx';

interface ProofLadderSectionProps {
  proofLadder: ProofLadder | null;
  onNavigate: (personId: string) => void;
}

export function ProofLadderSection({ proofLadder, onNavigate }: ProofLadderSectionProps) {
  const [copied, setCopied] = useState(false);

  if (!proofLadder || proofLadder.links.length <= 1) return null;

  const handleCopySafeToShare = () => {
    const subjectName = proofLadder.links[proofLadder.links.length - 1].personName;
    const rootName = proofLadder.links[0].personName;
    const linkCount = proofLadder.links.length;
    const text = generateSafeToShareText(
      subjectName,
      rootName,
      linkCount,
      proofLadder.weakestTier,
      proofLadder.bridgeZones,
    );
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section>
      <h3 className="text-sm font-medium text-text-secondary mb-2 uppercase tracking-wide">
        Proof Chain
      </h3>
      <div className="space-y-0">
        {proofLadder.links.map((link, i) => {
          const isWeakest = link.personId === proofLadder.weakestPersonId;
          return (
            <div key={link.personId} className="flex items-start gap-2">
              {/* Vertical connector */}
              <div className="flex flex-col items-center w-4 flex-shrink-0">
                {i > 0 && <div className="w-px h-2 bg-border" />}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  isWeakest ? 'bg-tier4' : 'bg-border'
                }`} />
                {i < proofLadder.links.length - 1 && <div className="w-px h-full min-h-[12px] bg-border" />}
              </div>

              <div className={`py-0.5 ${isWeakest ? 'text-tier4' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onNavigate(link.personId)}
                    className="text-sm text-gold hover:text-gold-light transition-colors font-[family-name:var(--font-heading)] text-left"
                  >
                    {link.personName}
                  </button>
                  {link.edgeTier !== null && (
                    <ConfidenceBadge tier={link.edgeTier} />
                  )}
                </div>
                {link.sharedWithPaths.length > 0 && (
                  <div className="text-[10px] text-text-dim ml-0.5 mt-0.5">
                    also on path to: {link.sharedWithPaths.slice(0, 3).join(', ')}
                    {link.sharedWithPaths.length > 3 && ` +${link.sharedWithPaths.length - 3} more`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-2 text-xs text-text-secondary border-t border-border pt-2">
        Chain confidence: <ConfidenceBadge tier={proofLadder.weakestTier} />
        {proofLadder.weakestPersonId && (
          <span className="ml-1">(weakest link at{' '}
            <button
              type="button"
              onClick={() => onNavigate(proofLadder.weakestPersonId!)}
              className="text-gold hover:text-gold-light"
            >
              {proofLadder.links.find(l => l.personId === proofLadder.weakestPersonId)?.personName}
            </button>)
          </span>
        )}
      </div>

      {/* Bridge zones */}
      {proofLadder.bridgeZones.length > 0 && (
        <div className="mt-2 space-y-1">
          {proofLadder.bridgeZones.map((zone, i) => (
            <div
              key={i}
              className="text-xs px-2 py-1 bg-tier3-bg border border-tier3 rounded text-tier3"
            >
              <span className="font-medium">Bridge zone:</span> {zone.description} ({zone.edgeCount} unsourced links)
            </div>
          ))}
        </div>
      )}

      {/* Copy safe-to-share text */}
      <div className="mt-2">
        <button
          type="button"
          onClick={handleCopySafeToShare}
          className="text-xs px-2 py-1 bg-surface-raised border border-border rounded text-text-secondary hover:text-text-primary hover:border-gold transition-colors"
        >
          {copied ? 'Copied!' : 'Copy safe-to-share text'}
        </button>
      </div>
    </section>
  );
}
