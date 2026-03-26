import { memo } from 'react';
import type { PedigreeGridNode as PedigreeGridNodeType } from './pedigree-grid-layout.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import { TIER_COLORS } from '@/types/tier-labels.ts';

interface PedigreeGridNodeProps {
  node: PedigreeGridNodeType;
  nodeWidth: number;
  nodeHeight: number;
  isSelected: boolean;
  onClick: (personId: string) => void;
  onExpand?: (personId: string) => void;
  onExpandAll?: (personId: string) => void;
}

const STATUS_SYMBOLS: Record<string, { symbol: string; color: string }> = {
  tentative: { symbol: '\u25CB', color: '#9ca3af' },       // circle outline
  under_review: { symbol: '\u25D0', color: '#fbbf24' },    // half circle
  validated: { symbol: '\u25CF', color: '#34d399' },        // filled circle
  disputed: { symbol: '\u26A0', color: '#f87171' },         // warning
  rejected: { symbol: '\u2715', color: '#4b5563' },         // x mark
};

function formatYears(
  birthYear: number | null | undefined,
  deathYear: number | null | undefined,
): string {
  if (birthYear && deathYear) return `${birthYear}\u2013${deathYear}`;
  if (birthYear) return `b. ${birthYear}`;
  if (deathYear) return `d. ${deathYear}`;
  return '';
}

function truncateName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + '\u2026';
}

export const PedigreeGridNode = memo(function PedigreeGridNode({
  node,
  nodeWidth,
  nodeHeight,
  isSelected,
  onClick,
  onExpand,
  onExpandAll,
}: PedigreeGridNodeProps) {
  const person = node.person;
  if (!person) return null;

  const status = STATUS_SYMBOLS[person.status] ?? STATUS_SYMBOLS.tentative;
  const isRejected = person.status === 'rejected';
  const tier = person.confidenceTier as ConfidenceTier;
  const tierColor = TIER_COLORS[tier] ?? '#9a8872';
  const years = formatYears(person.birth.date?.year, person.death.date?.year);
  const opacity = isRejected ? 0.4 : 1;

  const accentWidth = 3;
  const borderColor = isSelected ? '#c9a55a' : '#2a2f3e';
  const borderWidth = isSelected ? 2 : 1;

  // Expand button label
  const expandLabel = node.expandableDepth <= 1 ? '+' : `${node.expandableDepth}+`;

  // Estimate max name chars based on node width
  const maxNameChars = Math.floor((nodeWidth - 40) / 7.5);

  return (
    <g
      transform={`translate(${node.x},${node.y - nodeHeight / 2})`}
      onClick={() => onClick(person.id)}
      style={{ cursor: 'pointer', opacity }}
    >
      {/* Background rect */}
      <rect
        width={nodeWidth}
        height={nodeHeight}
        rx={4}
        ry={4}
        fill="#1a1f2e"
        stroke={borderColor}
        strokeWidth={borderWidth}
      />

      {/* Selected glow */}
      {isSelected && (
        <rect
          width={nodeWidth}
          height={nodeHeight}
          rx={4}
          ry={4}
          fill="none"
          stroke="#c9a55a"
          strokeWidth={1}
          strokeOpacity={0.3}
          style={{ filter: 'blur(3px)' }}
        />
      )}

      {/* Tier-colored left accent bar */}
      <rect
        x={1}
        y={4}
        width={accentWidth}
        height={nodeHeight - 8}
        rx={1.5}
        fill={tierColor}
      />

      {/* Status badge (top-right) */}
      <text
        x={nodeWidth - 14}
        y={14}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fill={status.color}
      >
        {status.symbol}
      </text>

      {/* Flag warning indicator (bottom-right area, triangle) */}
      {node.hasFlags && (
        <text
          x={nodeWidth - 14}
          y={nodeHeight - 10}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          fill="#fbbf24"
        >
          {'\u26A0'}
        </text>
      )}

      {/* Person name */}
      <text
        x={accentWidth + 8}
        y={nodeHeight * 0.42}
        dominantBaseline="central"
        fill="#e8e0d4"
        fontSize={nodeHeight >= 62 ? 14 : 12}
        fontFamily="var(--font-heading)"
      >
        {truncateName(person.name.full, maxNameChars)}
      </text>

      {/* Years */}
      {years && (
        <text
          x={accentWidth + 8}
          y={nodeHeight * 0.72}
          dominantBaseline="central"
          fill="#8a8275"
          fontSize={nodeHeight >= 62 ? 11 : 10}
          fontFamily="var(--font-mono)"
        >
          {years}
        </text>
      )}

      {/* Expand button (right edge) */}
      {node.isExpandable && onExpand && (
        <g
          onClick={(e) => {
            e.stopPropagation();
            onExpand(person.id);
          }}
          style={{ cursor: 'pointer' }}
        >
          <circle
            cx={nodeWidth + 12}
            cy={nodeHeight / 2 - 8}
            r={10}
            fill="#1a2520"
            stroke="#34d399"
            strokeWidth={1}
          />
          <text
            x={nodeWidth + 12}
            y={nodeHeight / 2 - 8}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fontWeight={600}
            fill="#34d399"
          >
            {expandLabel}
          </text>
        </g>
      )}

      {/* Expand-all button (right edge, below expand) */}
      {node.isExpandable && onExpandAll && (
        <g
          onClick={(e) => {
            e.stopPropagation();
            onExpandAll(person.id);
          }}
          style={{ cursor: 'pointer' }}
        >
          <circle
            cx={nodeWidth + 12}
            cy={nodeHeight / 2 + 10}
            r={8}
            fill="#1a2520"
            stroke="#60a5fa"
            strokeWidth={1}
          />
          <text
            x={nodeWidth + 12}
            y={nodeHeight / 2 + 10}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9}
            fontWeight={600}
            fill="#60a5fa"
          >
            {'\u00BB'}
          </text>
        </g>
      )}
    </g>
  );
});
