/**
 * Chat hook — manages ephemeral chat session state and API calls.
 *
 * Chat history is NOT persisted. Only outcomes (sources added, flags created)
 * persist through the normal reducer → IndexedDB flow.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { useTree } from './use-tree.ts';
import { getApiKey, streamSearchConversation } from '@/ai/ai-client.ts';
import { buildChatContext } from '@/ai/chat/chat-context.ts';
import { buildChatSystemPrompt, buildChatMessages } from '@/ai/chat/chat-prompt.ts';
import { extractActionsFromResponse } from '@/ai/chat/action-parser.ts';
import type { ChatMessage, ChatSession, ChatAction } from '@/ai/chat/chat-session.ts';
import { EMPTY_SESSION, generateChatMessageId } from '@/ai/chat/chat-session.ts';
import { convertToSource } from '@/ai/source-importer.ts';
import { generateId } from '@/utils/id-generator.ts';
import { buildSuggestedPrompts } from '@/ai/chat/suggested-prompts.ts';
import { generateFollowUpSuggestions } from '@/ai/chat/follow-up-generator.ts';
import type { Flag, FlagCategory, FlagSeverity } from '@/types/flag.ts';
import type { Conjecture } from '@/types/conjecture.ts';

const BUDGET_WARNING_USD = 0.50;

export interface MergeRequest {
  personIdA: string;
  personIdB: string;
}

export function useChat(activeView: string) {
  const { state, dispatch } = useTree();
  const [session, setSession] = useState<ChatSession>(EMPTY_SESSION);
  const [budgetWarningDismissed, setBudgetWarningDismissed] = useState(false);
  const [mergeRequest, setMergeRequest] = useState<MergeRequest | null>(null);
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
      citations: [],
      costUsd: null,
      timestamp: new Date(),
    };

    // Placeholder assistant message (loading)
    const loadingMsg: ChatMessage = {
      id: generateChatMessageId(),
      role: 'assistant',
      content: '',
      actions: [],
      citations: [],
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

      // Streaming: accumulate text and throttle state updates via RAF
      let streamedText = '';
      let rafId: number | null = null;

      const flushStreamUpdate = () => {
        if (controller.signal.aborted) return;
        const snapshot = streamedText;
        setSession(prev => ({
          ...prev,
          messages: prev.messages.map(m =>
            m.id === loadingMsg.id ? { ...m, content: snapshot } : m
          ),
        }));
        rafId = null;
      };

      const response = await streamSearchConversation(
        'chat',
        systemPrompt,
        messages,
        {
          onTextDelta: (delta) => {
            streamedText += delta;
            // Throttle UI updates to once per animation frame
            if (rafId === null) {
              rafId = requestAnimationFrame(flushStreamUpdate);
            }
          },
          onComplete: () => {
            if (rafId !== null) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
          },
        },
        {
          maxTokens: 2048,
          maxSearches: 4,
          maxFetches: 3,
        },
      );

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

      // Extract actions from full response (not partial stream)
      const actions = extractActionsFromResponse(response.content, context, state.graph);

      // Map citations from LLM response
      const citations = response.citations.map(c => ({
        url: c.url,
        title: c.title,
        citedText: c.citedText,
      }));

      const messageCost = response.usage.estimatedCost;

      setSession(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.id === loadingMsg.id
            ? {
                ...m,
                content: response.content,
                actions,
                citations,
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

      case 'merge_persons': {
        const personIdA = action.data.personIdA as string;
        const personIdB = action.data.personIdB as string;
        if (personIdA && personIdB) {
          setMergeRequest({ personIdA, personIdB });
        }
        break;
      }

      case 'mark_duplicate': {
        const personIds = (action.data.personIds as string[]) ?? [];
        const targetId = personIds[0] ?? state.selectedPersonId;
        if (!targetId) break;
        const flag: Flag = {
          id: generateId('flag'),
          category: 'duplicate_suspect',
          severity: 'warning',
          title: 'Possible duplicate detected by AI',
          description: personIds.length >= 2
            ? `AI analysis suggests these may be the same person.`
            : 'AI analysis suggests a possible duplicate.',
          suggestedAction: 'Review both entries and merge if confirmed.',
          ruleId: 'ai-chat-duplicate',
          affectedPersonIds: personIds.length >= 2 ? personIds : [targetId],
          affectedEdgeIds: [],
          userStatus: 'new',
          userNote: null,
          detectedAt: new Date(),
          resolvedAt: null,
        };
        dispatch({ type: 'SET_FLAGS', flags: [...state.flags, flag] });
        break;
      }

      case 'create_flag': {
        const personId = (action.data.personId as string) ?? state.selectedPersonId;
        if (!personId) break;
        const flag: Flag = {
          id: generateId('flag'),
          category: (action.data.category as FlagCategory) ?? 'data_quality',
          severity: (action.data.severity as FlagSeverity) ?? 'warning',
          title: 'Issue flagged by AI',
          description: (action.data.description as string) ?? 'AI detected a potential issue.',
          suggestedAction: 'Review and investigate this issue.',
          ruleId: 'ai-chat-flag',
          affectedPersonIds: [personId],
          affectedEdgeIds: [],
          userStatus: 'new',
          userNote: null,
          detectedAt: new Date(),
          resolvedAt: null,
        };
        dispatch({ type: 'SET_FLAGS', flags: [...state.flags, flag] });
        break;
      }

      case 'create_conjecture': {
        const personId = (action.data.personId as string) ?? state.selectedPersonId;
        if (!personId) break;
        const conjecture: Conjecture = {
          id: generateId('conj'),
          personId,
          hypothesis: (action.data.hypothesis as string) ?? 'AI-suggested hypothesis',
          confidencePercent: 50,
          supportingEvidence: '',
          contradictingEvidence: '',
          sourceIds: [],
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        dispatch({ type: 'ADD_CONJECTURE', conjecture });
        break;
      }

      case 'add_research_step': {
        const personId = state.selectedPersonId;
        if (!personId) break;
        const step = {
          id: generateId('rs'),
          personId,
          edgeId: null,
          origin: 'ai_generated' as const,
          description: (action.data.description as string) ?? 'Follow up on AI recommendation',
          suggestedSource: null,
          suggestedUrl: null,
          reasoning: 'Recommended by AI research assistant.',
          impact: 'medium' as const,
          status: 'not_started' as const,
          completedAt: null,
          resultNote: null,
          generatedAt: new Date(),
        };
        dispatch({ type: 'SET_RESEARCH_STEPS', steps: [...state.researchSteps, step] });
        break;
      }

      case 'run_deep_research': {
        const personId = (action.data.personId as string) ?? state.selectedPersonId;
        if (personId) {
          dispatch({ type: 'SELECT_PERSON', personId });
        }
        break;
      }
    }
  }, [dispatch, state.selectedPersonId, state.flags, state.researchSteps]);

  // Context-aware suggested prompts
  const suggestedPrompts = useMemo(() => {
    if (!state.graph) return [];
    const context = buildChatContext({
      graph: state.graph,
      flags: state.flags,
      selectedPersonId: state.selectedPersonId,
      activeView,
      deepScanResult: state.deepScanResult,
      storyPathResult: state.storyPathResult,
    });
    return buildSuggestedPrompts(context);
  }, [state.graph, state.flags, state.selectedPersonId, activeView, state.deepScanResult, state.storyPathResult]);

  // Follow-up suggestions based on last assistant message
  const followUpSuggestions = useMemo(() => {
    const lastAssistant = [...session.messages].reverse().find(
      m => m.role === 'assistant' && !m.loading && !m.error && m.content,
    );
    if (!lastAssistant) return [];

    const context = state.graph
      ? buildChatContext({
          graph: state.graph,
          flags: state.flags,
          selectedPersonId: state.selectedPersonId,
          activeView,
          deepScanResult: state.deepScanResult,
          storyPathResult: state.storyPathResult,
        })
      : null;

    return generateFollowUpSuggestions(lastAssistant.content, context);
  }, [session.messages, state.graph, state.flags, state.selectedPersonId, activeView, state.deepScanResult, state.storyPathResult]);

  const clearMergeRequest = useCallback(() => setMergeRequest(null), []);

  return {
    session,
    hasApiKey,
    showBudgetWarning,
    suggestedPrompts,
    followUpSuggestions,
    mergeRequest,
    sendMessage,
    cancelMessage,
    clearSession,
    dismissBudgetWarning,
    executeAction,
    clearMergeRequest,
  };
}
