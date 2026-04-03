import { memo } from 'react';
import type { NetworkLink, NetworkNode } from './network-map-data.ts';
import { TIER_COLORS, TIER_DASH } from '@/types/tier-labels.ts';

interface NetworkMapLinkProps {
  link: NetworkLink;
  zoomScale: number;
  onMouseEnter: (e: React.MouseEvent, link: NetworkLink) => void;
  onMouseLeave: () => void;
}

function getNodePos(endpoint: string | NetworkNode): { x: number; y: number } {
  if (typeof endpoint === 'string') return { x: 0, y: 0 };
  return { x: endpoint.x ?? 0, y: endpoint.y ?? 0 };
}

export const NetworkMapLink = memo(function NetworkMapLink({
  link,
  zoomScale,
  onMouseEnter,
  onMouseLeave,
}: NetworkMapLinkProps) {
  const source = getNodePos(link.source);
  const target = getNodePos(link.target);
  const tierColor = TIER_COLORS[link.confidenceTier];
  const dash = TIER_DASH[link.confidenceTier];

  const showArrow = zoomScale >= 0.3 && link.linkType === 'parent-child';
  const markerId = showArrow ? `arrow-tier-${link.confidenceTier}` : undefined;

  if (link.linkType === 'sibling') {
    return (
      <g>
        {/* Hit area */}
        <line
          x1={source.x} y1={source.y}
          x2={target.x} y2={target.y}
          stroke="transparent"
          strokeWidth={12}
          onMouseEnter={(e) => onMouseEnter(e, link)}
          onMouseLeave={onMouseLeave}
        />
        <line
          x1={source.x} y1={source.y}
          x2={target.x} y2={target.y}
          stroke={tierColor}
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.35}
          pointerEvents="none"
        />
      </g>
    );
  }

  if (link.linkType === 'spouse') {
    const mx = (source.x + target.x) / 2;
    const my = (source.y + target.y) / 2;
    const showDiamond = zoomScale >= 0.3;

    return (
      <g>
        {/* Hit area */}
        <line
          x1={source.x} y1={source.y}
          x2={target.x} y2={target.y}
          stroke="transparent"
          strokeWidth={12}
          onMouseEnter={(e) => onMouseEnter(e, link)}
          onMouseLeave={onMouseLeave}
        />
        <line
          x1={source.x} y1={source.y}
          x2={target.x} y2={target.y}
          stroke={tierColor}
          strokeWidth={2.5}
          strokeDasharray={dash}
          opacity={0.7}
          pointerEvents="none"
        />
        {showDiamond && (
          <polygon
            points={`${mx},${my - 4} ${mx + 4},${my} ${mx},${my + 4} ${mx - 4},${my}`}
            fill={tierColor}
            opacity={0.8}
            pointerEvents="none"
          />
        )}
      </g>
    );
  }

  // Parent-child
  return (
    <g>
      {/* Hit area */}
      <line
        x1={source.x} y1={source.y}
        x2={target.x} y2={target.y}
        stroke="transparent"
        strokeWidth={12}
        onMouseEnter={(e) => onMouseEnter(e, link)}
        onMouseLeave={onMouseLeave}
      />
      <line
        x1={source.x} y1={source.y}
        x2={target.x} y2={target.y}
        stroke={tierColor}
        strokeWidth={1.8}
        strokeDasharray={dash}
        opacity={0.65}
        markerEnd={markerId ? `url(#${markerId})` : undefined}
        pointerEvents="none"
      />
    </g>
  );
});

/** Arrow marker defs — render once in the parent SVG <defs>. */
export function NetworkArrowDefs() {
  const tiers = [1, 2, 3, 4] as const;
  return (
    <>
      {tiers.map(tier => (
        <marker
          key={tier}
          id={`arrow-tier-${tier}`}
          viewBox="0 0 10 10"
          refX={10}
          refY={5}
          markerWidth={8}
          markerHeight={8}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={TIER_COLORS[tier]} opacity={0.7} />
        </marker>
      ))}
    </>
  );
}
