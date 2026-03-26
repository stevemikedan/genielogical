import { useCallback } from 'react';
import type { TreeOrientation } from './TreeControls.tsx';

interface TreeMinimapProps {
  nodes: Array<{ x: number; y: number }>;
  viewportBounds: { x: number; y: number; width: number; height: number };
  fullBounds: { x: number; y: number; width: number; height: number };
  onNavigate: (x: number, y: number) => void;
  orientation?: TreeOrientation;
}

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 150;
const PADDING = 10;

export function TreeMinimap({ nodes, viewportBounds, fullBounds, onNavigate }: TreeMinimapProps) {
  if (nodes.length === 0) return null;

  const fb = fullBounds;
  const scaleX = fb.width > 0 ? (MINIMAP_WIDTH - 2 * PADDING) / fb.width : 1;
  const scaleY = fb.height > 0 ? (MINIMAP_HEIGHT - 2 * PADDING) / fb.height : 1;
  const scale = Math.min(scaleX, scaleY);

  function toMinimap(x: number, y: number) {
    return {
      mx: PADDING + (x - fb.x) * scale,
      my: PADDING + (y - fb.y) * scale,
    };
  }

  const vpStart = toMinimap(viewportBounds.x, viewportBounds.y);
  const vpW = viewportBounds.width * scale;
  const vpH = viewportBounds.height * scale;

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const x = fb.x + (mx - PADDING) / scale;
    const y = fb.y + (my - PADDING) / scale;
    onNavigate(x, y);
  }, [fb, scale, onNavigate]);

  return (
    <div className="absolute bottom-4 right-4 z-40">
      <svg
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        onClick={handleClick}
        className="cursor-crosshair rounded-lg border border-border"
        style={{ backgroundColor: 'rgba(12, 11, 9, 0.85)' }}
      >
        {/* Node dots — coordinates are already in SVG space */}
        {nodes.map((node, i) => {
          const { mx, my } = toMinimap(node.x, node.y);
          return (
            <circle
              key={i}
              cx={mx}
              cy={my}
              r={2}
              fill="#9a8872"
              opacity={0.6}
            />
          );
        })}

        {/* Viewport rectangle */}
        <rect
          x={vpStart.mx}
          y={vpStart.my}
          width={Math.max(vpW, 4)}
          height={Math.max(vpH, 4)}
          fill="none"
          stroke="#e8e0d0"
          strokeWidth={1}
          opacity={0.7}
        />
      </svg>
    </div>
  );
}
