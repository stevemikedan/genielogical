import type { TreeGraph } from './tree-graph.ts';

export interface PathSegment {
  fromPersonId: string;
  toPersonId: string;
  edgeId: string;
  direction: 'parent' | 'child' | 'spouse';
}

// ── Internal types ───────────────────────────────────────────────────

interface BfsEntry {
  prev: string | null;
  segment: PathSegment | null;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Find the shortest path between two persons in the graph.
 *
 * Traverses parent edges, child edges, and spouse links.
 * Uses bidirectional BFS for performance on large graphs.
 *
 * Returns:
 *  - `[]` if `fromId === toId`
 *  - `null` if no path exists
 *  - An array of `PathSegment` describing each hop otherwise
 */
export function findPath(
  graph: TreeGraph,
  fromId: string,
  toId: string,
): PathSegment[] | null {
  // Same person — trivial path.
  if (fromId === toId) return [];

  // Validate both persons exist.
  if (!graph.getPersonById(fromId) || !graph.getPersonById(toId)) return null;

  // ── Bidirectional BFS ──────────────────────────────────────────

  const visitedForward = new Map<string, BfsEntry>();
  const visitedBackward = new Map<string, BfsEntry>();

  visitedForward.set(fromId, { prev: null, segment: null });
  visitedBackward.set(toId, { prev: null, segment: null });

  let frontierForward: string[] = [fromId];
  let frontierBackward: string[] = [toId];

  /**
   * Collect the neighbours of `personId` as PathSegments.
   */
  function neighbours(personId: string): PathSegment[] {
    const result: PathSegment[] = [];

    // Parent edges: this person is a child -> go up to parent.
    const pEdges = graph.parentEdges.get(personId);
    if (pEdges) {
      for (const edge of pEdges) {
        result.push({
          fromPersonId: personId,
          toPersonId: edge.parentId,
          edgeId: edge.id,
          direction: 'parent',
        });
      }
    }

    // Child edges: this person is a parent -> go down to child.
    const cEdges = graph.childEdges.get(personId);
    if (cEdges) {
      for (const edge of cEdges) {
        result.push({
          fromPersonId: personId,
          toPersonId: edge.childId,
          edgeId: edge.id,
          direction: 'child',
        });
      }
    }

    // Spouse links.
    const spouseIds = graph.spouseMap.get(personId);
    if (spouseIds) {
      for (const spouseId of spouseIds) {
        // Find any edge that connects these two as co-parents to get an edge id.
        const edgeId = findSharedParentEdgeId(graph, personId, spouseId);
        result.push({
          fromPersonId: personId,
          toPersonId: spouseId,
          edgeId: edgeId ?? `spouse:${personId}:${spouseId}`,
          direction: 'spouse',
        });
      }
    }

    return result;
  }

  /**
   * Expand one level of BFS from one side.
   * Returns the meeting-point person ID if the two frontiers intersect,
   * or null if they haven't met yet.
   */
  function expandLevel(
    frontier: string[],
    visited: Map<string, BfsEntry>,
    otherVisited: Map<string, BfsEntry>,
  ): { meetId: string; nextFrontier: string[] } | { meetId: null; nextFrontier: string[] } {
    const nextFrontier: string[] = [];
    for (const personId of frontier) {
      for (const seg of neighbours(personId)) {
        if (visited.has(seg.toPersonId)) continue;
        visited.set(seg.toPersonId, { prev: personId, segment: seg });
        nextFrontier.push(seg.toPersonId);

        if (otherVisited.has(seg.toPersonId)) {
          return { meetId: seg.toPersonId, nextFrontier };
        }
      }
    }
    return { meetId: null, nextFrontier };
  }

  // Alternate expanding forward and backward.
  while (frontierForward.length > 0 || frontierBackward.length > 0) {
    // Expand forward.
    if (frontierForward.length > 0) {
      const result = expandLevel(frontierForward, visitedForward, visitedBackward);
      frontierForward = result.nextFrontier;
      if (result.meetId !== null) {
        return reconstructPath(result.meetId, visitedForward, visitedBackward);
      }
    }

    // Expand backward.
    if (frontierBackward.length > 0) {
      const result = expandLevel(frontierBackward, visitedBackward, visitedForward);
      frontierBackward = result.nextFrontier;
      if (result.meetId !== null) {
        return reconstructPath(result.meetId, visitedForward, visitedBackward);
      }
    }
  }

  return null;
}

// ── Private helpers ──────────────────────────────────────────────────

/**
 * Reconstruct the path once the bidirectional BFS frontiers meet.
 *
 * The forward half is traced backward from meetId to fromId (then reversed).
 * The backward half is traced from meetId to toId -- but each segment's
 * direction needs to be flipped because it was explored in reverse.
 */
function reconstructPath(
  meetId: string,
  visitedForward: Map<string, BfsEntry>,
  visitedBackward: Map<string, BfsEntry>,
): PathSegment[] {
  // Forward half: meetId <- ... <- fromId  ->  reversed to fromId -> ... -> meetId
  const forwardSegments: PathSegment[] = [];
  let current: string | null = meetId;
  while (current !== null) {
    const entry = visitedForward.get(current);
    if (!entry || !entry.segment) break;
    forwardSegments.push(entry.segment);
    current = entry.prev;
  }
  forwardSegments.reverse();

  // Backward half: meetId <- ... <- toId  ->  flip each segment's direction
  const backwardSegments: PathSegment[] = [];
  current = meetId;
  while (current !== null) {
    const entry = visitedBackward.get(current);
    if (!entry || !entry.segment) break;
    // Flip the segment: it was recorded from toId-side toward meetId,
    // but we want meetId toward toId.
    backwardSegments.push(flipSegment(entry.segment));
    current = entry.prev;
  }

  return [...forwardSegments, ...backwardSegments];
}

/** Reverse a segment's direction. */
function flipSegment(seg: PathSegment): PathSegment {
  const flippedDirection: PathSegment['direction'] =
    seg.direction === 'parent'
      ? 'child'
      : seg.direction === 'child'
        ? 'parent'
        : 'spouse';

  return {
    fromPersonId: seg.toPersonId,
    toPersonId: seg.fromPersonId,
    edgeId: seg.edgeId,
    direction: flippedDirection,
  };
}

/**
 * Find any edge where both personA and personB are parents of the same child.
 * Returns the edge id from personA's side, or undefined if none found.
 */
function findSharedParentEdgeId(
  graph: TreeGraph,
  personA: string,
  personB: string,
): string | undefined {
  const aChildren = graph.childEdges.get(personA);
  const bChildren = graph.childEdges.get(personB);
  if (!aChildren || !bChildren) return undefined;

  const bChildIds = new Set<string>();
  for (const edge of bChildren) {
    bChildIds.add(edge.childId);
  }

  for (const edge of aChildren) {
    if (bChildIds.has(edge.childId)) {
      return edge.id;
    }
  }

  return undefined;
}
