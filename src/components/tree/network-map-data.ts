import type { Person } from '@/types/person';
import type { Edge } from '@/types/edge';
import type { ConfidenceTier, NodeStatus } from '@/types/common';
import type { TreeGraph } from '@/graph/tree-graph';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3';

export type NetworkLinkType = 'parent-child' | 'spouse' | 'sibling';

export interface NetworkNode extends SimulationNodeDatum {
  id: string;
  person: Person;
  confidenceTier: ConfidenceTier;
  status: NodeStatus;
  hasFlags: boolean;
}

export interface NetworkLink extends SimulationLinkDatum<NetworkNode> {
  id: string;
  source: string | NetworkNode;
  target: string | NetworkNode;
  linkType: NetworkLinkType;
  confidenceTier: ConfidenceTier;
  edge: Edge | null;
  hasParallelPaths: boolean;
}

export interface NetworkLayoutConfig {
  generationRadius: number;
  showParentChild: boolean;
  showSpouse: boolean;
  showSibling: boolean;
  visibleTiers: Set<ConfidenceTier>;
  showRejected: boolean;
}

export interface NetworkGraphData {
  nodes: NetworkNode[];
  links: NetworkLink[];
  rootNodeId: string;
  stats: {
    totalPersons: number;
    totalLinks: number;
    parentChildCount: number;
    spouseCount: number;
    siblingCount: number;
  };
}

function isPersonVisible(person: Person, config: NetworkLayoutConfig): boolean {
  if (!config.visibleTiers.has(person.confidenceTier)) return false;
  if (person.status === 'rejected' && !config.showRejected) return false;
  return true;
}

function sortedPairId(prefix: string, a: string, b: string): string {
  return a < b ? `${prefix}:${a}:${b}` : `${prefix}:${b}:${a}`;
}

function worstTier(tierA: ConfidenceTier, tierB: ConfidenceTier): ConfidenceTier {
  return Math.max(tierA, tierB) as ConfidenceTier;
}

/**
 * Build a force-graph dataset via BFS from the root person,
 * following all relationship types up to `generationRadius` hops.
 */
export function buildNetworkGraph(
  rootPersonId: string,
  graph: TreeGraph,
  config: NetworkLayoutConfig,
): NetworkGraphData {
  const rootPerson = graph.getPersonById(rootPersonId);
  if (!rootPerson) {
    return {
      nodes: [],
      links: [],
      rootNodeId: rootPersonId,
      stats: { totalPersons: 0, totalLinks: 0, parentChildCount: 0, spouseCount: 0, siblingCount: 0 },
    };
  }

  // BFS to collect reachable person IDs within radius
  const visited = new Map<string, number>(); // personId → distance
  const queue: Array<{ id: string; depth: number }> = [{ id: rootPersonId, depth: 0 }];
  visited.set(rootPersonId, 0);

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= config.generationRadius) continue;

    const nextDepth = depth + 1;

    // Parent edges (person is child → follow to parent)
    const parentEdges = graph.parentEdges.get(id) ?? [];
    for (const edge of parentEdges) {
      if (!visited.has(edge.parentId)) {
        visited.set(edge.parentId, nextDepth);
        queue.push({ id: edge.parentId, depth: nextDepth });
      }
    }

    // Child edges (person is parent → follow to child)
    const childEdges = graph.childEdges.get(id) ?? [];
    for (const edge of childEdges) {
      if (!visited.has(edge.childId)) {
        visited.set(edge.childId, nextDepth);
        queue.push({ id: edge.childId, depth: nextDepth });
      }
    }

    // Spouses
    const spouseIds = graph.spouseMap.get(id) ?? [];
    for (const spouseId of spouseIds) {
      if (!visited.has(spouseId)) {
        visited.set(spouseId, nextDepth);
        queue.push({ id: spouseId, depth: nextDepth });
      }
    }

    // Siblings
    const person = graph.getPersonById(id);
    if (person) {
      const siblings = graph.getSiblings(id);
      for (const sib of siblings) {
        if (!visited.has(sib.id)) {
          visited.set(sib.id, nextDepth);
          queue.push({ id: sib.id, depth: nextDepth });
        }
      }
    }
  }

  // Filter by visibility, build node map
  const nodeMap = new Map<string, NetworkNode>();
  for (const personId of visited.keys()) {
    const person = graph.getPersonById(personId);
    if (!person) continue;
    if (!isPersonVisible(person, config)) continue;
    nodeMap.set(personId, {
      id: person.id,
      person,
      confidenceTier: person.confidenceTier,
      status: person.status,
      hasFlags: person.flagIds.length > 0,
    });
  }

  // Build links
  const linkMap = new Map<string, NetworkLink>();
  let parentChildCount = 0;
  let spouseCount = 0;
  let siblingCount = 0;

  // Parent-child links from real edges
  if (config.showParentChild) {
    for (const edge of graph.edges.values()) {
      if (!nodeMap.has(edge.parentId) || !nodeMap.has(edge.childId)) continue;
      if (linkMap.has(edge.id)) continue;
      linkMap.set(edge.id, {
        id: edge.id,
        source: edge.parentId,
        target: edge.childId,
        linkType: 'parent-child',
        confidenceTier: edge.confidenceTier,
        edge,
        hasParallelPaths: edge.parallelGroupId !== null,
      });
      parentChildCount++;
    }
  }

  // Synthetic spouse links
  if (config.showSpouse) {
    for (const [personId, spouseIds] of graph.spouseMap.entries()) {
      if (!nodeMap.has(personId)) continue;
      for (const spouseId of spouseIds) {
        if (!nodeMap.has(spouseId)) continue;
        const linkId = sortedPairId('spouse', personId, spouseId);
        if (linkMap.has(linkId)) continue;
        const personNode = nodeMap.get(personId)!;
        const spouseNode = nodeMap.get(spouseId)!;
        linkMap.set(linkId, {
          id: linkId,
          source: personId,
          target: spouseId,
          linkType: 'spouse',
          confidenceTier: worstTier(personNode.confidenceTier, spouseNode.confidenceTier),
          edge: null,
          hasParallelPaths: false,
        });
        spouseCount++;
      }
    }
  }

  // Synthetic sibling links
  if (config.showSibling) {
    for (const personId of nodeMap.keys()) {
      const siblings = graph.getSiblings(personId);
      for (const sib of siblings) {
        if (!nodeMap.has(sib.id)) continue;
        const linkId = sortedPairId('sibling', personId, sib.id);
        if (linkMap.has(linkId)) continue;
        const personNode = nodeMap.get(personId)!;
        const sibNode = nodeMap.get(sib.id)!;
        linkMap.set(linkId, {
          id: linkId,
          source: personId,
          target: sib.id,
          linkType: 'sibling',
          confidenceTier: worstTier(personNode.confidenceTier, sibNode.confidenceTier),
          edge: null,
          hasParallelPaths: false,
        });
        siblingCount++;
      }
    }
  }

  const nodes = Array.from(nodeMap.values());
  const links = Array.from(linkMap.values());

  return {
    nodes,
    links,
    rootNodeId: rootPersonId,
    stats: {
      totalPersons: nodes.length,
      totalLinks: links.length,
      parentChildCount,
      spouseCount,
      siblingCount,
    },
  };
}
