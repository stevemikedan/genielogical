import type { LLMResponse } from './provider/types.ts';
import {
  getLegacyApiKey,
  setLegacyApiKey,
  clearLegacyApiKey,
  getProvider,
} from './provider/provider-registry.ts';
import { AnthropicProvider } from './provider/anthropic-provider.ts';

// ── API Key Management (legacy convenience wrappers) ─────────────────
// These delegate to the provider registry but keep the same API
// so existing UI components don't need to change yet.

export function getApiKey(): string | null {
  return getLegacyApiKey();
}

export function setApiKey(key: string): void {
  setLegacyApiKey(key);
}

export function clearApiKey(): void {
  clearLegacyApiKey();
}

export async function testApiKey(key: string): Promise<boolean> {
  const provider = new AnthropicProvider(key);
  const result = await provider.testConnection();
  return result.ok;
}

// ── Response Types (kept for backwards compat) ───────────────────────

export interface AIResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface WebCitation {
  url: string;
  title: string | null;
  citedText: string;
}

export interface AgentSearchResponse {
  text: string;
  citations: WebCitation[];
  inputTokens: number;
  outputTokens: number;
}

// ── Message Sending (delegating to provider) ─────────────────────────

/**
 * Send a single-turn message. Delegates to the provider registry.
 */
export async function sendMessage(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<AIResponse> {
  const provider = new AnthropicProvider(apiKey);

  const response = await provider.sendMessage({
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 2048,
  });

  return llmResponseToAIResponse(response);
}

/**
 * Send a message with web search enabled.
 * Delegates to the provider — if provider supports web search, it's used
 * natively. Otherwise falls back to knowledge-only mode.
 */
export async function sendAgentSearchMessage(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  options?: {
    maxSearches?: number;
    maxFetches?: number;
    allowedDomains?: string[];
  },
): Promise<AgentSearchResponse> {
  const provider = new AnthropicProvider(apiKey);

  const response = await provider.sendMessage({
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 4096,
    tools: [
      {
        type: 'web_search',
        name: 'web_search',
        config: {
          maxSearches: options?.maxSearches ?? 8,
          allowedDomains: options?.allowedDomains,
        },
      },
      {
        type: 'web_fetch',
        name: 'web_fetch',
        config: {
          maxFetches: options?.maxFetches ?? 5,
        },
      },
    ],
  });

  return {
    text: response.content,
    citations: response.citations.map(c => ({
      url: c.url,
      title: c.title,
      citedText: c.citedText,
    })),
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  };
}

// ── Provider-aware API ───────────────────────────────────────────────

/**
 * Send a message using the provider configured for the given task type.
 * Returns null if no provider is configured for that task.
 */
export async function sendWithProvider(
  task: 'quickCheck' | 'validation' | 'deepResearch' | 'chat',
  systemPrompt: string,
  userPrompt: string,
  options?: {
    maxTokens?: number;
    webSearch?: boolean;
    maxSearches?: number;
    maxFetches?: number;
  },
): Promise<LLMResponse | null> {
  const provider = getProvider(task);
  if (!provider) return null;

  const tools = options?.webSearch && provider.capabilities.webSearch
    ? [
        { type: 'web_search', name: 'web_search', config: { maxSearches: options.maxSearches ?? 8 } },
        { type: 'web_fetch', name: 'web_fetch', config: { maxFetches: options.maxFetches ?? 5 } },
      ]
    : undefined;

  return provider.sendMessage({
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: options?.maxTokens ?? 2048,
    tools,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function llmResponseToAIResponse(response: LLMResponse): AIResponse {
  return {
    text: response.content,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  };
}
