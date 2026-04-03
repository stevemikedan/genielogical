import type { TreeGraph } from './tree-graph.ts';
import type { Edge } from '@/types/edge.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import type { BridgeZoneInfo } from './safe-to-share.ts';
import { detectBridgeZones } from '@/engine/bridge-detector.ts';
import type { NotableAncestor } from '@/types/story-path.ts';

export interface ProofLink {
  personId: string;
  personName: string;
  edge: Edge | null;       // null for the root (start of chain)
  edgeTier: ConfidenceTier | null;
  /** Names of notable ancestors whose path shares this link */
  sharedWithPaths: string[];
}

export interface ProofLadder {
  links: ProofLink[];
  weakestTier: ConfidenceTier;
  weakestPersonId: string | null;
  bridgeZones: BridgeZoneInfo[];
}

/**
 * Build a proof chain from the tree root down to the target person.
 * Follows primary parent edges upward from target to root, then reverses.
 * Returns the chain with the weakest link identified.
 *
 * When notableAncestors are provided, each link is annotated with the names
 * of notable ancestors whose path shares that link (sharedWithPaths).
 */
export function buildProofLadder(
  targetId: string,
  graph: TreeGraph,
  notableAncestors?: NotableAncestor[],
): ProofLadder | null {
  const target = graph.persons.get(targetId);
  if (!target) return null;

  // Walk upward through primary parent edges to find path to a root
  const chain: Array<{ personId: string; edge: Edge | null }> = [];
  const visited = new Set<string>();
  let current = targetId;

  while (true) {
    if (visited.has(current)) break; // cycle guard
    visited.add(current);

    const parentEdges = graph.parentEdges.get(current);
    const primaryEdge = parentEdges?.find(e => e.isPrimary) ?? null;

    if (!primaryEdge) {
      // This is a root — add it without an edge
      chain.push({ personId: current, edge: null });
      break;
    }

    chain.push({ personId: current, edge: primaryEdge });
    current = primaryEdge.parentId;
  }

  // Reverse so chain goes root → target
  chain.reverse();

  // Build ProofLink array
  let weakestTier: ConfidenceTier = 1;
  let weakestPersonId: string | null = null;

  const links: ProofLink[] = chain.map(({ personId, edge }) => {
    const person = graph.persons.get(personId);
    const personName = person?.name.full ?? personId;

    // For the reversed chain, the edge on each link is the edge FROM the
    // previous person TO this person. The root has no incoming edge.
    // After reversal: first item has edge: null (root), subsequent items
    // have the edge that connects them to their parent.
    // But we reversed, so edge assignment needs fixing:
    // Before reversal: [target w/ edgeToParent1, parent1 w/ edgeToParent2, ..., root w/ null]
    // After reversal:  [root w/ null, ..., parent1 w/ edgeToParent2, target w/ edgeToParent1]
    // The edge on each item IS the edge from that item's parent to that item. Perfect.

    const edgeTier = edge?.confidenceTier ?? null;
    if (edgeTier !== null && edgeTier > weakestTier) {
      weakestTier = edgeTier;
      weakestPersonId = personId;
    }

    // Find notable ancestors whose path includes this person
    const shared: string[] = [];
    if (notableAncestors) {
      for (const na of notableAncestors) {
        // Don't include the target person itself in sharedWithPaths
        if (na.personId === targetId) continue;
        if (na.pathToSubject.includes(personId)) {
          shared.push(na.name);
        }
      }
    }

    return { personId, personName, edge, edgeTier, sharedWithPaths: shared };
  });

  // Detect bridge zones in the chain
  const pathIds = links.map(l => l.personId);
  const detectedZones = detectBridgeZones(graph, pathIds);
  const bridgeZones: BridgeZoneInfo[] = detectedZones.map(z => ({
    edgeCount: z.edgeCount,
    description: z.description,
  }));

  return { links, weakestTier, weakestPersonId, bridgeZones };
}
