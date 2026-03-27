import type { AncestryConflict } from '@/types/conflict.ts';
import type { Person } from '@/types/person.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import type { LocationContext } from '@/ai/era-context.ts';
import { formatSourcesSummary, formatFlagsSummary, formatLocationContext } from './user-templates.ts';

/**
 * AI prompt for resolving ancestry conflicts.
 *
 * Used as a Mode 2 or Mode 3 task to compare two conflicting parent
 * chains for duplicate persons and determine which is correct.
 */

export const CONFLICT_RESOLUTION_SYSTEM_PROMPT = `You are an expert genealogical researcher evaluating a parentage conflict.

Two entries in a family tree appear to be the same person but have DIFFERENT parents assigned. Your job is to search for documentary evidence and determine which parentage is correct — or whether neither can be confirmed.

EVALUATION CRITERIA (in priority order):
1. PRIMARY SOURCES — Vital records (birth/baptism/marriage/death certificates) that directly state parentage.
2. CENSUS RECORDS — Household listings showing parent-child relationships.
3. CHURCH RECORDS — Parish registers, baptism records naming parents.
4. PUBLISHED GENEALOGIES — Peer-reviewed academic genealogies (strong), user-submitted trees (weak).
5. CHRONOLOGICAL PLAUSIBILITY — Do the dates work? Can a 12-year-old be a parent? Did the supposed parent die before conception?
6. GEOGRAPHIC PLAUSIBILITY — Were the supposed parents in the right location?
7. SOURCE CHAIN QUALITY — How many sourced connections exist upstream of each version?

IMPORTANT:
- Do NOT assume the version with more descendants or more tree connections is correct. Popularity ≠ accuracy.
- Ancestry.com hint imports frequently create duplicate entries with different parents. The one entered first is NOT necessarily correct.
- Be specific about which records you found or didn't find. Cite URLs where possible.
- If you cannot determine which version is correct, say so clearly. "Uncertain" is a valid answer.

RESPONSE FORMAT — return ONLY a JSON object:
{
  "verdict": "version_a" | "version_b" | "neither" | "uncertain",
  "confidence": "high" | "medium" | "low",
  "reasoning": "2-3 sentence explanation of your conclusion",
  "evidenceForA": [{ "description": "...", "url": "..." | null, "weight": "strong" | "moderate" | "weak" }],
  "evidenceForB": [{ "description": "...", "url": "..." | null, "weight": "strong" | "moderate" | "weak" }],
  "evidenceAgainstA": [{ "description": "...", "url": "..." | null, "weight": "strong" | "moderate" | "weak" }],
  "evidenceAgainstB": [{ "description": "...", "url": "..." | null, "weight": "strong" | "moderate" | "weak" }],
  "recommendation": "merge_keep_a" | "merge_keep_b" | "keep_as_parallel" | "needs_more_research",
  "nextStep": { "action": "...", "repository": "...", "impactIfFound": "..." } | null
}`;

/**
 * Build the user prompt for conflict resolution.
 */
export function buildConflictResolutionPrompt(
  conflict: AncestryConflict,
  personA: Person,
  personB: Person,
  sourcesA: Source[],
  sourcesB: Source[],
  flagsA: Flag[],
  flagsB: Flag[],
  location: LocationContext | null,
): string {
  const parts: string[] = [];

  parts.push(`## ANCESTRY CONFLICT: ${personA.name.full}`);
  parts.push(`Conflict type: ${conflict.conflictType}`);
  parts.push('');

  // Version A
  parts.push(`### VERSION A: ${personA.name.full}`);
  parts.push(`- ID: ${personA.id}`);
  parts.push(`- Birth: ${personA.birth.date?.raw ?? 'unknown'}${personA.birth.place?.raw ? ', ' + personA.birth.place.raw : ''}`);
  parts.push(`- Death: ${personA.death.date?.raw ?? 'unknown'}${personA.death.place?.raw ? ', ' + personA.death.place.raw : ''}`);
  parts.push(`- Father: ${conflict.pathA.fatherName ?? 'unknown'} (${conflict.pathA.fatherId ?? 'none'})`);
  parts.push(`- Mother: ${conflict.pathA.motherName ?? 'unknown'} (${conflict.pathA.motherId ?? 'none'})`);
  parts.push(`- Grandparent depth: ${conflict.pathA.grandparentCount} ancestors within 3 generations`);
  parts.push(`- Descendants affected: ${conflict.descendantsAffectedA}`);
  parts.push(`- Confidence tier: ${conflict.confidenceTierA}`);
  if (sourcesA.length > 0) {
    parts.push(`- Sources:\n${formatSourcesSummary(sourcesA)}`);
  } else {
    parts.push('- Sources: NONE');
  }
  if (flagsA.length > 0) {
    parts.push(`- Flags:\n${formatFlagsSummary(flagsA)}`);
  }
  parts.push('');

  // Version B
  parts.push(`### VERSION B: ${personB.name.full}`);
  parts.push(`- ID: ${personB.id}`);
  parts.push(`- Birth: ${personB.birth.date?.raw ?? 'unknown'}${personB.birth.place?.raw ? ', ' + personB.birth.place.raw : ''}`);
  parts.push(`- Death: ${personB.death.date?.raw ?? 'unknown'}${personB.death.place?.raw ? ', ' + personB.death.place.raw : ''}`);
  parts.push(`- Father: ${conflict.pathB.fatherName ?? 'unknown'} (${conflict.pathB.fatherId ?? 'none'})`);
  parts.push(`- Mother: ${conflict.pathB.motherName ?? 'unknown'} (${conflict.pathB.motherId ?? 'none'})`);
  parts.push(`- Grandparent depth: ${conflict.pathB.grandparentCount} ancestors within 3 generations`);
  parts.push(`- Descendants affected: ${conflict.descendantsAffectedB}`);
  parts.push(`- Confidence tier: ${conflict.confidenceTierB}`);
  if (sourcesB.length > 0) {
    parts.push(`- Sources:\n${formatSourcesSummary(sourcesB)}`);
  } else {
    parts.push('- Sources: NONE');
  }
  if (flagsB.length > 0) {
    parts.push(`- Flags:\n${formatFlagsSummary(flagsB)}`);
  }
  parts.push('');

  // Shared info
  if (conflict.sharedDescendants.length > 0) {
    parts.push(`### SHARED DESCENDANTS: ${conflict.sharedDescendants.length} persons appear in both lines`);
  }

  if (location) {
    parts.push(`### LOCATION CONTEXT`);
    parts.push(formatLocationContext(location));
  }

  parts.push('');
  parts.push('Search for records that confirm or contradict each version. Which parentage is supported by the evidence?');

  return parts.join('\n');
}
