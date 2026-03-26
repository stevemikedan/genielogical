import { memo, useState } from 'react';
import type { PedigreeGridNode } from './pedigree-grid-layout.ts';

interface PlaceholderNodeProps {
  node: PedigreeGridNode;  // person is null
  nodeWidth: number;
  nodeHeight: number;
  onClick: (ahnentafel: number, position: 'father' | 'mother', parentOfPersonId: string | null) => void;
}

export const PlaceholderNode = memo(function PlaceholderNode({
  node,
  nodeWidth,
  nodeHeight,
  onClick,
}: PlaceholderNodeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const position = node.position === 'self' ? 'father' : node.position;
  const label = position === 'father' ? 'Add Father' : 'Add Mother';
  const borderColor = isHovered ? '#5a5f6e' : '#3a3f4e';

  // The parentAhnentafel points to the child this placeholder is a parent of.
  // We need the child's person ID. We pass null here; the consumer resolves it
  // via the ahnentafel→node lookup.
  // However, since we can't access the node map here, we pass null and let the
  // parent component resolve it.
  const childPersonId: string | null = null;

  return (
    <g
      transform={`translate(${node.x},${node.y - nodeHeight / 2})`}
      onClick={() => onClick(node.ahnentafel, position, childPersonId)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {/* Dashed border rect */}
      <rect
        width={nodeWidth}
        height={nodeHeight}
        rx={4}
        ry={4}
        fill="transparent"
        stroke={borderColor}
        strokeWidth={1}
        strokeDasharray="6 3"
      />

      {/* Plus icon */}
      <text
        x={nodeWidth / 2}
        y={nodeHeight * 0.38}
        textAnchor="middle"
        dominantBaseline="central"
        fill={isHovered ? '#8a8f9e' : '#5a5f6e'}
        fontSize={18}
        fontWeight={300}
      >
        +
      </text>

      {/* Label */}
      <text
        x={nodeWidth / 2}
        y={nodeHeight * 0.7}
        textAnchor="middle"
        dominantBaseline="central"
        fill={isHovered ? '#8a8f9e' : '#5a5f6e'}
        fontSize={10}
        fontFamily="var(--font-body)"
      >
        {label}
      </text>
    </g>
  );
});
