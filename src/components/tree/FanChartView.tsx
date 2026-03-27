import { useState, useRef, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import type { TreeDensity } from './TreeControls.tsx';
import type { FanMode } from './fan-chart-layout.ts';
import { computeFanChartLayout } from './fan-chart-layout.ts';
import { FanChartWedge } from './FanChartWedge.tsx';
import { TIER_COLORS } from '@/types/tier-labels.ts';

export interface FanChartViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: () => void;
  centerOnSelected: () => void;
}

interface FanChartViewProps {
  graph: TreeGraph;
  rootPersonId: string;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
  density: TreeDensity;
  maxGenerations: number;
  visibleTiers: Set<ConfidenceTier>;
  showRejected: boolean;
  fanMode: FanMode;
  onReRoot: (personId: string) => void;
}

export const FanChartView = forwardRef<FanChartViewHandle, FanChartViewProps>(
  function FanChartView(
    { graph, rootPersonId, selectedPersonId, onSelectPerson, maxGenerations, visibleTiers, showRejected, fanMode, onReRoot },
    ref,
  ) {
    const svgRef = useRef<SVGSVGElement>(null);
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const [transform, setTransform] = useState(d3.zoomIdentity);

    // Compute layout
    const layout = useMemo(() => {
      return computeFanChartLayout(rootPersonId, graph, {
        maxGenerations: Math.min(maxGenerations, 15), // cap for performance
        mode: fanMode,
        showEmptySlots: true,
      });
    }, [rootPersonId, graph, maxGenerations, fanMode]);

    // Filter nodes by visibility
    const visibleNodes = useMemo(() => {
      if (!layout) return [];
      return layout.nodes.filter(node => {
        if (node.isEmpty) return true; // always show gaps
        if (!node.person) return false;
        if (!visibleTiers.has(node.confidenceTier)) return false;
        if (!showRejected && node.person.status === 'rejected') return false;
        return true;
      });
    }, [layout, visibleTiers, showRejected]);

    // Separate subject (gen 0) from wedges (gen 1+)
    const subjectNode = useMemo(
      () => visibleNodes.find(n => n.generation === 0),
      [visibleNodes],
    );

    const wedgeNodes = useMemo(
      () => visibleNodes.filter(n => n.generation > 0),
      [visibleNodes],
    );

    // Setup D3 zoom
    useEffect(() => {
      if (!svgRef.current) return;
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 6])
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

    // Fit to view on layout change
    const fitToView = useCallback(() => {
      if (!svgRef.current || !zoomRef.current || !layout) return;
      const svg = svgRef.current;
      const width = svg.clientWidth || 800;
      const height = svg.clientHeight || 600;

      const totalR = layout.totalRadius + 30; // padding
      const diameter = totalR * 2;

      const scaleX = width / diameter;
      const scaleY = height / (fanMode === 'semi' ? totalR + 80 : diameter);
      const scale = Math.min(scaleX, scaleY, 1) * 0.9;

      // Center the fan in the viewport
      const cx = layout.centerX;
      const cy = layout.centerY;

      const t = d3.zoomIdentity
        .translate(width / 2 - cx * scale, height / 2 - cy * scale)
        .scale(scale);

      d3.select(svg).transition().duration(500).call(zoomRef.current.transform, t);
    }, [layout, fanMode]);

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
      if (!svgRef.current || !zoomRef.current || !layout) return;
      if (!selectedPersonId) {
        fitToView();
        return;
      }
      // Find the selected node
      const node = layout.nodes.find(n => n.personId === selectedPersonId);
      if (!node) {
        fitToView();
        return;
      }
      const svg = svgRef.current;
      const width = svg.clientWidth || 800;
      const height = svg.clientHeight || 600;

      // Compute center of wedge
      const midAngle = (node.startAngle + node.endAngle) / 2;
      const midRadius = (node.innerRadius + node.outerRadius) / 2;
      const cx = midRadius * Math.cos(midAngle) + layout.centerX;
      const cy = midRadius * Math.sin(midAngle) + layout.centerY;

      const scale = Math.min(transform.k, 1.5);
      const t = d3.zoomIdentity
        .translate(width / 2 - cx * scale, height / 2 - cy * scale)
        .scale(scale);
      d3.select(svg).transition().duration(400).call(zoomRef.current.transform, t);
    }, [selectedPersonId, layout, transform.k, fitToView]);

    useImperativeHandle(ref, () => ({
      zoomIn: handleZoomIn,
      zoomOut: handleZoomOut,
      fitToView,
      centerOnSelected: handleCenterOnSelected,
    }));

    const handleDoubleClick = useCallback((personId: string) => {
      onReRoot(personId);
    }, [onReRoot]);

    if (!layout) {
      return (
        <div className="flex items-center justify-center h-full text-text-dim">
          No tree data to display.
        </div>
      );
    }

    const rootPerson = graph.persons.get(rootPersonId);

    return (
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        className="bg-bg"
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Translate to center of fan */}
          <g transform={`translate(${layout.centerX},${layout.centerY})`}>
            {/* Generation ring guides (subtle) */}
            {Array.from({ length: layout.maxGeneration }, (_, i) => i + 1).map(gen => {
              const node = wedgeNodes.find(n => n.generation === gen);
              if (!node) return null;
              return (
                <circle
                  key={`ring-${gen}`}
                  cx={0}
                  cy={0}
                  r={node.innerRadius}
                  fill="none"
                  stroke="rgba(255,255,255,0.03)"
                  strokeWidth={0.5}
                />
              );
            })}

            {/* Wedges */}
            {wedgeNodes.map(node => (
              <FanChartWedge
                key={node.ahnentafel}
                node={node}
                isSelected={node.personId === selectedPersonId}
                onClick={onSelectPerson}
                onDoubleClick={handleDoubleClick}
                zoomScale={transform.k}
              />
            ))}

            {/* Subject circle at center */}
            {subjectNode && subjectNode.person && (
              <g
                className="cursor-pointer"
                onClick={() => onSelectPerson(subjectNode.person!.id)}
              >
                <circle
                  cx={0}
                  cy={0}
                  r={subjectNode.outerRadius}
                  fill={TIER_COLORS[subjectNode.confidenceTier]}
                  fillOpacity={0.8}
                  stroke={selectedPersonId === subjectNode.personId ? '#fbbf24' : 'rgba(255,255,255,0.2)'}
                  strokeWidth={selectedPersonId === subjectNode.personId ? 2.5 : 1}
                />
                <text
                  x={0}
                  y={-6}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-text-primary pointer-events-none select-none"
                  style={{ fontSize: '11px', fontFamily: 'var(--font-heading)', fontWeight: 500 }}
                >
                  {subjectNode.person.name.full.length > 20
                    ? subjectNode.person.name.full.substring(0, 18) + '\u2026'
                    : subjectNode.person.name.full}
                </text>
                <text
                  x={0}
                  y={8}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-text-dim pointer-events-none select-none"
                  style={{ fontSize: '8px', fontFamily: 'var(--font-sans)' }}
                >
                  {formatSubjectDates(subjectNode.person.birth.date?.raw, subjectNode.person.death.date?.raw)}
                </text>
              </g>
            )}

            {/* Generation labels (only at medium+ zoom) */}
            {transform.k > 0.4 && Array.from({ length: layout.maxGeneration }, (_, i) => i + 1).map(gen => {
              const node = wedgeNodes.find(n => n.generation === gen);
              if (!node) return null;
              const labelR = node.outerRadius + 3;
              // Place label at angle 0 for full, or at top for semi
              const labelAngle = fanMode === 'semi' ? -Math.PI / 2 : -Math.PI / 2;
              return (
                <text
                  key={`gen-label-${gen}`}
                  x={labelR * Math.cos(labelAngle)}
                  y={labelR * Math.sin(labelAngle)}
                  textAnchor="middle"
                  dominantBaseline="auto"
                  className="fill-text-dim pointer-events-none select-none"
                  style={{ fontSize: '7px', fontFamily: 'var(--font-mono)' }}
                >
                  Gen {gen}
                </text>
              );
            })}
          </g>
        </g>

        {/* Legend */}
        <g transform="translate(12, 12)">
          <text x={0} y={10} className="fill-text-dim" style={{ fontSize: '9px', fontFamily: 'var(--font-sans)' }}>
            {rootPerson?.name.full ?? 'Fan Chart'}
          </text>
          <text x={0} y={22} className="fill-text-dim" style={{ fontSize: '7px', fontFamily: 'var(--font-sans)' }}>
            {fanMode === 'full' ? 'Full circle' : 'Semicircle'} · {maxGenerations} generations · Double-click to recenter
          </text>
        </g>
      </svg>
    );
  },
);

function formatSubjectDates(birth?: string, death?: string): string {
  const parts: string[] = [];
  if (birth) parts.push(`b. ${birth}`);
  if (death) parts.push(`d. ${death}`);
  return parts.join(' · ');
}
