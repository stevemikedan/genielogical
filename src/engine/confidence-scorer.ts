import type { ConfidenceTier } from '@/types/common.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Flag } from '@/types/flag.ts';
import type { Source, SourceClass } from '@/types/source.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { getTierLabel } from '@/types/tier-labels.ts';

// ── Helpers ──────────────────────────────────────────────────────────

const SOURCE_CLASS_TIER: Record<SourceClass, ConfidenceTier> = {
  primary: 1,
  secondary: 2,
  tertiary: 3,
  derivative: 3,
};

function getBestSourceTier(sources: Source[], provesWhat: string): ConfidenceTier {
  let best: ConfidenceTier = 3;
  for (const source of sources) {
    if (source.provesWhat.includes(provesWhat as never)) {
      const tier = SOURCE_CLASS_TIER[source.sourceClass];
      if (tier < best) best = tier;
    }
  }
  return best;
}

function getSourcesForIds(ids: string[], graph: TreeGraph): Source[] {
  const sources: Source[] = [];
  for (const id of ids) {
    const source = graph.sources.get(id);
    if (source) sources.push(source);
  }
  return sources;
}

function isActiveFlag(f: Flag): boolean {
  return f.userStatus !== 'dismissed' && f.userStatus !== 'resolved';
}

function getFlagsForEdge(edge: Edge, flags: Flag[]): Flag[] {
  return flags.filter(f => isActiveFlag(f) && f.affectedEdgeIds.includes(edge.id));
}

function getFlagsForPerson(person: Person, flags: Flag[]): Flag[] {
  return flags.filter(f => isActiveFlag(f) && f.affectedPersonIds.includes(person.id));
}

// ── Edge Confidence ──────────────────────────────────────────────────

export function scoreEdgeConfidence(
  edge: Edge,
  graph: TreeGraph,
  flags: Flag[] = [],
): { tier: ConfidenceTier; reason: string } {
  const reasons: string[] = [];
  const sources = getSourcesForIds(edge.sourceIds, graph);
  const edgeFlags = getFlagsForEdge(edge, flags);

  // Step 1: Source ceiling
  let baseTier: ConfidenceTier;
  if (sources.length === 0) {
    baseTier = 3;
    reasons.push('No sources attached to this connection.');
  } else {
    baseTier = getBestSourceTier(sources, 'parentage');
    const tierLabel = baseTier === 1 ? 'primary' : baseTier === 2 ? 'secondary' : 'tertiary/derivative';
    reasons.push(`Best source proving parentage: ${tierLabel}.`);
  }

  // Step 2: Flag penalties
  const hasCriticalFlag = edgeFlags.some(f => f.severity === 'critical');
  const hasChronoFlag = edgeFlags.some(f => f.ruleId.startsWith('CHRONO_'));
  const parent = graph.persons.get(edge.parentId);
  const child = graph.persons.get(edge.childId);
  const personFlags = [
    ...getFlagsForPerson(parent!, flags),
    ...getFlagsForPerson(child!, flags),
  ];
  const hasPrestigeFlag = personFlags.some(f => f.category === 'prestige_inflation');

  if (hasChronoFlag) {
    baseTier = 4 as ConfidenceTier;
    reasons.push('Chronological impossibility detected.');
  } else if (hasCriticalFlag) {
    baseTier = Math.max(baseTier, 3) as ConfidenceTier;
    reasons.push('Critical flag on this connection.');
  }
  if (hasPrestigeFlag) {
    baseTier = Math.max(baseTier, 3) as ConfidenceTier;
    reasons.push('Prestige inflation flag on connected person.');
  }

  // Step 2b: Ancestry conflict penalty
  const childFlags = child ? getFlagsForPerson(child, flags) : [];
  const hasConflictFlag = childFlags.some(f => f.ruleId === 'ANCESTRY_CONFLICT_DIFFERENT_PARENTS');
  if (hasConflictFlag) {
    baseTier = Math.max(baseTier, 3) as ConfidenceTier;
    reasons.push('Ancestry conflict: child has conflicting parent assignments.');
  }

  // Step 3: Era adjustment
  const parentBirthYear = parent?.birth.date?.year ?? null;
  if (parentBirthYear !== null) {
    if (parentBirthYear < 800) {
      baseTier = Math.max(baseTier, 3) as ConfidenceTier;
      reasons.push(`Era adjustment: pre-800 caps at Provisional.`);
    } else if (parentBirthYear < 1500) {
      baseTier = Math.max(baseTier, 2) as ConfidenceTier;
      reasons.push(`Era adjustment: pre-1500 caps at Supported.`);
    }
  }

  // Step 4: No-source desert penalty
  if (sources.length === 0) {
    if (edgeFlags.length > 0) {
      baseTier = 4 as ConfidenceTier;
      reasons.push('Unsourced AND flagged.');
    }
    // baseTier already 3 from step 1 if no flags
  }

  return {
    tier: baseTier,
    reason: `${getTierLabel(baseTier, reasons.join(' '))}: ${reasons.join(' ')}`,
  };
}

// ── Person Confidence ────────────────────────────────────────────────

export function scorePersonConfidence(
  person: Person,
  graph: TreeGraph,
  flags: Flag[] = [],
): { tier: ConfidenceTier; reason: string } {
  const reasons: string[] = [];
  const parentE = graph.parentEdges.get(person.id);
  const primaryParentEdges = parentE?.filter(e => e.isPrimary) ?? [];
  const personFlags = getFlagsForPerson(person, flags);
  const sources = getSourcesForIds(person.sourceIds, graph);

  let baseTier: ConfidenceTier;

  // Step 1 & 2: Root vs. has-parent-edges
  if (primaryParentEdges.length === 0) {
    // Root — score based on own sources
    const hasPrimaryBirthDeath = sources.some(
      s => s.sourceClass === 'primary' && s.provesWhat.some(p => p === 'birth' || p === 'death')
    );
    const hasSecondary = sources.some(s => s.sourceClass === 'secondary');

    if (hasPrimaryBirthDeath) {
      baseTier = 1;
      reasons.push('Has primary source for birth or death.');
    } else if (hasSecondary) {
      baseTier = 2;
      reasons.push('Has secondary source.');
    } else {
      baseTier = 3;
      reasons.push('No primary or secondary sources.');
    }
  } else {
    // Has parent edges — inherit worst tier
    baseTier = 1;
    for (const edge of primaryParentEdges) {
      if (edge.confidenceTier > baseTier) {
        baseTier = edge.confidenceTier;
      }
    }
    reasons.push(`Inherits ${getTierLabel(baseTier)} from weakest parent edge.`);
  }

  // Step 3: Self-sourcing bonus
  if (baseTier >= 3) {
    const hasPrimaryIdentity = sources.some(
      s => s.sourceClass === 'primary' && s.provesWhat.includes('identity')
    );
    if (hasPrimaryIdentity) {
      baseTier = Math.max(baseTier - 1, 2) as ConfidenceTier;
      reasons.push('Self-sourcing bonus: primary identity source improves by 1 tier.');
    }
  }

  // Step 4: Flag penalty
  const hasCritical = personFlags.some(f => f.severity === 'critical');
  if (hasCritical) {
    baseTier = Math.max(baseTier, 3) as ConfidenceTier;
    reasons.push('Critical flag penalty.');
  }

  return {
    tier: baseTier,
    reason: `${getTierLabel(baseTier, reasons.join(' '))}: ${reasons.join(' ')}`,
  };
}

// ── Score All ────────────────────────────────────────────────────────

/**
 * Score all edges then all persons in the graph, mutating in place.
 * Edges must be scored first since person confidence depends on edge tiers.
 */
export function scoreAllConfidence(graph: TreeGraph, flags: Flag[]): void {
  // Score all edges
  for (const edge of graph.edges.values()) {
    const result = scoreEdgeConfidence(edge, graph, flags);
    edge.confidenceTier = result.tier;
    edge.confidenceReason = result.reason;
  }

  // Score all persons
  for (const person of graph.persons.values()) {
    const result = scorePersonConfidence(person, graph, flags);
    person.confidenceTier = result.tier;
    person.confidenceReason = result.reason;
  }
}
