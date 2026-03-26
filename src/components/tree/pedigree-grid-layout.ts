/**
 * Ahnentafel Grid Layout Engine
 *
 * Pure layout function with no React/D3 dependencies. Computes a pedigree
 * chart layout using the Ahnentafel numbering system:
 *
 *   1 = root person (proband)
 *   2 = father of root,  3 = mother of root
 *   4 = paternal grandfather, 5 = paternal grandmother
 *   6 = maternal grandfather, 7 = maternal grandmother
 *   ...
 *   For any person at number N:  father = 2N, mother = 2N+1
 *   Generation = floor(log2(N))
 *
 * The layout assigns each person a horizontal band of rows proportional to
 * 2^(G-1-g) where G is the total visible generation count and g is the
 * person's generation. The root occupies the widest band (entire height),
 * parents each get half, grandparents each get a quarter, and so on.
 */

import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';

// ── Public types ─────────────────────────────────────────────────────

export interface PedigreeGridNode {
  person: Person | null;        // null = placeholder for unknown ancestor
  ahnentafel: number;           // 1=root, 2=father, 3=mother, etc.
  generation: number;           // 0=root, 1=parents, 2=grandparents...
  position: 'self' | 'father' | 'mother';
  parentAhnentafel: number | null;  // the child this person is parent of (floor(a/2))
  x: number;                    // horizontal position (generation axis)
  y: number;                    // vertical center within band
  bandTop: number;              // top edge of this node's row band
  bandBottom: number;           // bottom edge of this node's row band
  edgeToChild: Edge | null;     // the edge connecting this parent to their child
  hasFlags: boolean;
  isExpandable: boolean;        // has parents beyond current visible depth
  expandableDepth: number;      // how many more ancestor generations exist beyond
}

export interface PedigreeGridConnector {
  fromNode: PedigreeGridNode;   // parent (deeper generation)
  toNode: PedigreeGridNode;     // child (closer to root)
  tier: ConfidenceTier;
  hasParallelPaths: boolean;
}

export interface PedigreeGridLayout {
  nodes: PedigreeGridNode[];
  placeholders: PedigreeGridNode[];
  connectors: PedigreeGridConnector[];
  totalWidth: number;
  totalHeight: number;
}

export interface GridDensityPreset {
  columnWidth: number;
  rowHeight: number;
  nodeW: number;
  nodeH: number;
}

export const GRID_DENSITY_PRESETS: Record<'compact' | 'comfortable' | 'spacious', GridDensityPreset> = {
  compact:     { columnWidth: 220, rowHeight: 55, nodeW: 180, nodeH: 50 },
  comfortable: { columnWidth: 280, rowHeight: 70, nodeW: 220, nodeH: 62 },
  spacious:    { columnWidth: 340, rowHeight: 85, nodeW: 260, nodeH: 74 },
};

// ── Internal working types ───────────────────────────────────────────

/** Intermediate representation while building the grid */
interface WorkingNode {
  personId: string | null;
  person: Person | null;
  ahnentafel: number;
  generation: number;
  edgeToChild: Edge | null;
  /** The maximum visible generation in this node's subtree (for expanded ancestors) */
  localMaxGen: number;
}

// ── Main layout function ─────────────────────────────────────────────

/**
 * Compute the full pedigree grid layout for a root person.
 *
 * @param rootPersonId   The person to place at ahnentafel position 1
 * @param graph          The in-memory tree graph
 * @param maxGenerations Number of ancestor generations to show (e.g. 4 = root + 3 ancestor gens)
 * @param density        Column/row sizing preset
 * @param expandedAncestors  Set of person IDs whose subtrees extend beyond the base depth
 * @returns Complete layout with positioned nodes, placeholders, and connectors
 */
export function computePedigreeGridLayout(
  rootPersonId: string,
  graph: TreeGraph,
  maxGenerations: number,
  density: GridDensityPreset,
  expandedAncestors?: Set<string>,
): PedigreeGridLayout {
  const rootPerson = graph.persons.get(rootPersonId);
  if (!rootPerson) {
    return { nodes: [], placeholders: [], connectors: [], totalWidth: 0, totalHeight: 0 };
  }

  const expanded = expandedAncestors ?? new Set<string>();

  // ── Step 1: Walk the ancestor tree, collect working nodes ──────

  // We track the effective depth limit per subtree. When a person in
  // `expandedAncestors` sits at the base depth limit, their subtree
  // extends by `maxGenerations` additional generations.
  const workingNodes: WorkingNode[] = [];

  // Map from ahnentafel number to working node for child lookups
  const ahnMap = new Map<number, WorkingNode>();

  // Track the maximum generation actually populated (needed for band math)
  let globalMaxGen = 0;

  // BFS queue: [personId, ahnentafel number, current generation, local depth limit]
  const queue: Array<[string, number, number, number]> = [
    [rootPersonId, 1, 0, maxGenerations],
  ];

  // Guard against cycles (pedigree collapse / data errors)
  const visitedAhn = new Set<number>();

  while (queue.length > 0) {
    const [personId, ahn, gen, localLimit] = queue.shift()!;

    if (visitedAhn.has(ahn)) continue;
    visitedAhn.add(ahn);

    const person = graph.persons.get(personId) ?? null;

    const node: WorkingNode = {
      personId,
      person,
      ahnentafel: ahn,
      generation: gen,
      edgeToChild: null,
      localMaxGen: gen,
    };

    workingNodes.push(node);
    ahnMap.set(ahn, node);

    if (gen > globalMaxGen) globalMaxGen = gen;

    // Determine the edge connecting this person to their child (parent at floor(ahn/2))
    if (ahn > 1) {
      const childAhn = Math.floor(ahn / 2);
      const childNode = ahnMap.get(childAhn);
      if (childNode && childNode.personId) {
        const edgesToChild = graph.parentEdges.get(childNode.personId);
        if (edgesToChild) {
          const edge = edgesToChild.find(e => e.parentId === personId && e.isPrimary)
            ?? edgesToChild.find(e => e.parentId === personId);
          node.edgeToChild = edge ?? null;
        }
      }
    }

    // Stop recursing if we've reached this subtree's depth limit
    if (gen >= localLimit - 1) continue;

    // Find parent edges for this person (primary edges preferred)
    const parentEdges = graph.parentEdges.get(personId);
    if (!parentEdges || parentEdges.length === 0) continue;

    // Separate primary edges; prefer them for slot assignment
    const primaryEdges = parentEdges.filter(e => e.isPrimary);
    const edgesToUse = primaryEdges.length > 0 ? primaryEdges : parentEdges;

    // Track which ahnentafel slots (father=2*ahn, mother=2*ahn+1) are filled
    let fatherSlotFilled = false;
    let motherSlotFilled = false;

    for (const edge of edgesToUse) {
      const parent = graph.persons.get(edge.parentId);
      if (!parent) continue;

      // Determine slot based on sex
      let childAhnSlot: number;
      if (parent.sex === 'M' && !fatherSlotFilled) {
        childAhnSlot = 2 * ahn;
        fatherSlotFilled = true;
      } else if (parent.sex === 'F' && !motherSlotFilled) {
        childAhnSlot = 2 * ahn + 1;
        motherSlotFilled = true;
      } else if (parent.sex === 'U') {
        // Unknown sex: assign to first unoccupied slot
        if (!fatherSlotFilled) {
          childAhnSlot = 2 * ahn;
          fatherSlotFilled = true;
        } else if (!motherSlotFilled) {
          childAhnSlot = 2 * ahn + 1;
          motherSlotFilled = true;
        } else {
          continue; // Both slots full
        }
      } else {
        // Sex matches an already-filled slot; try the other
        if (!fatherSlotFilled) {
          childAhnSlot = 2 * ahn;
          fatherSlotFilled = true;
        } else if (!motherSlotFilled) {
          childAhnSlot = 2 * ahn + 1;
          motherSlotFilled = true;
        } else {
          continue;
        }
      }

      // Determine depth limit for this subtree
      const nextGen = gen + 1;
      let childLocalLimit = localLimit;

      // If this person is expanded and we're at or near the base depth limit,
      // extend their subtree
      if (expanded.has(parent.id) && nextGen >= maxGenerations - 1) {
        childLocalLimit = nextGen + maxGenerations;
      }

      queue.push([parent.id, childAhnSlot, nextGen, childLocalLimit]);
    }
  }

  // ── Step 2: Determine total row count from deepest generation ──

  // G = number of visible generation levels (0 through globalMaxGen inclusive)
  const G = globalMaxGen + 1;

  // Total row slots = 2^(G-1) (the number of slots at the deepest generation)
  const totalRowSlots = G > 0 ? Math.pow(2, G - 1) : 1;

  // ── Step 3: Compute coordinates for each working node ──────────

  const nodes: PedigreeGridNode[] = [];
  const placeholders: PedigreeGridNode[] = [];

  for (const wn of workingNodes) {
    const { ahnentafel: ahn, generation: gen, person, edgeToChild } = wn;

    // Band computation
    const bandSize = Math.pow(2, G - 1 - gen);
    const positionInGen = ahn - Math.pow(2, gen);
    const bandStart = positionInGen * bandSize;

    const bandTop = bandStart * density.rowHeight;
    const bandBottom = (bandStart + bandSize) * density.rowHeight;
    const y = bandTop + (bandSize * density.rowHeight) / 2;
    const x = gen * density.columnWidth;

    // Determine position label
    let position: 'self' | 'father' | 'mother';
    if (ahn === 1) {
      position = 'self';
    } else if (ahn % 2 === 0) {
      position = 'father';
    } else {
      position = 'mother';
    }

    const parentAhnentafel = ahn > 1 ? Math.floor(ahn / 2) : null;

    // Check expandability: does this person have parents beyond visible depth?
    const { isExpandable, expandableDepth } = computeExpandability(
      wn.personId,
      gen,
      G - 1, // max visible generation index
      graph,
    );

    const gridNode: PedigreeGridNode = {
      person,
      ahnentafel: ahn,
      generation: gen,
      position,
      parentAhnentafel,
      x,
      y,
      bandTop,
      bandBottom,
      edgeToChild,
      hasFlags: person ? person.flagIds.length > 0 : false,
      isExpandable,
      expandableDepth,
    };

    nodes.push(gridNode);
  }

  // ── Step 4: Generate placeholders for missing parents ──────────

  // For each node at the deepest visible generation of its subtree,
  // create placeholder nodes for empty father/mother slots if the
  // person COULD have parents (i.e., they exist in the graph).
  for (const node of nodes) {
    if (node.person === null) continue;

    // A node is at the "deepest visible edge" if it has no children
    // in the ahnMap at 2*ahn or 2*ahn+1
    const fatherAhn = 2 * node.ahnentafel;
    const motherAhn = 2 * node.ahnentafel + 1;
    const hasFatherInGrid = ahnMap.has(fatherAhn);
    const hasMotherInGrid = ahnMap.has(motherAhn);

    // Only create placeholders if at least one slot is empty and the
    // person has SOME parent edges (indicating parents exist in the data)
    // OR if one parent is present but the other is not
    if (hasFatherInGrid && hasMotherInGrid) continue;

    // Check if this person actually has parent edges we couldn't show
    const parentEdges = graph.parentEdges.get(node.person.id);
    const hasParentsInGraph = parentEdges && parentEdges.length > 0;

    // Create placeholder for missing father slot
    if (!hasFatherInGrid) {
      const shouldPlaceholder = hasParentsInGraph || hasMotherInGrid;
      if (shouldPlaceholder) {
        const placeholderGen = node.generation + 1;
        if (placeholderGen < G) {
          const placeholder = createPlaceholderNode(
            fatherAhn,
            placeholderGen,
            node.ahnentafel,
            G,
            density,
          );
          placeholders.push(placeholder);
        }
      }
    }

    // Create placeholder for missing mother slot
    if (!hasMotherInGrid) {
      const shouldPlaceholder = hasParentsInGraph || hasFatherInGrid;
      if (shouldPlaceholder) {
        const placeholderGen = node.generation + 1;
        if (placeholderGen < G) {
          const placeholder = createPlaceholderNode(
            motherAhn,
            placeholderGen,
            node.ahnentafel,
            G,
            density,
          );
          placeholders.push(placeholder);
        }
      }
    }
  }

  // ── Step 5: Build connectors between parent→child pairs ────────

  const connectors: PedigreeGridConnector[] = [];

  // Build a lookup from ahnentafel to grid node (includes real nodes only)
  const nodeByAhn = new Map<number, PedigreeGridNode>();
  for (const node of nodes) {
    nodeByAhn.set(node.ahnentafel, node);
  }

  for (const parentNode of nodes) {
    if (parentNode.ahnentafel === 1) continue; // root has no child connector
    if (parentNode.parentAhnentafel === null) continue;

    const childNode = nodeByAhn.get(parentNode.parentAhnentafel);
    if (!childNode) continue;

    // Determine confidence tier from the connecting edge
    const tier: ConfidenceTier = parentNode.edgeToChild?.confidenceTier ?? 4;

    // Check for parallel paths: does the child have multiple parent edges
    // in a parallel group?
    let hasParallelPaths = false;
    if (childNode.person) {
      const childParentEdges = graph.parentEdges.get(childNode.person.id);
      if (childParentEdges) {
        const parallelGroups = new Set(
          childParentEdges
            .filter(e => e.parallelGroupId !== null)
            .map(e => e.parallelGroupId),
        );
        hasParallelPaths = parallelGroups.size > 0;
      }
    }

    connectors.push({
      fromNode: parentNode,
      toNode: childNode,
      tier,
      hasParallelPaths,
    });
  }

  // ── Step 6: Compute total dimensions ───────────────────────────

  const totalWidth = globalMaxGen * density.columnWidth + density.nodeW;
  const totalHeight = totalRowSlots * density.rowHeight;

  return {
    nodes,
    placeholders,
    connectors,
    totalWidth,
    totalHeight,
  };
}

// ── Helper functions ─────────────────────────────────────────────────

/**
 * Create a placeholder node for an unknown/missing ancestor.
 */
function createPlaceholderNode(
  ahn: number,
  gen: number,
  parentAhnentafel: number,
  totalGenerations: number,
  density: GridDensityPreset,
): PedigreeGridNode {
  const bandSize = Math.pow(2, totalGenerations - 1 - gen);
  const positionInGen = ahn - Math.pow(2, gen);
  const bandStart = positionInGen * bandSize;

  const bandTop = bandStart * density.rowHeight;
  const bandBottom = (bandStart + bandSize) * density.rowHeight;
  const y = bandTop + (bandSize * density.rowHeight) / 2;
  const x = gen * density.columnWidth;

  return {
    person: null,
    ahnentafel: ahn,
    generation: gen,
    position: ahn % 2 === 0 ? 'father' : 'mother',
    parentAhnentafel,
    x,
    y,
    bandTop,
    bandBottom,
    edgeToChild: null,
    hasFlags: false,
    isExpandable: false,
    expandableDepth: 0,
  };
}

/**
 * Determine if a node is expandable (has ancestors beyond visible depth)
 * and count how many more generations exist.
 */
function computeExpandability(
  personId: string | null,
  currentGen: number,
  maxVisibleGen: number,
  graph: TreeGraph,
): { isExpandable: boolean; expandableDepth: number } {
  if (!personId) {
    return { isExpandable: false, expandableDepth: 0 };
  }

  // Not at the boundary -- not expandable from this node
  if (currentGen < maxVisibleGen) {
    return { isExpandable: false, expandableDepth: 0 };
  }

  // At the boundary: check if parent edges exist
  const parentEdges = graph.parentEdges.get(personId);
  if (!parentEdges || parentEdges.length === 0) {
    return { isExpandable: false, expandableDepth: 0 };
  }

  // Count how many more generations exist beyond this point via BFS
  let depth = 0;
  let frontier = [personId];
  const visited = new Set<string>([personId]);

  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      const edges = graph.parentEdges.get(id);
      if (!edges) continue;
      for (const edge of edges) {
        if (edge.isPrimary && !visited.has(edge.parentId)) {
          const parent = graph.persons.get(edge.parentId);
          if (parent) {
            visited.add(edge.parentId);
            nextFrontier.push(edge.parentId);
          }
        }
      }
    }
    if (nextFrontier.length > 0) {
      depth++;
    }
    frontier = nextFrontier;
  }

  return {
    isExpandable: depth > 0,
    expandableDepth: depth,
  };
}
