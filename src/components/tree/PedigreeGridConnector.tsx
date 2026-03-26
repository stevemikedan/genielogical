import { memo } from 'react';
import type { PedigreeGridConnector as PedigreeGridConnectorType } from './pedigree-grid-layout.ts';
import { TIER_COLORS, TIER_DASH } from '@/types/tier-labels.ts';

interface PedigreeGridConnectorProps {
  connector: PedigreeGridConnectorType;
  nodeWidth: number;
  nodeHeight: number;
}

export const PedigreeGridConnector = memo(function PedigreeGridConnector({
  connector,
  nodeWidth,
  nodeHeight: _nodeHeight,
}: PedigreeGridConnectorProps) {
  const { fromNode, toNode, tier, hasParallelPaths } = connector;

  const color = TIER_COLORS[tier];
  const dash = TIER_DASH[tier];

  // Grid goes left (root, gen 0) to right (ancestors, deeper generations).
  // fromNode = parent (deeper generation, farther right)
  // toNode = child (closer to root, farther left)
  //
  // Start from child's RIGHT edge, end at parent's LEFT edge.
  const childRightX = toNode.x + nodeWidth;
  const childY = toNode.y;
  const parentLeftX = fromNode.x;
  const parentY = fromNode.y;

  // Midpoint between child right edge and parent left edge
  const midX = (childRightX + parentLeftX) / 2;

  // Right-angle step path: horizontal from child, vertical to parent's y, horizontal to parent
  const d = `M ${childRightX},${childY} H ${midX} V ${parentY} H ${parentLeftX}`;

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dash}
      />
      {/* Wider invisible path for hover area */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={10}
      />
      {/* Parallel paths fork icon at midpoint */}
      {hasParallelPaths && (
        <text
          x={midX}
          y={(childY + parentY) / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fill="#c9a55a"
        >
          {'\u2042'}
        </text>
      )}
    </g>
  );
});
