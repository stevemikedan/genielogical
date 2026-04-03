import { memo } from 'react';
import type { SiblingGridNode } from './pedigree-grid-layout.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import { TIER_COLORS } from '@/types/tier-labels.ts';
import { formatDisplayName } from '@/utils/name-display.ts';

interface SiblingNodeProps {
  node: SiblingGridNode;
  isSelected: boolean;
  onClick: (personId: string) => void;
}

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

export const SiblingNode = memo(function SiblingNode({
  node,
  isSelected,
  onClick,
}: SiblingNodeProps) {
  const { person, nodeWidth, nodeHeight } = node;
  const isRejected = person.status === 'rejected';
  const tier = person.confidenceTier as ConfidenceTier;
  const tierColor = TIER_COLORS[tier] ?? '#9a8872';
  const years = formatYears(person.birth.date?.year, person.death.date?.year);
  const opacity = isRejected ? 0.4 : 0.75;

  const accentWidth = 2;
  const borderColor = isSelected ? '#c9a55a' : '#2a2f3e';
  const borderWidth = isSelected ? 2 : 1;

  const maxNameChars = Math.floor((nodeWidth - 30) / 6.5);

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
        rx={3}
        ry={3}
        fill="#161a28"
        stroke={borderColor}
        strokeWidth={borderWidth}
      />

      {/* Selected glow */}
      {isSelected && (
        <rect
          width={nodeWidth}
          height={nodeHeight}
          rx={3}
          ry={3}
          fill="none"
          stroke="#c9a55a"
          strokeWidth={1}
          strokeOpacity={0.3}
          style={{ filter: 'blur(3px)' }}
        />
      )}

      {/* Tier-colored left accent bar (thinner than direct-line) */}
      <rect
        x={1}
        y={3}
        width={accentWidth}
        height={nodeHeight - 6}
        rx={1}
        fill={tierColor}
      />

      {/* Flag indicator */}
      {node.hasFlags && (
        <text
          x={nodeWidth - 10}
          y={nodeHeight / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={9}
          fill="#fbbf24"
        >
          {'\u26A0'}
        </text>
      )}

      {/* Person name */}
      <text
        x={accentWidth + 6}
        y={nodeHeight * 0.38}
        dominantBaseline="central"
        fill="#c0b8ac"
        fontSize={nodeHeight >= 46 ? 11 : 10}
        fontFamily="var(--font-heading)"
      >
        {truncateName(formatDisplayName(person.name), maxNameChars)}
      </text>

      {/* Years */}
      {years && (
        <text
          x={accentWidth + 6}
          y={nodeHeight * 0.72}
          dominantBaseline="central"
          fill="#6b6560"
          fontSize={9}
          fontFamily="var(--font-mono)"
        >
          {years}
        </text>
      )}
    </g>
  );
});
