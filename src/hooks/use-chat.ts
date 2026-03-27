/**
 * Chat hook — manages ephemeral chat session state and API calls.
 *
 * Chat history is NOT persisted. Only outcomes (sources added, flags created)
 * persist through the normal reducer → IndexedDB flow.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { useTree } from './use-tree.ts';
import { getApiKey, sendSearchConversation } from '@/ai/ai-client.ts';
import { buildChatContext } from '@/ai/chat/chat-context.ts';
import { buildChatSystemPrompt, buildChatMessages } from '@/ai/chat/chat-prompt.ts';
import { extractActionsFromResponse } from '@/ai/chat/action-parser.ts';
import type { ChatMessage, ChatSession, ChatAction } from '@/ai/chat/chat-session.ts';
import { EMPTY_SESSION, generateChatMessageId } from '@/ai/chat/chat-session.ts';
import { convertToSource } from '@/ai/source-importer.ts';

const BUDGET_WARNING_USD = 0.50;

export function useChat(activeView: string) {
  const { state, dispatch } = useTree();
  const [session, setSession] = useState<ChatSession>(EMPTY_SESSION);
  const [budgetWarningDismissed, setBudgetWarningDismissed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const hasApiKey = useMemo(() => getApiKey() !== null, []);

  const showBudgetWarning = !budgetWarningDismissed && session.totalCostUsd >= BUDGET_WARNING_USD;

  const sendMessage = useCallback(async (userText: string) => {
    if (!state.graph || !getApiKey()) return;

    const userMsg: ChatMessage = {
      id: generateChatMessageId(),
      role: 'user',
      content: userText,
      actions: [],
      costUsd: null,
      timestamp: new Date(),
    };

    // Placeholder assistant message (loading)
    const loadingMsg: ChatMessage = {
      id: generateChatMessageId(),
      role: 'assistant',
      content: '',
      actions: [],
      costUsd: null,
      timestamp: new Date(),
      loading: true,
    };

    setSession(prev => ({
      ...prev,
      messages: [...prev.messages, userMsg, loadingMsg],
      isLoading: true,
    }));

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      // Build context from current app state
      const context = buildChatContext({
        graph: state.graph,
        flags: state.flags,
        selectedPersonId: state.selectedPersonId,
        activeView,
        deepScanResult: state.deepScanResult,
        storyPathResult: state.storyPathResult,
      });

      const systemPrompt = buildChatSystemPrompt(context);
      const prevMessages = session.messages.filter(m => !m.loading && !m.error);
      const messages = buildChatMessages(prevMessages, userText);

      const response = await sendSearchConversation('chat', systemPrompt, messages, {
        maxTokens: 2048,
        maxSearches: 4,
        maxFetches: 3,
      });

      if (controller.signal.aborted) return;

      if (!response) {
        setSession(prev => ({
          ...prev,
          messages: prev.messages.map(m =>
            m.id === loadingMsg.id
              ? { ...m, loading: false, error: 'No AI provider configured. Set up your API key first.' }
              : m
          ),
          isLoading: false,
        }));
        return;
      }

      // Extract actions from response
      const actions = extractActionsFromResponse(response.content, context, state.graph);

      const messageCost = response.usage.estimatedCost;

      setSession(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.id === loadingMsg.id
            ? {
                ...m,
                content: response.content,
                actions,
                costUsd: messageCost,
                loading: false,
                error: null,
              }
            : m
        ),
        totalCostUsd: prev.totalCostUsd + messageCost,
        isLoading: false,
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setSession(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.id === loadingMsg.id
            ? { ...m, loading: false, error: errorMessage }
            : m
        ),
        isLoading: false,
      }));
    } finally {
      abortRef.current = null;
    }
  }, [state.graph, state.flags, state.selectedPersonId, state.deepScanResult, state.storyPathResult, activeView, session.messages]);

  const cancelMessage = useCallback(() => {
    abortRef.current?.abort();
    setSession(prev => ({
      ...prev,
      messages: prev.messages.filter(m => !m.loading),
      isLoading: false,
    }));
  }, []);

  const clearSession = useCallback(() => {
    setSession(EMPTY_SESSION);
    setBudgetWarningDismissed(false);
  }, []);

  const dismissBudgetWarning = useCallback(() => {
    setBudgetWarningDismissed(true);
  }, []);

  /** Execute a chat action (import source, open person, etc.) */
  const executeAction = useCallback((action: ChatAction) => {
    switch (action.type) {
      case 'open_person': {
        const personId = action.data.personId as string;
        if (personId) {
          dispatch({ type: 'SELECT_PERSON', personId });
        }
        break;
      }

      case 'import_source': {
        const source = convertToSource(
          {
            title: (action.data.title as string) ?? 'Unnamed source',
            url: null,
            repository: (action.data.repository as string) ?? '',
            sourceClass: (action.data.sourceClass as 'primary' | 'secondary' | 'tertiary') ?? 'tertiary',
            sourceType: (action.data.sourceType as string) ?? 'other',
            provesWhat: [(action.data.proves as string) ?? ''],
          },
          state.selectedPersonId ? [state.selectedPersonId] : [],
          [],
        );
        dispatch({
          type: 'ADD_SOURCE',
          source,
          personIds: state.selectedPersonId ? [state.selectedPersonId] : [],
          edgeIds: [],
        });
        break;
      }

      // Other action types show an informational message but don't auto-execute
      // The user should use the structured UI for these operations
      default:
        break;
    }
  }, [dispatch, state.selectedPersonId]);

  return {
    session,
    hasApiKey,
    showBudgetWarning,
    sendMessage,
    cancelMessage,
    clearSession,
    dismissBudgetWarning,
    executeAction,
  };
}
