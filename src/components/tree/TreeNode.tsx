import { memo } from 'react';
import type { HierarchyPointNode } from 'd3-hierarchy';
import type { TreeHierarchyNode } from './tree-data-adapter.ts';
import type { TreeOrientation } from './TreeControls.tsx';
import { TIER_COLORS } from '@/types/tier-labels.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import { formatDisplayName } from '@/utils/name-display.ts';

export type DetailLevel = 'full' | 'abbreviated' | 'dot';

interface TreeNodeProps {
  node: HierarchyPointNode<TreeHierarchyNode>;
  isSelected: boolean;
  onClick: (personId: string) => void;
  nodeWidth?: number;
  nodeHeight?: number;
  fontSize?: number;
  detailLevel?: DetailLevel;
  isOnHighlightPath?: boolean;
  isHighlightActive?: boolean;
  onExpand?: (personId: string) => void;
  orientation?: TreeOrientation;
}

const STATUS_SYMBOLS: Record<string, { symbol: string; color: string }> = {
  tentative: { symbol: '\u25CB', color: '#9ca3af' },       // ○
  under_review: { symbol: '\u25D0', color: '#fbbf24' },    // ◐
  validated: { symbol: '\u25CF', color: '#34d399' },        // ●
  disputed: { symbol: '\u26A0', color: '#f87171' },         // ⚠
  rejected: { symbol: '\u2715', color: '#4b5563' },         // ✕
};

/** Subtle background tint per tier (very dark, just enough to be visible) */
const TIER_BG_TINTS: Record<ConfidenceTier, string> = {
  1: 'rgba(52,211,153,0.07)',
  2: 'rgba(96,165,250,0.07)',
  3: 'rgba(251,191,36,0.06)',
  4: 'rgba(248,113,113,0.07)',
};

const TIER_SHORT_LABELS: Record<ConfidenceTier, string> = {
  1: 'Doc',
  2: 'Sup',
  3: 'Prov',
  4: 'Unv',
};

function formatYears(person: TreeHierarchyNode['person']): string {
  const birth = person.birth.date?.year;
  const death = person.death.date?.year;
  if (birth && death) return `${birth}\u2013${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return '';
}

function truncateName(name: string, maxLen: number = 24): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + '\u2026';
}

/** Convert D3 hierarchy coordinates to SVG x,y based on orientation */
function toSvg(node: { x: number; y: number }, orientation: TreeOrientation): { sx: number; sy: number } {
  switch (orientation) {
    case 'horizontal':
      return { sx: node.y, sy: node.x };
    case 'vertical-down':
      return { sx: node.x, sy: node.y };
    case 'vertical-up':
      return { sx: node.x, sy: -node.y };
  }
}

export const TreeNode = memo(function TreeNode({
  node,
  isSelected,
  onClick,
  nodeWidth = 200,
  nodeHeight = 60,
  fontSize = 13,
  detailLevel = 'full',
  isOnHighlightPath = false,
  isHighlightActive = false,
  onExpand,
  orientation = 'horizontal',
}: TreeNodeProps) {
  const { person, hasFlags, isExpandable, expandableDepth } = node.data;
  const status = STATUS_SYMBOLS[person.status] ?? STATUS_SYMBOLS.tentative;
  const isRejected = person.status === 'rejected';
  const years = formatYears(person);
  const tier = person.confidenceTier as ConfidenceTier;
  const tierColor = TIER_COLORS[tier] ?? '#9a8872';
  const tierBg = TIER_BG_TINTS[tier] ?? 'transparent';

  // Compute opacity based on highlight state
  let opacity = isRejected ? 0.4 : 1;
  if (isHighlightActive && !isOnHighlightPath) {
    opacity = 0.2;
  }

  const { sx, sy } = toSvg(node, orientation);
  const accentWidth = 4;

  // Expand button label: "+" for 1, "N+" for >1
  const expandLabel = expandableDepth <= 1 ? '+' : `${expandableDepth}+`;

  // Dot mode — tier-colored rectangle
  if (detailLevel === 'dot') {
    return (
      <g
        transform={`translate(${sx - 6},${sy - 6})`}
        onClick={() => onClick(person.id)}
        style={{ cursor: 'pointer', opacity }}
      >
        <rect
          width={12}
          height={12}
          rx={2}
          ry={2}
          fill={tierColor}
          stroke={isSelected ? '#c9a84c' : 'none'}
          strokeWidth={isSelected ? 2 : 0}
        />
      </g>
    );
  }

  // Abbreviated mode — name + status + tier accent
  if (detailLevel === 'abbreviated') {
    const abbrW = Math.max(nodeWidth * 0.6, 120);
    const abbrH = 32;
    return (
      <g
        transform={`translate(${sx - abbrW / 2},${sy - abbrH / 2})`}
        onClick={() => onClick(person.id)}
        style={{ cursor: 'pointer', opacity }}
      >
        {/* Background with tier tint */}
        <rect
          width={abbrW}
          height={abbrH}
          rx={4}
          ry={4}
          fill={tierBg}
          stroke={isSelected ? '#c9a84c' : '#2a2520'}
          strokeWidth={isSelected ? 2 : 1}
        />
        {/* Tier accent left border */}
        <rect x={0} y={2} width={3} height={abbrH - 4} rx={1.5} fill={tierColor} />
        <text
          x={12}
          y={abbrH / 2 + 1}
          fontSize={10}
          fill={status.color}
          dominantBaseline="central"
        >
          {status.symbol}
        </text>
        <text
          x={abbrW / 2 + 6}
          y={abbrH / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#e8e0d0"
          fontSize={11}
          fontFamily="'EB Garamond', Georgia, serif"
        >
          {truncateName(formatDisplayName(person.name), 18)}
        </text>
      </g>
    );
  }

  // Full detail mode
  const borderColor = isSelected ? '#c9a84c' : '#2a2520';

  return (
    <g
      transform={`translate(${sx - nodeWidth / 2},${sy - nodeHeight / 2})`}
      onClick={() => onClick(person.id)}
      style={{ cursor: 'pointer', opacity }}
    >
      {/* Background rect with subtle tier tint */}
      <rect
        width={nodeWidth}
        height={nodeHeight}
        rx={6}
        ry={6}
        fill={tierBg}
        stroke={borderColor}
        strokeWidth={isSelected ? 2 : 1}
      />

      {/* Tier-colored left accent bar */}
      <rect
        x={1}
        y={4}
        width={accentWidth}
        height={nodeHeight - 8}
        rx={2}
        fill={tierColor}
      />

      {/* Status badge (top-left, after accent) */}
      <text
        x={accentWidth + 8}
        y={16}
        fontSize={Math.round(fontSize * 0.92)}
        fill={status.color}
      >
        {status.symbol}
      </text>

      {/* Tier badge dot + label (top-right) */}
      <circle
        cx={nodeWidth - 28}
        cy={13}
        r={4}
        fill={tierColor}
      />
      <text
        x={nodeWidth - 20}
        y={16}
        fontSize={9}
        fill={tierColor}
        fontFamily="'Source Sans 3', sans-serif"
      >
        {TIER_SHORT_LABELS[tier]}
      </text>

      {/* Flag warning (below tier badge, top-right) */}
      {hasFlags && (
        <text
          x={nodeWidth - 12}
          y={nodeHeight - 8}
          fontSize={Math.round(fontSize * 0.85)}
          fill="#fbbf24"
          textAnchor="middle"
        >
          {'\u26A0'}
        </text>
      )}

      {/* Expand button (bottom-right, if expandable) — green with depth indicator */}
      {isExpandable && onExpand && (
        <g
          onClick={(e) => {
            e.stopPropagation();
            onExpand(person.id);
          }}
          style={{ cursor: 'pointer' }}
        >
          <rect
            x={nodeWidth - 28}
            y={nodeHeight - 22}
            width={24}
            height={20}
            rx={4}
            fill="#1a2520"
            stroke="#34d399"
            strokeWidth={1}
          />
          <text
            x={nodeWidth - 16}
            y={nodeHeight - 10}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={600}
            fill="#34d399"
          >
            {expandLabel}
          </text>
        </g>
      )}

      {/* Person name */}
      <text
        x={nodeWidth / 2}
        y={nodeHeight * 0.44}
        textAnchor="middle"
        fill="#e8e0d0"
        fontSize={fontSize}
        fontFamily="'EB Garamond', Georgia, serif"
        fontWeight={isOnHighlightPath && isHighlightActive ? 600 : 400}
      >
        {truncateName(formatDisplayName(person.name), Math.floor(nodeWidth / (fontSize * 0.55)))}
      </text>

      {/* Years */}
      {years && (
        <text
          x={nodeWidth / 2}
          y={nodeHeight * 0.72}
          textAnchor="middle"
          fill="#9a8872"
          fontSize={Math.round(fontSize * 0.85)}
          fontFamily="'JetBrains Mono', monospace"
        >
          {years}
        </text>
      )}
    </g>
  );
});
