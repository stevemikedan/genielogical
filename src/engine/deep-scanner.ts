import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { DeepScanResult, BranchAnalysis } from '@/types/deep-scan.ts';
import type { NotableAncestor } from '@/types/story-path.ts';
import { findNotableAncestors } from './story-paths.ts';

interface AncestorEntry {
  personId: string;
  generation: number;
}

/**
 * Labels for the 8 great-grandparent branches (English standard).
 */
const BRANCH_LABELS = [
  "Paternal grandfather's father",
  "Paternal grandfather's mother",
  "Paternal grandmother's father",
  "Paternal grandmother's mother",
  "Maternal grandfather's father",
  "Maternal grandfather's mother",
  "Maternal grandmother's father",
  "Maternal grandmother's mother",
];

/**
 * Trace a single branch from a great-grandparent, counting ancestors,
 * max depth, and deepest ancestor.
 */
function traceBranch(
  startId: string,
  graph: TreeGraph,
  globalVisited: Set<string>,
): { ancestorCount: number; maxDepth: number; deepestAncestorId: string; genDistribution: Map<number, number> } {
  const localQueue: AncestorEntry[] = [{ personId: startId, generation: 0 }];
  let ancestorCount = 0;
  let maxDepth = 0;
  let deepestAncestorId = startId;
  const genDistribution = new Map<number, number>();

  while (localQueue.length > 0) {
    const current = localQueue.shift()!;
    const person = graph.persons.get(current.personId);
    if (!person) continue;

    ancestorCount++;
    if (current.generation > maxDepth) {
      maxDepth = current.generation;
      deepestAncestorId = current.personId;
    }

    // Track generation distribution
    genDistribution.set(current.generation, (genDistribution.get(current.generation) ?? 0) + 1);

    // Enqueue parents
    const parentEdges = graph.parentEdges.get(current.personId) ?? [];
    for (const edge of parentEdges) {
      if (!edge.isPrimary) continue;
      if (globalVisited.has(edge.parentId)) continue;
      globalVisited.add(edge.parentId);
      localQueue.push({
        personId: edge.parentId,
        generation: current.generation + 1,
      });
    }
  }

  return { ancestorCount, maxDepth, deepestAncestorId, genDistribution };
}

/**
 * Get parents of a person (primary edges only).
 */
function getPrimaryParents(personId: string, graph: TreeGraph): Person[] {
  const edges = graph.parentEdges.get(personId) ?? [];
  const parents: Person[] = [];
  for (const edge of edges) {
    if (!edge.isPrimary) continue;
    const parent = graph.persons.get(edge.parentId);
    if (parent) parents.push(parent);
  }
  return parents;
}

/**
 * Run a deep scan from a subject person, analyzing all 8 great-grandparent branches.
 * Uses BFS to trace each branch independently, computing ancestor counts,
 * max depth, notable figures, and richness scores.
 */
export function runDeepScan(
  graph: TreeGraph,
  subjectId: string,
): DeepScanResult {
  const subject = graph.persons.get(subjectId);
  if (!subject) {
    return {
      subjectId,
      totalUniqueAncestors: 0,
      maxGenerationReached: 0,
      branches: [],
      generationDistribution: new Map(),
      allNotableFigures: [],
    };
  }

  // Get notable ancestors for the whole tree (reuse story paths engine)
  const storyResult = findNotableAncestors(graph, subjectId);
  const notableByPersonId = new Map<string, NotableAncestor>();
  for (const notable of storyResult.notableAncestors) {
    notableByPersonId.set(notable.personId, notable);
  }

  // Find the 8 great-grandparents (or fewer if incomplete)
  const parents = getPrimaryParents(subjectId, graph);
  const grandparents: Array<{ person: Person; viaParent: Person }> = [];
  for (const parent of parents) {
    const gps = getPrimaryParents(parent.id, graph);
    for (const gp of gps) {
      grandparents.push({ person: gp, viaParent: parent });
    }
  }

  const greatGrandparents: Array<{ person: Person; viaGrandparent: Person; viaParent: Person }> = [];
  for (const gp of grandparents) {
    const ggps = getPrimaryParents(gp.person.id, graph);
    for (const ggp of ggps) {
      greatGrandparents.push({ person: ggp, viaGrandparent: gp.person, viaParent: gp.viaParent });
    }
  }

  // Track all visited to avoid double-counting across branches
  const globalVisited = new Set<string>();
  globalVisited.add(subjectId);
  for (const p of parents) globalVisited.add(p.id);
  for (const gp of grandparents) globalVisited.add(gp.person.id);
  for (const ggp of greatGrandparents) globalVisited.add(ggp.person.id);

  const branches: BranchAnalysis[] = [];
  const globalGenDistribution = new Map<number, number>();

  // Count the subject + parents + grandparents + great-grandparents
  let totalUniqueAncestors = 1 + parents.length + grandparents.length + greatGrandparents.length;

  for (let i = 0; i < greatGrandparents.length; i++) {
    const ggp = greatGrandparents[i];
    const branchResult = traceBranch(ggp.person.id, graph, globalVisited);

    // Merge generation distribution (offset by 3 for subject→parent→gp→ggp)
    for (const [gen, count] of branchResult.genDistribution) {
      const globalGen = gen + 3;
      globalGenDistribution.set(globalGen, (globalGenDistribution.get(globalGen) ?? 0) + count);
    }

    totalUniqueAncestors += branchResult.ancestorCount;

    const deepestPerson = graph.persons.get(branchResult.deepestAncestorId);

    // Find notables in this branch
    const branchNotables: NotableAncestor[] = [];
    // Simple approach: check all notables to see if their path passes through this ggp
    for (const notable of storyResult.notableAncestors) {
      if (notable.pathToSubject.includes(ggp.person.id)) {
        branchNotables.push(notable);
      }
    }

    const richnessScore = branchResult.ancestorCount *
      Math.log(Math.max(branchResult.maxDepth, 1) + 1) *
      (1 + branchNotables.length);

    branches.push({
      branchLabel: i < BRANCH_LABELS.length ? BRANCH_LABELS[i] : `Branch ${i + 1}`,
      greatGrandparentId: ggp.person.id,
      greatGrandparentName: ggp.person.name.full,
      viaGrandparentName: ggp.viaGrandparent.name.full,
      ancestorCount: branchResult.ancestorCount,
      maxDepth: branchResult.maxDepth + 3, // relative to subject
      deepestAncestorId: branchResult.deepestAncestorId,
      deepestAncestorName: deepestPerson?.name.full ?? branchResult.deepestAncestorId,
      deepestAncestorBirthYear: deepestPerson?.birth.date?.year ?? null,
      notableFigures: branchNotables,
      richnessScore: Math.round(richnessScore * 100) / 100,
    });
  }

  // Add the closer generations to the global distribution
  globalGenDistribution.set(0, 1); // subject
  if (parents.length > 0) globalGenDistribution.set(1, parents.length);
  if (grandparents.length > 0) globalGenDistribution.set(2, grandparents.length);
  if (greatGrandparents.length > 0) globalGenDistribution.set(3, greatGrandparents.length);

  // Sort branches by richness score descending
  branches.sort((a, b) => b.richnessScore - a.richnessScore);

  const maxGenerationReached = branches.reduce((max, b) => Math.max(max, b.maxDepth), 0);

  return {
    subjectId,
    totalUniqueAncestors,
    maxGenerationReached,
    branches,
    generationDistribution: globalGenDistribution,
    allNotableFigures: storyResult.notableAncestors,
  };
}
