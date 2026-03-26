import type { ConfidenceTier } from '@/types/common.ts';
import { TIER_BG_CLASSES, getTierLabel } from '@/types/tier-labels.ts';

interface ConfidenceBadgeProps {
  tier: ConfidenceTier;
  reason?: string;
  size?: 'sm' | 'md';
}

export function ConfidenceBadge({ tier, reason, size = 'sm' }: ConfidenceBadgeProps) {
  const label = getTierLabel(tier, reason);
  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';

  return (
    <span className={`inline-flex items-center gap-1 rounded font-sans font-medium ${TIER_BG_CLASSES[tier]} ${sizeClasses}`}>
      {label}
    </span>
  );
}
