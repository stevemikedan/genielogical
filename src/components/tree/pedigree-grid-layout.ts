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
  spouse: Person | null;        // the other parent of the child at floor(ahn/2)
}

export interface SiblingGridNode {
  person: Person;
  directLineAncestorId: string;  // which ancestor this is a sibling of
  anchorAhnentafel: number;
  generation: number;
  x: number;
  y: number;
  nodeWidth: number;
  nodeHeight: number;
  hasFlags: boolean;
  confidenceTier: ConfidenceTier;
}

export interface SiblingConnector {
  siblingNode: SiblingGridNode;
  trunkX: number;  // X of the vertical trunk from parent connector
  trunkTopY: number;
  trunkBottomY: number;
  tier: ConfidenceTier;
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
  siblings: SiblingGridNode[];
  siblingConnectors: SiblingConnector[];
  totalWidth: number;
  totalHeight: number;
}

export interface GridDensityPreset {
  columnWidth: number;
  rowHeight: number;
  nodeW: number;
  nodeH: number;
  minBandHeight: number;
  siblingNodeW: number;
  siblingNodeH: number;
  siblingGap: number;
}

export const GRID_DENSITY_PRESETS: Record<'compact' | 'comfortable' | 'spacious', GridDensityPreset> = {
  compact:     { columnWidth: 220, rowHeight: 55, nodeW: 180, nodeH: 50, minBandHeight: 60, siblingNodeW: 130, siblingNodeH: 38, siblingGap: 4 },
  comfortable: { columnWidth: 280, rowHeight: 70, nodeW: 220, nodeH: 62, minBandHeight: 72, siblingNodeW: 160, siblingNodeH: 46, siblingGap: 5 },
  spacious:    { columnWidth: 340, rowHeight: 85, nodeW: 260, nodeH: 74, minBandHeight: 84, siblingNodeW: 190, siblingNodeH: 54, siblingGap: 6 },
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
  showSiblings?: boolean,
  maxSiblingsPerFamily?: number,
): PedigreeGridLayout {
  const rootPerson = graph.persons.get(rootPersonId);
  if (!rootPerson) {
    return { nodes: [], placeholders: [], connectors: [], siblings: [], siblingConnectors: [], totalWidth: 0, totalHeight: 0 };
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

  // ── Step 1.5: Collect siblings and spouses for each ancestor ───
  //
  // For each direct-line ancestor (ahn > 1), find their siblings and
  // the spouse (the other parent of the child at floor(ahn/2)).

  const siblingCap = maxSiblingsPerFamily ?? 8;
  const siblingsMap = new Map<number, Person[]>(); // ahnentafel → siblings
  const spouseMap = new Map<number, Person>();      // ahnentafel → spouse

  if (showSiblings) {
    for (const wn of workingNodes) {
      if (wn.ahnentafel <= 1 || !wn.personId) continue;

      // Collect siblings
      const siblings = graph.getSiblings(wn.personId);
      if (siblings.length > 0) {
        // Sort by birth year (null-year last)
        const sorted = siblings.slice().sort((a, b) => {
          const ay = a.birth.date?.year ?? Infinity;
          const by = b.birth.date?.year ?? Infinity;
          return ay - by;
        });
        siblingsMap.set(wn.ahnentafel, sorted.slice(0, siblingCap));
      }

      // Resolve spouse: the other parent of child at floor(ahn/2)
      const childAhn = Math.floor(wn.ahnentafel / 2);
      const childNode = ahnMap.get(childAhn);
      if (childNode?.personId) {
        const childParentEdges = graph.parentEdges.get(childNode.personId);
        if (childParentEdges) {
          for (const edge of childParentEdges) {
            if (edge.parentId !== wn.personId) {
              const spousePerson = graph.persons.get(edge.parentId);
              if (spousePerson) {
                spouseMap.set(wn.ahnentafel, spousePerson);
                break;
              }
            }
          }
        }
      }
    }
  }

  // ── Step 2: Recursive band allocation ──────────────────────────
  //
  // Instead of global 2^(G-1) row slots, we allocate bands recursively.
  // Each child gets half of its parent's band. This means a branch
  // expanded to gen 12 subdivides its band finely, while an unexpanded
  // branch at gen 5 keeps reasonable proportions.

  // G = number of visible generation levels (0 through globalMaxGen inclusive)
  const G = globalMaxGen + 1;

  // First, count leaves under each ahnentafel to determine proper band sizes
  const leafCountMap = new Map<number, number>();

  function countLeaves(ahn: number): number {
    const cached = leafCountMap.get(ahn);
    if (cached !== undefined) return cached;

    const fatherAhn = 2 * ahn;
    const motherAhn = 2 * ahn + 1;
    const hasFather = ahnMap.has(fatherAhn);
    const hasMother = ahnMap.has(motherAhn);

    if (!hasFather && !hasMother) {
      // Leaf node — inflate for siblings if present
      let base = 1;
      if (showSiblings) {
        const sibs = siblingsMap.get(ahn);
        if (sibs && sibs.length > 0) {
          const sibStackHeight = sibs.length * (density.siblingNodeH + density.siblingGap);
          base = Math.max(1, Math.ceil(sibStackHeight / density.minBandHeight) + 1);
        }
      }
      leafCountMap.set(ahn, base);
      return base;
    }

    let count = 0;
    if (hasFather) count += countLeaves(fatherAhn);
    if (hasMother) count += countLeaves(motherAhn);

    // If only one child exists, count the missing side as 1 leaf (for placeholders)
    if (hasFather && !hasMother) count += 1;
    if (!hasFather && hasMother) count += 1;

    leafCountMap.set(ahn, count);
    return count;
  }

  const totalLeaves = countLeaves(1);
  const totalHeight = Math.max(totalLeaves * density.minBandHeight, totalLeaves * density.rowHeight);

  // Now allocate bands recursively
  interface BandAllocation {
    ahn: number;
    bandTop: number;
    bandBottom: number;
  }

  const bandAllocations = new Map<number, BandAllocation>();

  function allocateBands(ahn: number, bandTop: number, bandBottom: number): void {
    bandAllocations.set(ahn, { ahn, bandTop, bandBottom });

    const fatherAhn = 2 * ahn;
    const motherAhn = 2 * ahn + 1;
    const hasFather = ahnMap.has(fatherAhn);
    const hasMother = ahnMap.has(motherAhn);

    if (!hasFather && !hasMother) return;

    // Compute leaf counts for proportional band splitting
    const fatherLeaves = hasFather ? countLeaves(fatherAhn) : (hasMother ? 1 : 0);
    const motherLeaves = hasMother ? countLeaves(motherAhn) : (hasFather ? 1 : 0);
    const totalChildLeaves = fatherLeaves + motherLeaves;

    if (totalChildLeaves === 0) return;

    const fatherFraction = fatherLeaves / totalChildLeaves;
    const splitY = bandTop + (bandBottom - bandTop) * fatherFraction;

    if (hasFather) {
      allocateBands(fatherAhn, bandTop, splitY);
    } else if (hasMother) {
      // Allocate placeholder band for missing father
      bandAllocations.set(fatherAhn, { ahn: fatherAhn, bandTop, bandBottom: splitY });
    }

    if (hasMother) {
      allocateBands(motherAhn, splitY, bandBottom);
    } else if (hasFather) {
      // Allocate placeholder band for missing mother
      bandAllocations.set(motherAhn, { ahn: motherAhn, bandTop: splitY, bandBottom });
    }
  }

  allocateBands(1, 0, totalHeight);

  // ── Step 3: Compute coordinates for each working node ──────────

  const nodes: PedigreeGridNode[] = [];
  const placeholders: PedigreeGridNode[] = [];

  for (const wn of workingNodes) {
    const { ahnentafel: ahn, generation: gen, person, edgeToChild } = wn;

    // Get band from recursive allocation
    const band = bandAllocations.get(ahn);
    const bandTop = band ? band.bandTop : 0;
    const bandBottom = band ? band.bandBottom : totalHeight;
    const y = (bandTop + bandBottom) / 2;
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

    // Resolve spouse for non-root ancestors
    const spouse = (showSiblings && ahn > 1) ? (spouseMap.get(ahn) ?? null) : null;

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
      spouse,
    };

    nodes.push(gridNode);
  }

  // ── Step 4: Generate placeholders for missing parents ──────────

  for (const node of nodes) {
    if (node.person === null) continue;

    const fatherAhn = 2 * node.ahnentafel;
    const motherAhn = 2 * node.ahnentafel + 1;
    const hasFatherInGrid = ahnMap.has(fatherAhn);
    const hasMotherInGrid = ahnMap.has(motherAhn);

    if (hasFatherInGrid && hasMotherInGrid) continue;

    const parentEdges = graph.parentEdges.get(node.person.id);
    const hasParentsInGraph = parentEdges && parentEdges.length > 0;

    if (!hasFatherInGrid) {
      const shouldPlaceholder = hasParentsInGraph || hasMotherInGrid;
      if (shouldPlaceholder) {
        const placeholderGen = node.generation + 1;
        if (placeholderGen < G) {
          const band = bandAllocations.get(fatherAhn);
          const phBandTop = band ? band.bandTop : node.bandTop;
          const phBandBottom = band ? band.bandBottom : (node.bandTop + node.bandBottom) / 2;
          const phY = (phBandTop + phBandBottom) / 2;
          const phX = placeholderGen * density.columnWidth;

          placeholders.push({
            person: null,
            ahnentafel: fatherAhn,
            generation: placeholderGen,
            position: 'father',
            parentAhnentafel: node.ahnentafel,
            x: phX,
            y: phY,
            bandTop: phBandTop,
            bandBottom: phBandBottom,
            edgeToChild: null,
            hasFlags: false,
            isExpandable: false,
            expandableDepth: 0,
            spouse: null,
          });
        }
      }
    }

    if (!hasMotherInGrid) {
      const shouldPlaceholder = hasParentsInGraph || hasFatherInGrid;
      if (shouldPlaceholder) {
        const placeholderGen = node.generation + 1;
        if (placeholderGen < G) {
          const band = bandAllocations.get(motherAhn);
          const phBandTop = band ? band.bandTop : (node.bandTop + node.bandBottom) / 2;
          const phBandBottom = band ? band.bandBottom : node.bandBottom;
          const phY = (phBandTop + phBandBottom) / 2;
          const phX = placeholderGen * density.columnWidth;

          placeholders.push({
            person: null,
            ahnentafel: motherAhn,
            generation: placeholderGen,
            position: 'mother',
            parentAhnentafel: node.ahnentafel,
            x: phX,
            y: phY,
            bandTop: phBandTop,
            bandBottom: phBandBottom,
            edgeToChild: null,
            hasFlags: false,
            isExpandable: false,
            expandableDepth: 0,
            spouse: null,
          });
        }
      }
    }
  }

  // ── Step 4.5: Position siblings within bands ───────────────────

  const siblingNodes: SiblingGridNode[] = [];

  if (showSiblings) {
    for (const node of nodes) {
      if (node.ahnentafel <= 1 || !node.person) continue;
      const sibs = siblingsMap.get(node.ahnentafel);
      if (!sibs || sibs.length === 0) continue;

      const ancestorY = node.y;
      const { siblingNodeW, siblingNodeH, siblingGap } = density;

      // X: same generation column, centered horizontally within the ancestor node width
      const sibX = node.x + (density.nodeW - siblingNodeW) / 2;

      // Position siblings alternating above/below the ancestor
      for (let i = 0; i < sibs.length; i++) {
        const sib = sibs[i];
        const offset = Math.floor(i / 2) + 1;
        const isAbove = i % 2 === 0;
        let sibY: number;
        if (isAbove) {
          sibY = ancestorY - (density.nodeH / 2) - siblingGap - (siblingNodeH / 2)
            - (offset - 1) * (siblingNodeH + siblingGap);
        } else {
          sibY = ancestorY + (density.nodeH / 2) + siblingGap + (siblingNodeH / 2)
            + (offset - 1) * (siblingNodeH + siblingGap);
        }

        siblingNodes.push({
          person: sib,
          directLineAncestorId: node.person.id,
          anchorAhnentafel: node.ahnentafel,
          generation: node.generation,
          x: sibX,
          y: sibY,
          nodeWidth: siblingNodeW,
          nodeHeight: siblingNodeH,
          hasFlags: sib.flagIds.length > 0,
          confidenceTier: sib.confidenceTier,
        });
      }
    }
  }

  // ── Step 5: Build connectors between parent→child pairs ────────

  const connectors: PedigreeGridConnector[] = [];

  const nodeByAhn = new Map<number, PedigreeGridNode>();
  for (const node of nodes) {
    nodeByAhn.set(node.ahnentafel, node);
  }

  for (const parentNode of nodes) {
    if (parentNode.ahnentafel === 1) continue;
    if (parentNode.parentAhnentafel === null) continue;

    const childNode = nodeByAhn.get(parentNode.parentAhnentafel);
    if (!childNode) continue;

    const tier: ConfidenceTier = parentNode.edgeToChild?.confidenceTier ?? 4;

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

  // ── Step 5.5: Build sibling connectors ──────────────────────────

  const siblingConnectors: SiblingConnector[] = [];

  if (showSiblings) {
    for (const sibNode of siblingNodes) {
      const ancestorNode = nodeByAhn.get(sibNode.anchorAhnentafel);
      if (!ancestorNode) continue;

      // trunkX is the midpoint between the child column right edge and parent column left edge
      // (same as standard connectors)
      const childAhn = Math.floor(sibNode.anchorAhnentafel / 2);
      const childNode = nodeByAhn.get(childAhn);
      if (!childNode) continue;

      const childRightX = childNode.x + density.nodeW;
      const parentLeftX = ancestorNode.x;
      const trunkX = (childRightX + parentLeftX) / 2;

      siblingConnectors.push({
        siblingNode: sibNode,
        trunkX,
        trunkTopY: Math.min(ancestorNode.y, sibNode.y),
        trunkBottomY: Math.max(ancestorNode.y, sibNode.y),
        tier: sibNode.confidenceTier,
      });
    }
  }

  // ── Step 6: Compute total dimensions ───────────────────────────

  const totalWidth = globalMaxGen * density.columnWidth + density.nodeW;

  return {
    nodes,
    placeholders,
    connectors,
    siblings: siblingNodes,
    siblingConnectors,
    totalWidth,
    totalHeight,
  };
}

// ── Helper functions ─────────────────────────────────────────────────

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
