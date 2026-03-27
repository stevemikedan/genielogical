import type { Person } from '@/types/person.ts';
import type { AINotableContext } from '@/types/ai.ts';

const GENEALOGY_SYSTEM_PROMPT = `You are an expert genealogist specializing in historical record analysis, source evaluation, and family history verification. You have deep knowledge of:
- Civil registration systems worldwide and their inception dates
- Church records (parish registers, diocesan archives)
- Census records by country and era
- Military records, land records, probate records
- Medieval genealogy, peerage records, and the challenges of pre-1500 lineages
- DNA evidence interpretation for genealogical purposes
- Common pitfalls: prestige inflation, wish-fulfillment connections, conflated individuals

Always respond with valid JSON matching the requested schema. Be honest about uncertainty — if records are unlikely to exist for a given era/location, say so.`;

function formatDate(person: Person, type: 'birth' | 'death'): string {
  const event = person[type];
  if (!event.date) return 'unknown';
  if (event.date.year) {
    const place = event.place?.raw ? ` in ${event.place.raw}` : '';
    return `${event.date.raw}${place}`;
  }
  return event.date.raw || 'unknown';
}

export interface PromptPair {
  system: string;
  user: string;
}

// ── Notable Context ──────────────────────────────────────────────

export function buildNotableContextPrompt(
  person: Person,
  generationsFromSubject: number,
): PromptPair {
  const user = `Provide historical context for this ancestor found in a family tree:

**Name:** ${person.name.full}
**Birth:** ${formatDate(person, 'birth')}
**Death:** ${formatDate(person, 'death')}
**Generations from subject:** ${generationsFromSubject}

Respond with JSON matching this schema:
{
  "historicalContext": "Paragraph about this person's historical significance and the era they lived in",
  "connectionPlausibility": "Assessment of how plausible it is for a modern person to have a verified connection this many generations back",
  "suggestedReadings": ["Book or resource about this person or era"]
}`;

  return { system: GENEALOGY_SYSTEM_PROMPT, user };
}

export function parseNotableContext(
  personId: string,
  responseText: string,
): AINotableContext | null {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const data = JSON.parse(jsonMatch[0]) as {
      historicalContext?: string;
      connectionPlausibility?: string;
      suggestedReadings?: string[];
    };

    return {
      personId,
      historicalContext: data.historicalContext ?? 'No context provided.',
      connectionPlausibility: data.connectionPlausibility ?? 'Unknown.',
      suggestedReadings: Array.isArray(data.suggestedReadings) ? data.suggestedReadings : [],
      generatedAt: new Date(),
    };
  } catch {
    return null;
  }
}
