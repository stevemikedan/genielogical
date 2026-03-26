import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import type { AIPersonValidation, AISourceSuggestion, AIEdgeValidation, AINotableContext } from '@/types/ai.ts';

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

function formatSources(sources: Source[]): string {
  if (sources.length === 0) return 'No sources attached.';
  return sources.map(s =>
    `- [${s.sourceClass}/${s.sourceType}] ${s.title}${s.citation ? `: ${s.citation}` : ''}`
  ).join('\n');
}

function formatFlags(flags: Flag[]): string {
  if (flags.length === 0) return 'No flags.';
  return flags.map(f => `- [${f.severity}] ${f.title}: ${f.description}`).join('\n');
}

// ── Person Validation ────────────────────────────────────────────

export interface PromptPair {
  system: string;
  user: string;
}

export function buildPersonValidationPrompt(
  person: Person,
  parents: Person[],
  children: Person[],
  sources: Source[],
  flags: Flag[],
): PromptPair {
  const parentList = parents.length > 0
    ? parents.map(p => `  - ${p.name.full} (${formatDate(p, 'birth')} – ${formatDate(p, 'death')})`).join('\n')
    : '  None recorded';

  const childList = children.length > 0
    ? children.map(c => `  - ${c.name.full} (${formatDate(c, 'birth')} – ${formatDate(c, 'death')})`).join('\n')
    : '  None recorded';

  const user = `Evaluate this person in a family tree:

**Name:** ${person.name.full}
**Sex:** ${person.sex}
**Birth:** ${formatDate(person, 'birth')}
**Death:** ${formatDate(person, 'death')}
**Current Status:** ${person.status}
**Current Confidence Tier:** ${person.confidenceTier}

**Parents:**
${parentList}

**Children:**
${childList}

**Sources:**
${formatSources(sources)}

**Flags:**
${formatFlags(flags)}

Respond with JSON matching this schema:
{
  "summary": "Brief assessment of this person's historical plausibility",
  "suggestedTier": <1|2|3|4>,
  "historicalNotes": ["Note about historical context or concerns"],
  "sourceSuggestions": [
    {
      "sourceName": "Name of suggested source",
      "repository": "Where to find it",
      "url": "URL or null",
      "reasoning": "Why this source would help"
    }
  ]
}`;

  return { system: GENEALOGY_SYSTEM_PROMPT, user };
}

export function parsePersonValidation(
  personId: string,
  responseText: string,
): AIPersonValidation | null {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const data = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      suggestedTier?: number;
      historicalNotes?: string[];
      sourceSuggestions?: Array<{
        sourceName?: string;
        repository?: string;
        url?: string | null;
        reasoning?: string;
      }>;
    };

    const tier = Number(data.suggestedTier);
    const validTier = (tier >= 1 && tier <= 4 ? tier : 4) as ConfidenceTier;

    return {
      personId,
      summary: data.summary ?? 'No summary provided.',
      suggestedTier: validTier,
      historicalNotes: Array.isArray(data.historicalNotes) ? data.historicalNotes : [],
      sourceSuggestions: Array.isArray(data.sourceSuggestions)
        ? data.sourceSuggestions.map((s): AISourceSuggestion => ({
            sourceName: s.sourceName ?? 'Unknown',
            repository: s.repository ?? 'Unknown',
            url: s.url ?? null,
            reasoning: s.reasoning ?? '',
          }))
        : [],
      validatedAt: new Date(),
      modelId: 'claude-sonnet-4-20250514',
    };
  } catch {
    return null;
  }
}

// ── Edge Validation ──────────────────────────────────────────────

export function buildEdgeValidationPrompt(
  parent: Person,
  child: Person,
  edge: Edge,
  sources: Source[],
): PromptPair {
  const user = `Evaluate this parent-child relationship:

**Parent:** ${parent.name.full} (${formatDate(parent, 'birth')} – ${formatDate(parent, 'death')})
**Child:** ${child.name.full} (${formatDate(child, 'birth')} – ${formatDate(child, 'death')})
**Relationship Type:** ${edge.relationshipType}
**Legitimacy:** ${edge.legitimacy}
**Current Confidence Tier:** ${edge.confidenceTier}

**Sources for this connection:**
${formatSources(sources)}

Respond with JSON matching this schema:
{
  "plausibility": "confirmed" | "plausible" | "unlikely" | "implausible",
  "reasoning": "Explanation of assessment",
  "suggestedSources": ["Source that could verify or refute this connection"]
}`;

  return { system: GENEALOGY_SYSTEM_PROMPT, user };
}

export function parseEdgeValidation(
  edgeId: string,
  parentId: string,
  childId: string,
  responseText: string,
): AIEdgeValidation | null {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const data = JSON.parse(jsonMatch[0]) as {
      plausibility?: string;
      reasoning?: string;
      suggestedSources?: string[];
    };

    const validPlausibilities = ['confirmed', 'plausible', 'unlikely', 'implausible'] as const;
    const plausibility = validPlausibilities.includes(data.plausibility as typeof validPlausibilities[number])
      ? (data.plausibility as AIEdgeValidation['plausibility'])
      : 'plausible';

    return {
      edgeId,
      parentId,
      childId,
      plausibility,
      reasoning: data.reasoning ?? 'No reasoning provided.',
      suggestedSources: Array.isArray(data.suggestedSources) ? data.suggestedSources : [],
      validatedAt: new Date(),
    };
  } catch {
    return null;
  }
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
