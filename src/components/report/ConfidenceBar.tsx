import type { ConfidenceTier } from '@/types/common.ts';
import { TIER_CSS_CLASSES } from '@/types/tier-labels.ts';

interface ConfidenceBarProps {
  score: number; // 0-1
  tier?: ConfidenceTier;
  label?: string;
  showValue?: boolean;
}

const TIER_BAR_COLORS: Record<ConfidenceTier, string> = {
  1: 'bg-tier1',
  2: 'bg-tier2',
  3: 'bg-tier3',
  4: 'bg-tier4',
};

function scoreTier(score: number): ConfidenceTier {
  if (score >= 0.75) return 1;
  if (score >= 0.50) return 2;
  if (score >= 0.25) return 3;
  return 4;
}

export function ConfidenceBar({ score, tier, label, showValue = true }: ConfidenceBarProps) {
  const displayTier = tier ?? scoreTier(score);
  const percent = Math.round(Math.min(1, Math.max(0, score)) * 100);
  const barColor = TIER_BAR_COLORS[displayTier];

  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-xs text-text-secondary w-20 shrink-0">{label}</span>
      )}
      <div className="flex-1 h-2 bg-surface-alt rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showValue && (
        <span className={`text-xs font-mono w-12 text-right ${TIER_CSS_CLASSES[displayTier]}`}>
          {percent}%
        </span>
      )}
    </div>
  );
}
