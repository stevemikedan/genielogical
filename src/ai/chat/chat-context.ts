/**
 * Build context object from current app state for injection into chat prompts.
 */

import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { Flag } from '@/types/flag.ts';
import type { DeepScanResult } from '@/types/deep-scan.ts';
import type { StoryPathResult } from '@/types/story-path.ts';
import type { Person } from '@/types/person.ts';
import type { Source } from '@/types/source.ts';
import { TIER_LABELS } from '@/types/tier-labels.ts';

export interface ChatContext {
  selectedPersonId: string | null;
  activeView: string;

  treeSummary: {
    totalPeople: number;
    totalGenerations: number;
    subjectName: string;
    branchCount: number;
    topNotableAncestors: { name: string; category: string; gen: number }[];
    topFlags: { title: string; severity: string }[];
    overallHealthScore: number;
    generationalDistribution: { band: string; count: number }[];
    deepestAncestors: { name: string; dates: string; generation: number }[];
    tierDistribution: { tier: number; count: number }[];
  };

  selectedPersonContext: {
    name: string;
    dates: string;
    places: string;
    tier: number;
    parents: { name: string; tier: number }[];
    children: { name: string }[];
    flags: { title: string; severity: string }[];
    sources: { title: string; sourceClass: string }[];
    onNotablePaths: string[];
    ancestorChainDepth: number;
    deepestAncestorName: string | null;
  } | null;
}

function formatPersonDates(person: Person): string {
  const parts: string[] = [];
  if (person.birth.date) parts.push(`b. ${person.birth.date.raw}`);
  if (person.death.date) parts.push(`d. ${person.death.date.raw}`);
  return parts.join(', ') || 'dates unknown';
}

function formatPersonPlaces(person: Person): string {
  const places: string[] = [];
  if (person.birth.place) places.push(person.birth.place.raw);
  if (person.death.place) places.push(person.death.place.raw);
  return [...new Set(places)].join('; ') || 'places unknown';
}

const GENERATION_BANDS: { label: string; min: number; max: number }[] = [
  { label: '1-3', min: 1, max: 3 },
  { label: '4-6', min: 4, max: 6 },
  { label: '7-10', min: 7, max: 10 },
  { label: '11-15', min: 11, max: 15 },
  { label: '16-20', min: 16, max: 20 },
  { label: '21-30', min: 21, max: 30 },
  { label: '31+', min: 31, max: Infinity },
];

/**
 * BFS from all leaves upward via ALL parent edges to compute generation depths.
 * Returns a Map of personId → generation number (1 = leaf/subject).
 */
function computeGenerationMap(graph: TreeGraph): Map<string, number> {
  const genMap = new Map<string, number>();
  // Find leaves (persons with no child edges pointing to them, i.e. no children)
  const leaves: string[] = [];
  for (const person of graph.persons.values()) {
    const childEdges = graph.childEdges.get(person.id) ?? [];
    if (childEdges.length === 0) {
      leaves.push(person.id);
    }
  }

  // BFS from leaves upward
  const queue: Array<{ id: string; gen: number }> = leaves.map(id => ({ id, gen: 1 }));
  for (const item of queue) {
    const existing = genMap.get(item.id);
    if (existing !== undefined && existing >= item.gen) continue;
    genMap.set(item.id, item.gen);

    const parentEdges = graph.parentEdges.get(item.id) ?? [];
    for (const edge of parentEdges) {
      const parentGen = item.gen + 1;
      const parentExisting = genMap.get(edge.parentId);
      if (parentExisting === undefined || parentGen > parentExisting) {
        queue.push({ id: edge.parentId, gen: parentGen });
      }
    }
  }
  return genMap;
}

/**
 * Bucket persons by generation band.
 */
export function computeGenerationalDistribution(graph: TreeGraph): { band: string; count: number }[] {
  const genMap = computeGenerationMap(graph);
  const bandCounts = new Map<string, number>();
  for (const band of GENERATION_BANDS) bandCounts.set(band.label, 0);

  for (const gen of genMap.values()) {
    for (const band of GENERATION_BANDS) {
      if (gen >= band.min && gen <= band.max) {
        bandCounts.set(band.label, (bandCounts.get(band.label) ?? 0) + 1);
        break;
      }
    }
  }

  return GENERATION_BANDS
    .map(b => ({ band: b.label, count: bandCounts.get(b.label) ?? 0 }))
    .filter(b => b.count > 0);
}

/**
 * Find the deepest ancestors (terminal nodes at maximum generation depth).
 */
export function findDeepestAncestors(graph: TreeGraph, limit: number = 6): { name: string; dates: string; generation: number }[] {
  const genMap = computeGenerationMap(graph);
  const entries: Array<{ id: string; gen: number }> = [];
  for (const [id, gen] of genMap) entries.push({ id, gen });
  entries.sort((a, b) => b.gen - a.gen);

  const results: { name: string; dates: string; generation: number }[] = [];
  for (const entry of entries.slice(0, limit)) {
    const person = graph.persons.get(entry.id);
    if (person) {
      results.push({
        name: person.name.full,
        dates: formatPersonDates(person),
        generation: entry.gen,
      });
    }
  }
  return results;
}

/**
 * Count persons per confidence tier.
 */
export function computeTierDistribution(graph: TreeGraph): { tier: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const person of graph.persons.values()) {
    counts.set(person.confidenceTier, (counts.get(person.confidenceTier) ?? 0) + 1);
  }
  return [1, 2, 3, 4]
    .filter(t => (counts.get(t) ?? 0) > 0)
    .map(t => ({ tier: t, count: counts.get(t) ?? 0 }));
}

/**
 * BFS from a person upward via ALL parent edges to find deepest ancestor chain depth.
 */
export function computeDeepestChain(personId: string, graph: TreeGraph): { depth: number; deepestName: string | null } {
  let maxDepth = -1;
  let deepestId: string | null = null;
  const visited = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [{ id: personId, depth: 0 }];

  for (const item of queue) {
    const existing = visited.get(item.id);
    if (existing !== undefined && existing >= item.depth) continue;
    visited.set(item.id, item.depth);

    if (item.depth > maxDepth) {
      maxDepth = item.depth;
      deepestId = item.id;
    }

    const parentEdges = graph.parentEdges.get(item.id) ?? [];
    for (const edge of parentEdges) {
      const parentDepth = item.depth + 1;
      const parentExisting = visited.get(edge.parentId);
      if (parentExisting === undefined || parentDepth > parentExisting) {
        queue.push({ id: edge.parentId, depth: parentDepth });
      }
    }
  }

  const deepestPerson = deepestId ? graph.persons.get(deepestId) : null;
  return { depth: maxDepth, deepestName: deepestPerson?.name.full ?? null };
}

interface BuildContextOptions {
  graph: TreeGraph;
  flags: Flag[];
  selectedPersonId: string | null;
  activeView: string;
  deepScanResult: DeepScanResult | null;
  storyPathResult: StoryPathResult | null;
}

/**
 * Build a ChatContext from the current app state.
 * Keeps total token budget under ~500 tokens for the context block.
 */
export function buildChatContext(options: BuildContextOptions): ChatContext {
  const { graph, flags, selectedPersonId, activeView, deepScanResult, storyPathResult } = options;

  // Tree summary
  const totalPeople = graph.persons.size;
  const totalGenerations = graph.getGenerationDepth();

  // Find a "subject" — use the first person with no parent edges as heuristic
  let subjectName = 'Unknown';
  for (const person of graph.persons.values()) {
    const pEdges = graph.parentEdges.get(person.id) ?? [];
    const cEdges = graph.childEdges.get(person.id) ?? [];
    if (pEdges.length === 0 && cEdges.length > 0) {
      // This is a root ancestor, not subject. Keep looking.
      continue;
    }
    if (cEdges.length === 0 && pEdges.length > 0) {
      // Leaf node (subject candidate)
      subjectName = person.name.full;
      break;
    }
  }
  // If no clear leaf found, just use first person
  if (subjectName === 'Unknown' && graph.persons.size > 0) {
    subjectName = graph.persons.values().next().value!.name.full;
  }

  // Branches from deep scan
  const branchCount = deepScanResult?.branches?.length ?? 0;

  // Top notable ancestors from story paths
  const topNotableAncestors: { name: string; category: string; gen: number }[] = [];
  if (storyPathResult) {
    for (const ancestor of storyPathResult.notableAncestors.slice(0, 5)) {
      topNotableAncestors.push({
        name: ancestor.name,
        category: ancestor.category,
        gen: ancestor.generationsFromSubject,
      });
    }
  }

  // Top flags (critical/warning only, max 5)
  const topFlags = flags
    .filter(f => f.userStatus === 'new' || f.userStatus === 'acknowledged' || f.userStatus === 'investigating' && (f.severity === 'critical' || f.severity === 'warning'))
    .slice(0, 5)
    .map(f => ({ title: f.title, severity: f.severity }));

  // Health score: simple ratio of non-flagged to total persons
  const flaggedPersonIds = new Set(flags.flatMap(f => f.affectedPersonIds));
  const overallHealthScore = totalPeople > 0
    ? Math.round(((totalPeople - flaggedPersonIds.size) / totalPeople) * 100)
    : 100;

  // Generational distribution, deepest ancestors, tier distribution
  const generationalDistribution = computeGenerationalDistribution(graph);
  const deepestAncestors = findDeepestAncestors(graph);
  const tierDistribution = computeTierDistribution(graph);

  // Selected person context
  let selectedPersonContext: ChatContext['selectedPersonContext'] = null;
  if (selectedPersonId) {
    const person = graph.persons.get(selectedPersonId);
    if (person) {
      const parentEdges = graph.parentEdges.get(selectedPersonId) ?? [];
      const parents = parentEdges
        .map(e => graph.persons.get(e.parentId))
        .filter((p): p is Person => p !== undefined)
        .map(p => ({ name: p.name.full, tier: p.confidenceTier }));

      const childEdges = graph.childEdges.get(selectedPersonId) ?? [];
      const children = childEdges
        .map(e => graph.persons.get(e.childId))
        .filter((p): p is Person => p !== undefined)
        .map(p => ({ name: p.name.full }));

      const personFlags = flags
        .filter(f => f.affectedPersonIds.includes(selectedPersonId) && f.userStatus === 'new' || f.userStatus === 'acknowledged' || f.userStatus === 'investigating')
        .map(f => ({ title: f.title, severity: f.severity }));

      const sources = person.sourceIds
        .map(id => graph.sources.get(id))
        .filter((s): s is Source => s !== undefined)
        .map(s => ({ title: s.title, sourceClass: s.sourceClass }));

      // Notable paths through this person
      const onNotablePaths: string[] = [];
      if (storyPathResult) {
        for (const ancestor of storyPathResult.notableAncestors) {
          if (ancestor.pathToSubject.includes(selectedPersonId)) {
            onNotablePaths.push(ancestor.name);
          }
        }
      }

      const chainInfo = computeDeepestChain(selectedPersonId, graph);

      selectedPersonContext = {
        name: person.name.full,
        dates: formatPersonDates(person),
        places: formatPersonPlaces(person),
        tier: person.confidenceTier,
        parents,
        children,
        flags: personFlags,
        sources,
        onNotablePaths: onNotablePaths.slice(0, 5),
        ancestorChainDepth: chainInfo.depth,
        deepestAncestorName: chainInfo.deepestName,
      };
    }
  }

  return {
    selectedPersonId,
    activeView,
    treeSummary: {
      totalPeople,
      totalGenerations,
      subjectName,
      branchCount,
      topNotableAncestors,
      topFlags,
      overallHealthScore,
      generationalDistribution,
      deepestAncestors,
      tierDistribution,
    },
    selectedPersonContext,
  };
}

/**
 * Format ChatContext as a concise text block for system prompt injection.
 */
export function formatContextForPrompt(context: ChatContext): string {
  const lines: string[] = [];
  const ts = context.treeSummary;

  lines.push(`TREE: ${ts.totalPeople} people, ${ts.totalGenerations} generations, subject: ${ts.subjectName}`);

  if (ts.branchCount > 0) lines.push(`Branches: ${ts.branchCount}`);
  if (ts.overallHealthScore < 100) lines.push(`Health: ${ts.overallHealthScore}%`);

  if (ts.topNotableAncestors.length > 0) {
    lines.push('Notable ancestors: ' + ts.topNotableAncestors.map(a => `${a.name} (${a.category}, gen ${a.gen})`).join(', '));
  }

  if (ts.generationalDistribution.length > 0) {
    lines.push('Ancestor distribution: ' + ts.generationalDistribution.map(g => `Gen ${g.band}: ${g.count}`).join(', '));
  }

  if (ts.deepestAncestors.length > 0) {
    lines.push('Deepest ancestors: ' + ts.deepestAncestors.map(a => `${a.name} (${a.dates}, gen ${a.generation})`).join(', '));
  }

  if (ts.tierDistribution.length > 0) {
    lines.push('Confidence: ' + ts.tierDistribution.map(t => `T${t.tier}: ${t.count}`).join(', '));
  }

  if (ts.topFlags.length > 0) {
    lines.push('Active issues: ' + ts.topFlags.map(f => `${f.title} [${f.severity}]`).join(', '));
  }

  if (context.selectedPersonContext) {
    const sp = context.selectedPersonContext;
    lines.push('');
    lines.push(`SELECTED: ${sp.name} (${sp.dates}) — ${sp.places}`);
    lines.push(`Tier: ${sp.tier} (${TIER_LABELS[sp.tier as 1 | 2 | 3 | 4] ?? 'Unknown'})`);
    if (sp.parents.length > 0) {
      lines.push('Parents: ' + sp.parents.map(p => `${p.name} (T${p.tier})`).join(', '));
    }
    if (sp.children.length > 0) {
      lines.push('Children: ' + sp.children.map(c => c.name).join(', '));
    }
    if (sp.sources.length > 0) {
      lines.push('Sources: ' + sp.sources.map(s => `${s.title} [${s.sourceClass}]`).join(', '));
    }
    if (sp.flags.length > 0) {
      lines.push('Flags: ' + sp.flags.map(f => `${f.title} [${f.severity}]`).join(', '));
    }
    if (sp.onNotablePaths.length > 0) {
      lines.push('On paths to: ' + sp.onNotablePaths.join(', '));
    }
    if (sp.ancestorChainDepth > 0) {
      lines.push(`Ancestor chain depth: ${sp.ancestorChainDepth} generations` + (sp.deepestAncestorName ? ` (deepest: ${sp.deepestAncestorName})` : ''));
    }
  } else {
    lines.push('');
    lines.push('SELECTED: None — user is viewing the tree overview');
  }

  return lines.join('\n');
}
