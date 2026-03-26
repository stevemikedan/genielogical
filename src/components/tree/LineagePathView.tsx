import { useState, useMemo, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import { buildProofLadder } from '@/graph/proof-ladder.ts';
import { TIER_COLORS, TIER_DASH, getTierLabel } from '@/types/tier-labels.ts';

export interface LineagePathViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: () => void;
  centerOnSelected: () => void;
}

interface LineagePathViewProps {
  graph: TreeGraph;
  rootPersonId: string;             // The subject (bottom of path)
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
  onReRoot: (personId: string) => void;
}

const CARD_WIDTH = 340;
const CARD_HEIGHT = 72;
const CARD_GAP = 20;
const EDGE_HEIGHT = 50;
const STEP_HEIGHT = CARD_HEIGHT + CARD_GAP + EDGE_HEIGHT;

export const LineagePathView = forwardRef<LineagePathViewHandle, LineagePathViewProps>(
  function LineagePathView(
    { graph, rootPersonId, selectedPersonId, onSelectPerson, onReRoot },
    ref,
  ) {
    const svgRef = useRef<SVGSVGElement>(null);
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const [transform, setTransform] = useState(d3.zoomIdentity);

    // Build the proof chain from root to deepest ancestor
    const ladder = useMemo(
      () => buildProofLadder(rootPersonId, graph),
      [rootPersonId, graph],
    );

    // Setup D3 zoom
    useEffect(() => {
      if (!svgRef.current) return;
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 3])
        .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
          setTransform(event.transform);
        });

      d3.select(svgRef.current).call(zoom);
      zoomRef.current = zoom;

      return () => {
        if (svgRef.current) {
          d3.select(svgRef.current).on('.zoom', null);
        }
      };
    }, []);

    const fitToView = useCallback(() => {
      if (!svgRef.current || !zoomRef.current || !ladder) return;
      const svg = svgRef.current;
      const width = svg.clientWidth || 800;
      const height = svg.clientHeight || 600;

      const totalHeight = ladder.links.length * STEP_HEIGHT;
      const padding = 40;

      const scaleX = (width - padding * 2) / CARD_WIDTH;
      const scaleY = (height - padding * 2) / totalHeight;
      const scale = Math.min(scaleX, scaleY, 1) * 0.9;

      const cx = CARD_WIDTH / 2;
      const cy = totalHeight / 2;

      const t = d3.zoomIdentity
        .translate(width / 2 - cx * scale, height / 2 - cy * scale)
        .scale(scale);

      d3.select(svg).transition().duration(500).call(zoomRef.current.transform, t);
    }, [ladder]);

    useEffect(() => {
      fitToView();
    }, [fitToView]);

    const handleZoomIn = useCallback(() => {
      if (!svgRef.current || !zoomRef.current) return;
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.3);
    }, []);

    const handleZoomOut = useCallback(() => {
      if (!svgRef.current || !zoomRef.current) return;
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1 / 1.3);
    }, []);

    const handleCenterOnSelected = useCallback(() => {
      if (!svgRef.current || !zoomRef.current || !ladder || !selectedPersonId) {
        fitToView();
        return;
      }
      const idx = ladder.links.findIndex(l => l.personId === selectedPersonId);
      if (idx < 0) {
        fitToView();
        return;
      }
      const svg = svgRef.current;
      const width = svg.clientWidth || 800;
      const height = svg.clientHeight || 600;

      const cx = CARD_WIDTH / 2;
      const cy = idx * STEP_HEIGHT + CARD_HEIGHT / 2;

      const scale = Math.min(transform.k, 1);
      const t = d3.zoomIdentity
        .translate(width / 2 - cx * scale, height / 2 - cy * scale)
        .scale(scale);
      d3.select(svg).transition().duration(400).call(zoomRef.current.transform, t);
    }, [selectedPersonId, ladder, transform.k, fitToView]);

    useImperativeHandle(ref, () => ({
      zoomIn: handleZoomIn,
      zoomOut: handleZoomOut,
      fitToView,
      centerOnSelected: handleCenterOnSelected,
    }));

    if (!ladder || ladder.links.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-text-dim">
          No lineage path available.
        </div>
      );
    }

    return (
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        className="bg-bg"
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {ladder.links.map((link, i) => {
            const y = i * STEP_HEIGHT;
            const isSelected = link.personId === selectedPersonId;
            const person = graph.persons.get(link.personId);
            if (!person) return null;

            const generationLabel = getGenerationLabel(i, ladder.links.length);
            const sources = graph.sources;
            const sourceCount = person.sourceIds.filter(sid => sources.has(sid)).length;

            return (
              <g key={link.personId}>
                {/* Edge connector to next card */}
                {i < ladder.links.length - 1 && (
                  <LineageEdge
                    x={CARD_WIDTH / 2}
                    y1={y + CARD_HEIGHT}
                    y2={y + CARD_HEIGHT + CARD_GAP + EDGE_HEIGHT}
                    tier={ladder.links[i + 1].edgeTier}
                    isWeakest={ladder.links[i + 1].personId === ladder.weakestPersonId}
                  />
                )}

                {/* Person card */}
                <g
                  className="cursor-pointer"
                  onClick={() => onSelectPerson(link.personId)}
                  onDoubleClick={() => onReRoot(link.personId)}
                >
                  {/* Card background */}
                  <rect
                    x={0}
                    y={y}
                    width={CARD_WIDTH}
                    height={CARD_HEIGHT}
                    rx={6}
                    fill={isSelected ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255,255,255,0.03)'}
                    stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.1)'}
                    strokeWidth={isSelected ? 2 : 1}
                    className="hover:fill-white/5 transition-colors"
                  />

                  {/* Tier indicator bar (left edge) */}
                  {link.edgeTier && (
                    <rect
                      x={0}
                      y={y}
                      width={4}
                      height={CARD_HEIGHT}
                      rx={2}
                      fill={TIER_COLORS[link.edgeTier]}
                      fillOpacity={0.8}
                    />
                  )}

                  {/* Generation label */}
                  <text
                    x={14}
                    y={y + 15}
                    className="fill-text-dim pointer-events-none select-none"
                    style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}
                  >
                    {generationLabel}
                  </text>

                  {/* Person name */}
                  <text
                    x={14}
                    y={y + 32}
                    className="fill-text-primary pointer-events-none select-none"
                    style={{ fontSize: '14px', fontFamily: 'var(--font-heading)', fontWeight: 500 }}
                  >
                    {person.name.full.length > 35
                      ? person.name.full.substring(0, 33) + '\u2026'
                      : person.name.full}
                  </text>

                  {/* Dates + confidence */}
                  <text
                    x={14}
                    y={y + 48}
                    className="fill-text-secondary pointer-events-none select-none"
                    style={{ fontSize: '11px', fontFamily: 'var(--font-sans)' }}
                  >
                    {formatLifespan(person.birth.date?.raw, person.death.date?.raw)}
                    {person.birth.place?.raw ? ` · ${truncatePlace(person.birth.place.raw)}` : ''}
                  </text>

                  {/* Right-side badges */}
                  {link.edgeTier && (
                    <g transform={`translate(${CARD_WIDTH - 70}, ${y + 12})`}>
                      <rect
                        x={0}
                        y={0}
                        width={56}
                        height={18}
                        rx={3}
                        fill={TIER_COLORS[link.edgeTier]}
                        fillOpacity={0.15}
                        stroke={TIER_COLORS[link.edgeTier]}
                        strokeWidth={0.5}
                      />
                      <text
                        x={28}
                        y={12}
                        textAnchor="middle"
                        style={{ fontSize: '9px', fontFamily: 'var(--font-sans)', fill: TIER_COLORS[link.edgeTier] }}
                        className="pointer-events-none select-none"
                      >
                        {getTierLabel(link.edgeTier, link.edge?.confidenceReason)}
                      </text>
                    </g>
                  )}

                  {/* Source count */}
                  <text
                    x={CARD_WIDTH - 14}
                    y={y + 48}
                    textAnchor="end"
                    className="fill-text-dim pointer-events-none select-none"
                    style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}
                  >
                    {sourceCount > 0 ? `${sourceCount} src` : 'no sources'}
                  </text>

                  {/* Flag indicator */}
                  {person.flagIds.length > 0 && (
                    <text
                      x={CARD_WIDTH - 14}
                      y={y + 62}
                      textAnchor="end"
                      className="fill-tier3 pointer-events-none select-none"
                      style={{ fontSize: '9px' }}
                    >
                      &#x26A0; {person.flagIds.length}
                    </text>
                  )}
                </g>
              </g>
            );
          })}
        </g>

        {/* Legend */}
        <g transform="translate(12, 12)">
          <text x={0} y={10} className="fill-text-dim" style={{ fontSize: '9px', fontFamily: 'var(--font-sans)' }}>
            Lineage Path · {ladder.links.length} generations · Double-click to recenter
          </text>
          {ladder.weakestPersonId && (
            <text x={0} y={22} className="fill-tier4" style={{ fontSize: '8px', fontFamily: 'var(--font-sans)' }}>
              Weakest link: Tier {ladder.weakestTier}
            </text>
          )}
        </g>
      </svg>
    );
  },
);

/** Vertical edge connector between cards. */
function LineageEdge({
  x,
  y1,
  y2,
  tier,
  isWeakest,
}: {
  x: number;
  y1: number;
  y2: number;
  tier: ConfidenceTier | null;
  isWeakest: boolean;
}) {
  const color = tier ? TIER_COLORS[tier] : 'rgba(255,255,255,0.15)';
  const dash = tier ? TIER_DASH[tier] : undefined;

  return (
    <g>
      <line
        x1={x}
        y1={y1}
        x2={x}
        y2={y2}
        stroke={color}
        strokeWidth={isWeakest ? 3 : 2}
        strokeDasharray={dash}
        strokeOpacity={0.7}
      />
      {/* Arrow at bottom */}
      <polygon
        points={`${x - 4},${y2 - 6} ${x + 4},${y2 - 6} ${x},${y2}`}
        fill={color}
        fillOpacity={0.7}
      />
      {isWeakest && (
        <text
          x={x + 10}
          y={(y1 + y2) / 2 + 3}
          className="fill-tier4 pointer-events-none select-none"
          style={{ fontSize: '8px', fontFamily: 'var(--font-mono)' }}
        >
          weakest link
        </text>
      )}
    </g>
  );
}

function getGenerationLabel(index: number, total: number): string {
  if (index === total - 1) return 'You';
  const gen = total - 1 - index;
  if (gen === 1) return 'Parent';
  if (gen === 2) return 'Grandparent';
  if (gen === 3) return 'Great-grandparent';
  const greats = gen - 2;
  return `${greats}× great-grandparent`;
}

function formatLifespan(birth?: string, death?: string): string {
  const b = birth ?? '?';
  const d = death ?? '';
  if (!d) return `b. ${b}`;
  return `${b} \u2013 ${d}`;
}

function truncatePlace(place: string, maxLen: number = 30): string {
  if (place.length <= maxLen) return place;
  return place.substring(0, maxLen - 1) + '\u2026';
}
