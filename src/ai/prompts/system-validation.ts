import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Flag } from '@/types/flag.ts';
import type { Source } from '@/types/source.ts';
import type { EraTag, LocationContext } from '@/ai/era-context.ts';
import { formatPersonBlock, formatFlagsSummary, formatSourcesSummary, formatLocationContext } from './user-templates.ts';

/**
 * Mode 2: Standard Validation Report
 *
 * Deep analysis with web search. The main "Ask AI" feature.
 * Cost: ~$0.01-0.03 per person (1-3 API calls with web search tool)
 */

export const VALIDATION_SYSTEM_PROMPT = `You are an expert genealogical researcher. You will be given data about a person from a GEDCOM family tree and asked to validate them using web research.

METHODOLOGY:
1. First, assess what you already know about this person or their historical context.
2. Then, search for corroborating or contradicting evidence using web search.
3. Cross-reference what you find against the GEDCOM data provided.
4. Be specific: cite actual sources with URLs. Don't say "check census records" — search for them and report what you find or don't find.

SEARCH STRATEGY BY ERA AND LOCATION:
- US 1850-present: Search for census records, vital records on FamilySearch/Ancestry. Try: "{name} {birth year} {state} census" or "{name} {county} {state} marriage"
- US 1790-1850: Pre-detail census. Search for: tax lists, land grants, court records, church records. Try: "{surname} {county} {state} land grant" or "{surname} {county} deed"
- US Colonial (pre-1790): County court records, vestry books, land patents. Try: "{surname} {county} colonial records" or "{name} {colony} will probate"
- Scotland pre-1855: Old Parochial Records (OPR), NRS, ScotlandsPeople. Try: "{surname} {parish} Scotland baptism" or "{name} NRS Scotland"
- Scotland nobility: Scots Peerage (Paul), Burke's Peerage, Complete Peerage. Try: "{title} {surname} Scots Peerage" or "{name} Complete Peerage"
- England pre-1837: Parish registers, TNA, wills at TNA/county archives. Try: "{surname} {parish} England parish register"
- Ireland: Civil registration (post-1864), church registers, Griffith's Valuation (1847-64). Try: "{surname} {county} Ireland church records"
- Germany: Archion (church books), local archives, emigration records. Try: "{surname} {town} {region} Germany kirchenbuch"
- Medieval Europe: Published peerages, Wikipedia, Medieval Lands (FMG). Try: "{name} {title} medieval" or "{name} Foundation for Medieval Genealogy"
- Military (any era): NARA pension files, Fold3, service records. Try: "{name} {war} pension NARA" or "{name} {regiment} military records"

WHAT TO REPORT:
- Records found that CONFIRM the GEDCOM data (with URLs)
- Records found that CONTRADICT the GEDCOM data (with URLs and explanation)
- Records NOT found that SHOULD exist if the person is real (absence of evidence)
- The single most impactful next research step

CROSS-REFERENCING RULES:
- If the GEDCOM says Person A is child of Person B, look for records that name both.
- If you find a record with a matching name but different dates, note the discrepancy.
- If you find a record that names different parents than the GEDCOM shows, flag it.
- Pay attention to county/state boundaries that changed over time.
- Note spelling variants: McRae/MacRae/McCrae/McCree are the same family.

Always respond in the specified JSON format.`;

export function buildValidationUserPrompt(
  person: Person,
  parents: { father: Person | null; mother: Person | null },
  children: Person[],
  sources: Source[],
  flags: Flag[],
  era: EraTag,
  location: LocationContext,
  questions: string[],
  edge: Edge | null,
): string {
  const personBlock = formatPersonBlock(person, parents, children);
  const flagsSummary = formatFlagsSummary(flags);
  const sourcesSummary = formatSourcesSummary(sources);
  const locationBlock = formatLocationContext(location);
  const questionsBlock = questions.length > 0
    ? questions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')
    : '  No specific questions generated.';

  const edgeBlock = edge
    ? `\nPARENTAL EDGE:\n  Relationship: ${edge.relationshipType}\n  Legitimacy: ${edge.legitimacy}\n  Edge confidence: Tier ${edge.confidenceTier}`
    : '';

  return `Validate this person and their parental connection:

${personBlock}${edgeBlock}

CURRENT ASSESSMENT:
  Confidence tier: ${person.confidenceTier}
  Active flags: ${flagsSummary}
  Existing sources: ${sourcesSummary}

CONTEXT:
  Era tag: ${era}
${locationBlock}

SPECIFIC QUESTIONS:
${questionsBlock}

Search the web to find evidence. Report findings in this JSON format:
{
  "personAssessment": {
    "plausibility": "confirmed" | "plausible" | "questionable" | "implausible",
    "summary": "2-3 sentence assessment"
  },
  "parentalLink": {
    "status": "confirmed" | "plausible" | "questionable" | "implausible" | "contradicted",
    "summary": "1-2 sentence assessment of the parent-child connection specifically"
  },
  "recordsFound": [
    {
      "type": "census" | "vital" | "church" | "military" | "land" | "probate" | "published_genealogy" | "peerage" | "other",
      "title": "description of the record",
      "url": "URL if found online",
      "repository": "FamilySearch" | "Ancestry" | "NARA" | "NRS" | "WikiTree" | "other",
      "confirms": ["what GEDCOM claims this supports"],
      "contradicts": ["what GEDCOM claims this contradicts, if any"],
      "sourceClass": "primary" | "secondary" | "tertiary"
    }
  ],
  "recordsExpectedButNotFound": [
    {
      "type": "record type",
      "description": "what should exist and where to look",
      "significance": "what its absence might mean"
    }
  ],
  "dateDiscrepancies": [
    {
      "gedcomClaim": "what the tree says",
      "evidenceSays": "what the records say",
      "source": "where the evidence comes from"
    }
  ],
  "suggestedTier": 1-4,
  "nextStep": {
    "action": "specific research action",
    "repository": "where to look",
    "expectedCost": "free" | "subscription" | "archive_visit" | "unknown",
    "impactIfFound": "what this would prove or disprove"
  }
}`;
}
