import { describe, it, expect } from 'vitest';
import { EMPTY_SESSION, generateChatMessageId } from './chat-session.ts';
import type { ChatActionType } from './chat-session.ts';

describe('EMPTY_SESSION', () => {
  it('has empty messages array', () => {
    expect(EMPTY_SESSION.messages).toEqual([]);
  });

  it('has zero cost', () => {
    expect(EMPTY_SESSION.totalCostUsd).toBe(0);
  });

  it('is not loading', () => {
    expect(EMPTY_SESSION.isLoading).toBe(false);
  });
});

describe('generateChatMessageId', () => {
  it('returns a string starting with chat-msg-', () => {
    const id = generateChatMessageId();
    expect(id).toMatch(/^chat-msg-/);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateChatMessageId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('ChatActionType', () => {
  it('includes expected action types', () => {
    const validTypes: ChatActionType[] = [
      'import_source',
      'open_person',
      'mark_duplicate',
      'create_flag',
      'create_conjecture',
      'add_research_step',
      'run_deep_research',
    ];
    // Just verify these are valid type assignments (compile-time check)
    expect(validTypes).toHaveLength(7);
  });
});
