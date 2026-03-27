import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider } from './anthropic-provider.ts';

// Mock the SDK module — must use a constructor-compatible function
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

beforeEach(() => {
  mockCreate.mockReset();
});

describe('AnthropicProvider', () => {
  it('has correct static properties', () => {
    const provider = new AnthropicProvider('sk-test');
    expect(provider.id).toBe('anthropic');
    expect(provider.name).toBe('Claude (Anthropic)');
    expect(provider.requiresApiKey).toBe(true);
    expect(provider.capabilities.webSearch).toBe(true);
    expect(provider.capabilities.toolUse).toBe(true);
    expect(provider.capabilities.structuredOutput).toBe(true);
    expect(provider.cost.inputPerMillion).toBe(3);
    expect(provider.cost.outputPerMillion).toBe(15);
  });

  describe('sendMessage', () => {
    it('sends a basic message and returns formatted response', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Hello world' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
      });

      const provider = new AnthropicProvider('sk-test');
      const response = await provider.sendMessage({
        systemPrompt: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 100,
      });

      expect(response.content).toBe('Hello world');
      expect(response.usage.inputTokens).toBe(10);
      expect(response.usage.outputTokens).toBe(5);
      expect(response.usage.estimatedCost).toBeGreaterThan(0);
      expect(response.stopReason).toBe('end_turn');
      expect(response.citations).toHaveLength(0);
    });

    it('extracts web search citations', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: 'Found a record.',
            citations: [
              {
                type: 'web_search_result_location',
                url: 'https://example.com/record',
                title: 'John Smith Birth Record',
                cited_text: 'Born 1842 in Edinburgh',
              },
            ],
          },
        ],
        usage: { input_tokens: 50, output_tokens: 20 },
        stop_reason: 'end_turn',
      });

      const provider = new AnthropicProvider('sk-test');
      const response = await provider.sendMessage({
        systemPrompt: 'Search for records.',
        messages: [{ role: 'user', content: 'Find records' }],
        maxTokens: 4096,
        tools: [{ type: 'web_search', name: 'web_search' }],
      });

      expect(response.citations).toHaveLength(1);
      expect(response.citations[0].url).toBe('https://example.com/record');
      expect(response.citations[0].title).toBe('John Smith Birth Record');
      expect(response.citations[0].citedText).toBe('Born 1842 in Edinburgh');
    });

    it('deduplicates citations by URL', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: 'First mention.',
            citations: [
              { type: 'web_search_result_location', url: 'https://example.com/a', title: 'A', cited_text: 'text1' },
            ],
          },
          {
            type: 'text',
            text: 'Second mention.',
            citations: [
              { type: 'web_search_result_location', url: 'https://example.com/a', title: 'A', cited_text: 'text2' },
              { type: 'web_search_result_location', url: 'https://example.com/b', title: 'B', cited_text: 'text3' },
            ],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'end_turn',
      });

      const provider = new AnthropicProvider('sk-test');
      const response = await provider.sendMessage({
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'test' }],
        maxTokens: 100,
      });

      expect(response.citations).toHaveLength(2);
    });

    it('concatenates multiple text blocks', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
        usage: { input_tokens: 5, output_tokens: 3 },
        stop_reason: 'end_turn',
      });

      const provider = new AnthropicProvider('sk-test');
      const response = await provider.sendMessage({
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'test' }],
        maxTokens: 100,
      });

      expect(response.content).toBe('Hello world');
    });

    it('maps stop reasons correctly', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '' }],
        usage: { input_tokens: 5, output_tokens: 100 },
        stop_reason: 'max_tokens',
      });

      const provider = new AnthropicProvider('sk-test');
      const response = await provider.sendMessage({
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'test' }],
        maxTokens: 100,
      });

      expect(response.stopReason).toBe('max_tokens');
    });

    it('calculates estimated cost correctly', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
        stop_reason: 'end_turn',
      });

      const provider = new AnthropicProvider('sk-test');
      const response = await provider.sendMessage({
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'test' }],
        maxTokens: 100,
      });

      // $3/M input + $15/M output = $18
      expect(response.usage.estimatedCost).toBe(18);
    });

    it('passes web search tools to SDK', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
      });

      const provider = new AnthropicProvider('sk-test');
      await provider.sendMessage({
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'test' }],
        maxTokens: 100,
        tools: [
          { type: 'web_search', name: 'web_search', config: { maxSearches: 5 } },
          { type: 'web_fetch', name: 'web_fetch', config: { maxFetches: 3 } },
        ],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ type: 'web_search_20250305', max_uses: 5 }),
            expect.objectContaining({ type: 'web_fetch_20250910', max_uses: 3 }),
          ]),
        }),
      );
    });
  });

  describe('testConnection', () => {
    it('returns ok on success', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 5, output_tokens: 2 },
        stop_reason: 'end_turn',
      });

      const provider = new AnthropicProvider('sk-test');
      const result = await provider.testConnection();
      expect(result.ok).toBe(true);
    });

    it('returns error on failure', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Invalid API key'));

      const provider = new AnthropicProvider('sk-bad');
      const result = await provider.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });
  });
});
