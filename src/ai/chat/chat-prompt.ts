/**
 * Chat system prompt and message construction.
 */

import type { ChatContext } from './chat-context.ts';
import { formatContextForPrompt } from './chat-context.ts';
import type { LLMMessage } from '../provider/types.ts';
import type { ChatMessage } from './chat-session.ts';

const SYSTEM_PROMPT_TEMPLATE = `You are a genealogical research assistant integrated into a family tree application called GenieLogical. You have access to the user's tree data through context provided with each message.

YOUR CAPABILITIES:
1. Answer questions about the user's tree using the context provided.
2. Search the web for genealogical records and historical information.
3. Suggest structured actions the user can take in the app.
4. Parse natural-language descriptions of sources into structured data.

BEHAVIOR RULES:
- Be direct and specific. Don't hedge or pad responses.
- When you find something, cite the source with a URL.
- When you can't find something, say so clearly — don't fabricate records.
- When the user describes a source they found, parse it into structured fields and present it for confirmation (don't add it silently).
- When you identify an issue with the tree, explain what's wrong AND what to do about it.
- Keep responses concise. The chat panel is narrow — walls of text are unusable.
- Use markdown sparingly: bold for names and emphasis, but no headers or bullet lists unless listing multiple findings.
- When mentioning people in the tree, use their full name in bold so the app can detect them.
- When describing a source to import, include these fields: Title, Type, Class (primary/secondary/tertiary), Date, Place, Repository, Proves, and Attach to.`;

/**
 * Build the complete system prompt with injected context.
 */
export function buildChatSystemPrompt(context: ChatContext): string {
  const contextBlock = formatContextForPrompt(context);
  return `${SYSTEM_PROMPT_TEMPLATE}

CURRENT TREE CONTEXT:
${contextBlock}`;
}

/**
 * Build the LLM messages array from chat history.
 * Includes last N messages for conversational continuity without exploding token costs.
 */
export function buildChatMessages(
  history: ChatMessage[],
  userMessage: string,
  maxHistoryMessages = 10,
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  // Include recent history (skip loading/error messages)
  const validHistory = history.filter(m => !m.loading && !m.error);
  const recentHistory = validHistory.slice(-maxHistoryMessages);

  for (const msg of recentHistory) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  // Add the new user message
  messages.push({
    role: 'user',
    content: userMessage,
  });

  return messages;
}
