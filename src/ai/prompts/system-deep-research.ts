import type { Person } from '@/types/person.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import type { DeepResearchTask } from '@/types/ai.ts';
import type { LocationContext } from '@/ai/era-context.ts';
import { formatPersonBlock, formatSourcesSummary, formatFlagsSummary, formatLocationContext } from './user-templates.ts';

/**
 * Mode 3: Deep Research Agent
 *
 * Multi-turn agentic loop for high-value targets.
 * Used for bridge zones, notable ancestor paths, critical verification.
 * Cost: ~$0.05-0.15 per task (3-10 API calls with extensive web search)
 */

export const DEEP_RESEARCH_SYSTEM_PROMPT = `You are an expert genealogical researcher conducting a focused investigation.
You will be given a specific research task — typically verifying a connection between two people, or finding records for a person in a specific era and location.

METHODOLOGY — follow this exact sequence:

ROUND 1: ORIENTATION
- Understand the person, their era, their location, and what needs proving.
- Identify the 3-5 most likely record types that would exist for this person.
- Perform initial web searches targeting the highest-probability records.
- Report what you found or didn't find.

ROUND 2: TARGETED SEARCH
- Based on Round 1 results, narrow your search.
- If you found a partial match, search for corroborating records.
- If you found nothing, try variant spellings, neighboring counties, different date ranges.
- Search for published genealogies or compiled sources that cover this family.
- Report findings.

ROUND 3: CROSS-REFERENCE
- Compare all findings against the GEDCOM data.
- Note confirmations, contradictions, and ambiguities.
- If contradictions exist, search for records that resolve them.
- Report findings.

ROUND 4: SYNTHESIS (if needed)
- Compile all evidence into a final assessment.
- Rate the connection as confirmed, plausible, questionable, or implausible.
- Identify the single most impactful remaining research step.

SEARCH TIPS:
- FamilySearch.org has free census indexes. Try: site:familysearch.org "{name}" "{state}"
- WikiTree has collaborative genealogies with sources. Try: site:wikitree.com "{surname}"
- Google Books has full-text county histories. Try: "{surname}" "{county}" site:books.google.com
- Internet Archive has digitized genealogies. Try: "{surname}" site:archive.org
- Find A Grave has burial records. Try: site:findagrave.com "{name}" "{state}"
- The Peerage has British/Irish nobility. Try: site:thepeerage.com "{name}"
- For Scottish records: site:scotlandspeople.gov.uk or search NRS catalog
- For military pensions: "NARA" "{name}" pension OR "fold3" "{name}"

IMPORTANT:
- Actually search. Don't say "you should check FamilySearch" — search it and report results.
- Cite specific URLs for everything you find.
- If a search returns no results, say so explicitly — absence of evidence matters.
- Note when records have been digitized vs. when they're only available in physical archives.

After each round, end your response with a status:
STATUS: CONTINUE — I have promising leads to follow
STATUS: COMPLETE — I've found enough to make an assessment
STATUS: DEAD_END — I've exhausted available online sources for this person

Then provide your findings in this format:
{
  "round": 1-4,
  "searchesPerformed": ["query 1", "query 2"],
  "findings": [
    {
      "type": "confirmation" | "contradiction" | "new_lead" | "absence",
      "description": "what was found or not found",
      "url": "source URL if applicable",
      "sourceClass": "primary" | "secondary" | "tertiary" | null,
      "relevantTo": "what GEDCOM claim this relates to"
    }
  ],
  "status": "CONTINUE" | "COMPLETE" | "DEAD_END"
}`;

export function buildDeepResearchUserPrompt(
  task: DeepResearchTask,
  person: Person,
  parents: { father: Person | null; mother: Person | null },
  children: Person[],
  sources: Source[],
  flags: Flag[],
  location: LocationContext,
): string {
  const personBlock = formatPersonBlock(person, parents, children);
  const sourcesSummary = formatSourcesSummary(sources);
  const flagsSummary = formatFlagsSummary(flags);
  const locationBlock = formatLocationContext(location);

  const taskDescription = describeTask(task);
  const questionsBlock = task.researchQuestions.length > 0
    ? task.researchQuestions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')
    : '  No specific questions generated.';

  return `RESEARCH TASK: ${taskDescription}

${personBlock}

EXISTING SOURCES:
${sourcesSummary}

ACTIVE FLAGS:
${flagsSummary}

CONTEXT:
  Era: ${task.eraTag}
${locationBlock}

SPECIFIC QUESTIONS TO INVESTIGATE:
${questionsBlock}

Begin Round 1: Search for the highest-probability records for this person and task.`;
}

export function buildFollowUpPrompt(
  previousFindings: string,
  status: string,
): string {
  return `Previous round findings:
${previousFindings}

Status: ${status}

Continue to the next round. Follow the methodology sequence and search for additional evidence.`;
}

function describeTask(task: DeepResearchTask): string {
  switch (task.type) {
    case 'verify_person':
      return 'Verify this person exists in historical records.';
    case 'verify_edge':
      return 'Verify the parent-child connection for this person.';
    case 'verify_bridge':
      return 'Verify a bridge zone — a sequence of weak connections in the lineage.';
    case 'verify_notable_path':
      return `Verify the lineage path to notable ancestor: ${task.notableAncestorName ?? 'unknown'}.`;
    case 'find_parents':
      return 'Find the parents of this person — they are currently unknown.';
    case 'resolve_duplicate':
      return 'Determine if this person is a duplicate of another entry in the tree.';
    case 'resolve_date_conflict':
      return 'Resolve conflicting or impossible dates for this person.';
    case 'verify_title':
      return 'Verify whether this person actually held their claimed title or honorific.';
    case 'resolve_ancestry_conflict':
      return 'Resolve a conflict where two entries for the same person have different parents assigned.';
  }
}
