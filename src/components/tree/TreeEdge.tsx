import { memo } from 'react';
import type { ConfidenceTier } from '@/types/common.ts';
import { TIER_COLORS, TIER_DASH } from '@/types/tier-labels.ts';
import type { TreeOrientation } from './TreeControls.tsx';

interface TreeEdgeProps {
  sourcePoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
  confidenceTier: ConfidenceTier;
  hasParallelPaths: boolean;
  orientation?: TreeOrientation;
  isOnHighlightPath?: boolean;
  isHighlightActive?: boolean;
  onMouseEnter?: (event: React.MouseEvent) => void;
  onMouseLeave?: () => void;
}

/** Convert D3 hierarchy coordinates to SVG x,y based on orientation */
function toSvg(pt: { x: number; y: number }, orientation: TreeOrientation): { sx: number; sy: number } {
  switch (orientation) {
    case 'horizontal':
      return { sx: pt.y, sy: pt.x };
    case 'vertical-down':
      return { sx: pt.x, sy: pt.y };
    case 'vertical-up':
      return { sx: pt.x, sy: -pt.y };
  }
}

export const TreeEdge = memo(function TreeEdge({
  sourcePoint,
  targetPoint,
  confidenceTier,
  hasParallelPaths,
  orientation = 'horizontal',
  isOnHighlightPath = false,
  isHighlightActive = false,
  onMouseEnter,
  onMouseLeave,
}: TreeEdgeProps) {
  const color = TIER_COLORS[confidenceTier];
  const dash = TIER_DASH[confidenceTier];

  const src = toSvg(sourcePoint, orientation);
  const tgt = toSvg(targetPoint, orientation);

  let d: string;
  if (orientation === 'horizontal') {
    // Horizontal bezier: curves along x-axis
    const midX = (src.sx + tgt.sx) / 2;
    d = `M ${src.sx},${src.sy} C ${midX},${src.sy} ${midX},${tgt.sy} ${tgt.sx},${tgt.sy}`;
  } else {
    // Vertical bezier: curves along y-axis
    const midY = (src.sy + tgt.sy) / 2;
    d = `M ${src.sx},${src.sy} C ${src.sx},${midY} ${tgt.sx},${midY} ${tgt.sx},${tgt.sy}`;
  }

  const forkX = (src.sx + tgt.sx) / 2;
  const forkY = (src.sy + tgt.sy) / 2;

  // Highlight state
  let strokeWidth = 2;
  let edgeOpacity = 1;
  if (isHighlightActive) {
    if (isOnHighlightPath) {
      strokeWidth = 3;
    } else {
      edgeOpacity = 0.15;
    }
  }

  return (
    <g style={{ opacity: edgeOpacity }}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{ cursor: 'pointer' }}
      />
      {/* Wider invisible path for easier hover */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{ cursor: 'pointer' }}
      />
      {hasParallelPaths && (
        <text
          x={forkX}
          y={forkY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={14}
          fill="#c9a84c"
        >
          {'\u2442'}
        </text>
      )}
    </g>
  );
});
