/**
 * Chat session types and helpers.
 *
 * Chat state is ephemeral — stored in React state, NOT persisted to IndexedDB.
 * Only outcomes (sources added, flags created) persist through reducer actions.
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Actions extracted from this message (assistant only) */
  actions: ChatAction[];
  /** Web search citations from the AI response (assistant only) */
  citations: ChatCitation[];
  /** Cost of this individual API call in USD (assistant only) */
  costUsd: number | null;
  /** Timestamp */
  timestamp: Date;
  /** Whether this message is currently streaming/loading */
  loading?: boolean;
  /** Error message if the API call failed */
  error?: string | null;
}

export interface ChatCitation {
  url: string;
  title: string | null;
  citedText: string;
}

export interface ChatAction {
  type: ChatActionType;
  label: string;
  data: Record<string, unknown>;
}

export type ChatActionType =
  | 'import_source'
  | 'open_person'
  | 'mark_duplicate'
  | 'merge_persons'
  | 'create_flag'
  | 'create_conjecture'
  | 'add_research_step'
  | 'run_deep_research';

export interface ChatSession {
  messages: ChatMessage[];
  totalCostUsd: number;
  isLoading: boolean;
}

export const EMPTY_SESSION: ChatSession = {
  messages: [],
  totalCostUsd: 0,
  isLoading: false,
};

let chatMessageCounter = 0;

/** Generate a unique message ID (ephemeral, no persistence needed). */
export function generateChatMessageId(): string {
  return `chat-msg-${Date.now()}-${++chatMessageCounter}`;
}
