import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';

export interface TreeHierarchyNode {
  person: Person;
  edgeToParent: Edge | null;
  hasFlags: boolean;
  hasParallelPaths: boolean;
  isExpandable: boolean;
  expandableDepth: number;
  children?: TreeHierarchyNode[];
}

/**
 * Count how many more primary-parent generations exist beyond this person.
 * Walks primary parent edges up to `max` depth, cycle-safe.
 */
function countExpandableDepth(personId: string, graph: TreeGraph, max: number = 20): number {
  let depth = 0;
  const visited = new Set<string>();
  let current = personId;

  while (depth < max) {
    if (visited.has(current)) break;
    visited.add(current);

    const parentEdges = graph.parentEdges.get(current) ?? [];
    const primaryEdge = parentEdges.find(e => e.isPrimary);
    if (!primaryEdge) break;

    const parent = graph.persons.get(primaryEdge.parentId);
    if (!parent) break;

    depth++;
    current = primaryEdge.parentId;
  }

  return depth;
}

/**
 * Count how many more child generations exist beyond this person (for descendant mode).
 */
function countExpandableDepthDescendant(personId: string, graph: TreeGraph, max: number = 20): number {
  let depth = 0;
  const visited = new Set<string>();
  const queue = [personId];

  // BFS to find max depth of descendants
  while (queue.length > 0 && depth < max) {
    const nextLevel: string[] = [];
    for (const id of queue) {
      if (visited.has(id)) continue;
      visited.add(id);
      const childEdges = graph.childEdges.get(id) ?? [];
      for (const edge of childEdges) {
        if (!visited.has(edge.childId) && graph.persons.has(edge.childId)) {
          nextLevel.push(edge.childId);
        }
      }
    }
    if (nextLevel.length === 0) break;
    depth++;
    queue.length = 0;
    queue.push(...nextLevel);
  }

  return depth;
}

/**
 * Build a PEDIGREE (ancestor) hierarchy from a root person.
 * In the resulting tree, "children" are actually the person's parents/ancestors.
 * This maps naturally to d3.tree() which renders parent→child as root→leaf.
 */
export function buildPedigreeHierarchy(
  rootPersonId: string,
  graph: TreeGraph,
  maxGenerations: number = 5,
  expandedAncestors: Set<string> = new Set(),
): TreeHierarchyNode | null {
  const rootPerson = graph.persons.get(rootPersonId);
  if (!rootPerson) return null;

  const visited = new Set<string>();

  function buildNode(person: Person, depth: number): TreeHierarchyNode {
    visited.add(person.id);

    const parentEdges = graph.parentEdges.get(person.id) ?? [];
    const hasParallelPaths = parentEdges.some(e => e.parallelGroupId !== null);

    // Check if this person has parents that could be shown
    const primaryParentEdges = parentEdges.filter(e => e.isPrimary);
    const hasUnshownParents = primaryParentEdges.some(
      e => !visited.has(e.parentId) && graph.persons.has(e.parentId),
    );

    const atDepthLimit = depth >= maxGenerations;
    const isExpanded = expandedAncestors.has(person.id);

    // Expandable if at depth limit (or beyond) with unshown parents, and NOT already expanded
    const isExpandable = atDepthLimit && hasUnshownParents && !isExpanded;

    const node: TreeHierarchyNode = {
      person,
      edgeToParent: null,
      hasFlags: person.flagIds.length > 0,
      hasParallelPaths,
      isExpandable,
      expandableDepth: isExpandable ? countExpandableDepth(person.id, graph) : 0,
    };

    // Stop if at depth limit and not expanded
    if (atDepthLimit && !isExpanded) return node;

    // Follow primary parent edges to build ancestor "children"
    const children: TreeHierarchyNode[] = [];
    for (const edge of parentEdges) {
      if (!edge.isPrimary) continue;
      if (visited.has(edge.parentId)) continue;

      const parentPerson = graph.persons.get(edge.parentId);
      if (!parentPerson) continue;

      const childNode = buildNode(parentPerson, depth + 1);
      childNode.edgeToParent = edge;
      children.push(childNode);
    }

    if (children.length > 0) {
      node.children = children;
    }

    return node;
  }

  return buildNode(rootPerson, 0);
}

/**
 * Build a DESCENDANT hierarchy from an ancestor.
 * "children" are actual children in the genealogical sense.
 */
export function buildDescendantHierarchy(
  ancestorId: string,
  graph: TreeGraph,
  maxGenerations: number = 5,
  expandedAncestors: Set<string> = new Set(),
): TreeHierarchyNode | null {
  const ancestorPerson = graph.persons.get(ancestorId);
  if (!ancestorPerson) return null;

  const visited = new Set<string>();

  function buildNode(person: Person, depth: number): TreeHierarchyNode {
    visited.add(person.id);

    const parentEdges = graph.parentEdges.get(person.id) ?? [];
    const hasParallelPaths = parentEdges.some(e => e.parallelGroupId !== null);

    const childEdges = graph.childEdges.get(person.id) ?? [];
    const hasUnshownChildren = childEdges.some(
      e => !visited.has(e.childId) && graph.persons.has(e.childId),
    );

    const atDepthLimit = depth >= maxGenerations;
    const isExpanded = expandedAncestors.has(person.id);

    const isExpandable = atDepthLimit && hasUnshownChildren && !isExpanded;

    const node: TreeHierarchyNode = {
      person,
      edgeToParent: null,
      hasFlags: person.flagIds.length > 0,
      hasParallelPaths,
      isExpandable,
      expandableDepth: isExpandable ? countExpandableDepthDescendant(person.id, graph) : 0,
    };

    if (atDepthLimit && !isExpanded) return node;

    const children: TreeHierarchyNode[] = [];

    for (const edge of childEdges) {
      if (visited.has(edge.childId)) continue;

      const childPerson = graph.persons.get(edge.childId);
      if (!childPerson) continue;

      const childNode = buildNode(childPerson, depth + 1);
      childNode.edgeToParent = edge;
      children.push(childNode);
    }

    if (children.length > 0) {
      node.children = children;
    }

    return node;
  }

  return buildNode(ancestorPerson, 0);
}

/**
 * Build a DIRECT LINE hierarchy that only follows primary parent edges,
 * showing a single path from root to deepest ancestor. Non-primary siblings
 * are expandable via the expandedNodes set.
 */
export function buildDirectLineHierarchy(
  rootPersonId: string,
  graph: TreeGraph,
  maxGenerations: number = 5,
  expandedNodes: Set<string> = new Set(),
  expandedAncestors: Set<string> = new Set(),
): TreeHierarchyNode | null {
  const rootPerson = graph.persons.get(rootPersonId);
  if (!rootPerson) return null;

  const visited = new Set<string>();

  function buildNode(person: Person, depth: number, isOnDirectLine: boolean): TreeHierarchyNode {
    visited.add(person.id);

    const parentEdges = graph.parentEdges.get(person.id) ?? [];
    const hasParallelPaths = parentEdges.some(e => e.parallelGroupId !== null);

    // Check if this person has siblings that could be expanded
    const primaryParentEdges = parentEdges.filter(e => e.isPrimary);
    const hasSiblings = primaryParentEdges.some(edge => {
      const siblingEdges = graph.childEdges.get(edge.parentId) ?? [];
      return siblingEdges.length > 1;
    });

    // Check for unshown parents (for ancestor expansion)
    const hasUnshownParents = primaryParentEdges.some(
      e => !visited.has(e.parentId) && graph.persons.has(e.parentId),
    );

    const atDepthLimit = depth >= maxGenerations;
    const isAncestorExpanded = expandedAncestors.has(person.id);

    // Sibling expandable: on direct line with siblings, not already sibling-expanded
    const isSiblingExpandable = isOnDirectLine && hasSiblings && !expandedNodes.has(person.id);
    // Ancestor expandable: at depth limit with unshown parents, not already ancestor-expanded
    const isAncestorExpandable = atDepthLimit && hasUnshownParents && !isAncestorExpanded;

    const node: TreeHierarchyNode = {
      person,
      edgeToParent: null,
      hasFlags: person.flagIds.length > 0,
      hasParallelPaths,
      isExpandable: isSiblingExpandable || isAncestorExpandable,
      expandableDepth: isAncestorExpandable ? countExpandableDepth(person.id, graph) : 0,
    };

    if (atDepthLimit && !isAncestorExpanded) return node;

    const children: TreeHierarchyNode[] = [];

    // Always follow direct-line parent edges
    for (const edge of parentEdges) {
      if (!edge.isPrimary) continue;
      if (visited.has(edge.parentId)) continue;

      const parentPerson = graph.persons.get(edge.parentId);
      if (!parentPerson) continue;

      const childNode = buildNode(parentPerson, depth + 1, true);
      childNode.edgeToParent = edge;
      children.push(childNode);

      // If this node is expanded, also add siblings
      if (expandedNodes.has(person.id)) {
        const siblingEdges = graph.childEdges.get(edge.parentId) ?? [];
        for (const sibEdge of siblingEdges) {
          if (sibEdge.childId === person.id) continue;
          if (visited.has(sibEdge.childId)) continue;

          const sibPerson = graph.persons.get(sibEdge.childId);
          if (!sibPerson) continue;

          const sibNode = buildNode(sibPerson, depth + 1, false);
          sibNode.edgeToParent = sibEdge;
          children.push(sibNode);
        }
      }
    }

    if (children.length > 0) {
      node.children = children;
    }

    return node;
  }

  return buildNode(rootPerson, 0, true);
}
