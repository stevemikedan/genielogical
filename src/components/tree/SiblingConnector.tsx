import { memo } from 'react';
import type { SiblingConnector as SiblingConnectorType } from './pedigree-grid-layout.ts';
import { TIER_COLORS, TIER_DASH } from '@/types/tier-labels.ts';

interface SiblingConnectorProps {
  connector: SiblingConnectorType;
}

export const SiblingConnector = memo(function SiblingConnector({
  connector,
}: SiblingConnectorProps) {
  const { siblingNode, trunkX, tier } = connector;

  const color = TIER_COLORS[tier];
  const dash = TIER_DASH[tier] ?? '3 3';

  // Horizontal spur from sibling's left edge to the parent-child trunk
  const siblingLeftX = siblingNode.x;
  const siblingY = siblingNode.y;

  const d = `M ${siblingLeftX},${siblingY} H ${trunkX}`;

  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeDasharray={dash}
      strokeOpacity={0.6}
    />
  );
});
