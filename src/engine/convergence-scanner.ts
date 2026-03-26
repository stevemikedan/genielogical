import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { ConvergencePoint } from '@/types/conflict.ts';

/**
 * Scan for convergence points — ancestors reached through multiple paths
 * that may have different intermediary ancestors or different parents.
 *
 * This catches the case where one INDI record is a child in two different
 * FAM records with different parents (not caught by duplicate detection).
 */
export function scanPathConvergence(
  graph: TreeGraph,
  subjectId: string,
): ConvergencePoint[] {
  // BFS from subject, tracking all paths to each ancestor
  const pathsToAncestor = new Map<string, Array<{ pathIds: string[]; parentIds: [string | null, string | null] }>>();

  // BFS queue: each item is a path from subject to current person
  const queue: Array<{ personId: string; path: string[] }> = [{ personId: subjectId, path: [subjectId] }];
  const visited = new Map<string, number>(); // personId → visit count (allow revisits from different paths)

  while (queue.length > 0) {
    const { personId, path } = queue.shift()!;

    const visitCount = visited.get(personId) ?? 0;
    if (visitCount >= 4) continue; // Limit revisits to prevent explosion
    visited.set(personId, visitCount + 1);

    // Get parents for this person
    const parentEdges = graph.parentEdges.get(personId);
    if (!parentEdges || parentEdges.length === 0) continue;

    // Extract parent IDs
    const parents = graph.getParents(personId);
    const fatherId = parents.find(p => p.sex === 'M')?.id ?? null;
    const motherId = parents.find(p => p.sex === 'F')?.id ?? null;

    // Record this path's parent info for this ancestor
    if (!pathsToAncestor.has(personId)) {
      pathsToAncestor.set(personId, []);
    }
    pathsToAncestor.get(personId)!.push({
      pathIds: path,
      parentIds: [fatherId, motherId],
    });

    // Continue BFS upward
    for (const parent of parents) {
      const newPath = [...path, parent.id];
      if (newPath.length <= 30) { // Limit path depth
        queue.push({ personId: parent.id, path: newPath });
      }
    }
  }

  // Find convergence points: ancestors reached by multiple paths
  const convergencePoints: ConvergencePoint[] = [];

  for (const [ancestorId, paths] of pathsToAncestor) {
    if (paths.length < 2) continue;

    const ancestor = graph.persons.get(ancestorId);
    if (!ancestor) continue;

    // Check if paths have different parent info for this ancestor
    let conflictDetected = false;
    let divergenceGeneration = 0;

    // Check if this person has multiple different parent sets across paths
    const parentSets = new Set<string>();
    for (const path of paths) {
      const key = `${path.parentIds[0] ?? 'null'}|${path.parentIds[1] ?? 'null'}`;
      parentSets.add(key);
    }

    if (parentSets.size > 1) {
      conflictDetected = true;
      // Find the earliest generation where divergence occurs
      divergenceGeneration = Math.min(...paths.map(p => p.pathIds.length - 1));
    }

    // Also check: does this person have edges to multiple different parent pairs?
    const parentEdges = graph.parentEdges.get(ancestorId);
    if (parentEdges && parentEdges.length > 2) {
      // More than 2 parent edges = child in multiple FAM records
      // Check if they're in a parallelGroupId (intentional) or not
      const hasParallelGroup = parentEdges.some(e => e.parallelGroupId !== null);
      if (!hasParallelGroup) {
        conflictDetected = true;
      }
    }

    if (paths.length >= 2) {
      // Compute weakest confidence per path
      const pathsWithConfidence = paths.map(p => {
        let weakest = 1;
        for (let i = 0; i < p.pathIds.length - 1; i++) {
          const edges = graph.parentEdges.get(p.pathIds[i]);
          if (edges) {
            for (const edge of edges) {
              if (edge.parentId === p.pathIds[i + 1] && edge.confidenceTier > weakest) {
                weakest = edge.confidenceTier;
              }
            }
          }
        }
        return {
          pathIds: p.pathIds,
          parentIds: p.parentIds,
          confidence: weakest,
        };
      });

      convergencePoints.push({
        ancestorId,
        ancestorName: ancestor.name.full,
        paths: pathsWithConfidence,
        conflictDetected,
        divergenceGeneration,
      });
    }
  }

  return convergencePoints;
}
