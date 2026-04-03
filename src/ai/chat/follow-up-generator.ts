/**
 * Generate follow-up prompt suggestions based on the AI's last response.
 *
 * Rule-based pattern matching — no AI call needed.
 * Returns up to 3 suggestions rendered as clickable chips.
 */

import type { ChatContext } from './chat-context.ts';

const MAX_FOLLOW_UPS = 3;

interface FollowUpRule {
  pattern: RegExp;
  suggestion: string | ((context: ChatContext | null) => string | null);
}

const FOLLOW_UP_RULES: FollowUpRule[] = [
  {
    pattern: /(?:source|record|document|census|vital|certificate|register|archive)/i,
    suggestion: 'Can you search for more records?',
  },
  {
    pattern: /(?:date|year|born|died|birth|death).*(?:issue|wrong|incorrect|conflict|discrepanc)/i,
    suggestion: 'What records could confirm the correct date?',
  },
  {
    pattern: /(?:tier [34]|unverified|speculative|low confidence|provisional)/i,
    suggestion: (ctx) => {
      const name = ctx?.selectedPersonContext?.name;
      return name
        ? `What would raise ${name}'s confidence tier?`
        : 'What would improve the confidence tier?';
    },
  },
  {
    pattern: /(?:recommend|suggest|next step|further research|investigate|look into)/i,
    suggestion: 'Tell me more about that research approach.',
  },
  {
    pattern: /(?:notable|famous|royal|king|queen|historical figure)/i,
    suggestion: 'How reliable is this connection?',
  },
  {
    pattern: /(?:duplicate|same person|merge|identical)/i,
    suggestion: 'What evidence would confirm they are the same?',
  },
  {
    pattern: /(?:missing|unknown|no (?:record|source|evidence|documentation))/i,
    suggestion: 'Where else could I look for information?',
  },
  {
    pattern: /(?:migration|immigrat|emigrat|moved|relocated)/i,
    suggestion: 'What immigration records might exist?',
  },
];

/**
 * Generate follow-up suggestions from the last AI response text.
 */
export function generateFollowUpSuggestions(
  responseText: string,
  context: ChatContext | null,
): string[] {
  const suggestions: string[] = [];

  for (const rule of FOLLOW_UP_RULES) {
    if (suggestions.length >= MAX_FOLLOW_UPS) break;
    if (!rule.pattern.test(responseText)) continue;

    const text = typeof rule.suggestion === 'function'
      ? rule.suggestion(context)
      : rule.suggestion;

    if (text && !suggestions.includes(text)) {
      suggestions.push(text);
    }
  }

  return suggestions;
}
