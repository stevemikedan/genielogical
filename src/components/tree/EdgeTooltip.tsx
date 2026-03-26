import type { ConfidenceTier } from '@/types/common.ts';
import { TIER_CSS_CLASSES, getTierLabel } from '@/types/tier-labels.ts';

interface EdgeTooltipProps {
  x: number;
  y: number;
  confidenceTier: ConfidenceTier;
  confidenceReason?: string;
  relationshipType: string;
  sourceCount: number;
  visible: boolean;
}

export function EdgeTooltip({ x, y, confidenceTier, confidenceReason, relationshipType, sourceCount, visible }: EdgeTooltipProps) {
  if (!visible) return null;

  const label = getTierLabel(confidenceTier, confidenceReason);

  return (
    <div
      className="absolute z-50 pointer-events-none bg-surface border border-border rounded-lg p-3 shadow-lg"
      style={{ left: x, top: y, transform: 'translate(-50%, -100%) translateY(-8px)' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${TIER_CSS_CLASSES[confidenceTier]}`}>
          {label}
        </span>
      </div>
      <div className="text-text-secondary text-xs">
        <span className="capitalize">{relationshipType}</span>
        <span className="mx-1">&middot;</span>
        <span>{sourceCount} source{sourceCount !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
