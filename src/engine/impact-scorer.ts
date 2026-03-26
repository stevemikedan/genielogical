import type { NotableAncestor } from '@/types/story-path.ts';
import type { ResearchPriority } from '@/types/research.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';

/**
 * Compute research priorities by ranking edges based on how many
 * notable-ancestor paths pass through them, weighted by inverse tier.
 *
 * Priority = pathCount × inverseCurrentTier
 * - Tier 4 edges get 4× weight vs Tier 1
 * - Only edges that appear in at least one notable ancestor path are included
 */
export function computeResearchPriorities(
  graph: TreeGraph,
  notableAncestors: NotableAncestor[],
): ResearchPriority[] {
  if (notableAncestors.length === 0) return [];

  // Count how many notable paths pass through each edge
  const edgePathCount = new Map<string, { count: number; notableNames: string[] }>();

  for (const notable of notableAncestors) {
    const path = notable.pathToSubject;
    // Walk consecutive pairs to find edges
    for (let i = 0; i < path.length - 1; i++) {
      const childId = path[i];
      const parentId = path[i + 1];

      // Find the edge connecting these two
      const edges = graph.parentEdges.get(childId) ?? [];
      const edge = edges.find(e => e.parentId === parentId && e.isPrimary);
      if (!edge) continue;

      const existing = edgePathCount.get(edge.id);
      if (existing) {
        existing.count++;
        if (!existing.notableNames.includes(notable.name)) {
          existing.notableNames.push(notable.name);
        }
      } else {
        edgePathCount.set(edge.id, { count: 1, notableNames: [notable.name] });
      }
    }
  }

  // Build priority list
  const priorities: ResearchPriority[] = [];

  for (const [edgeId, info] of edgePathCount) {
    const edge = graph.edges.get(edgeId);
    if (!edge) continue;

    // Only include edges that could benefit from verification (tier 2+)
    if (edge.confidenceTier <= 1) continue;

    const inverseTier = edge.confidenceTier;
    const impactScore = info.count * inverseTier;

    const parentName = graph.persons.get(edge.parentId)?.name.full ?? edge.parentId;
    const childName = graph.persons.get(edge.childId)?.name.full ?? edge.childId;

    const pathNames = info.notableNames.slice(0, 3).join(', ');
    const moreCount = info.notableNames.length - 3;
    const pathSuffix = moreCount > 0 ? ` and ${moreCount} more` : '';

    priorities.push({
      edgeId: edge.id,
      parentId: edge.parentId,
      childId: edge.childId,
      currentTier: edge.confidenceTier,
      impactScore,
      affectedNotablePaths: info.notableNames,
      affectedPathCount: info.count,
      description: `Verifying ${parentName} → ${childName} would strengthen ${info.count} path${info.count !== 1 ? 's' : ''}: ${pathNames}${pathSuffix}`,
    });
  }

  // Sort by impact score descending
  priorities.sort((a, b) => b.impactScore - a.impactScore);

  return priorities;
}
