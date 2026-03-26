import type Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMCitation,
  ProviderCapabilities,
  ProviderCost,
} from './types.ts';

/**
 * Anthropic Claude provider.
 *
 * Uses `@anthropic-ai/sdk` with dangerouslyAllowBrowser for client-side use.
 * Supports web search via `web_search_20250305` and `web_fetch_20250910` tools.
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly name = 'Claude (Anthropic)';
  readonly requiresApiKey = true;
  readonly apiKeyLabel = 'Anthropic API Key';

  readonly capabilities: ProviderCapabilities = {
    webSearch: true,
    toolUse: true,
    structuredOutput: true,
    maxContextTokens: 200_000,
    maxOutputTokens: 8_192,
    streaming: true,
  };

  readonly cost: ProviderCost = {
    inputPerMillion: 3,
    outputPerMillion: 15,
  };

  private apiKey: string;
  private modelId: string;

  constructor(apiKey: string, modelId = 'claude-sonnet-4-20250514') {
    this.apiKey = apiKey;
    this.modelId = modelId;
  }

  async sendMessage(request: LLMRequest): Promise<LLMResponse> {
    const AnthropicSDK = (await import('@anthropic-ai/sdk')).default;
    const client = new AnthropicSDK({
      apiKey: this.apiKey,
      dangerouslyAllowBrowser: true,
    });

    // Build tools array if request has tool definitions
    const tools = this.buildTools(request);

    const createParams: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: this.modelId,
      max_tokens: request.maxTokens,
      system: request.systemPrompt,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(tools.length > 0 ? { tools } : {}),
    };

    const response = await client.messages.create(createParams);

    // Extract text content
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    const content = textBlocks.map(b => b.text).join('');

    // Extract citations from text blocks
    const citations = this.extractCitations(textBlocks);

    // Calculate cost
    const inputCost = (response.usage.input_tokens / 1_000_000) * this.cost.inputPerMillion;
    const outputCost = (response.usage.output_tokens / 1_000_000) * this.cost.outputPerMillion;

    // Map stop reason
    let stopReason: LLMResponse['stopReason'] = 'end_turn';
    if (response.stop_reason === 'tool_use') stopReason = 'tool_use';
    else if (response.stop_reason === 'max_tokens') stopReason = 'max_tokens';

    return {
      content,
      citations,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        estimatedCost: inputCost + outputCost,
      },
      stopReason,
    };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.sendMessage({
        systemPrompt: 'Reply with "ok".',
        messages: [{ role: 'user', content: 'Test.' }],
        maxTokens: 10,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  // ── Private helpers ─────────────────────────────────────────────

  private buildTools(request: LLMRequest): Anthropic.Messages.ToolUnion[] {
    if (!request.tools || request.tools.length === 0) return [];

    const tools: Anthropic.Messages.ToolUnion[] = [];
    for (const tool of request.tools) {
      if (tool.type === 'web_search') {
        const searchTool: Anthropic.Messages.WebSearchTool20250305 = {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: (tool.config?.maxSearches as number) ?? 8,
          ...(tool.config?.allowedDomains
            ? { allowed_domains: tool.config.allowedDomains as string[] }
            : {}),
        };
        tools.push(searchTool);
      } else if (tool.type === 'web_fetch') {
        const fetchTool: Anthropic.Messages.WebFetchTool20250910 = {
          type: 'web_fetch_20250910',
          name: 'web_fetch',
          max_uses: (tool.config?.maxFetches as number) ?? 5,
        };
        tools.push(fetchTool);
      }
    }
    return tools;
  }

  private extractCitations(textBlocks: Anthropic.TextBlock[]): LLMCitation[] {
    const citations: LLMCitation[] = [];
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

    return citations;
  }
}
