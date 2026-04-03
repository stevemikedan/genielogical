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
  const duplicateAction = detectDuplicateAnalysis(response, graph, context.selectedPersonId);
  if (duplicateAction) {
    actions.push(duplicateAction);
    // Also offer merge when two specific persons are identified
    const personIds = duplicateAction.data.personIds as string[];
    if (personIds.length === 2) {
      actions.push({
        type: 'merge_persons',
        label: 'Merge these persons',
        data: { personIdA: personIds[0], personIdB: personIds[1] },
      });
    }
  }

  // 4. Detect research recommendations
  const researchAction = detectResearchRecommendation(response);
  if (researchAction) actions.push(researchAction);

  // 5. Detect flag suggestions
  const flagAction = detectFlagSuggestion(response, context.selectedPersonId);
  if (flagAction) actions.push(flagAction);

  // 6. Detect conjecture suggestions
  const conjectureAction = detectConjecture(response, context.selectedPersonId);
  if (conjectureAction) actions.push(conjectureAction);

  // 7. Detect deep research suggestions
  const deepResearchAction = detectDeepResearchSuggestion(response, context.selectedPersonId);
  if (deepResearchAction) actions.push(deepResearchAction);

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

function detectDuplicateAnalysis(
  response: string,
  graph: TreeGraph | null,
  selectedPersonId: string | null,
): ChatAction | null {
  if (!DUPLICATE_PATTERNS.some(p => p.test(response))) return null;

  // Try to extract person IDs from bold names in the response
  const personIds: string[] = [];
  if (graph) {
    const boldPattern = /\*\*([^*]+)\*\*/g;
    let match: RegExpExecArray | null;
    while ((match = boldPattern.exec(response)) !== null) {
      const name = match[1].trim();
      if (name.length < 3) continue;
      const pid = findPersonByName(name, graph);
      if (pid && !personIds.includes(pid)) personIds.push(pid);
      if (personIds.length >= 2) break;
    }
  }

  // Include selected person if only one other was found
  if (selectedPersonId && personIds.length === 1 && !personIds.includes(selectedPersonId)) {
    personIds.unshift(selectedPersonId);
  }

  return {
    type: 'mark_duplicate' as ChatActionType,
    label: 'Mark as duplicate',
    data: { personIds },
  };
}

// ── Flag Suggestion Detection ────────────────────────────────────────

const FLAG_PATTERNS = [
  /should be flagged/i,
  /chronological impossibilit/i,
  /dates? (?:don'?t|doesn'?t|do not) (?:add up|make sense)/i,
  /(?:data|date|age) (?:is |seems? )?(?:wrong|incorrect|impossible|implausible)/i,
  /suspicious (?:date|claim|connection)/i,
  /no (?:evidence|documentation|source|proof)/i,
  /needs? (?:a |to be )?flag/i,
  /red flag/i,
];

const FLAG_SEVERITY_MAP: [RegExp, 'critical' | 'warning'][] = [
  [/impossib|critical|serious|major|wrong/i, 'critical'],
  [/suspicious|questionable|unlikely|implausible|warning/i, 'warning'],
];

const FLAG_CATEGORY_MAP: [RegExp, string][] = [
  [/chronolog|date|age|year|birth|death|born|died/i, 'chronological'],
  [/king|queen|royal|noble|title|prestige/i, 'prestige_inflation'],
  [/duplicate|same person/i, 'duplicate_suspect'],
  [/source|evidence|document|proof|unsourced/i, 'source_desert'],
  [/parent|child|connection|lineage/i, 'structural'],
];

function detectFlagSuggestion(response: string, selectedPersonId: string | null): ChatAction | null {
  if (!FLAG_PATTERNS.some(p => p.test(response))) return null;
  if (!selectedPersonId) return null;

  // Determine severity from language
  let severity: 'critical' | 'warning' = 'warning';
  for (const [pattern, sev] of FLAG_SEVERITY_MAP) {
    if (pattern.test(response)) { severity = sev; break; }
  }

  // Determine category from language
  let category = 'data_quality';
  for (const [pattern, cat] of FLAG_CATEGORY_MAP) {
    if (pattern.test(response)) { category = cat; break; }
  }

  // Extract a description — use the sentence matching the flag pattern
  const sentences = response.split(/[.!]\s+/);
  const flagSentence = sentences.find(s => FLAG_PATTERNS.some(p => p.test(s))) ?? 'Issue detected by AI';

  return {
    type: 'create_flag',
    label: 'Create flag',
    data: {
      personId: selectedPersonId,
      severity,
      category,
      description: flagSentence.trim().slice(0, 200),
    },
  };
}

// ── Conjecture Detection ─────────────────────────────────────────────

const CONJECTURE_PATTERNS = [
  /\bhypothesis\b/i,
  /\bmy best guess\b/i,
  /\bone (?:possible )?explanation\b/i,
  /\bconjecture\b/i,
  /\bspeculat(?:e|ion|ive)\b/i,
  /\bpossibly the same\b/i,
  /\bif (?:we|I) assume\b/i,
  /\bworking theory\b/i,
];

function detectConjecture(response: string, selectedPersonId: string | null): ChatAction | null {
  if (!CONJECTURE_PATTERNS.some(p => p.test(response))) return null;
  if (!selectedPersonId) return null;

  // Extract the hypothesis text — use the sentence containing the pattern
  const sentences = response.split(/[.!]\s+/);
  const hypothesisSentence = sentences.find(s => CONJECTURE_PATTERNS.some(p => p.test(s))) ?? 'AI-suggested hypothesis';

  return {
    type: 'create_conjecture',
    label: 'Save as conjecture',
    data: {
      personId: selectedPersonId,
      hypothesis: hypothesisSentence.trim().slice(0, 300),
    },
  };
}

// ── Deep Research Suggestion Detection ───────────────────────────────

const DEEP_RESEARCH_PATTERNS = [
  /needs? (?:a )?deep(?:er)? research/i,
  /deep dive/i,
  /thorough research/i,
  /comprehensive (?:search|investigation|review)/i,
  /warrants? (?:further|deeper|more) (?:investigation|research|analysis)/i,
  /recommend.*deep research/i,
];

function detectDeepResearchSuggestion(response: string, selectedPersonId: string | null): ChatAction | null {
  if (!DEEP_RESEARCH_PATTERNS.some(p => p.test(response))) return null;
  if (!selectedPersonId) return null;

  return {
    type: 'run_deep_research',
    label: 'Open deep research',
    data: { personId: selectedPersonId },
  };
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
