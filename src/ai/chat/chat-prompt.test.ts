import { describe, it, expect } from 'vitest';
import { buildChatSystemPrompt, buildChatMessages } from './chat-prompt.ts';
import type { ChatContext } from './chat-context.ts';
import type { ChatMessage } from './chat-session.ts';

function makeChatContext(overrides: Partial<ChatContext> = {}): ChatContext {
  return {
    selectedPersonId: null,
    activeView: 'tree',
    treeSummary: {
      totalPeople: 100,
      totalGenerations: 5,
      subjectName: 'John Doe',
      branchCount: 4,
      topNotableAncestors: [],
      topFlags: [],
      overallHealthScore: 75,
      generationalDistribution: [],
      deepestAncestors: [],
      tierDistribution: [],
    },
    selectedPersonContext: null,
    ...overrides,
  };
}

function makeMsg(role: 'user' | 'assistant', content: string): ChatMessage {
  return {
    id: `msg-${Math.random()}`,
    role,
    content,
    actions: [],
    citations: [],
    costUsd: null,
    timestamp: new Date(),
  };
}

describe('buildChatSystemPrompt', () => {
  it('includes genealogical research assistant framing', () => {
    const prompt = buildChatSystemPrompt(makeChatContext());
    expect(prompt).toContain('genealogical research assistant');
  });

  it('includes CURRENT TREE CONTEXT section', () => {
    const prompt = buildChatSystemPrompt(makeChatContext());
    expect(prompt).toContain('CURRENT TREE CONTEXT');
  });

  it('includes behavior rules', () => {
    const prompt = buildChatSystemPrompt(makeChatContext());
    expect(prompt).toContain('BEHAVIOR RULES');
  });

  it('mentions structured source format', () => {
    const prompt = buildChatSystemPrompt(makeChatContext());
    expect(prompt).toContain('Title');
    expect(prompt).toContain('Repository');
  });
});

describe('buildChatMessages', () => {
  it('adds user message at end', () => {
    const messages = buildChatMessages([], 'Tell me about John');
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Tell me about John');
  });

  it('includes history messages', () => {
    const history = [
      makeMsg('user', 'Hello'),
      makeMsg('assistant', 'Hi there'),
    ];
    const messages = buildChatMessages(history, 'Follow up');
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[2].content).toBe('Follow up');
  });

  it('limits history to maxHistoryMessages', () => {
    const history: ChatMessage[] = [];
    for (let i = 0; i < 20; i++) {
      history.push(makeMsg(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`));
    }
    const messages = buildChatMessages(history, 'New message', 4);
    // 4 history + 1 new = 5
    expect(messages).toHaveLength(5);
  });

  it('skips loading messages from history', () => {
    const history: ChatMessage[] = [
      makeMsg('user', 'Hello'),
      { ...makeMsg('assistant', ''), loading: true },
    ];
    const messages = buildChatMessages(history, 'Follow up');
    // Loading msg filtered out: 1 history + 1 new = 2
    expect(messages).toHaveLength(2);
  });

  it('skips error messages from history', () => {
    const history: ChatMessage[] = [
      makeMsg('user', 'Hello'),
      { ...makeMsg('assistant', ''), error: 'API failed' },
    ];
    const messages = buildChatMessages(history, 'Follow up');
    expect(messages).toHaveLength(2);
  });
});
