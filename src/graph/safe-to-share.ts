import type { ConfidenceTier } from '@/types/common.ts';

export interface BridgeZoneInfo {
  edgeCount: number;
  description: string;
}

/**
 * Generate a safe-to-share text summary describing the confidence of a
 * genealogical connection between a subject and an ancestor.
 */
export function generateSafeToShareText(
  _subjectName: string,
  targetName: string,
  linkCount: number,
  weakestTier: ConfidenceTier,
  bridgeZones: BridgeZoneInfo[],
): string {
  const hasBridgeZones = bridgeZones.length > 0;

  // Tier 4 or bridge zones present — describe weakness
  if (weakestTier >= 4 || hasBridgeZones) {
    let weakness: string;
    if (hasBridgeZones) {
      const totalUnsourced = bridgeZones.reduce((sum, z) => sum + z.edgeCount, 0);
      weakness = `there are ${totalUnsourced} consecutive unsourced links in the chain`;
    } else {
      weakness = 'some connections have chronological or structural concerns';
    }
    return `My tree appears to connect to ${targetName}, but ${weakness}. Further research is needed to confirm this connection.`;
  }

  // Tier 3 — mostly documented but needs verification
  if (weakestTier === 3) {
    return `My tree connects to ${targetName} through ${linkCount} generations. Most links are documented; some links await primary source verification.`;
  }

  // Tier 1-2 — documented chain
  return `I descend from ${targetName} through a documented chain of ${linkCount} generations.`;
}
