import Anthropic from '@anthropic-ai/sdk';

const API_KEY_STORAGE_KEY = 'genielogical_anthropic_api_key';

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

export function createClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

export async function testApiKey(key: string): Promise<boolean> {
  try {
    const client = createClient(key);
    await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Reply with "ok".' }],
    });
    return true;
  } catch {
    return false;
  }
}

export interface AIResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export async function sendMessage(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<AIResponse> {
  const client = createClient(apiKey);
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ── Web Search Citation ───────────────────────────────────────────

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

/**
 * Send a message with web search enabled via Anthropic's server-side
 * web_search tool. Claude will autonomously search the web for records
 * and return results with citations.
 *
 * The search happens entirely server-side — no CORS issues.
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
  const client = createClient(apiKey);

  const webSearchTool: Anthropic.Messages.WebSearchTool20250305 = {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: options?.maxSearches ?? 8,
    ...(options?.allowedDomains ? { allowed_domains: options.allowedDomains } : {}),
  };

  const webFetchTool: Anthropic.Messages.WebFetchTool20250910 = {
    type: 'web_fetch_20250910',
    name: 'web_fetch',
    max_uses: options?.maxFetches ?? 5,
  };

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools: [webSearchTool, webFetchTool],
  });

  // Extract text blocks and their citations
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );

  const text = textBlocks.map(b => b.text).join('');

  // Extract web search citations from text blocks
  const citations: WebCitation[] = [];
  const seenUrls = new Set<string>();

  for (const block of textBlocks) {
    if (!block.citations) continue;
    for (const cite of block.citations) {
      if (cite.type === 'web_search_result_location' && !seenUrls.has(cite.url)) {
        seenUrls.add(cite.url);
        citations.push({
          url: cite.url,
          title: cite.title,
          citedText: cite.cited_text,
        });
      }
    }
  }

  return {
    text,
    citations,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
