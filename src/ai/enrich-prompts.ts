/**
 * AI Record Enrichment — agentic prompts for finding genealogical records.
 *
 * Uses Anthropic's web_search tool so Claude can actually search
 * FamilySearch, FindAGrave, Ancestry, WikiTree, and other genealogical
 * databases in real time. Returns structured suggestions with live
 * citations from the records found.
 */

import type { Person } from '@/types/person.ts';
import type { AIEnrichResult, EnrichSuggestionField, EnrichFieldKey, WebSearchCitation } from '@/types/ai.ts';
import type { PromptPair } from './validation-prompts.ts';
import { buildSourceSearchPlan, formatSourceContext } from './genealogy-source-registry.ts';
import type { SourceSearchPlan } from './genealogy-source-registry.ts';

const ENRICH_SYSTEM_PROMPT = `You are an expert genealogist with access to web search and web fetch. Your job is to find REAL records for a person in a family tree.

WORKFLOW:
1. Search for the person on genealogical databases: FamilySearch, FindAGrave, WikiTree, Ancestry, etc.
2. When you find promising search results, use web_fetch to read the actual record pages and extract verified data.
3. Search for census records, vital records, church records, burial records, and other primary sources.
4. Cross-reference multiple sources to build confidence.
5. Return structured JSON with your findings.

SEARCH STRATEGY:
- Start with FamilySearch (largest free database) — search for historical records AND the family tree.
- Search FindAGrave for burial/death confirmation and headstone photos.
- Search WikiTree for collaborative tree data with source citations.
- For Scottish records, search ScotlandsPeople. For Irish records, search IrishGenealogy.ie.
- Use the person's known details (name, dates, location, family members) to narrow searches.
- If initial searches are too broad, add family context (spouse name, parent name, birth location) to refine.

RECORD VERIFICATION:
- After finding a search result, use web_fetch to navigate to the specific record page.
- Extract person attributes (names, dates, places, relationships) directly from the record page content.
- Always include the specific record page URL in "recordUrl" (not the search results page).
- The "searchUrl" field should contain the search/collection page URL where the record was found.
- If you cannot fetch the record page, still include whatever you found from the search results.

RULES:
1. Only suggest details you found in actual records or reliable genealogical databases.
2. Cite the specific URL where you found each piece of information.
3. Distinguish confidence levels:
   - HIGH: Found in vital records, official documents, or multiple corroborating sources.
   - MEDIUM: Found in one reliable source (census, church record, curated tree).
   - LOW: Found in user-submitted trees or secondary sources without citations.
4. If you cannot find the person in any records, say so honestly. Do NOT make up records.
5. When suggesting family members (father, mother, spouse, sibling), cite the record showing the relationship.

Always respond with valid JSON matching the requested schema.`;

function formatPersonContext(person: Person): string {
  const parts: string[] = [];
  parts.push(`**Name:** ${person.name.full}`);
  if (person.name.middle) parts.push(`**Middle Name:** ${person.name.middle}`);
  if (person.name.maidenName) parts.push(`**Maiden Name:** ${person.name.maidenName}`);
  parts.push(`**Sex:** ${person.sex === 'U' ? 'Unknown' : person.sex}`);

  if (person.birth.date?.raw) {
    parts.push(`**Birth Date:** ${person.birth.date.raw}`);
  }
  if (person.birth.place?.raw) {
    parts.push(`**Birth Place:** ${person.birth.place.raw}`);
  }
  if (person.death.date?.raw) {
    parts.push(`**Death Date:** ${person.death.date.raw}`);
  }
  if (person.death.place?.raw) {
    parts.push(`**Death Place:** ${person.death.place.raw}`);
  }

  if (person.alternateNames.length > 0) {
    parts.push(`**Alternate Names:** ${person.alternateNames.map(n => `${n.name.full} (${n.type})`).join(', ')}`);
  }

  if (person.notes) {
    parts.push(`**Notes:** ${person.notes.slice(0, 200)}`);
  }

  return parts.join('\n');
}

function formatFamilyContext(
  parents: Person[],
  children: Person[],
  spouses: Person[],
  siblings: Person[],
): string {
  const parts: string[] = [];

  if (parents.length > 0) {
    parts.push('**Known Parents:**');
    for (const p of parents) {
      const dates = [p.birth.date?.raw, p.death.date?.raw].filter(Boolean).join(' – ');
      parts.push(`  - ${p.name.full}${dates ? ` (${dates})` : ''}`);
    }
  }

  if (spouses.length > 0) {
    parts.push('**Known Spouses:**');
    for (const s of spouses) {
      const dates = [s.birth.date?.raw, s.death.date?.raw].filter(Boolean).join(' – ');
      parts.push(`  - ${s.name.full}${dates ? ` (${dates})` : ''}`);
    }
  }

  if (siblings.length > 0) {
    parts.push(`**Known Siblings (${siblings.length}):**`);
    for (const s of siblings.slice(0, 5)) {
      const dates = [s.birth.date?.raw, s.death.date?.raw].filter(Boolean).join(' – ');
      parts.push(`  - ${s.name.full}${dates ? ` (${dates})` : ''}`);
    }
    if (siblings.length > 5) {
      parts.push(`  - ...and ${siblings.length - 5} more`);
    }
  }

  if (children.length > 0) {
    parts.push(`**Known Children (${children.length}):**`);
    for (const c of children.slice(0, 5)) {
      const dates = [c.birth.date?.raw, c.death.date?.raw].filter(Boolean).join(' – ');
      parts.push(`  - ${c.name.full}${dates ? ` (${dates})` : ''}`);
    }
    if (children.length > 5) {
      parts.push(`  - ...and ${children.length - 5} more`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : 'No family members recorded.';
}

function identifyMissingFields(person: Person): string[] {
  const missing: string[] = [];
  if (!person.birth.date) missing.push('birthDate');
  if (!person.birth.place) missing.push('birthPlace');
  if (!person.death.date) missing.push('deathDate');
  if (!person.death.place) missing.push('deathPlace');
  if (person.sex === 'U') missing.push('sex');
  return missing;
}

export function buildEnrichPrompt(
  person: Person,
  parents: Person[],
  children: Person[],
  spouses: Person[],
  siblings?: Person[],
  referenceUrls?: string[],
): PromptPair {
  const missingFields = identifyMissingFields(person);
  const missingList = missingFields.length > 0
    ? `Missing fields: ${missingFields.join(', ')}`
    : 'All basic fields are filled — search for corrections or additional details.';

  // Build prioritized source search plan for context
  const searchPlan = buildSourceSearchPlan(person);
  const sourceContext = formatSourceContext(searchPlan);

  // Build reference URLs section if provided
  const referenceSection = referenceUrls && referenceUrls.length > 0
    ? `\n**Reference Links Provided:**\nThe user has provided these reference URLs — fetch each one first and extract relevant genealogical data before doing broader searches:\n${referenceUrls.map(url => `- ${url}`).join('\n')}\n`
    : '';

  const user = `Search genealogical databases for records of this person and suggest details based on what you find.

${formatPersonContext(person)}

**Family Context:**
${formatFamilyContext(parents, children, spouses, siblings ?? [])}

${missingList}
${referenceSection}
**Suggested databases to search (prioritized for this person's era/region):**
${sourceContext}

INSTRUCTIONS:
1. ${referenceUrls && referenceUrls.length > 0 ? 'First, use web_fetch to read each reference URL provided above and extract genealogical data.\n2. Then use' : 'Use'} web search to look up this person on FamilySearch, FindAGrave, WikiTree, and other relevant databases.
${referenceUrls && referenceUrls.length > 0 ? '3' : '2'}. Search for census records, vital records, church records, and burial records.
${referenceUrls && referenceUrls.length > 0 ? '4' : '3'}. If the person has known parents or spouse, use those names to narrow your search.
${referenceUrls && referenceUrls.length > 0 ? '5' : '4'}. When you find a promising search result, use web_fetch to read the actual record page and extract verified data.
${referenceUrls && referenceUrls.length > 0 ? '6' : '5'}. For each finding, cite the specific record page URL.
${referenceUrls && referenceUrls.length > 0 ? '7' : '6'}. Cross-reference multiple sources when possible.

After searching, respond with JSON matching this schema:
{
  "identifiedAs": "If you identified a specific individual in records, describe who (or null if not found)",
  "summary": "What you found, which databases you searched, how confident you are",
  "sourcesSearched": ["FamilySearch", "FindAGrave", ...databases you actually searched],
  "suggestions": [
    {
      "field": "birthDate" | "birthPlace" | "deathDate" | "deathPlace" | "sex" | "father" | "mother" | "spouse" | "sibling" | "occupation" | "note",
      "label": "Human-readable label (e.g. 'Birth Date')",
      "value": "The value from records",
      "reasoning": "Cite the specific record (e.g. '1850 US Census, Henrico County, Virginia')",
      "confidence": "high" | "medium" | "low",
      "sourceHint": "Record collection name (e.g. 'England Births and Christenings, 1538-1975')",
      "searchUrl": "URL of the search page or collection where this record was found",
      "recordUrl": "URL of the specific record page you read (e.g. FindAGrave memorial page, FamilySearch person page)",
      "sourceDatabase": "Database name (e.g. 'FamilySearch', 'FindAGrave')"
    }
  ]
}

Only include suggestions backed by records you actually found. If you found nothing, return empty suggestions and explain in the summary.`;

  return { system: ENRICH_SYSTEM_PROMPT, user };
}

const VALID_FIELDS: Set<string> = new Set([
  'birthDate', 'birthPlace', 'deathDate', 'deathPlace',
  'sex', 'father', 'mother', 'spouse', 'sibling', 'occupation', 'note',
]);

const VALID_CONFIDENCES: Set<string> = new Set(['high', 'medium', 'low']);

export function parseEnrichResponse(
  personId: string,
  responseText: string,
  webCitations?: WebSearchCitation[],
): AIEnrichResult | null {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const data = JSON.parse(jsonMatch[0]) as {
      identifiedAs?: string | null;
      summary?: string;
      sourcesSearched?: string[];
      suggestions?: Array<{
        field?: string;
        label?: string;
        value?: string;
        reasoning?: string;
        confidence?: string;
        sourceHint?: string | null;
        searchUrl?: string | null;
        recordUrl?: string | null;
        sourceDatabase?: string | null;
      }>;
    };

    const suggestions: EnrichSuggestionField[] = [];
    if (Array.isArray(data.suggestions)) {
      for (const s of data.suggestions) {
        if (!s.field || !s.value || !VALID_FIELDS.has(s.field)) continue;
        suggestions.push({
          field: s.field as EnrichFieldKey,
          label: s.label ?? s.field,
          value: s.value,
          reasoning: s.reasoning ?? '',
          confidence: VALID_CONFIDENCES.has(s.confidence ?? '')
            ? (s.confidence as 'high' | 'medium' | 'low')
            : 'low',
          sourceHint: s.sourceHint ?? null,
          searchUrl: s.searchUrl ?? null,
          recordUrl: s.recordUrl ?? null,
          sourceDatabase: s.sourceDatabase ?? null,
        });
      }
    }

    return {
      personId,
      identifiedAs: data.identifiedAs ?? null,
      summary: data.summary ?? 'No summary provided.',
      suggestions,
      sourcesSearched: Array.isArray(data.sourcesSearched) ? data.sourcesSearched : [],
      webCitations: webCitations ?? [],
      generatedAt: new Date(),
      modelId: 'claude-sonnet-4-20250514',
    };
  } catch {
    return null;
  }
}

/** Re-export for use by the hook */
export { buildSourceSearchPlan };
export type { SourceSearchPlan };
