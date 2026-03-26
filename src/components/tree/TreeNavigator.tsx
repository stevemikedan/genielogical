import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import type { HierarchyPointNode, HierarchyPointLink } from 'd3';
import type { ConfidenceTier } from '@/types/common.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { buildPedigreeHierarchy, buildDescendantHierarchy, buildDirectLineHierarchy } from './tree-data-adapter.ts';
import type { TreeHierarchyNode } from './tree-data-adapter.ts';
import { TreeNode } from './TreeNode.tsx';
import type { DetailLevel } from './TreeNode.tsx';
import { TreeEdge } from './TreeEdge.tsx';
import { EdgeTooltip } from './EdgeTooltip.tsx';
import { TreeControls, DENSITY_PRESETS } from './TreeControls.tsx';
import type { ViewMode, TreeDensity, TreeOrientation } from './TreeControls.tsx';
import { TreeMinimap } from './TreeMinimap.tsx';
import { PedigreeGridView } from './PedigreeGridView.tsx';
import type { PedigreeGridViewHandle } from './PedigreeGridView.tsx';
import { FanChartView } from './FanChartView.tsx';
import type { FanChartViewHandle } from './FanChartView.tsx';
import type { FanMode } from './fan-chart-layout.ts';
import { LineagePathView } from './LineagePathView.tsx';
import type { LineagePathViewHandle } from './LineagePathView.tsx';
import { AddPersonModal } from '@/components/shared/AddPersonModal.tsx';
import { generateEdgeId } from '@/utils/id-generator.ts';
import type { Edge } from '@/types/edge.ts';
import { useTree } from '@/hooks/use-tree.ts';

interface TreeNavigatorProps {
  graph: TreeGraph;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
  expandToAncestor?: string | null;
  onClearExpandTarget?: () => void;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  confidenceTier: ConfidenceTier;
  confidenceReason: string;
  relationshipType: string;
  sourceCount: number;
}

type PointNode = HierarchyPointNode<TreeHierarchyNode>;
type PointLink = HierarchyPointLink<TreeHierarchyNode>;

/** Convert D3 hierarchy coordinates to SVG x,y based on orientation */
function toSvg(dx: number, dy: number, orientation: TreeOrientation): { sx: number; sy: number } {
  switch (orientation) {
    case 'horizontal':
      return { sx: dy, sy: dx };
    case 'vertical-down':
      return { sx: dx, sy: dy };
    case 'vertical-up':
      return { sx: dx, sy: -dy };
  }
}

function computeFitTransform(
  nodes: PointNode[],
  svgWidth: number,
  svgHeight: number,
  orientation: TreeOrientation,
  padding: number = 80,
): d3.ZoomTransform {
  // Convert all node positions to SVG coordinates
  const svgCoords = nodes.map(n => toSvg(n.x, n.y, orientation));
  const xs = svgCoords.map(c => c.sx);
  const ys = svgCoords.map(c => c.sy);

  const minX = Math.min(...xs) - padding;
  const maxX = Math.max(...xs) + padding;
  const minY = Math.min(...ys) - padding;
  const maxY = Math.max(...ys) + padding;

  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;

  const scaleX = svgWidth / contentWidth;
  const scaleY = svgHeight / contentHeight;
  const scale = Math.min(scaleX, scaleY, 1) * 0.9;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return d3.zoomIdentity
    .translate(svgWidth / 2 - centerX * scale, svgHeight / 2 - centerY * scale)
    .scale(scale);
}

/**
 * Compute highlight path: walk primary parent edges from selected person to root.
 */
function computeHighlightPath(personId: string, graph: TreeGraph): Set<string> {
  const path = new Set<string>();
  const visited = new Set<string>();
  let current = personId;

  while (true) {
    if (visited.has(current)) break;
    visited.add(current);
    path.add(current);

    const parentEdges = graph.parentEdges.get(current);
    const primaryEdge = parentEdges?.find(e => e.isPrimary);
    if (!primaryEdge) break;
    current = primaryEdge.parentId;
  }

  return path;
}

/**
 * Compute primary parent chain from rootPersonId up to targetPersonId.
 * Returns all person IDs along the chain (to add to expandedAncestors).
 */
function computeChainToAncestor(rootPersonId: string, targetPersonId: string, graph: TreeGraph): Set<string> {
  const chain = new Set<string>();
  const visited = new Set<string>();
  let current = rootPersonId;

  while (true) {
    if (visited.has(current)) break;
    visited.add(current);
    chain.add(current);

    if (current === targetPersonId) break;

    const parentEdges = graph.parentEdges.get(current);
    const primaryEdge = parentEdges?.find(e => e.isPrimary);
    if (!primaryEdge) break;
    current = primaryEdge.parentId;
  }

  return chain;
}

/**
 * Determine detail level from D3 zoom scale.
 */
function getDetailLevel(zoomScale: number): DetailLevel {
  if (zoomScale >= 0.5) return 'full';
  if (zoomScale >= 0.25) return 'abbreviated';
  return 'dot';
}

export function TreeNavigator({ graph, selectedPersonId, onSelectPerson, expandToAncestor, onClearExpandTarget }: TreeNavigatorProps) {
  const { dispatch } = useTree();

  const initialRoot = useMemo(() => {
    if (selectedPersonId && graph.persons.has(selectedPersonId)) return selectedPersonId;
    const leaves = graph.getLeaves();
    if (leaves.length > 0) return leaves[0].id;
    const first = graph.persons.keys().next();
    return first.done ? '' : first.value;
  }, [graph, selectedPersonId]);

  const [rootPersonId, setRootPersonId] = useState(initialRoot);
  const [viewMode, setViewMode] = useState<ViewMode>('pedigree');
  const [maxGenerations, setMaxGenerations] = useState(5);
  const [visibleTiers, setVisibleTiers] = useState<Set<ConfidenceTier>>(new Set([1, 2, 3, 4]));
  const [showRejected, setShowRejected] = useState(false);
  const [density, setDensity] = useState<TreeDensity>('compact');
  const [orientation, setOrientation] = useState<TreeOrientation>('horizontal');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [expandedAncestors, setExpandedAncestors] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, confidenceTier: 3, confidenceReason: '', relationshipType: '', sourceCount: 0,
  });
  const [transform, setTransform] = useState(d3.zoomIdentity);

  const [fanMode, setFanMode] = useState<FanMode>('semi');

  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gridViewRef = useRef<PedigreeGridViewHandle>(null);
  const fanChartRef = useRef<FanChartViewHandle>(null);
  const lineagePathRef = useRef<LineagePathViewHandle>(null);

  // State for placeholder-triggered add person (pedigreeGrid mode)
  const [pendingAdd, setPendingAdd] = useState<{ sex: 'M' | 'F'; connectToChildId: string | null } | null>(null);

  const preset = DENSITY_PRESETS[density];
  const detailLevel = getDetailLevel(transform.k);

  // Highlight path computation
  const highlightPath = useMemo(() => {
    if (!selectedPersonId) return new Set<string>();
    return computeHighlightPath(selectedPersonId, graph);
  }, [selectedPersonId, graph]);

  const isHighlightActive = selectedPersonId !== null && highlightPath.size > 1;

  // Build hierarchy (not used for fan or pedigreeGrid — they have their own layout)
  const hierarchyRoot = useMemo(() => {
    if (!rootPersonId) return null;
    if (viewMode === 'fan' || viewMode === 'pedigreeGrid' || viewMode === 'lineagePath') return null;
    if (viewMode === 'directLine') {
      return buildDirectLineHierarchy(rootPersonId, graph, maxGenerations, expandedNodes, expandedAncestors);
    }
    return viewMode === 'pedigree'
      ? buildPedigreeHierarchy(rootPersonId, graph, maxGenerations, expandedAncestors)
      : buildDescendantHierarchy(rootPersonId, graph, maxGenerations, expandedAncestors);
  }, [rootPersonId, graph, viewMode, maxGenerations, expandedNodes, expandedAncestors]);

  // Compute layout
  const layoutData = useMemo<PointNode | null>(() => {
    if (!hierarchyRoot) return null;

    const root = d3.hierarchy(hierarchyRoot, d => d.children);

    // For horizontal: siblings spread vertically (x = vSpacing), depth horizontal (y = hSpacing)
    // For vertical: siblings spread horizontally (x = hSpacing), depth vertical (y = vSpacing)
    const isVertical = orientation !== 'horizontal';
    const nodeSize: [number, number] = isVertical
      ? [preset.hSpacing, preset.vSpacing]
      : [preset.vSpacing, preset.hSpacing];

    const treeLayout = d3.tree<TreeHierarchyNode>()
      .nodeSize(nodeSize);

    return treeLayout(root);
  }, [hierarchyRoot, orientation, preset]);

  // Filter nodes by visibility
  const visibleNodes = useMemo<PointNode[]>(() => {
    if (!layoutData) return [];
    return layoutData.descendants().filter(node => {
      const person = node.data.person;
      if (!visibleTiers.has(person.confidenceTier)) return false;
      if (!showRejected && person.status === 'rejected') return false;
      return true;
    });
  }, [layoutData, visibleTiers, showRejected]);

  const visibleLinks = useMemo<PointLink[]>(() => {
    if (!layoutData) return [];
    return layoutData.links().filter(link => {
      const sourcePerson = link.source.data.person;
      const targetPerson = link.target.data.person;
      if (!visibleTiers.has(sourcePerson.confidenceTier)) return false;
      if (!visibleTiers.has(targetPerson.confidenceTier)) return false;
      if (!showRejected && (sourcePerson.status === 'rejected' || targetPerson.status === 'rejected')) return false;
      return true;
    });
  }, [layoutData, visibleTiers, showRejected]);

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
      d3.select(svgRef.current!).on('.zoom', null);
    };
  }, []);

  // Fit to view when layout or orientation changes
  useEffect(() => {
    if (!svgRef.current || !layoutData || !zoomRef.current) return;
    const svg = svgRef.current;
    const nodes = layoutData.descendants();
    if (nodes.length === 0) return;

    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 600;
    const t = computeFitTransform(nodes, width, height, orientation);

    d3.select(svg)
      .transition()
      .duration(500)
      .call(zoomRef.current.transform, t);
  }, [layoutData, orientation, preset]);

  // React to expandToAncestor intent
  useEffect(() => {
    if (!expandToAncestor || !rootPersonId || !graph) return;

    const chain = computeChainToAncestor(rootPersonId, expandToAncestor, graph);
    if (chain.size > 0) {
      setExpandedAncestors(prev => {
        const next = new Set(prev);
        for (const id of chain) {
          next.add(id);
        }
        return next;
      });
    }

    onClearExpandTarget?.();
  }, [expandToAncestor, rootPersonId, graph, onClearExpandTarget]);

  const handleZoomIn = useCallback(() => {
    if (viewMode === 'pedigreeGrid') {
      gridViewRef.current?.zoomIn();
      return;
    }
    if (viewMode === 'fan') {
      fanChartRef.current?.zoomIn();
      return;
    }
    if (viewMode === 'lineagePath') {
      lineagePathRef.current?.zoomIn();
      return;
    }
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.2);
  }, [viewMode]);

  const handleZoomOut = useCallback(() => {
    if (viewMode === 'pedigreeGrid') {
      gridViewRef.current?.zoomOut();
      return;
    }
    if (viewMode === 'fan') {
      fanChartRef.current?.zoomOut();
      return;
    }
    if (viewMode === 'lineagePath') {
      lineagePathRef.current?.zoomOut();
      return;
    }
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1 / 1.2);
  }, [viewMode]);

  const handleFitToView = useCallback(() => {
    if (viewMode === 'pedigreeGrid') {
      gridViewRef.current?.fitToView();
      return;
    }
    if (viewMode === 'fan') {
      fanChartRef.current?.fitToView();
      return;
    }
    if (viewMode === 'lineagePath') {
      lineagePathRef.current?.fitToView();
      return;
    }
    if (!svgRef.current || !layoutData || !zoomRef.current) return;
    const svg = svgRef.current;
    const nodes = layoutData.descendants();
    if (nodes.length === 0) return;

    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 600;
    const t = computeFitTransform(nodes, width, height, orientation);

    d3.select(svg).transition().duration(500).call(zoomRef.current.transform, t);
  }, [viewMode, layoutData, orientation]);

  const handleCenterOnSelected = useCallback(() => {
    if (viewMode === 'pedigreeGrid') {
      gridViewRef.current?.centerOnSelected();
      return;
    }
    if (viewMode === 'fan') {
      fanChartRef.current?.centerOnSelected();
      return;
    }
    if (viewMode === 'lineagePath') {
      lineagePathRef.current?.centerOnSelected();
      return;
    }
    if (!svgRef.current || !zoomRef.current || !layoutData) return;
    if (!selectedPersonId) {
      handleFitToView();
      return;
    }
    const node = layoutData.descendants().find(n => n.data.person.id === selectedPersonId);
    if (!node) {
      handleFitToView();
      return;
    }
    const svg = svgRef.current;
    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 600;
    const { sx, sy } = toSvg(node.x, node.y, orientation);
    const scale = Math.min(transform.k, 1);
    const t = d3.zoomIdentity
      .translate(width / 2 - sx * scale, height / 2 - sy * scale)
      .scale(scale);
    d3.select(svg).transition().duration(400).call(zoomRef.current.transform, t);
  }, [viewMode, selectedPersonId, layoutData, orientation, transform.k, handleFitToView]);

  // Keyboard shortcuts for zoom
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === '=' || e.key === '+') { handleZoomIn(); e.preventDefault(); }
      else if (e.key === '-') { handleZoomOut(); e.preventDefault(); }
      else if (e.key === '0') { handleFitToView(); e.preventDefault(); }
      else if (e.key === 'c' && !e.ctrlKey && !e.metaKey) { handleCenterOnSelected(); e.preventDefault(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleZoomIn, handleZoomOut, handleFitToView, handleCenterOnSelected]);

  const handleMinimapNavigate = useCallback((x: number, y: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = svgRef.current;
    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 600;

    const t = d3.zoomIdentity
      .translate(width / 2 - x * transform.k, height / 2 - y * transform.k)
      .scale(transform.k);

    d3.select(svg).transition().duration(300).call(zoomRef.current.transform, t);
  }, [transform]);

  const handleExpandSiblings = useCallback((personId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.add(personId);
      return next;
    });
  }, []);

  const handleExpandAncestor = useCallback((personId: string) => {
    setExpandedAncestors(prev => {
      const next = new Set(prev);
      next.add(personId);
      return next;
    });
  }, []);

  // Combined expand handler: in directLine mode, determine which kind based on node state
  const handleExpand = useCallback((personId: string) => {
    if (viewMode === 'directLine') {
      // Check if it's a sibling expand or ancestor expand by looking at the node
      // If the node is at depth limit with unshown parents, it's an ancestor expand
      // Otherwise it's a sibling expand. We handle both by trying both.
      // The data adapter handles the logic of what to show.
      handleExpandSiblings(personId);
      handleExpandAncestor(personId);
    } else {
      handleExpandAncestor(personId);
    }
  }, [viewMode, handleExpandSiblings, handleExpandAncestor]);

  // Expand-all handler for pedigreeGrid: walk all primary parent edges from node to leaves
  const handleExpandAllFrom = useCallback((personId: string) => {
    setExpandedAncestors(prev => {
      const next = new Set(prev);
      const visited = new Set<string>();
      const queue = [personId];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        next.add(current);
        const parentEdges = graph.parentEdges.get(current);
        if (parentEdges) {
          for (const edge of parentEdges) {
            if (edge.isPrimary && !visited.has(edge.parentId)) {
              queue.push(edge.parentId);
            }
          }
        }
      }
      return next;
    });
  }, [graph]);

  // Handle add person from placeholder click in pedigreeGrid mode
  const handleGridAddPerson = useCallback((_ahnentafel: number, position: 'father' | 'mother', parentOfPersonId: string | null) => {
    const sex: 'M' | 'F' = position === 'father' ? 'M' : 'F';
    setPendingAdd({ sex, connectToChildId: parentOfPersonId });
  }, []);

  // Handle person created from add-person modal triggered by placeholder
  const handlePendingPersonCreated = useCallback((personId: string) => {
    // Create edge connecting the new parent to the child
    if (pendingAdd?.connectToChildId) {
      const edge: Edge = {
        id: generateEdgeId(),
        parentId: personId,
        childId: pendingAdd.connectToChildId,
        relationshipType: 'biological',
        legitimacy: 'unknown',
        marriage: null,
        confidenceTier: 4,
        confidenceReason: 'Newly created, no sources',
        parallelGroupId: null,
        isPrimary: true,
        pathLabel: null,
        sourceIds: [],
        flagIds: [],
        familyGedcomXref: null,
        createdAt: new Date(),
      };
      dispatch({ type: 'ADD_EDGE', edge });
    }
    onSelectPerson(personId);
    setPendingAdd(null);
  }, [pendingAdd, dispatch, onSelectPerson]);

  // Compute minimap data using SVG coordinates
  const minimapData = useMemo(() => {
    if (!layoutData) return { nodes: [] as Array<{ x: number; y: number }>, fullBounds: { x: 0, y: 0, width: 0, height: 0 } };
    const nodes = layoutData.descendants().map(n => {
      const { sx, sy } = toSvg(n.x, n.y, orientation);
      return { x: sx, y: sy };
    });
    if (nodes.length === 0) return { nodes, fullBounds: { x: 0, y: 0, width: 0, height: 0 } };

    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      nodes,
      fullBounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    };
  }, [layoutData, orientation]);

  const viewportBounds = useMemo(() => {
    const width = 800;
    const height = 600;
    return {
      x: -transform.x / transform.k,
      y: -transform.y / transform.k,
      width: width / transform.k,
      height: height / transform.k,
    };
  }, [transform]);

  // Reset expanded nodes when view mode changes
  useEffect(() => {
    setExpandedNodes(new Set());
    setExpandedAncestors(new Set());
  }, [viewMode]);

  if (!rootPersonId || graph.persons.size === 0) {
    return (
      <div className="text-center py-12 text-text-dim">
        No tree data to display.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <TreeControls
        graph={graph}
        rootPersonId={rootPersonId}
        onRootChange={setRootPersonId}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        maxGenerations={maxGenerations}
        onMaxGenerationsChange={setMaxGenerations}
        visibleTiers={visibleTiers}
        onVisibleTiersChange={setVisibleTiers}
        showRejected={showRejected}
        onShowRejectedChange={setShowRejected}
        density={density}
        onDensityChange={setDensity}
        orientation={orientation}
        onOrientationChange={setOrientation}
        fanMode={fanMode}
        onFanModeChange={setFanMode}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToView={handleFitToView}
        onCenterOnSelected={handleCenterOnSelected}
      />

      <div className="relative border border-border rounded-lg overflow-hidden" style={{ height: '70vh' }}>
        {viewMode === 'fan' ? (
          <FanChartView
            ref={fanChartRef}
            graph={graph}
            rootPersonId={rootPersonId}
            selectedPersonId={selectedPersonId}
            onSelectPerson={onSelectPerson}
            density={density}
            maxGenerations={maxGenerations}
            visibleTiers={visibleTiers}
            showRejected={showRejected}
            fanMode={fanMode}
            onReRoot={setRootPersonId}
          />
        ) : viewMode === 'lineagePath' ? (
          <LineagePathView
            ref={lineagePathRef}
            graph={graph}
            rootPersonId={rootPersonId}
            selectedPersonId={selectedPersonId}
            onSelectPerson={onSelectPerson}
            onReRoot={setRootPersonId}
          />
        ) : viewMode === 'pedigreeGrid' ? (
          <PedigreeGridView
            ref={gridViewRef}
            graph={graph}
            rootPersonId={rootPersonId}
            selectedPersonId={selectedPersonId}
            onSelectPerson={onSelectPerson}
            density={density}
            maxGenerations={maxGenerations}
            visibleTiers={visibleTiers}
            showRejected={showRejected}
            expandedAncestors={expandedAncestors}
            onExpandAncestor={handleExpandAncestor}
            onExpandAllFrom={handleExpandAllFrom}
            onAddPerson={handleGridAddPerson}
            onReRoot={setRootPersonId}
          />
        ) : (
          <>
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              className="bg-bg"
            >
              <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                {/* Edges (rendered first, below nodes) */}
                {visibleLinks.map((link, i) => {
                  const edge = link.target.data.edgeToParent;
                  const sourceId = link.source.data.person.id;
                  const targetId = link.target.data.person.id;
                  const bothOnPath = highlightPath.has(sourceId) && highlightPath.has(targetId);
                  return (
                    <TreeEdge
                      key={`edge-${i}`}
                      sourcePoint={{ x: link.source.x, y: link.source.y }}
                      targetPoint={{ x: link.target.x, y: link.target.y }}
                      confidenceTier={edge?.confidenceTier ?? 3}
                      hasParallelPaths={link.target.data.hasParallelPaths}
                      orientation={orientation}
                      isOnHighlightPath={bothOnPath}
                      isHighlightActive={isHighlightActive}
                      onMouseEnter={(e) => {
                        const rect = svgRef.current?.getBoundingClientRect();
                        if (rect) {
                          setTooltip({
                            visible: true,
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top,
                            confidenceTier: edge?.confidenceTier ?? 3,
                            confidenceReason: edge?.confidenceReason ?? '',
                            relationshipType: edge?.relationshipType ?? 'unknown',
                            sourceCount: edge?.sourceIds.length ?? 0,
                          });
                        }
                      }}
                      onMouseLeave={() => setTooltip(prev => ({ ...prev, visible: false }))}
                    />
                  );
                })}

                {/* Nodes */}
                {visibleNodes.map(node => (
                  <TreeNode
                    key={node.data.person.id}
                    node={node}
                    isSelected={node.data.person.id === selectedPersonId}
                    onClick={onSelectPerson}
                    nodeWidth={preset.nodeW}
                    nodeHeight={preset.nodeH}
                    fontSize={preset.fontSize}
                    detailLevel={detailLevel}
                    isOnHighlightPath={highlightPath.has(node.data.person.id)}
                    isHighlightActive={isHighlightActive}
                    onExpand={handleExpand}
                    orientation={orientation}
                  />
                ))}
              </g>
            </svg>

            {/* Edge tooltip (HTML overlay) */}
            <EdgeTooltip {...tooltip} />

            {/* Minimap */}
            <TreeMinimap
              nodes={minimapData.nodes}
              viewportBounds={viewportBounds}
              fullBounds={minimapData.fullBounds}
              onNavigate={handleMinimapNavigate}
              orientation={orientation}
            />
          </>
        )}
      </div>

      {/* Add Person modal for placeholder clicks in grid mode */}
      {pendingAdd && (
        <AddPersonModal
          onClose={() => setPendingAdd(null)}
          onCreated={handlePendingPersonCreated}
          defaultSex={pendingAdd.sex}
        />
      )}
    </div>
  );
}
