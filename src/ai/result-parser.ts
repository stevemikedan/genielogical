import type { ConfidenceTier } from '@/types/common.ts';
import type {
  QuickCheckResult,
  QuickCheckIssue,
  Plausibility,
  ValidationReport,
  ParentalLinkStatus,
  FoundRecord,
  MissingRecord,
  DateDiscrepancy,
  ResearchNextStep,
  DeepResearchRound,
  DeepResearchStatus,
  DeepResearchFinding,
} from '@/types/ai.ts';

/**
 * Extract JSON from a response that may contain prose before/after.
 * Tries to find the outermost JSON object.
 */
function extractJson(text: string): unknown | null {
  // Try to find JSON block in markdown code fence first
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch { /* fall through */ }
  }

  // Try to find outermost JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch { /* fall through */ }
  }

  return null;
}

const VALID_PLAUSIBILITIES: readonly Plausibility[] = ['confirmed', 'plausible', 'questionable', 'implausible'];
const VALID_PARENTAL_STATUSES: readonly ParentalLinkStatus[] = ['confirmed', 'plausible', 'questionable', 'implausible', 'contradicted'];
const VALID_ISSUE_TYPES = ['date', 'place', 'name', 'connection', 'title'] as const;
const VALID_RECORD_TYPES = ['census', 'vital', 'church', 'military', 'land', 'probate', 'published_genealogy', 'peerage', 'other'] as const;
const VALID_SOURCE_CLASSES = ['primary', 'secondary', 'tertiary'] as const;
const VALID_DEEP_STATUSES: readonly DeepResearchStatus[] = ['CONTINUE', 'COMPLETE', 'DEAD_END'];
const VALID_FINDING_TYPES = ['confirmation', 'contradiction', 'new_lead', 'absence'] as const;

function clampTier(value: unknown): ConfidenceTier {
  const n = Number(value);
  if (n >= 1 && n <= 4) return n as ConfidenceTier;
  return 4;
}

// ── Mode 1: Quick Check ─────────────────────────────────────────

export function parseQuickCheckResult(responseText: string): QuickCheckResult | null {
  const data = extractJson(responseText) as Record<string, unknown> | null;
  if (!data) return null;

  try {
    const plausibility = VALID_PLAUSIBILITIES.includes(data.plausibility as Plausibility)
      ? (data.plausibility as Plausibility)
      : 'questionable';

    const issues: QuickCheckIssue[] = [];
    if (Array.isArray(data.issues)) {
      for (const issue of data.issues) {
        if (issue && typeof issue === 'object') {
          const obj = issue as Record<string, unknown>;
          const type = VALID_ISSUE_TYPES.includes(obj.type as typeof VALID_ISSUE_TYPES[number])
            ? (obj.type as QuickCheckIssue['type'])
            : 'connection';
          issues.push({
            type,
            description: String(obj.description ?? ''),
            correction: obj.correction ? String(obj.correction) : null,
          });
        }
      }
    }

    return {
      plausibility,
      issues,
      suggestedTier: clampTier(data.suggestedTier),
      tierReason: String(data.tierReason ?? ''),
      quickWin: data.quickWin ? String(data.quickWin) : null,
    };
  } catch {
    return null;
  }
}

// ── Mode 2: Validation Report ───────────────────────────────────

export function parseValidationReport(responseText: string): ValidationReport | null {
  const data = extractJson(responseText) as Record<string, unknown> | null;
  if (!data) return null;

  try {
    // Person assessment
    const pa = data.personAssessment as Record<string, unknown> | undefined;
    const plausibility = pa && VALID_PLAUSIBILITIES.includes(pa.plausibility as Plausibility)
      ? (pa.plausibility as Plausibility)
      : 'questionable';

    // Parental link (optional — may not always be relevant)
    let parentalLink: ValidationReport['parentalLink'] = null;
    const pl = data.parentalLink as Record<string, unknown> | undefined;
    if (pl && pl.status) {
      const status = VALID_PARENTAL_STATUSES.includes(pl.status as ParentalLinkStatus)
        ? (pl.status as ParentalLinkStatus)
        : 'questionable';
      parentalLink = {
        status,
        summary: String(pl.summary ?? ''),
      };
    }

    // Records found
    const recordsFound: FoundRecord[] = [];
    if (Array.isArray(data.recordsFound)) {
      for (const r of data.recordsFound) {
        if (r && typeof r === 'object') {
          const obj = r as Record<string, unknown>;
          const type = VALID_RECORD_TYPES.includes(obj.type as typeof VALID_RECORD_TYPES[number])
            ? (obj.type as FoundRecord['type'])
            : 'other';
          const sourceClass = VALID_SOURCE_CLASSES.includes(obj.sourceClass as typeof VALID_SOURCE_CLASSES[number])
            ? (obj.sourceClass as FoundRecord['sourceClass'])
            : 'tertiary';
          recordsFound.push({
            type,
            title: String(obj.title ?? ''),
            url: obj.url ? String(obj.url) : null,
            repository: String(obj.repository ?? 'other'),
            confirms: Array.isArray(obj.confirms) ? obj.confirms.map(String) : [],
            contradicts: Array.isArray(obj.contradicts) ? obj.contradicts.map(String) : [],
            sourceClass,
          });
        }
      }
    }

    // Records expected but not found
    const recordsExpectedButNotFound: MissingRecord[] = [];
    if (Array.isArray(data.recordsExpectedButNotFound)) {
      for (const r of data.recordsExpectedButNotFound) {
        if (r && typeof r === 'object') {
          const obj = r as Record<string, unknown>;
          recordsExpectedButNotFound.push({
            type: String(obj.type ?? ''),
            description: String(obj.description ?? ''),
            significance: String(obj.significance ?? ''),
          });
        }
      }
    }

    // Date discrepancies
    const dateDiscrepancies: DateDiscrepancy[] = [];
    if (Array.isArray(data.dateDiscrepancies)) {
      for (const d of data.dateDiscrepancies) {
        if (d && typeof d === 'object') {
          const obj = d as Record<string, unknown>;
          dateDiscrepancies.push({
            gedcomClaim: String(obj.gedcomClaim ?? ''),
            evidenceSays: String(obj.evidenceSays ?? ''),
            source: String(obj.source ?? ''),
          });
        }
      }
    }

    // Next step
    let nextStep: ResearchNextStep | null = null;
    const ns = data.nextStep as Record<string, unknown> | undefined;
    if (ns && ns.action) {
      const validCosts = ['free', 'subscription', 'archive_visit', 'unknown'] as const;
      const cost = validCosts.includes(ns.expectedCost as typeof validCosts[number])
        ? (ns.expectedCost as ResearchNextStep['expectedCost'])
        : 'unknown';
      nextStep = {
        action: String(ns.action),
        repository: String(ns.repository ?? ''),
        expectedCost: cost,
        impactIfFound: String(ns.impactIfFound ?? ''),
      };
    }

    return {
      personAssessment: {
        plausibility,
        summary: String(pa?.summary ?? ''),
      },
      parentalLink,
      recordsFound,
      recordsExpectedButNotFound,
      dateDiscrepancies,
      suggestedTier: clampTier(data.suggestedTier),
      nextStep,
    };
  } catch {
    return null;
  }
}

// ── Mode 3: Deep Research Round ─────────────────────────────────

export function parseDeepResearchRound(responseText: string): DeepResearchRound | null {
  const data = extractJson(responseText) as Record<string, unknown> | null;
  if (!data) return null;

  try {
    const round = Number(data.round);
    const validRound = round >= 1 && round <= 10 ? round : 1;

    const searchesPerformed = Array.isArray(data.searchesPerformed)
      ? data.searchesPerformed.map(String)
      : [];

    const findings: DeepResearchFinding[] = [];
    if (Array.isArray(data.findings)) {
      for (const f of data.findings) {
        if (f && typeof f === 'object') {
          const obj = f as Record<string, unknown>;
          const type = VALID_FINDING_TYPES.includes(obj.type as typeof VALID_FINDING_TYPES[number])
            ? (obj.type as DeepResearchFinding['type'])
            : 'new_lead';
          const sourceClass = obj.sourceClass && VALID_SOURCE_CLASSES.includes(obj.sourceClass as typeof VALID_SOURCE_CLASSES[number])
            ? (obj.sourceClass as 'primary' | 'secondary' | 'tertiary')
            : null;
          findings.push({
            type,
            description: String(obj.description ?? ''),
            url: obj.url ? String(obj.url) : null,
            sourceClass,
            relevantTo: String(obj.relevantTo ?? ''),
          });
        }
      }
    }

    // Parse status — also check the prose for STATUS: lines
    let status: DeepResearchStatus = 'CONTINUE';
    if (VALID_DEEP_STATUSES.includes(data.status as DeepResearchStatus)) {
      status = data.status as DeepResearchStatus;
    } else {
      // Fallback: scan the response text for STATUS: lines
      const statusMatch = responseText.match(/STATUS:\s*(CONTINUE|COMPLETE|DEAD_END)/i);
      if (statusMatch) {
        status = statusMatch[1].toUpperCase() as DeepResearchStatus;
      }
    }

    return {
      round: validRound,
      searchesPerformed,
      findings,
      status,
    };
  } catch {
    return null;
  }
}
