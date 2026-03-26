/**
 * Cross-tree matcher — finds potential same-person matches across two trees.
 *
 * Uses name similarity + date proximity + place overlap to score candidates.
 */

import type { Person } from '@/types/person.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';

export interface CrossTreeMatch {
  personA: Person;
  personB: Person;
  score: number;          // 0-1, higher = more likely same person
  confidence: 'confirmed' | 'probable' | 'possible';
  reasons: string[];
}

/**
 * Normalize name for comparison: lowercase, trim, remove titles.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|sir|lady|rev|hon|col|lt|sgt|capt|maj|gen)\.?\s*/gi, '')
    .replace(/\b(jr|sr|i{1,3}|iv|v|vi{0,3})\b\.?/gi, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Compute name similarity using token overlap (Jaccard-like).
 */
function nameSimilarity(nameA: string, nameB: string): number {
  const tokensA = new Set(normalizeName(nameA).split(' ').filter(Boolean));
  const tokensB = new Set(normalizeName(nameB).split(' ').filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Date proximity score: 1 for exact match, drops off with year distance.
 */
function dateProximity(yearA: number | null, yearB: number | null): number {
  if (yearA === null || yearB === null) return 0.5; // unknown = neutral
  const diff = Math.abs(yearA - yearB);
  if (diff === 0) return 1;
  if (diff <= 1) return 0.9;
  if (diff <= 3) return 0.7;
  if (diff <= 5) return 0.4;
  if (diff <= 10) return 0.2;
  return 0;
}

/**
 * Place overlap: check if any place components match.
 */
function placeOverlap(placeA: string | null, placeB: string | null): number {
  if (!placeA || !placeB) return 0.5; // unknown = neutral
  const partsA = placeA.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const partsB = placeB.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

  if (partsA.length === 0 || partsB.length === 0) return 0.5;

  let matches = 0;
  for (const a of partsA) {
    for (const b of partsB) {
      if (a === b) matches++;
    }
  }

  const total = Math.max(partsA.length, partsB.length);
  return total > 0 ? matches / total : 0;
}

/**
 * Score a candidate match between two persons.
 */
function scoreMatch(personA: Person, personB: Person): CrossTreeMatch | null {
  const reasons: string[] = [];

  // Name similarity (weighted heaviest)
  const nameScore = nameSimilarity(personA.name.full, personB.name.full);
  if (nameScore < 0.3) return null; // names too different

  if (nameScore >= 0.8) reasons.push('Names very similar');
  else if (nameScore >= 0.5) reasons.push('Names partially match');

  // Sex must match (or one is unknown)
  if (personA.sex !== 'U' && personB.sex !== 'U' && personA.sex !== personB.sex) {
    return null;
  }

  // Birth date proximity
  const birthYearA = personA.birth.date?.year ?? null;
  const birthYearB = personB.birth.date?.year ?? null;
  const birthScore = dateProximity(birthYearA, birthYearB);

  if (birthYearA !== null && birthYearB !== null) {
    const diff = Math.abs(birthYearA - birthYearB);
    if (diff === 0) reasons.push('Same birth year');
    else if (diff <= 3) reasons.push(`Birth years within ${diff} years`);
    else if (diff > 10) return null; // too far apart
  }

  // Death date proximity
  const deathYearA = personA.death.date?.year ?? null;
  const deathYearB = personB.death.date?.year ?? null;
  const deathScore = dateProximity(deathYearA, deathYearB);

  if (deathYearA !== null && deathYearB !== null) {
    const diff = Math.abs(deathYearA - deathYearB);
    if (diff === 0) reasons.push('Same death year');
    else if (diff <= 3) reasons.push(`Death years within ${diff} years`);
  }

  // Birth place overlap
  const birthPlaceA = personA.birth.place?.raw ?? null;
  const birthPlaceB = personB.birth.place?.raw ?? null;
  const placeScore = placeOverlap(birthPlaceA, birthPlaceB);

  if (placeScore >= 0.5 && birthPlaceA && birthPlaceB) {
    reasons.push('Birth places overlap');
  }

  // Composite score: name=50%, birth=20%, death=15%, place=15%
  const score = nameScore * 0.5 + birthScore * 0.2 + deathScore * 0.15 + placeScore * 0.15;

  if (score < 0.3) return null;

  const confidence: CrossTreeMatch['confidence'] =
    score >= 0.8 ? 'confirmed' :
    score >= 0.55 ? 'probable' :
    'possible';

  return { personA, personB, score, confidence, reasons };
}

/**
 * Find potential same-person matches between two trees.
 *
 * Returns matches sorted by score descending.
 */
export function findCrossTreeMatches(
  graphA: TreeGraph,
  graphB: TreeGraph,
  minScore: number = 0.4,
): CrossTreeMatch[] {
  const matches: CrossTreeMatch[] = [];

  for (const personA of graphA.persons.values()) {
    for (const personB of graphB.persons.values()) {
      const match = scoreMatch(personA, personB);
      if (match && match.score >= minScore) {
        matches.push(match);
      }
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  return matches;
}

/**
 * Find potential matches for a specific person across another tree.
 */
export function findMatchesForPerson(
  person: Person,
  otherGraph: TreeGraph,
  minScore: number = 0.35,
): CrossTreeMatch[] {
  const matches: CrossTreeMatch[] = [];

  for (const candidate of otherGraph.persons.values()) {
    const match = scoreMatch(person, candidate);
    if (match && match.score >= minScore) {
      matches.push(match);
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches;
}
