import type { Person } from '@/types/person.ts';
import type { Flag } from '@/types/flag.ts';
import type { Source } from '@/types/source.ts';
import type { EraTag } from '@/ai/era-context.ts';
import { formatPersonBlock, formatFlagsSummary, formatSourcesSummary } from './user-templates.ts';

/**
 * Mode 1: Quick Plausibility Check
 *
 * Fast triage — no web search, pure knowledge assessment.
 * For batch operations or initial assessment.
 * Cost: ~$0.003 per person (1 API call, no tools)
 */

export const QUICK_CHECK_SYSTEM_PROMPT = `You are a genealogical research assistant. You will be given data about a person from a GEDCOM family tree and asked to assess plausibility.

Your job is NOT to be polite or hedging. Be direct and specific:
- If something is wrong, say exactly what and why.
- If something is plausible, say what would confirm it.
- If a date, place, or connection is anachronistic, flag it with the correct information.

Always respond in the specified JSON format. No prose outside the JSON.`;

export function buildQuickCheckUserPrompt(
  person: Person,
  parents: { father: Person | null; mother: Person | null },
  children: Person[],
  sources: Source[],
  flags: Flag[],
  eraTag: EraTag,
): string {
  const personBlock = formatPersonBlock(person, parents, children);
  const flagsSummary = formatFlagsSummary(flags);
  const sourcesSummary = formatSourcesSummary(sources);

  return `Assess this person from a family tree:

${personBlock}
Active flags: ${flagsSummary}
Sources attached: ${sourcesSummary}
Era context: ${eraTag}

Respond with JSON only:
{
  "plausibility": "confirmed" | "plausible" | "questionable" | "implausible",
  "issues": [
    {
      "type": "date" | "place" | "name" | "connection" | "title",
      "description": "specific issue",
      "correction": "what it should be, if known, or null"
    }
  ],
  "suggestedTier": 1-4,
  "tierReason": "one sentence explaining why",
  "quickWin": "the single most impactful thing to verify, or null"
}`;
}
