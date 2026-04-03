import { memo, useMemo } from 'react';
import type { FanChartNode } from './fan-chart-layout.ts';
import { TIER_COLORS, TIER_DASH } from '@/types/tier-labels.ts';
import type { ConfidenceTier } from '@/types/common.ts';

interface FanChartWedgeProps {
  node: FanChartNode;
  isSelected: boolean;
  onClick: (personId: string) => void;
  onDoubleClick: (personId: string) => void;
  zoomScale: number;
}

/** Compute the SVG arc path for a wedge. */
function arcPath(
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  // Convert angles to x,y coordinates
  // SVG arcs: 0 = right, PI/2 = down (standard math convention rotated)
  const x1i = innerRadius * Math.cos(startAngle);
  const y1i = innerRadius * Math.sin(startAngle);
  const x2i = innerRadius * Math.cos(endAngle);
  const y2i = innerRadius * Math.sin(endAngle);
  const x1o = outerRadius * Math.cos(startAngle);
  const y1o = outerRadius * Math.sin(startAngle);
  const x2o = outerRadius * Math.cos(endAngle);
  const y2o = outerRadius * Math.sin(endAngle);

  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  // Path: outer arc (clockwise) → line to inner → inner arc (counter-clockwise) → close
  return [
    `M ${x1o} ${y1o}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2o} ${y2o}`,
    `L ${x2i} ${y2i}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1i} ${y1i}`,
    'Z',
  ].join(' ');
}

/**
 * Compute detail level based on wedge angular width in pixels at current zoom.
 */
function getWedgeDetailLevel(
  startAngle: number,
  endAngle: number,
  outerRadius: number,
  zoomScale: number,
): 'fill-only' | 'color-only' | 'name' | 'full' {
  const angularWidth = endAngle - startAngle;
  const arcLength = angularWidth * outerRadius * zoomScale;

  if (arcLength < 10) return 'fill-only';
  if (arcLength < 40) return 'color-only';
  if (arcLength < 100) return 'name';
  return 'full';
}

/**
 * Get fill color/opacity for a wedge based on confidence tier.
 */
function wedgeFill(tier: ConfidenceTier, isEmpty: boolean): { fill: string; opacity: number } {
  if (isEmpty) {
    return { fill: '#1a1a2e', opacity: 0.3 };
  }
  return {
    fill: TIER_COLORS[tier],
    opacity: tier <= 2 ? 0.7 : tier === 3 ? 0.5 : 0.35,
  };
}

/**
 * Compute text position at the midpoint of a wedge arc.
 */
function wedgeTextPosition(
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): { x: number; y: number; rotation: number } {
  const midAngle = (startAngle + endAngle) / 2;
  const midRadius = (innerRadius + outerRadius) / 2;

  const x = midRadius * Math.cos(midAngle);
  const y = midRadius * Math.sin(midAngle);

  // Rotate text to follow the arc (readable)
  let rotation = (midAngle * 180) / Math.PI;
  // Keep text upright: flip if in bottom half
  if (rotation > 90 || rotation < -90) {
    rotation += 180;
  }

  return { x, y, rotation };
}

/**
 * Truncate name to fit within available arc length.
 */
function truncateName(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  return name.substring(0, maxChars - 1) + '\u2026';
}

export const FanChartWedge = memo(function FanChartWedge({
  node,
  isSelected,
  onClick,
  onDoubleClick,
  zoomScale,
}: FanChartWedgeProps) {
  const { startAngle, endAngle, innerRadius, outerRadius, person, isEmpty, confidenceTier, isNotable, hasFlags, depthBeyond } = node;

  const detailLevel = useMemo(
    () => getWedgeDetailLevel(startAngle, endAngle, outerRadius, zoomScale),
    [startAngle, endAngle, outerRadius, zoomScale],
  );

  const path = useMemo(
    () => arcPath(innerRadius, outerRadius, startAngle, endAngle),
    [innerRadius, outerRadius, startAngle, endAngle],
  );

  const { fill, opacity } = wedgeFill(confidenceTier, isEmpty);
  const textPos = useMemo(
    () => wedgeTextPosition(innerRadius, outerRadius, startAngle, endAngle),
    [innerRadius, outerRadius, startAngle, endAngle],
  );

  // Estimate max characters that fit
  const angularWidth = endAngle - startAngle;
  const arcLen = angularWidth * ((innerRadius + outerRadius) / 2);
  const maxChars = Math.max(3, Math.floor(arcLen / 7));

  const strokeColor = isSelected
    ? '#fbbf24'
    : isNotable
      ? '#d4af37'
      : 'rgba(255,255,255,0.1)';

  const strokeWidth = isSelected ? 2.5 : isNotable ? 1.5 : 0.5;
  const dashArray = isEmpty ? TIER_DASH[4] : undefined;

  // Fill-only: render just the colored wedge, no text/hover/flags
  if (detailLevel === 'fill-only') {
    return (
      <path
        d={path}
        fill={fill}
        fillOpacity={opacity}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        className="cursor-pointer"
        onClick={() => !isEmpty && person && onClick(person.id)}
        onDoubleClick={() => !isEmpty && person && onDoubleClick(person.id)}
      />
    );
  }

  return (
    <g
      className="cursor-pointer"
      onClick={() => !isEmpty && person && onClick(person.id)}
      onDoubleClick={() => !isEmpty && person && onDoubleClick(person.id)}
    >
      {/* Wedge shape */}
      <path
        d={path}
        fill={fill}
        fillOpacity={opacity}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
      />

      {/* Hover highlight */}
      <path
        d={path}
        fill="transparent"
        stroke="transparent"
        strokeWidth={0}
        className="hover:fill-white/10 transition-colors"
      />

      {/* Text labels (only at sufficient zoom) */}
      {detailLevel !== 'color-only' && person && (
        <text
          x={textPos.x}
          y={textPos.y}
          transform={`rotate(${textPos.rotation}, ${textPos.x}, ${textPos.y})`}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-text-primary pointer-events-none select-none"
          style={{
            fontSize: detailLevel === 'full' ? '9px' : '7px',
            fontFamily: 'var(--font-heading)',
          }}
        >
          {truncateName(person.name.full, maxChars)}
        </text>
      )}

      {/* Dates (full detail only) */}
      {detailLevel === 'full' && person && (
        <text
          x={textPos.x}
          y={textPos.y + 11}
          transform={`rotate(${textPos.rotation}, ${textPos.x}, ${textPos.y + 11})`}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-text-dim pointer-events-none select-none"
          style={{ fontSize: '6px', fontFamily: 'var(--font-sans)' }}
        >
          {formatDates(person.birth.date?.raw, person.death.date?.raw)}
        </text>
      )}

      {/* Flag indicator */}
      {hasFlags && detailLevel !== 'color-only' && (
        <text
          x={outerRadius * Math.cos(startAngle + 0.05)}
          y={outerRadius * Math.sin(startAngle + 0.05) - 3}
          className="fill-tier3 pointer-events-none select-none"
          style={{ fontSize: '8px' }}
        >
          &#x26A0;
        </text>
      )}

      {/* Depth indicator for collapsed deep branches */}
      {depthBeyond > 0 && (
        <text
          x={textPos.x}
          y={textPos.y + (detailLevel === 'full' ? 20 : 10)}
          transform={`rotate(${textPos.rotation}, ${textPos.x}, ${textPos.y + (detailLevel === 'full' ? 20 : 10)})`}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-gold pointer-events-none select-none"
          style={{ fontSize: '6px', fontFamily: 'var(--font-mono)' }}
        >
          +{depthBeyond} more
        </text>
      )}
    </g>
  );
});

function formatDates(birth?: string, death?: string): string {
  const b = birth ?? '?';
  const d = death ?? '';
  if (!d) return `b. ${b}`;
  return `${b}\u2013${d}`;
}
