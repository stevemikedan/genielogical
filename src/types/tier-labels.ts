import type { ConfidenceTier } from './common.ts';

export const TIER_LABELS: Record<ConfidenceTier, string> = {
  1: 'Documented',
  2: 'Supported',
  3: 'Provisional',
  4: 'Unverified',
};

export const TIER_COLORS: Record<ConfidenceTier, string> = {
  1: '#34d399',
  2: '#60a5fa',
  3: '#fbbf24',
  4: '#f87171',
};

export const TIER_DASH: Record<ConfidenceTier, string | undefined> = {
  1: undefined,
  2: undefined,
  3: '8 4',
  4: '3 3',
};

export const TIER_CSS_CLASSES: Record<ConfidenceTier, string> = {
  1: 'text-tier1-text bg-tier1-bg border-tier1-border',
  2: 'text-tier2-text bg-tier2-bg border-tier2-border',
  3: 'text-tier3-text bg-tier3-bg border-tier3-border',
  4: 'text-tier4-text bg-tier4-bg border-tier4-border',
};

export const TIER_BG_CLASSES: Record<ConfidenceTier, string> = {
  1: 'bg-tier1 text-bg',
  2: 'bg-tier2 text-bg',
  3: 'bg-tier3 text-bg',
  4: 'bg-tier4 text-bg',
};

/**
 * Tier 4 has contextual labels:
 * - "Speculative" when caused by chronological impossibility or structural problems
 * - "Unverified" when caused by being unsourced + flagged
 */
export function getTier4Label(reason: string): 'Unverified' | 'Speculative' {
  if (
    reason.includes('Chronological impossibility') ||
    reason.includes('chronological impossibility')
  ) {
    return 'Speculative';
  }
  return 'Unverified';
}

/**
 * Get the display label for a confidence tier.
 * For tier 4, optionally pass a reason to get contextual label.
 */
export function getTierLabel(tier: ConfidenceTier, reason?: string): string {
  if (tier === 4 && reason) {
    return getTier4Label(reason);
  }
  return TIER_LABELS[tier];
}
