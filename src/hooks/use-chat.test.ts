import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { TreeProvider } from '@/context/tree-context.tsx';

// Mock AI dependencies
vi.mock('@/ai/ai-client.ts', () => ({
  getApiKey: vi.fn().mockReturnValue('test-key'),
  sendSearchConversation: vi.fn().mockResolvedValue({ text: 'AI response here', inputTokens: 100, outputTokens: 50 }),
}));

vi.mock('@/ai/chat/action-parser.ts', () => ({
  extractActionsFromResponse: vi.fn().mockReturnValue([]),
}));

vi.mock('@/ai/chat/chat-context.ts', () => ({
  buildChatContext: vi.fn().mockReturnValue({ totalPeople: 0, totalEdges: 0, totalSources: 0, healthScore: 100, selectedPersonSummary: null, treeSummary: '' }),
  formatContextForPrompt: vi.fn().mockReturnValue('context text'),
}));

vi.mock('@/ai/chat/chat-prompt.ts', () => ({
  buildChatSystemPrompt: vi.fn().mockReturnValue('system prompt'),
  buildChatMessages: vi.fn().mockReturnValue([{ role: 'user', content: 'test' }]),
}));

vi.mock('@/ai/source-importer.ts', () => ({
  convertToSource: vi.fn(),
}));

import { useChat } from './use-chat.ts';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(TreeProvider, null, children);
}

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with empty session', () => {
    const { result } = renderHook(() => useChat('tree'), { wrapper });
    expect(result.current.session.messages).toHaveLength(0);
    expect(result.current.session.totalCostUsd).toBe(0);
  });

  it('reports hasApiKey', () => {
    const { result } = renderHook(() => useChat('tree'), { wrapper });
    expect(result.current.hasApiKey).toBe(true);
  });

  it('clearSession resets to empty', () => {
    const { result } = renderHook(() => useChat('tree'), { wrapper });

    act(() => {
      result.current.clearSession();
    });
    expect(result.current.session.messages).toHaveLength(0);
    expect(result.current.session.totalCostUsd).toBe(0);
  });

  it('sendMessage is a no-op when graph is null (empty state)', async () => {
    const { result } = renderHook(() => useChat('tree'), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    // No graph loaded → early return, no messages added
    expect(result.current.session.messages).toHaveLength(0);
  });

  it('dismissBudgetWarning clears the warning', () => {
    const { result } = renderHook(() => useChat('tree'), { wrapper });

    act(() => {
      result.current.dismissBudgetWarning();
    });

    expect(result.current.showBudgetWarning).toBe(false);
  });

  it('exposes cancelMessage function', () => {
    const { result } = renderHook(() => useChat('tree'), { wrapper });
    expect(typeof result.current.cancelMessage).toBe('function');
  });

  it('exposes executeAction function', () => {
    const { result } = renderHook(() => useChat('tree'), { wrapper });
    expect(typeof result.current.executeAction).toBe('function');
  });

  it('session.isLoading defaults to false', () => {
    const { result } = renderHook(() => useChat('tree'), { wrapper });
    expect(result.current.session.isLoading).toBe(false);
  });
});
