/**
 * Provider-agnostic LLM interface.
 *
 * All AI features code against this interface — never against a specific SDK.
 * Provider implementations handle SDK-specific details internally.
 */

export interface LLMProvider {
  /** Unique identifier: "anthropic", "openai", "ollama", "google", "openrouter" */
  readonly id: string;
  /** Human-readable label: "Claude (Anthropic)" */
  readonly name: string;

  readonly capabilities: ProviderCapabilities;
  readonly cost: ProviderCost;

  readonly requiresApiKey: boolean;
  /** Label for the API key input: "Anthropic API Key" */
  readonly apiKeyLabel: string;

  /** Send a message (single- or multi-turn) and get a response. */
  sendMessage(request: LLMRequest): Promise<LLMResponse>;

  /** Send a message with streaming support. Returns the final LLMResponse when complete. */
  streamMessage?(request: LLMRequest, callbacks: LLMStreamCallbacks): Promise<LLMResponse>;

  /** Validate that the connection works (test API key, check model). */
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}

export interface LLMStreamCallbacks {
  /** Called when a text delta is received during streaming. */
  onTextDelta: (delta: string) => void;
  /** Called when streaming completes (before the promise resolves). */
  onComplete?: () => void;
}

export interface ProviderCapabilities {
  /** Can the model search the web during inference? */
  webSearch: boolean;
  /** Can the model call tools (function calling)? */
  toolUse: boolean;
  /** Can the model reliably output JSON? */
  structuredOutput: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
  streaming: boolean;
}

export interface ProviderCost {
  /** USD per million input tokens */
  inputPerMillion: number;
  /** USD per million output tokens */
  outputPerMillion: number;
}

export interface LLMRequest {
  systemPrompt: string;
  messages: LLMMessage[];
  maxTokens: number;
  temperature?: number;

  /** Tool definitions (only used if provider supports tool use). */
  tools?: LLMToolDefinition[];

  /** Hint for response format. Providers handle enforcement internally. */
  responseFormat?: 'text' | 'json';
}

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  /** The text response content. */
  content: string;

  /** Web search citations, if the provider returned them. */
  citations: LLMCitation[];

  usage: LLMUsage;

  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
}

export interface LLMCitation {
  url: string;
  title: string | null;
  citedText: string;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost in USD for this request. */
  estimatedCost: number;
}

export interface LLMToolDefinition {
  type: string;
  name: string;
  description?: string;
  /** Provider-specific config (e.g., max_uses for Anthropic web search). */
  config?: Record<string, unknown>;
}

// ── Provider Configuration ──────────────────────────────────────────

export interface ProviderConfig {
  providerId: string;
  modelId: string;
  apiKey: string | null;
  baseUrl: string | null;
  enabled: boolean;
}

/** Which provider config to use for each AI task type. */
export interface TaskAssignment {
  quickCheck: ProviderConfig;
  validation: ProviderConfig;
  deepResearch: ProviderConfig;
  chat: ProviderConfig;
}

export type AITaskType = keyof TaskAssignment;
