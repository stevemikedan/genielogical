import type { ConfidenceTier } from '@/types/common.ts';
import type { BridgeZone } from '@/types/bridge.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';

/**
 * Detect consecutive runs of weak edges in a path.
 * A bridge zone is 2+ consecutive edges at or above the threshold tier.
 *
 * @param graph - The tree graph
 * @param path - Ordered list of person IDs from subject to ancestor
 * @param threshold - Minimum tier to consider "weak" (default 3, meaning tier 3+ are weak)
 */
export function detectBridgeZones(
  graph: TreeGraph,
  path: string[],
  threshold: ConfidenceTier = 3,
): BridgeZone[] {
  if (path.length < 2) return [];

  const zones: BridgeZone[] = [];

  // Track the current run of weak edges
  let runStart = -1; // index of the first person in the current weak run
  let runEdgeTiers: number[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const childId = path[i];
    const parentId = path[i + 1];

    // Find the primary edge connecting child → parent
    const parentEdgesForChild = graph.parentEdges.get(childId);
    const edge = parentEdgesForChild?.find(
      (e) => e.parentId === parentId && e.isPrimary,
    );

    const tier = edge ? edge.confidenceTier : 4; // missing edge = worst tier
    const isWeak = tier >= threshold;

    if (isWeak) {
      if (runStart === -1) {
        // Start a new run
        runStart = i;
        runEdgeTiers = [tier];
      } else {
        // Continue the current run
        runEdgeTiers.push(tier);
      }
    }

    if (!isWeak || i === path.length - 2) {
      // End the current run if we hit a strong edge or reached the last pair
      if (runStart !== -1 && runEdgeTiers.length >= 2) {
        // Only emit if the run is actually ending (not weak, or last pair and weak)
        // If last pair is weak, the run includes it already
        const runEnd = isWeak ? i + 1 : i;
        const startGen = runStart;
        const endGen = runEnd;
        const edgeCount = runEdgeTiers.length;
        const averageTier =
          runEdgeTiers.reduce((sum, t) => sum + t, 0) / edgeCount;

        zones.push({
          startPersonId: path[runStart],
          endPersonId: path[runEnd],
          startGen,
          endGen,
          edgeCount,
          averageTier,
          description: `${edgeCount} consecutive unsourced links between Gen ${startGen}–${endGen}`,
        });
      }

      if (!isWeak) {
        runStart = -1;
        runEdgeTiers = [];
      }
    }
  }

  return zones;
}
