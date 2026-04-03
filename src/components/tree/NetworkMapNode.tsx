import { memo } from 'react';
import type { NetworkNode } from './network-map-data.ts';
import { TIER_COLORS } from '@/types/tier-labels.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import { formatDisplayName } from '@/utils/name-display.ts';

const STATUS_SYMBOLS: Record<string, { symbol: string; color: string }> = {
  tentative: { symbol: '\u25CB', color: '#9ca3af' },
  under_review: { symbol: '\u25D0', color: '#fbbf24' },
  validated: { symbol: '\u25CF', color: '#34d399' },
  disputed: { symbol: '\u26A0', color: '#f87171' },
  rejected: { symbol: '\u2715', color: '#4b5563' },
};

const TIER_BG_TINTS: Record<ConfidenceTier, string> = {
  1: 'rgba(52,211,153,0.07)',
  2: 'rgba(96,165,250,0.07)',
  3: 'rgba(251,191,36,0.06)',
  4: 'rgba(248,113,113,0.07)',
};

const GOLD = '#d4a84b';
const CARD_W = 140;
const CARD_H = 50;

interface NetworkMapNodeProps {
  node: NetworkNode;
  isSelected: boolean;
  isRoot: boolean;
  onClick: (personId: string) => void;
  onDoubleClick: (personId: string) => void;
  onPointerDown: (e: React.PointerEvent, node: NetworkNode) => void;
  zoomScale: number;
}

function getInitials(node: NetworkNode): string {
  const { given, surname } = node.person.name;
  const g = given ? given[0] : '';
  const s = surname ? surname[0] : '';
  return (g + s).toUpperCase() || '?';
}

function getYearDisplay(node: NetworkNode): string {
  const b = node.person.birth.date?.year;
  const d = node.person.death.date?.year;
  if (b && d) return `${b}\u2013${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return '';
}

export const NetworkMapNode = memo(function NetworkMapNode({
  node,
  isSelected,
  isRoot,
  onClick,
  onDoubleClick,
  onPointerDown,
  zoomScale,
}: NetworkMapNodeProps) {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const tierColor = TIER_COLORS[node.confidenceTier];
  const statusInfo = STATUS_SYMBOLS[node.status] ?? STATUS_SYMBOLS.tentative;

  // Dot mode: k < 0.3
  if (zoomScale < 0.3) {
    const r = isRoot ? 12 : 8;
    return (
      <g
        transform={`translate(${x},${y})`}
        onClick={() => onClick(node.id)}
        onDoubleClick={() => onDoubleClick(node.id)}
        onPointerDown={(e) => onPointerDown(e, node)}
        style={{ cursor: 'pointer' }}
      >
        <circle r={r} fill={tierColor} opacity={0.8} />
        {isRoot && <circle r={r + 3} fill="none" stroke={GOLD} strokeWidth={2} />}
        {isSelected && <circle r={r + 3} fill="none" stroke={GOLD} strokeWidth={2} />}
      </g>
    );
  }

  // Initials mode: 0.3 ≤ k < 0.7
  if (zoomScale < 0.7) {
    const r = 18;
    return (
      <g
        transform={`translate(${x},${y})`}
        onClick={() => onClick(node.id)}
        onDoubleClick={() => onDoubleClick(node.id)}
        onPointerDown={(e) => onPointerDown(e, node)}
        style={{ cursor: 'pointer' }}
      >
        <circle r={r} fill="#1a1a2e" stroke={tierColor} strokeWidth={2} />
        {isRoot && <circle r={r + 4} fill="none" stroke={GOLD} strokeWidth={1.5} />}
        {isSelected && <circle r={r + 4} fill="none" stroke={GOLD} strokeWidth={2} />}
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill={tierColor}
          fontSize={12}
          fontFamily="'Source Sans 3', sans-serif"
          fontWeight={600}
        >
          {getInitials(node)}
        </text>
      </g>
    );
  }

  // Card mode: k ≥ 0.7
  const halfW = CARD_W / 2;
  const halfH = CARD_H / 2;
  const displayName = formatDisplayName(node.person.name);
  const years = getYearDisplay(node);

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={() => onClick(node.id)}
      onDoubleClick={() => onDoubleClick(node.id)}
      onPointerDown={(e) => onPointerDown(e, node)}
      style={{ cursor: 'pointer' }}
    >
      {/* Selection/root highlight */}
      {(isSelected || isRoot) && (
        <rect
          x={-halfW - 3}
          y={-halfH - 3}
          width={CARD_W + 6}
          height={CARD_H + 6}
          rx={8}
          fill="none"
          stroke={GOLD}
          strokeWidth={isSelected ? 2.5 : 1.5}
        />
      )}

      {/* Card background */}
      <rect
        x={-halfW}
        y={-halfH}
        width={CARD_W}
        height={CARD_H}
        rx={6}
        fill={TIER_BG_TINTS[node.confidenceTier]}
        stroke={tierColor}
        strokeWidth={1.5}
      />

      {/* Tier accent bar (left) */}
      <rect x={-halfW} y={-halfH} width={4} height={CARD_H} rx={2} fill={tierColor} />

      {/* Name */}
      <text
        x={-halfW + 10}
        y={-halfH + 17}
        fill="#e8e0d4"
        fontSize={11}
        fontFamily="'EB Garamond', serif"
        fontWeight={600}
      >
        {displayName.length > 18 ? displayName.slice(0, 17) + '\u2026' : displayName}
      </text>

      {/* Years */}
      {years && (
        <text
          x={-halfW + 10}
          y={-halfH + 32}
          fill="#9ca3af"
          fontSize={9}
          fontFamily="'Source Sans 3', sans-serif"
        >
          {years}
        </text>
      )}

      {/* Status badge (top-right) */}
      <text
        x={halfW - 12}
        y={-halfH + 16}
        fill={statusInfo.color}
        fontSize={11}
        textAnchor="middle"
      >
        {statusInfo.symbol}
      </text>

      {/* Flag warning */}
      {node.hasFlags && (
        <circle cx={halfW - 8} cy={halfH - 8} r={4} fill="#f87171" opacity={0.8} />
      )}
    </g>
  );
});
