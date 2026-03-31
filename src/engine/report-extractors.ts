import type { Person } from '@/types/person.ts';
import type { Flag } from '@/types/flag.ts';
import type { NotableCategory } from '@/types/story-path.ts';
import type {
  ReportScope, ReportCandidate,
  DataQualityCandidate, DataQualityIssue,
  BranchCoverageEntry,
} from '@/types/report.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { matchPatterns } from './notable-patterns.ts';
import {
  computePersonIdentityScore,
  computeChainConfidence,
  computeAncestralConfidence,
} from './report-scorer.ts';

// ── Notable People Extraction ───────────────────────────────────────

/**
 * Extract notable people candidates from the graph, scored and sorted.
 */
export function extractNotablePeople(
  graph: TreeGraph,
  flags: Flag[],
  rootPersonId: string,
  config: { sex: 'M' | 'F'; scope: ReportScope },
): ReportCandidate[] {
  const root = graph.persons.get(rootPersonId);
  if (!root) return [];

  // BFS upward to collect all ancestors with generation + path info
  const ancestorMap = new Map<string, { generation: number; path: string[] }>();
  ancestorMap.set(rootPersonId, { generation: 0, path: [rootPersonId] });

  const queue: Array<{ personId: string; generation: number; path: string[] }> = [
    { personId: rootPersonId, generation: 0, path: [rootPersonId] },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const parentEdges = graph.parentEdges.get(current.personId) ?? [];

    for (const edge of parentEdges) {
      if (!edge.isPrimary) continue;
      const parentId = edge.parentId;
      if (ancestorMap.has(parentId)) continue;

      const newPath = [...current.path, parentId];
      const newGen = current.generation + 1;
      ancestorMap.set(parentId, { generation: newGen, path: newPath });
      queue.push({ personId: parentId, generation: newGen, path: newPath });
    }
  }

  // Build direct-line set: follow primary maternal or paternal line
  const directLineIds = buildDirectLine(graph, rootPersonId, config.sex);

  // Filter and score candidates
  const candidates: ReportCandidate[] = [];

  for (const [personId, info] of ancestorMap) {
    const person = graph.persons.get(personId);
    if (!person) continue;

    // Sex filter
    if (person.sex !== config.sex && person.sex !== 'U') continue;

    // Scope: generation range
    if (config.scope.generationRange) {
      const { min, max } = config.scope.generationRange;
      if (info.generation < min || info.generation > max) continue;
    }

    // Scope: direct_line mode
    if (config.scope.mode === 'direct_line' && !directLineIds.has(personId)) continue;

    // Pattern matching
    const textToSearch = buildSearchText(person);
    const matches = matchPatterns(textToSearch);
    const matchReasons: string[] = matches.map(m => m.significance);
    const categories: NotableCategory[] = [...new Set(matches.map(m => m.category))];

    // Also include "documented ancestors" — anyone with sources or events beyond birth/death
    const hasDocumentation = person.sourceIds.length > 0 ||
      person.events.some(e => e.type !== 'birth' && e.type !== 'death');

    if (matches.length === 0 && !hasDocumentation) continue;

    if (matches.length === 0 && hasDocumentation) {
      matchReasons.push('Documented ancestor');
      categories.push('other');
    }

    // Tier filter
    if (config.scope.minConfidenceTier !== null) {
      if (person.confidenceTier > config.scope.minConfidenceTier) continue;
    }

    // Scoring
    const identityScore = computePersonIdentityScore(person, graph, flags);
    const chainResult = computeChainConfidence(rootPersonId, personId, graph);
    const ancestralConfidence = computeAncestralConfidence(identityScore, chainResult.score);

    const section = directLineIds.has(personId) ? 'direct_line' as const : 'historical' as const;

    candidates.push({
      personId,
      person,
      section,
      matchReasons,
      categories,
      generationsFromRoot: info.generation,
      pathToRoot: info.path,
      personIdentityScore: identityScore,
      chainConfidence: chainResult.score,
      ancestralConfidence,
      personTier: person.confidenceTier,
      weakestChainTier: chainResult.weakestTier,
      bridgeZones: chainResult.bridgeZones,
      aiNarrative: null,
      aiQuickCheck: null,
    });
  }

  // Sort by ancestral confidence descending
  candidates.sort((a, b) => b.ancestralConfidence - a.ancestralConfidence);

  return candidates;
}

// ── Data Quality Extraction ─────────────────────────────────────────

/**
 * Scan all persons for data quality issues, compute per-person quality score.
 */
export function extractDataQualityIssues(
  graph: TreeGraph,
  flags: Flag[],
): DataQualityCandidate[] {
  const candidates: DataQualityCandidate[] = [];

  for (const person of graph.persons.values()) {
    const issues: DataQualityIssue[] = [];

    // Missing birth date
    if (!person.birth.date?.year) {
      issues.push({
        type: 'missing_date',
        severity: 'warning',
        description: `${person.name.full}: missing birth date`,
        suggestedFix: 'Search vital records for birth date',
      });
    }

    // Missing death date (only for likely historical persons — born >100 years ago or no birth year)
    const birthYear = person.birth.date?.year;
    const isHistorical = !birthYear || birthYear < new Date().getFullYear() - 100;
    if (isHistorical && !person.death.date?.year) {
      issues.push({
        type: 'missing_date',
        severity: 'info',
        description: `${person.name.full}: missing death date`,
        suggestedFix: 'Search death records and cemetery databases',
      });
    }

    // Missing birth place
    if (!person.birth.place) {
      issues.push({
        type: 'missing_place',
        severity: 'info',
        description: `${person.name.full}: missing birth place`,
        suggestedFix: 'Check census or christening records for birthplace',
      });
    }

    // No sources
    if (person.sourceIds.length === 0) {
      issues.push({
        type: 'no_sources',
        severity: 'critical',
        description: `${person.name.full}: no sources attached`,
        suggestedFix: 'Attach at least one source to verify this person\'s identity',
      });
    }

    // Name overloading (embedded titles)
    const nameText = `${person.name.full} ${person.name.prefix} ${person.name.suffix}`;
    if (/\b(king|queen|duke|earl|baron|prince|princess)\s+of\b/i.test(nameText)) {
      issues.push({
        type: 'name_overloading',
        severity: 'warning',
        description: `${person.name.full}: title embedded in name field`,
        suggestedFix: 'Move title to prefix field; use proper name in name field',
      });
    }

    // Missing sex
    if (person.sex === 'U') {
      issues.push({
        type: 'missing_sex',
        severity: 'info',
        description: `${person.name.full}: sex not specified`,
        suggestedFix: 'Set sex based on name or source records',
      });
    }

    // Impossible dates (from flags)
    const personFlags = flags.filter(
      f => f.affectedPersonIds.includes(person.id) &&
        f.userStatus !== 'dismissed' && f.userStatus !== 'resolved',
    );
    const hasImpossibleDate = personFlags.some(f => f.ruleId.startsWith('CHRONO_'));
    if (hasImpossibleDate) {
      issues.push({
        type: 'impossible_date',
        severity: 'critical',
        description: `${person.name.full}: chronological impossibility detected`,
        suggestedFix: 'Review and correct conflicting dates',
      });
    }

    // Orphan (no edges at all)
    const parentEdges = graph.parentEdges.get(person.id) ?? [];
    const childEdges = graph.childEdges.get(person.id) ?? [];
    if (parentEdges.length === 0 && childEdges.length === 0) {
      issues.push({
        type: 'orphan',
        severity: 'warning',
        description: `${person.name.full}: not connected to any family`,
        suggestedFix: 'Connect this person to their parents or children',
      });
    }

    // Duplicate suspect (from flags)
    const isDuplicateSuspect = personFlags.some(f => f.category === 'duplicate_suspect');
    if (isDuplicateSuspect) {
      issues.push({
        type: 'duplicate_suspect',
        severity: 'warning',
        description: `${person.name.full}: possible duplicate entry`,
        suggestedFix: 'Review and merge if duplicate confirmed',
      });
    }

    // Compute quality score (1.0 = perfect, penalties per issue)
    const penalties: Record<string, number> = {
      critical: 0.25,
      warning: 0.1,
      info: 0.05,
    };
    let qualityScore = 1.0;
    for (const issue of issues) {
      qualityScore -= penalties[issue.severity];
    }
    qualityScore = Math.max(0, qualityScore);

    candidates.push({
      personId: person.id,
      person,
      issues,
      qualityScore,
    });
  }

  // Sort by quality score ascending (worst first)
  candidates.sort((a, b) => a.qualityScore - b.qualityScore);

  return candidates;
}

// ── Branch Coverage ─────────────────────────────────────────────────

/**
 * Compute source coverage per branch (great-grandparent line).
 */
export function computeBranchCoverage(
  graph: TreeGraph,
  rootPersonId: string,
): BranchCoverageEntry[] {
  const entries: BranchCoverageEntry[] = [];

  // Get up to great-grandparents (gen 3) as branch roots
  const branchRoots = getBranchRoots(graph, rootPersonId);

  for (const branch of branchRoots) {
    // BFS from branch root upward to count persons and sourced persons
    const visited = new Set<string>();
    const queue = [branch.ancestorId];
    let total = 0;
    let withSources = 0;

    while (queue.length > 0) {
      const pid = queue.shift()!;
      if (visited.has(pid)) continue;
      visited.add(pid);

      const person = graph.persons.get(pid);
      if (!person) continue;

      total++;
      if (person.sourceIds.length > 0) withSources++;

      const parentEdges = graph.parentEdges.get(pid) ?? [];
      for (const e of parentEdges) {
        if (e.isPrimary && !visited.has(e.parentId)) {
          queue.push(e.parentId);
        }
      }
    }

    entries.push({
      branchLabel: branch.label,
      ancestorId: branch.ancestorId,
      ancestorName: branch.name,
      totalPersons: total,
      withSources,
      coveragePercent: total > 0 ? (withSources / total) * 100 : 0,
    });
  }

  return entries;
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildSearchText(person: Person): string {
  const parts = [
    person.name.full,
    person.name.raw,
    person.name.prefix,
    person.name.suffix,
    person.notes,
    ...person.events.map(e => e.notes),
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * Build the direct maternal or paternal line from root upward.
 * For Notable Women (sex='F'): follows mother edges.
 * For Notable Men (sex='M'): follows father edges.
 */
function buildDirectLine(graph: TreeGraph, rootId: string, sex: 'M' | 'F'): Set<string> {
  const directLine = new Set<string>();
  directLine.add(rootId);

  let current = rootId;
  const visited = new Set<string>();

  while (!visited.has(current)) {
    visited.add(current);
    const parentEdges = graph.parentEdges.get(current) ?? [];
    const lineParent = parentEdges.find(e => {
      if (!e.isPrimary) return false;
      const parent = graph.persons.get(e.parentId);
      return parent && parent.sex === sex;
    });

    if (!lineParent) break;
    directLine.add(lineParent.parentId);
    current = lineParent.parentId;
  }

  return directLine;
}

interface BranchRoot {
  ancestorId: string;
  name: string;
  label: string;
}

function getBranchRoots(graph: TreeGraph, rootId: string): BranchRoot[] {
  const roots: BranchRoot[] = [];

  // Walk 3 generations up (to great-grandparents)
  const gen1 = getParentIds(graph, rootId);
  for (const g1 of gen1) {
    const gen2 = getParentIds(graph, g1);
    for (const g2 of gen2) {
      const gen3 = getParentIds(graph, g2);
      if (gen3.length > 0) {
        for (const g3 of gen3) {
          const person = graph.persons.get(g3);
          if (person) {
            roots.push({
              ancestorId: g3,
              name: person.name.full,
              label: `${person.name.surname || person.name.full} line`,
            });
          }
        }
      } else {
        // If no great-grandparents, use grandparent as branch root
        const person = graph.persons.get(g2);
        if (person) {
          roots.push({
            ancestorId: g2,
            name: person.name.full,
            label: `${person.name.surname || person.name.full} line`,
          });
        }
      }
    }
  }

  // If no branches found, use root's parents
  if (roots.length === 0) {
    for (const g1 of gen1) {
      const person = graph.persons.get(g1);
      if (person) {
        roots.push({
          ancestorId: g1,
          name: person.name.full,
          label: `${person.name.surname || person.name.full} line`,
        });
      }
    }
  }

  return roots;
}

function getParentIds(graph: TreeGraph, personId: string): string[] {
  const edges = graph.parentEdges.get(personId) ?? [];
  return edges.filter(e => e.isPrimary).map(e => e.parentId);
}
