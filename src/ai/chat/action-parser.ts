/**
 * Extract structured actions from AI chat responses.
 *
 * Actions are detected by pattern matching the response text against
 * known patterns — they're NOT returned by the AI as structured data.
 * The app injects action buttons into the chat UI based on detection.
 */

import type { ChatAction, ChatActionType } from './chat-session.ts';
import type { ChatContext } from './chat-context.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';

/**
 * Extract all detectable actions from an AI response.
 */
export function extractActionsFromResponse(
  response: string,
  context: ChatContext,
  graph: TreeGraph | null,
): ChatAction[] {
  const actions: ChatAction[] = [];

  // 1. Detect source descriptions (structured table or key source fields)
  const sourceAction = detectSourceImport(response);
  if (sourceAction) actions.push(sourceAction);

  // 2. Detect person mentions that match tree data
  if (graph) {
    const personActions = detectPersonMentions(response, graph, context.selectedPersonId);
    actions.push(...personActions);
  }

  // 3. Detect duplicate analysis
  const duplicateAction = detectDuplicateAnalysis(response);
  if (duplicateAction) actions.push(duplicateAction);

  // 4. Detect research recommendations
  const researchAction = detectResearchRecommendation(response);
  if (researchAction) actions.push(researchAction);

  return actions;
}

// ── Source Import Detection ──────────────────────────────────────────

/**
 * Detects when the AI describes a specific source with enough structured data
 * to import. Looks for key fields: Title, Type/Class, Date, Repository.
 */
function detectSourceImport(response: string): ChatAction | null {
  // Look for structured source description patterns
  const hasTitle = /\*?\*?(?:Title|Source)\*?\*?\s*[:|\-]\s*.+/i.test(response);
  const hasType = /\*?\*?(?:Type|Class)\*?\*?\s*[:|\-]\s*.+/i.test(response);
  const hasRepository = /\*?\*?(?:Repository|Found (?:on|at|in))\*?\*?\s*[:|\-]\s*.+/i.test(response);

  // Also detect table-formatted sources (| Field | Value |)
  const hasTable = /\|\s*(?:Title|Source)\s*\|/i.test(response);

  if ((hasTitle && hasType) || (hasTitle && hasRepository) || hasTable) {
    // Extract what we can from the response
    const title = extractField(response, ['Title', 'Source']) ?? 'Unnamed source';
    const sourceClass = extractField(response, ['Class']) ?? 'tertiary';
    const repository = extractField(response, ['Repository', 'Found on', 'Found at', 'Found in']) ?? '';
    const date = extractField(response, ['Date']) ?? '';
    const place = extractField(response, ['Place', 'Location']) ?? '';
    const sourceType = extractField(response, ['Type']) ?? 'other';
    const proves = extractField(response, ['Proves', 'Confirms']) ?? '';

    return {
      type: 'import_source',
      label: 'Add this source',
      data: {
        title,
        sourceClass: normalizeSourceClass(sourceClass),
        repository,
        date,
        place,
        sourceType,
        proves,
      },
    };
  }

  return null;
}

function extractField(text: string, fieldNames: string[]): string | null {
  for (const name of fieldNames) {
    // Check table format first: "| Field | Value |"
    const tableMatch = new RegExp(`\\|\\s*\\*?\\*?${name}\\*?\\*?\\s*\\|\\s*([^|]+?)\\s*\\|`, 'i').exec(text);
    if (tableMatch) return tableMatch[1].trim().replace(/\*+/g, '');

    // Then check inline format: "**Field**: value" or "**Field** — value"
    const inlineMatch = new RegExp(`\\*?\\*?${name}\\*?\\*?\\s*[:\\u2014\\-]\\s*(.+?)(?:\\n|$)`, 'i').exec(text);
    if (inlineMatch) return inlineMatch[1].trim().replace(/\*+/g, '');
  }
  return null;
}

function normalizeSourceClass(raw: string): 'primary' | 'secondary' | 'tertiary' {
  const lower = raw.toLowerCase();
  if (lower.includes('primary')) return 'primary';
  if (lower.includes('secondary')) return 'secondary';
  return 'tertiary';
}

// ── Person Mention Detection ─────────────────────────────────────────

/**
 * Detect bold person names in the response that match tree data.
 * Returns "open_person" actions for up to 3 unique matches (excluding selected).
 */
function detectPersonMentions(
  response: string,
  graph: TreeGraph,
  selectedPersonId: string | null,
): ChatAction[] {
  const actions: ChatAction[] = [];
  const seen = new Set<string>();

  // Match **Name** patterns (bold names)
  const boldPattern = /\*\*([^*]+)\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = boldPattern.exec(response)) !== null) {
    const mentionedName = match[1].trim();
    if (mentionedName.length < 3) continue;

    // Search for matching person in tree
    const personId = findPersonByName(mentionedName, graph);
    if (personId && personId !== selectedPersonId && !seen.has(personId)) {
      seen.add(personId);
      const person = graph.persons.get(personId)!;
      actions.push({
        type: 'open_person',
        label: `View ${person.name.full}`,
        data: { personId },
      });
    }

    if (seen.size >= 3) break;
  }

  return actions;
}

/**
 * Find a person by name (case-insensitive, partial match).
 */
function findPersonByName(name: string, graph: TreeGraph): string | null {
  const lower = name.toLowerCase();

  // Exact match first
  for (const [id, person] of graph.persons) {
    if (person.name.full.toLowerCase() === lower) return id;
  }

  // Partial match (name contains the search term)
  for (const [id, person] of graph.persons) {
    if (person.name.full.toLowerCase().includes(lower)) return id;
  }

  return null;
}

// ── Duplicate Detection ──────────────────────────────────────────────

const DUPLICATE_PATTERNS = [
  /same person/i,
  /almost certainly the same/i,
  /duplicate entr/i,
  /merge these/i,
  /likely the same individual/i,
  /identical.*(?:name|birth|death)/i,
];

function detectDuplicateAnalysis(response: string): ChatAction | null {
  if (DUPLICATE_PATTERNS.some(p => p.test(response))) {
    return {
      type: 'mark_duplicate' as ChatActionType,
      label: 'Mark as duplicate',
      data: {},
    };
  }
  return null;
}

// ── Research Recommendation Detection ────────────────────────────────

const RESEARCH_PATTERNS = [
  /next step/i,
  /recommend.*(?:search|check|look)/i,
  /should.*(?:search|check|look)/i,
  /would be worth.*(?:search|check|look)/i,
  /try.*(?:searching|checking|looking)/i,
];

function detectResearchRecommendation(response: string): ChatAction | null {
  if (RESEARCH_PATTERNS.some(p => p.test(response))) {
    // Extract the recommendation text
    const nextStepMatch = /(?:next step|recommend|should|would be worth|try)[^.]*\.\s*([^.]+\.)/i.exec(response);
    const description = nextStepMatch?.[1]?.trim() ?? 'Follow up on AI recommendation';

    return {
      type: 'add_research_step',
      label: 'Add to research list',
      data: { description },
    };
  }
  return null;
}
