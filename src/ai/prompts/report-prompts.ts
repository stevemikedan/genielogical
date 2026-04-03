import type { Person } from '@/types/person.ts';
import type { ReportType } from '@/types/report.ts';
import type { EraTag } from '@/ai/era-context.ts';
import { formatPersonBlock, formatSourcesSummary } from './user-templates.ts';
import type { Source } from '@/types/source.ts';

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  notable_women: 'Notable Women in Your Ancestry',
  notable_men: 'Notable Men in Your Ancestry',
  data_quality: 'Data Quality Dashboard',
};

export const REPORT_NARRATIVE_SYSTEM_PROMPT = `You are a genealogical research assistant generating concise narrative entries for an ancestry report.

Your task:
1. Assess the plausibility of this person's identity and connection to the subject's family tree
2. Write a 2-3 sentence historical narrative suitable for the report
3. Note any concerns about the claimed connection

Respond ONLY with valid JSON in this format:
{
  "plausibility": "confirmed" | "plausible" | "questionable" | "implausible",
  "narrative": "2-3 sentence historical narrative about this person's significance and connection",
  "issues": [{"type": "date"|"place"|"name"|"connection"|"title", "description": "brief description"}],
  "suggestedTier": 1-4,
  "tierReason": "brief reason"
}`;

/**
 * Build a report-aware quick check prompt that also requests a narrative.
 */
export function buildReportNarrativePrompt(
  person: Person,
  parents: { father: Person | null; mother: Person | null },
  sources: Source[],
  reportType: ReportType,
  matchReasons: string[],
  ancestralConfidence: number,
  eraTag: EraTag,
): { system: string; user: string } {
  const reportLabel = REPORT_TYPE_LABELS[reportType];
  const confidencePercent = Math.round(ancestralConfidence * 100);

  const personBlock = formatPersonBlock(person, parents, []);
  const sourcesBlock = sources.length > 0 ? formatSourcesSummary(sources) : 'No sources attached.';

  const user = `## Report Context
Report type: ${reportLabel}
Era tag: ${eraTag}
Match reasons: ${matchReasons.join(', ')}
Ancestral confidence: ${confidencePercent}%

## Person
${personBlock}

## Sources
${sourcesBlock}

Assess this person's plausibility and write a narrative entry for the report.`;

  return { system: REPORT_NARRATIVE_SYSTEM_PROMPT, user };
}

/**
 * Parse a report narrative AI response.
 */
export function parseReportNarrativeResult(text: string): {
  narrative: string;
  plausibility: string;
  issues: Array<{ type: string; description: string }>;
  suggestedTier: number;
} | null {
  try {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();

    // Find JSON object
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(jsonStr.slice(start, end + 1));
    return {
      narrative: parsed.narrative ?? '',
      plausibility: parsed.plausibility ?? 'questionable',
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestedTier: parsed.suggestedTier ?? 3,
    };
  } catch {
    return null;
  }
}
