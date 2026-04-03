/**
 * Context-aware suggested prompt builder.
 *
 * Generates prompts based on current app state — selected person, flags, tiers, etc.
 * Returns up to 4 prompts.
 */

import type { ChatContext } from './chat-context.ts';

export interface SuggestedPrompt {
  text: string;
}

const MAX_PROMPTS = 4;

/**
 * Build suggested prompts based on the current chat context.
 */
export function buildSuggestedPrompts(context: ChatContext): SuggestedPrompt[] {
  const prompts: SuggestedPrompt[] = [];
  const sp = context.selectedPersonContext;

  if (sp) {
    // Person is selected — person-specific prompts

    // Unsourced person
    if (sp.sources.length === 0) {
      prompts.push({ text: `Find records for ${sp.name}` });
    }

    // Person has flags
    if (sp.flags.length > 0) {
      prompts.push({ text: `What's wrong with ${sp.name}?` });
    }

    // Low confidence
    if (sp.tier >= 3) {
      prompts.push({ text: `How can I improve confidence for ${sp.name}?` });
    }

    // On notable paths
    if (sp.onNotablePaths.length > 0) {
      prompts.push({ text: `Tell me about the connection to ${sp.onNotablePaths[0]}` });
    }

    // No parents
    if (sp.parents.length === 0) {
      prompts.push({ text: `Who were ${sp.name}'s parents?` });
    }
  } else {
    // No person selected — tree-level prompts

    prompts.push({ text: "What's interesting about my tree?" });

    if (context.treeSummary.topFlags.length > 0) {
      prompts.push({ text: 'What are the most critical issues?' });
    }

    if (context.treeSummary.topNotableAncestors.length > 0) {
      prompts.push({ text: 'What notable ancestors do I have?' });
    }

    prompts.push({ text: 'Which ancestors need the most research?' });
  }

  return prompts.slice(0, MAX_PROMPTS);
}
