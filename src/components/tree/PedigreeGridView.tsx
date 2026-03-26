import { useRef, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import * as d3 from 'd3';
import type { ConfidenceTier } from '@/types/common.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { TreeDensity } from './TreeControls.tsx';
import {
  computePedigreeGridLayout,
  GRID_DENSITY_PRESETS,
} from './pedigree-grid-layout.ts';
import type { PedigreeGridNode as PedigreeGridNodeType } from './pedigree-grid-layout.ts';
import { PedigreeGridNode } from './PedigreeGridNode.tsx';
import { PlaceholderNode } from './PlaceholderNode.tsx';
import { PedigreeGridConnector } from './PedigreeGridConnector.tsx';

export interface PedigreeGridViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: () => void;
}

interface PedigreeGridViewProps {
  graph: TreeGraph;
  rootPersonId: string;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
  density: TreeDensity;
  maxGenerations: number;
  visibleTiers: Set<ConfidenceTier>;
  showRejected: boolean;
  expandedAncestors: Set<string>;
  onExpandAncestor: (personId: string) => void;
  onExpandAllFrom: (personId: string) => void;
  onAddPerson: (ahnentafel: number, position: 'father' | 'mother', parentOfPersonId: string | null) => void;
  onReRoot: (personId: string) => void;
}

export const PedigreeGridView = forwardRef<PedigreeGridViewHandle, PedigreeGridViewProps>(
  function PedigreeGridView(
    {
      graph,
      rootPersonId,
      selectedPersonId,
      onSelectPerson,
      density,
      maxGenerations,
      visibleTiers,
      showRejected,
      expandedAncestors,
      onExpandAncestor,
      onExpandAllFrom,
      onAddPerson,
      onReRoot,
    },
    ref,
  ) {
    const svgRef = useRef<SVGSVGElement>(null);
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const [transform, setTransform] = useState(d3.zoomIdentity);

    const preset = GRID_DENSITY_PRESETS[density];

    // Compute layout
    const layout = useMemo(
      () =>
        computePedigreeGridLayout(
          rootPersonId,
          graph,
          maxGenerations,
          preset,
          expandedAncestors,
        ),
      [rootPersonId, graph, maxGenerations, preset, expandedAncestors],
    );

    // Filter nodes by tier visibility and rejected status
    const filteredNodes = useMemo(() => {
      return layout.nodes.filter(node => {
        if (!node.person) return false;
        if (!visibleTiers.has(node.person.confidenceTier)) return false;
        if (!showRejected && node.person.status === 'rejected') return false;
        return true;
      });
    }, [layout.nodes, visibleTiers, showRejected]);

    // Build a set of visible person IDs for connector filtering
    const visiblePersonIds = useMemo(() => {
      const ids = new Set<string>();
      for (const node of filteredNodes) {
        if (node.person) ids.add(node.person.id);
      }
      return ids;
    }, [filteredNodes]);

    // Filter connectors: both endpoints must be visible
    const filteredConnectors = useMemo(() => {
      return layout.connectors.filter(c => {
        const fromVisible = c.fromNode.person && visiblePersonIds.has(c.fromNode.person.id);
        const toVisible = c.toNode.person && visiblePersonIds.has(c.toNode.person.id);
        return fromVisible && toVisible;
      });
    }, [layout.connectors, visiblePersonIds]);

    // Filter placeholders: the child node they reference must be visible
    const filteredPlaceholders = useMemo(() => {
      return layout.placeholders.filter(ph => {
        if (ph.parentAhnentafel === null) return false;
        // Find the child node for this placeholder
        const childNode = filteredNodes.find(n => n.ahnentafel === ph.parentAhnentafel);
        return childNode !== undefined;
      });
    }, [layout.placeholders, filteredNodes]);

    // Build ahnentafel-to-node lookup for resolving child person IDs in placeholder clicks
    const nodeByAhn = useMemo(() => {
      const map = new Map<number, PedigreeGridNodeType>();
      for (const node of layout.nodes) {
        map.set(node.ahnentafel, node);
      }
      return map;
    }, [layout.nodes]);

    // Setup D3 zoom
    useEffect(() => {
      if (!svgRef.current) return;
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.05, 4])
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

    // Fit to view helper
    const fitToView = useCallback(() => {
      if (!svgRef.current || !zoomRef.current) return;
      const svg = svgRef.current;
      const width = svg.clientWidth || 800;
      const height = svg.clientHeight || 600;

      if (layout.totalWidth === 0 || layout.totalHeight === 0) return;

      const padding = 60;
      const scaleX = width / (layout.totalWidth + padding * 2);
      const scaleY = height / (layout.totalHeight + padding * 2);
      const scale = Math.min(scaleX, scaleY, 1) * 0.9;

      const centerX = layout.totalWidth / 2;
      const centerY = layout.totalHeight / 2;

      const t = d3.zoomIdentity
        .translate(width / 2 - centerX * scale, height / 2 - centerY * scale)
        .scale(scale);

      d3.select(svg)
        .transition()
        .duration(500)
        .call(zoomRef.current.transform, t);
    }, [layout.totalWidth, layout.totalHeight]);

    // Fit to view on layout change
    useEffect(() => {
      fitToView();
    }, [fitToView]);

    // Zoom handlers
    const zoomIn = useCallback(() => {
      if (!svgRef.current || !zoomRef.current) return;
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.3);
    }, []);

    const zoomOut = useCallback(() => {
      if (!svgRef.current || !zoomRef.current) return;
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.7);
    }, []);

    // Expose zoom controls via ref
    useImperativeHandle(ref, () => ({
      zoomIn,
      zoomOut,
      fitToView,
    }), [zoomIn, zoomOut, fitToView]);

    // Double-click on node re-roots
    const handleDoubleClick = useCallback((personId: string) => {
      onReRoot(personId);
    }, [onReRoot]);

    // Handle placeholder click: resolve child person ID from ahnentafel
    const handlePlaceholderClick = useCallback(
      (ahnentafel: number, position: 'father' | 'mother', _childPersonId: string | null) => {
        // Look up the child node via parentAhnentafel
        // The placeholder's parentAhnentafel is the ahnentafel of its child
        const childAhn = Math.floor(ahnentafel / 2);
        const childNode = nodeByAhn.get(childAhn);
        const resolvedChildPersonId = childNode?.person?.id ?? null;
        onAddPerson(ahnentafel, position, resolvedChildPersonId);
      },
      [nodeByAhn, onAddPerson],
    );

    return (
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        className="bg-bg"
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Connectors (below nodes) */}
          {filteredConnectors.map((connector, i) => (
            <PedigreeGridConnector
              key={`connector-${i}`}
              connector={connector}
              nodeWidth={preset.nodeW}
              nodeHeight={preset.nodeH}
            />
          ))}

          {/* Real person nodes */}
          {filteredNodes.map(node => (
            <g
              key={`node-${node.ahnentafel}`}
              onDoubleClick={() => {
                if (node.person) handleDoubleClick(node.person.id);
              }}
            >
              <PedigreeGridNode
                node={node}
                nodeWidth={preset.nodeW}
                nodeHeight={preset.nodeH}
                isSelected={node.person?.id === selectedPersonId}
                onClick={onSelectPerson}
                onExpand={onExpandAncestor}
                onExpandAll={onExpandAllFrom}
              />
            </g>
          ))}

          {/* Placeholder nodes for missing parents */}
          {filteredPlaceholders.map(ph => (
            <PlaceholderNode
              key={`placeholder-${ph.ahnentafel}`}
              node={ph}
              nodeWidth={preset.nodeW}
              nodeHeight={preset.nodeH}
              onClick={handlePlaceholderClick}
            />
          ))}
        </g>
      </svg>
    );
  },
);
