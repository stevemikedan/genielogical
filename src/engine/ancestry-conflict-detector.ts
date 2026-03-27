import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { AncestryConflict, ConflictType } from '@/types/conflict.ts';

/**
 * Compare ancestry for a pair of suspected duplicate persons.
 * Returns an AncestryConflict if their parent chains differ, or null if they match.
 */
export function compareAncestry(
  graph: TreeGraph,
  personIdA: string,
  personIdB: string,
): AncestryConflict | null {
  const parentsA = graph.getParents(personIdA);
  const parentsB = graph.getParents(personIdB);

  const fatherA = parentsA.find(p => p.sex === 'M') ?? null;
  const motherA = parentsA.find(p => p.sex === 'F') ?? null;
  const fatherB = parentsB.find(p => p.sex === 'M') ?? null;
  const motherB = parentsB.find(p => p.sex === 'F') ?? null;

  const hasParentsA = parentsA.length > 0;
  const hasParentsB = parentsB.length > 0;

  // Neither has parents — no conflict detectable
  if (!hasParentsA && !hasParentsB) return null;

  // Determine conflict type
  let conflictType: ConflictType;

  if (hasParentsA && !hasParentsB) {
    conflictType = 'additional_parents';
  } else if (!hasParentsA && hasParentsB) {
    conflictType = 'additional_parents';
  } else {
    // Both have parents — compare
    const sameFather = fatherA?.id === fatherB?.id;
    const sameMother = motherA?.id === motherB?.id;

    if (sameFather && sameMother) {
      // Same immediate parents — check upstream
      if (hasUpstreamDivergence(graph, fatherA?.id ?? null, fatherB?.id ?? null, motherA?.id ?? null, motherB?.id ?? null)) {
        conflictType = 'upstream_divergence';
      } else {
        // Identical ancestry — not a conflict
        return null;
      }
    } else if (sameFather && !sameMother) {
      conflictType = 'different_mother';
    } else if (!sameFather && sameMother) {
      conflictType = 'different_father';
    } else {
      conflictType = 'different_parents';
    }
  }

  // Count grandparents (depth of ancestry chain)
  const grandparentCountA = countAncestorGenerations(graph, personIdA, 3);
  const grandparentCountB = countAncestorGenerations(graph, personIdB, 3);

  // Count descendants and find shared ones
  const descendantsA = getDescendantIds(graph, personIdA);
  const descendantsB = getDescendantIds(graph, personIdB);
  const shared = descendantsA.filter(id => descendantsB.includes(id));

  // Source counts
  const personA = graph.persons.get(personIdA);
  const personB = graph.persons.get(personIdB);
  const sourceCountA = countSourcesInChain(graph, personIdA);
  const sourceCountB = countSourcesInChain(graph, personIdB);

  return {
    personIdA,
    personIdB,
    pathA: {
      fatherId: fatherA?.id ?? null,
      fatherName: fatherA?.name.full ?? null,
      motherId: motherA?.id ?? null,
      motherName: motherA?.name.full ?? null,
      grandparentCount: grandparentCountA,
    },
    pathB: {
      fatherId: fatherB?.id ?? null,
      fatherName: fatherB?.name.full ?? null,
      motherId: motherB?.id ?? null,
      motherName: motherB?.name.full ?? null,
      grandparentCount: grandparentCountB,
    },
    conflictType,
    descendantsAffectedA: descendantsA.length,
    descendantsAffectedB: descendantsB.length,
    sharedDescendants: shared,
    sourceCountA,
    sourceCountB,
    confidenceTierA: personA?.confidenceTier ?? 4,
    confidenceTierB: personB?.confidenceTier ?? 4,
  };
}

/**
 * Find all duplicate candidate pairs and compare their ancestry.
 * Returns only pairs with actual ancestry conflicts.
 */
export function detectAncestryConflicts(
  graph: TreeGraph,
): AncestryConflict[] {
  const conflicts: AncestryConflict[] = [];
  const persons = [...graph.persons.values()];
  const seen = new Set<string>();

  for (let i = 0; i < persons.length; i++) {
    for (let j = i + 1; j < persons.length; j++) {
      const a = persons[i];
      const b = persons[j];

      // Same duplicate matching criteria as checkDuplicateSuspects
      const aSurname = a.name.surname.toLowerCase().trim();
      const bSurname = b.name.surname.toLowerCase().trim();
      if (!aSurname || !bSurname || aSurname !== bSurname) continue;

      const aGiven = a.name.given.toLowerCase().trim().slice(0, 3);
      const bGiven = b.name.given.toLowerCase().trim().slice(0, 3);
      if (!aGiven || !bGiven || aGiven !== bGiven) continue;

      const aBirth = a.birth.date?.year ?? null;
      const bBirth = b.birth.date?.year ?? null;
      if (aBirth !== null && bBirth !== null && Math.abs(aBirth - bBirth) > 10) continue;

      const pairKey = [a.id, b.id].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const conflict = compareAncestry(graph, a.id, b.id);
      if (conflict) {
        conflicts.push(conflict);
      }
    }
  }

  return conflicts;
}

/**
 * Check if a conflict is auto-resolvable based on clear quality differences.
 */
export function isAutoResolvable(conflict: AncestryConflict): boolean {
  const tierDiff = Math.abs(conflict.confidenceTierA - conflict.confidenceTierB);
  if (tierDiff >= 2) return true;
  if (conflict.sourceCountA > 0 && conflict.sourceCountB === 0) return true;
  if (conflict.sourceCountB > 0 && conflict.sourceCountA === 0) return true;
  return false;
}

// ── Internal helpers ────────────────────────────────────────────────

function hasUpstreamDivergence(
  graph: TreeGraph,
  fatherIdA: string | null,
  _fatherIdB: string | null,
  motherIdA: string | null,
  motherIdB: string | null,
): boolean {
  // Check if shared mother has multiple parent edge sets (child in multiple FAMs)
  if (motherIdA && motherIdA === motherIdB) {
    const parentEdges = graph.parentEdges.get(motherIdA);
    if (parentEdges && parentEdges.length > 2) {
      return true;
    }
  }

  // Check if either parent has multiple sets of parent edges (child in multiple FAMs)
  if (fatherIdA) {
    const parentEdges = graph.parentEdges.get(fatherIdA);
    if (parentEdges && parentEdges.length > 2) return true;
  }
  if (motherIdA) {
    const parentEdges = graph.parentEdges.get(motherIdA);
    if (parentEdges && parentEdges.length > 2) return true;
  }

  return false;
}

function countAncestorGenerations(graph: TreeGraph, personId: string, maxDepth: number): number {
  let count = 0;
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: personId, depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth >= maxDepth || visited.has(item.id)) continue;
    visited.add(item.id);

    const parents = graph.getParents(item.id);
    for (const parent of parents) {
      count++;
      queue.push({ id: parent.id, depth: item.depth + 1 });
    }
  }

  return count;
}

function getDescendantIds(graph: TreeGraph, personId: string): string[] {
  const ids: string[] = [];
  const visited = new Set<string>();
  const queue = [personId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const children = graph.getChildren(current);
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }

  return ids;
}

function countSourcesInChain(graph: TreeGraph, personId: string): number {
  let count = 0;
  const visited = new Set<string>();
  const queue = [personId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const person = graph.persons.get(current);
    if (person) {
      count += person.sourceIds.length;
    }

    // Also count edge sources
    const parentEdges = graph.parentEdges.get(current);
    if (parentEdges) {
      for (const edge of parentEdges) {
        count += edge.sourceIds.length;
        if (!visited.has(edge.parentId)) {
          queue.push(edge.parentId);
        }
      }
    }
  }

  return count;
}
