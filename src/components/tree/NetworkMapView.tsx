import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import * as d3 from 'd3';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import { buildNetworkGraph } from './network-map-data.ts';
import type { NetworkNode, NetworkLink, NetworkLayoutConfig } from './network-map-data.ts';
import { NetworkMapNode } from './NetworkMapNode.tsx';
import { NetworkMapLink, NetworkArrowDefs } from './NetworkMapLink.tsx';
import { NetworkControls } from './NetworkControls.tsx';
import { EdgeTooltip } from './EdgeTooltip.tsx';

export interface NetworkMapViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: () => void;
  centerOnSelected: () => void;
}

interface NetworkMapViewProps {
  graph: TreeGraph;
  rootPersonId: string;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
  visibleTiers: Set<ConfidenceTier>;
  showRejected: boolean;
  onReRoot: (personId: string) => void;
}

const LINK_DISTANCES: Record<string, number> = {
  spouse: 60,
  'parent-child': 120,
  sibling: 180,
};
const LINK_STRENGTHS: Record<string, number> = {
  spouse: 1.0,
  'parent-child': 0.7,
  sibling: 0.2,
};

export const NetworkMapView = forwardRef<NetworkMapViewHandle, NetworkMapViewProps>(
  function NetworkMapView(
    { graph, rootPersonId, selectedPersonId, onSelectPerson, visibleTiers, showRejected, onReRoot },
    ref,
  ) {
    const svgRef = useRef<SVGSVGElement>(null);
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const simulationRef = useRef<d3.Simulation<NetworkNode, NetworkLink> | null>(null);
    const [transform, setTransform] = useState(d3.zoomIdentity);
    const [tickCount, setTickCount] = useState(0);
    const tickCounterRef = useRef(0);

    // Network-specific controls state
    const [generationRadius, setGenerationRadius] = useState(5);
    const [showParentChild, setShowParentChild] = useState(true);
    const [showSpouse, setShowSpouse] = useState(true);
    const [showSibling, setShowSibling] = useState(true);
    const [isPaused, setIsPaused] = useState(false);

    // Tooltip state
    const [tooltip, setTooltip] = useState<{
      x: number; y: number;
      link: NetworkLink;
      visible: boolean;
    } | null>(null);

    // Drag state
    const dragNodeRef = useRef<NetworkNode | null>(null);
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);

    // Build config
    const config = useMemo<NetworkLayoutConfig>(() => ({
      generationRadius,
      showParentChild,
      showSpouse,
      showSibling,
      visibleTiers,
      showRejected,
    }), [generationRadius, showParentChild, showSpouse, showSibling, visibleTiers, showRejected]);

    // Build graph data
    const networkData = useMemo(
      () => buildNetworkGraph(rootPersonId, graph, config),
      [rootPersonId, graph, config],
    );

    // Keep a ref to previous node positions for warm start
    const prevPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

    // Setup / update force simulation
    useEffect(() => {
      // Stop any previous simulation
      if (simulationRef.current) {
        simulationRef.current.stop();
      }

      const { nodes, links } = networkData;
      if (nodes.length === 0) {
        simulationRef.current = null;
        return;
      }

      // Warm start: reuse previous positions
      const prevPos = prevPositionsRef.current;
      for (const node of nodes) {
        const prev = prevPos.get(node.id);
        if (prev) {
          node.x = prev.x;
          node.y = prev.y;
        }
      }

      const simulation = d3.forceSimulation<NetworkNode, NetworkLink>(nodes)
        .force('charge', d3.forceManyBody<NetworkNode>().strength(-150))
        .force('link', d3.forceLink<NetworkNode, NetworkLink>(links)
          .id(d => d.id)
          .distance(d => LINK_DISTANCES[d.linkType] ?? 120)
          .strength(d => LINK_STRENGTHS[d.linkType] ?? 0.5))
        .force('center', d3.forceCenter(0, 0).strength(0.05))
        .force('collide', d3.forceCollide<NetworkNode>(30))
        .alphaDecay(0.01)
        .velocityDecay(0.4)
        .on('tick', () => {
          tickCounterRef.current++;
          // Throttle: update React every 2nd tick
          if (tickCounterRef.current % 2 === 0) {
            // Save positions for warm start
            const posMap = new Map<string, { x: number; y: number }>();
            for (const n of nodes) {
              posMap.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
            }
            prevPositionsRef.current = posMap;

            setTickCount(c => c + 1);
          }
        });

      simulationRef.current = simulation;

      if (isPaused) {
        simulation.stop();
      }

      return () => {
        simulation.stop();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [networkData]);

    // Handle pause/resume
    useEffect(() => {
      if (!simulationRef.current) return;
      if (isPaused) {
        simulationRef.current.stop();
      } else {
        simulationRef.current.alpha(0.3).restart();
      }
    }, [isPaused]);

    // Setup D3 zoom
    useEffect(() => {
      if (!svgRef.current) return;
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.05, 8])
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

    // Fit to view
    const fitToView = useCallback(() => {
      if (!svgRef.current || !zoomRef.current) return;
      const { nodes } = networkData;
      if (nodes.length === 0) return;

      const svg = svgRef.current;
      const width = svg.clientWidth || 800;
      const height = svg.clientHeight || 600;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of nodes) {
        const nx = n.x ?? 0;
        const ny = n.y ?? 0;
        if (nx < minX) minX = nx;
        if (nx > maxX) maxX = nx;
        if (ny < minY) minY = ny;
        if (ny > maxY) maxY = ny;
      }

      const padding = 80;
      const bw = maxX - minX + padding * 2;
      const bh = maxY - minY + padding * 2;
      const scale = Math.min(width / bw, height / bh, 2) * 0.9;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      const t = d3.zoomIdentity
        .translate(width / 2 - cx * scale, height / 2 - cy * scale)
        .scale(scale);

      d3.select(svg).transition().duration(500).call(zoomRef.current.transform, t);
    }, [networkData]);

    // Auto-fit once the simulation has settled a bit (after first data load)
    const hasAutoFitRef = useRef(false);
    useEffect(() => {
      if (tickCount > 10 && !hasAutoFitRef.current && networkData.nodes.length > 0) {
        hasAutoFitRef.current = true;
        fitToView();
      }
    }, [tickCount, fitToView, networkData.nodes.length]);

    // Reset auto-fit when root changes
    useEffect(() => {
      hasAutoFitRef.current = false;
    }, [rootPersonId]);

    const handleZoomIn = useCallback(() => {
      if (!svgRef.current || !zoomRef.current) return;
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.5);
    }, []);

    const handleZoomOut = useCallback(() => {
      if (!svgRef.current || !zoomRef.current) return;
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1 / 1.5);
    }, []);

    const handleCenterOnSelected = useCallback(() => {
      if (!svgRef.current || !zoomRef.current || !selectedPersonId) return;
      const node = networkData.nodes.find(n => n.id === selectedPersonId);
      if (!node) return;

      const svg = svgRef.current;
      const width = svg.clientWidth || 800;
      const height = svg.clientHeight || 600;
      const currentScale = transform.k;

      const t = d3.zoomIdentity
        .translate(width / 2 - (node.x ?? 0) * currentScale, height / 2 - (node.y ?? 0) * currentScale)
        .scale(currentScale);

      d3.select(svg).transition().duration(500).call(zoomRef.current.transform, t);
    }, [selectedPersonId, networkData.nodes, transform.k]);

    useImperativeHandle(ref, () => ({
      zoomIn: handleZoomIn,
      zoomOut: handleZoomOut,
      fitToView,
      centerOnSelected: handleCenterOnSelected,
    }));

    // Node click
    const handleNodeClick = useCallback((personId: string) => {
      onSelectPerson(personId);
    }, [onSelectPerson]);

    // Node double-click → re-root
    const handleNodeDoubleClick = useCallback((personId: string) => {
      onReRoot(personId);
    }, [onReRoot]);

    // Drag handlers via pointer events
    const handlePointerDown = useCallback((e: React.PointerEvent, node: NetworkNode) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      dragNodeRef.current = node;
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      // Pin node
      node.fx = node.x;
      node.fy = node.y;

      // Reheat simulation
      if (simulationRef.current && !isPaused) {
        simulationRef.current.alphaTarget(0.3).restart();
      }
    }, [isPaused]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
      const node = dragNodeRef.current;
      if (!node || !dragStartRef.current) return;

      // Convert screen delta to graph-space delta
      const k = transform.k;
      const dx = (e.clientX - dragStartRef.current.x) / k;
      const dy = (e.clientY - dragStartRef.current.y) / k;

      node.fx = (node.x ?? 0) + dx;
      node.fy = (node.y ?? 0) + dy;
      node.x = node.fx;
      node.y = node.fy;

      dragStartRef.current = { x: e.clientX, y: e.clientY };

      // Force re-render
      setTickCount(c => c + 1);
    }, [transform.k]);

    const handlePointerUp = useCallback(() => {
      const node = dragNodeRef.current;
      if (node) {
        // Unpin node
        node.fx = null;
        node.fy = null;
      }
      dragNodeRef.current = null;
      dragStartRef.current = null;

      // Cool down simulation
      if (simulationRef.current && !isPaused) {
        simulationRef.current.alphaTarget(0);
      }
    }, [isPaused]);

    // Link hover tooltip
    const handleLinkMouseEnter = useCallback((e: React.MouseEvent, link: NetworkLink) => {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        link,
        visible: true,
      });
    }, []);

    const handleLinkMouseLeave = useCallback(() => {
      setTooltip(null);
    }, []);

    // Suppress the tickCount lint — it forces re-render to read updated node positions
    void tickCount;

    const { nodes, links, stats } = networkData;

    return (
      <div className="relative w-full h-full" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="bg-bg"
        >
          <defs>
            <NetworkArrowDefs />
          </defs>
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {/* Links first (behind nodes) */}
            {links.map(link => (
              <NetworkMapLink
                key={link.id}
                link={link}
                zoomScale={transform.k}
                onMouseEnter={handleLinkMouseEnter}
                onMouseLeave={handleLinkMouseLeave}
              />
            ))}
            {/* Nodes on top */}
            {nodes.map(node => (
              <NetworkMapNode
                key={node.id}
                node={node}
                isSelected={node.id === selectedPersonId}
                isRoot={node.id === rootPersonId}
                onClick={handleNodeClick}
                onDoubleClick={handleNodeDoubleClick}
                onPointerDown={handlePointerDown}
                zoomScale={transform.k}
              />
            ))}
          </g>
        </svg>

        {/* Tooltip */}
        {tooltip?.visible && tooltip.link && (
          <EdgeTooltip
            x={tooltip.x}
            y={tooltip.y}
            confidenceTier={tooltip.link.confidenceTier}
            confidenceReason={tooltip.link.edge?.confidenceReason}
            relationshipType={tooltip.link.linkType === 'parent-child'
              ? (tooltip.link.edge?.relationshipType ?? 'parent-child')
              : tooltip.link.linkType}
            sourceCount={tooltip.link.edge?.sourceIds.length ?? 0}
            visible={true}
          />
        )}

        {/* Controls */}
        <NetworkControls
          generationRadius={generationRadius}
          onRadiusChange={setGenerationRadius}
          showParentChild={showParentChild}
          onShowParentChildChange={setShowParentChild}
          showSpouse={showSpouse}
          onShowSpouseChange={setShowSpouse}
          showSibling={showSibling}
          onShowSiblingChange={setShowSibling}
          isPaused={isPaused}
          onTogglePause={() => setIsPaused(p => !p)}
          nodeCount={stats.totalPersons}
          linkCount={stats.totalLinks}
        />
      </div>
    );
  },
);
