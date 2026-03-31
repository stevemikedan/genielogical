import type { ConfidenceTier } from '@/types/common.ts';
import type { Person } from '@/types/person.ts';
import type { Flag } from '@/types/flag.ts';
import type { BridgeZone } from '@/types/bridge.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { detectBridgeZones } from './bridge-detector.ts';

// ── Tier-to-probability mapping for chain multiplication ────────────

export const TIER_TO_PROBABILITY: Record<ConfidenceTier, number> = {
  1: 0.95,
  2: 0.80,
  3: 0.55,
  4: 0.25,
};

// ── Person Identity Score (0-1) ─────────────────────────────────────

/**
 * Compute a 0-1 identity confidence score for a person based on:
 * - Source count and quality (0-0.4)
 * - Name consistency — no embedded titles or suspicious patterns (0-0.2)
 * - Date plausibility — has birth date, not flagged impossible (0-0.2)
 * - No critical flags (0-0.2)
 */
export function computePersonIdentityScore(
  person: Person,
  graph: TreeGraph,
  flags: Flag[],
): number {
  let score = 0;

  // Source quality factor (0-0.4)
  const sources = person.sourceIds
    .map(id => graph.sources.get(id))
    .filter(s => s !== undefined);

  if (sources.length > 0) {
    const hasPrimary = sources.some(s => s.sourceClass === 'primary');
    const hasSecondary = sources.some(s => s.sourceClass === 'secondary');

    if (hasPrimary) {
      score += 0.3;
      // Bonus for multiple sources
      if (sources.length >= 3) score += 0.1;
      else if (sources.length >= 2) score += 0.05;
    } else if (hasSecondary) {
      score += 0.2;
      if (sources.length >= 2) score += 0.05;
    } else {
      // Tertiary/derivative only
      score += 0.1;
    }
  }

  // Name consistency factor (0-0.2)
  const name = person.name;
  const nameText = `${name.full} ${name.prefix} ${name.suffix} ${name.raw}`;
  const hasEmbeddedTitle = /\b(king|queen|duke|earl|baron|prince|princess)\s+of\b/i.test(nameText);
  if (!hasEmbeddedTitle) {
    score += 0.15;
    // Bonus for having a proper given name and surname
    if (name.given && name.surname) score += 0.05;
  } else {
    // Some credit for having a name at all
    score += 0.05;
  }

  // Date plausibility factor (0-0.2)
  const personFlags = flags.filter(
    f => f.affectedPersonIds.includes(person.id)
      && f.userStatus !== 'dismissed'
      && f.userStatus !== 'resolved',
  );
  const hasImpossibleDate = personFlags.some(f => f.ruleId.startsWith('CHRONO_'));

  if (person.birth.date?.year) {
    if (!hasImpossibleDate) {
      score += 0.2;
    } else {
      score += 0.05; // Has a date but it's flagged
    }
  } else {
    // No birth date at all
    score += 0;
  }

  // Flag penalty factor (0-0.2)
  const hasCriticalFlag = personFlags.some(f => f.severity === 'critical');
  const hasWarningFlag = personFlags.some(f => f.severity === 'warning');

  if (!hasCriticalFlag && !hasWarningFlag) {
    score += 0.2;
  } else if (!hasCriticalFlag) {
    score += 0.1;
  }
  // Critical flag: 0 bonus

  return Math.min(1, Math.max(0, score));
}

// ── Chain Confidence (0-1) ──────────────────────────────────────────

export interface ChainResult {
  score: number;
  weakestTier: ConfidenceTier;
  bridgeZones: BridgeZone[];
  path: string[];
}

/**
 * Compute multiplicative chain confidence by walking primary parent edges
 * from startId upward to targetAncestorId. Each edge's tier is converted
 * to a probability and multiplied.
 *
 * @param startId - The person at the bottom (subject / living person)
 * @param targetAncestorId - The ancestor at the top to reach
 *
 * Returns score = 1.0 when start === target (no chain).
 * Returns score = 0 if person not in graph or no path exists.
 */
export function computeChainConfidence(
  startId: string,
  targetAncestorId: string,
  graph: TreeGraph,
): ChainResult {
  if (startId === targetAncestorId) {
    return { score: 1.0, weakestTier: 1, bridgeZones: [], path: [startId] };
  }

  if (!graph.persons.has(startId) || !graph.persons.has(targetAncestorId)) {
    return { score: 0, weakestTier: 4, bridgeZones: [], path: [] };
  }

  // Walk upward from start toward target ancestor through primary parent edges
  const path: string[] = [];
  const visited = new Set<string>();
  let current = startId;
  let product = 1;
  let weakestTier: ConfidenceTier = 1;

  while (current !== targetAncestorId) {
    if (visited.has(current)) {
      return { score: 0, weakestTier: 4, bridgeZones: [], path: [] };
    }
    visited.add(current);
    path.push(current);

    // Find the parent edge leading toward our target ancestor
    const primaryEdge = findEdgeToward(current, targetAncestorId, graph, visited);

    if (!primaryEdge) {
      return { score: 0, weakestTier: 4, bridgeZones: [], path: [] };
    }

    const tier = primaryEdge.confidenceTier;
    product *= TIER_TO_PROBABILITY[tier];
    if (tier > weakestTier) weakestTier = tier;

    current = primaryEdge.parentId;
  }

  path.push(targetAncestorId);

  // Detect bridge zones along the path
  const bridgeZones = detectBridgeZones(graph, path);

  return { score: product, weakestTier, bridgeZones, path };
}

/**
 * Find a primary parent edge from `currentId` that leads toward `targetId`.
 * Uses BFS probe to check reachability when multiple parent edges exist.
 */
function findEdgeToward(
  currentId: string,
  targetId: string,
  graph: TreeGraph,
  alreadyVisited: Set<string>,
): { parentId: string; confidenceTier: ConfidenceTier } | null {
  const parentEdges = graph.parentEdges.get(currentId) ?? [];
  const primaryEdges = parentEdges.filter(e => e.isPrimary);
  const allEdges = primaryEdges.length > 0 ? primaryEdges : parentEdges;

  if (allEdges.length === 0) return null;
  if (allEdges.length === 1) return allEdges[0];

  // Direct hit
  for (const e of allEdges) {
    if (e.parentId === targetId) return e;
  }

  // BFS probe: check which parent edge leads toward target
  for (const e of allEdges) {
    if (alreadyVisited.has(e.parentId)) continue;
    if (canReach(e.parentId, targetId, graph)) return e;
  }

  return null;
}

function canReach(startId: string, targetId: string, graph: TreeGraph): boolean {
  const visited = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === targetId) return true;
    if (visited.has(id)) continue;
    visited.add(id);

    const parentEdges = graph.parentEdges.get(id) ?? [];
    for (const e of parentEdges) {
      if (e.isPrimary && !visited.has(e.parentId)) {
        queue.push(e.parentId);
      }
    }
  }

  return false;
}

// ── Ancestral Confidence ────────────────────────────────────────────

/**
 * Ancestral confidence = person identity × chain confidence.
 */
export function computeAncestralConfidence(
  identityScore: number,
  chainScore: number,
): number {
  return identityScore * chainScore;
}
