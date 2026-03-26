import { useCallback, useMemo, useRef } from 'react';
import { useTree } from './use-tree.ts';
import { getApiKey, sendMessage, sendAgentSearchMessage, sendSearchConversation } from '@/ai/ai-client.ts';
import {
  buildPersonValidationPrompt,
  parsePersonValidation,
  buildEdgeValidationPrompt,
  parseEdgeValidation,
  buildNotableContextPrompt,
  parseNotableContext,
} from '@/ai/validation-prompts.ts';
import { buildEnrichPrompt, parseEnrichResponse } from '@/ai/enrich-prompts.ts';
import {
  QUICK_CHECK_SYSTEM_PROMPT,
  buildQuickCheckUserPrompt,
  VALIDATION_SYSTEM_PROMPT,
  buildValidationUserPrompt,
  DEEP_RESEARCH_SYSTEM_PROMPT,
  buildDeepResearchUserPrompt,
  buildFollowUpPrompt,
} from '@/ai/prompts/index.ts';
import { parseQuickCheckResult, parseValidationReport, parseDeepResearchRound } from '@/ai/result-parser.ts';
import { computeEraTag, computeLocationContext } from '@/ai/era-context.ts';
import { generateResearchQuestions } from '@/ai/question-generator.ts';
import { convertToSource } from '@/ai/source-importer.ts';
import type { AIPersonValidation, AIEdgeValidation, AINotableContext, AIEnrichResult, QuickCheckResult, ValidationReport, DeepResearchRound, DeepResearchTask, DiscoveredSourceImport } from '@/types/ai.ts';
import type { Person } from '@/types/person.ts';
import type { Source } from '@/types/source.ts';
import type { LLMMessage } from '@/ai/provider/types.ts';

export function useAI() {
  const { state, dispatch } = useTree();

  const hasApiKey = useMemo(() => getApiKey() !== null, []);

  const validatePerson = useCallback(async (personId: string): Promise<AIPersonValidation | null> => {
    const apiKey = getApiKey();
    if (!apiKey || !state.graph) return null;

    const person = state.graph.persons.get(personId);
    if (!person) return null;

    const parents = (state.graph.parentEdges.get(personId) ?? [])
      .map(e => state.graph!.persons.get(e.parentId))
      .filter((p): p is Person => p !== undefined);

    const children = (state.graph.childEdges.get(personId) ?? [])
      .map(e => state.graph!.persons.get(e.childId))
      .filter((p): p is Person => p !== undefined);

    const sources = person.sourceIds
      .map(id => state.graph!.sources.get(id))
      .filter((s): s is Source => s !== undefined);

    const personFlags = state.flags.filter(f => f.affectedPersonIds.includes(personId));

    const { system, user } = buildPersonValidationPrompt(person, parents, children, sources, personFlags);
    const response = await sendMessage(apiKey, system, user);
    const result = parsePersonValidation(personId, response.text);

    if (result) {
      dispatch({ type: 'SET_AI_VALIDATION', validation: result });
    }
    return result;
  }, [state.graph, state.flags, dispatch]);

  const validateEdge = useCallback(async (edgeId: string): Promise<AIEdgeValidation | null> => {
    const apiKey = getApiKey();
    if (!apiKey || !state.graph) return null;

    const edge = state.graph.edges.get(edgeId);
    if (!edge) return null;

    const parent = state.graph.persons.get(edge.parentId);
    const child = state.graph.persons.get(edge.childId);
    if (!parent || !child) return null;

    const sources = edge.sourceIds
      .map(id => state.graph!.sources.get(id))
      .filter((s): s is Source => s !== undefined);

    const { system, user } = buildEdgeValidationPrompt(parent, child, edge, sources);
    const response = await sendMessage(apiKey, system, user);
    const result = parseEdgeValidation(edgeId, edge.parentId, edge.childId, response.text);

    if (result) {
      dispatch({ type: 'SET_AI_EDGE_VALIDATION', validation: result });
    }
    return result;
  }, [state.graph, dispatch]);

  const getNotableContext = useCallback(async (personId: string, generationsFromSubject: number): Promise<AINotableContext | null> => {
    const apiKey = getApiKey();
    if (!apiKey || !state.graph) return null;

    const person = state.graph.persons.get(personId);
    if (!person) return null;

    const { system, user } = buildNotableContextPrompt(person, generationsFromSubject);
    const response = await sendMessage(apiKey, system, user);
    const result = parseNotableContext(personId, response.text);

    if (result) {
      dispatch({ type: 'SET_AI_NOTABLE_CONTEXT', context: result });
    }
    return result;
  }, [state.graph, dispatch]);

  const getValidation = useCallback((personId: string): AIPersonValidation | undefined => {
    return state.aiValidations.get(personId);
  }, [state.aiValidations]);

  const getEdgeValidation = useCallback((edgeId: string): AIEdgeValidation | undefined => {
    return state.aiEdgeValidations.get(edgeId);
  }, [state.aiEdgeValidations]);

  const getCachedNotableContext = useCallback((personId: string): AINotableContext | undefined => {
    return state.aiNotableContexts.get(personId);
  }, [state.aiNotableContexts]);

  const enrichPerson = useCallback(async (personId: string, referenceUrls?: string[]): Promise<AIEnrichResult | null> => {
    const apiKey = getApiKey();
    if (!apiKey || !state.graph) return null;

    const person = state.graph.persons.get(personId);
    if (!person) return null;

    const parents = (state.graph.parentEdges.get(personId) ?? [])
      .map(e => state.graph!.persons.get(e.parentId))
      .filter((p): p is Person => p !== undefined);

    const children = (state.graph.childEdges.get(personId) ?? [])
      .map(e => state.graph!.persons.get(e.childId))
      .filter((p): p is Person => p !== undefined);

    const spouses = state.graph.getSpouses(personId);
    const siblings = state.graph.getSiblings(personId);

    const { system, user } = buildEnrichPrompt(person, parents, children, spouses, siblings, referenceUrls);
    // Use agentic search with web_search + web_fetch tools for real record lookups
    const response = await sendAgentSearchMessage(apiKey, system, user, {
      maxSearches: 8,
      maxFetches: referenceUrls && referenceUrls.length > 0 ? Math.max(5, referenceUrls.length + 2) : 5,
    });
    const result = parseEnrichResponse(personId, response.text, response.citations);

    if (result) {
      dispatch({ type: 'SET_AI_ENRICH', result });
    }
    return result;
  }, [state.graph, dispatch]);

  const getEnrichResult = useCallback((personId: string): AIEnrichResult | undefined => {
    return state.aiEnrichResults.get(personId);
  }, [state.aiEnrichResults]);

  // ── Mode 1: Quick Check ─────────────────────────────────────────

  const quickCheck = useCallback(async (personId: string): Promise<QuickCheckResult | null> => {
    if (!getApiKey() || !state.graph) return null;

    const person = state.graph.persons.get(personId);
    if (!person) return null;

    const parentEdges = state.graph.parentEdges.get(personId) ?? [];
    const father = parentEdges.find(e => {
      const p = state.graph!.persons.get(e.parentId);
      return p && p.sex === 'M';
    });
    const mother = parentEdges.find(e => {
      const p = state.graph!.persons.get(e.parentId);
      return p && p.sex === 'F';
    });
    const parents = {
      father: father ? state.graph.persons.get(father.parentId) ?? null : null,
      mother: mother ? state.graph.persons.get(mother.parentId) ?? null : null,
    };

    const children = (state.graph.childEdges.get(personId) ?? [])
      .map(e => state.graph!.persons.get(e.childId))
      .filter((p): p is Person => p !== undefined);

    const sources = person.sourceIds
      .map(id => state.graph!.sources.get(id))
      .filter((s): s is Source => s !== undefined);

    const personFlags = state.flags.filter(f => f.affectedPersonIds.includes(personId));
    const eraTag = computeEraTag(person);

    const userPrompt = buildQuickCheckUserPrompt(person, parents, children, sources, personFlags, eraTag);
    const response = await sendMessage(getApiKey()!, QUICK_CHECK_SYSTEM_PROMPT, userPrompt);
    const result = parseQuickCheckResult(response.text);

    if (result) {
      dispatch({ type: 'SET_AI_QUICK_CHECK', personId, result });
    }
    return result;
  }, [state.graph, state.flags, dispatch]);

  const getQuickCheck = useCallback((personId: string): QuickCheckResult | undefined => {
    return state.aiQuickChecks.get(personId);
  }, [state.aiQuickChecks]);

  // ── Mode 2: Standard Validation ─────────────────────────────────

  const validateStandard = useCallback(async (personId: string): Promise<ValidationReport | null> => {
    if (!getApiKey() || !state.graph) return null;

    const person = state.graph.persons.get(personId);
    if (!person) return null;

    const parentEdges = state.graph.parentEdges.get(personId) ?? [];
    const father = parentEdges.find(e => {
      const p = state.graph!.persons.get(e.parentId);
      return p && p.sex === 'M';
    });
    const mother = parentEdges.find(e => {
      const p = state.graph!.persons.get(e.parentId);
      return p && p.sex === 'F';
    });
    const parents = {
      father: father ? state.graph.persons.get(father.parentId) ?? null : null,
      mother: mother ? state.graph.persons.get(mother.parentId) ?? null : null,
    };

    const children = (state.graph.childEdges.get(personId) ?? [])
      .map(e => state.graph!.persons.get(e.childId))
      .filter((p): p is Person => p !== undefined);

    const sources = person.sourceIds
      .map(id => state.graph!.sources.get(id))
      .filter((s): s is Source => s !== undefined);

    const personFlags = state.flags.filter(f => f.affectedPersonIds.includes(personId));
    const eraTag = computeEraTag(person);
    const locationContext = computeLocationContext(person, eraTag);
    const primaryEdge = parentEdges[0] ?? null;
    const questions = generateResearchQuestions(person, parents, primaryEdge, personFlags, eraTag, locationContext);

    const userPrompt = buildValidationUserPrompt(person, parents, children, sources, personFlags, eraTag, locationContext, questions, primaryEdge);

    const response = await sendSearchConversation('validation', VALIDATION_SYSTEM_PROMPT, [
      { role: 'user', content: userPrompt },
    ], { maxTokens: 4096 });

    if (!response) return null;

    const report = parseValidationReport(response.content);
    if (report) {
      dispatch({ type: 'SET_AI_VALIDATION_REPORT', personId, report });
    }
    return report;
  }, [state.graph, state.flags, dispatch]);

  const getValidationReport = useCallback((personId: string): ValidationReport | undefined => {
    return state.aiValidationReports.get(personId);
  }, [state.aiValidationReports]);

  // ── Mode 3: Deep Research ───────────────────────────────────────

  const abortControllerRef = useRef<AbortController | null>(null);

  const startDeepResearch = useCallback((task: DeepResearchTask) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function* run(): AsyncGenerator<DeepResearchRound> {
      if (!getApiKey() || !state.graph) return;

      const person = state.graph.persons.get(task.primaryPersonId);
      if (!person) return;

      const parentEdges = state.graph.parentEdges.get(task.primaryPersonId) ?? [];
      const fatherEdge = parentEdges.find(e => {
        const p = state.graph!.persons.get(e.parentId);
        return p && p.sex === 'M';
      });
      const motherEdge = parentEdges.find(e => {
        const p = state.graph!.persons.get(e.parentId);
        return p && p.sex === 'F';
      });
      const parents = {
        father: fatherEdge ? state.graph.persons.get(fatherEdge.parentId) ?? null : null,
        mother: motherEdge ? state.graph.persons.get(motherEdge.parentId) ?? null : null,
      };

      const children = (state.graph.childEdges.get(task.primaryPersonId) ?? [])
        .map(e => state.graph!.persons.get(e.childId))
        .filter((p): p is Person => p !== undefined);

      const sources = person.sourceIds
        .map(id => state.graph!.sources.get(id))
        .filter((s): s is Source => s !== undefined);

      const personFlags = state.flags.filter(f => f.affectedPersonIds.includes(task.primaryPersonId));
      const locationContext = computeLocationContext(person, task.eraTag);

      // Clear previous session
      dispatch({ type: 'CLEAR_DEEP_RESEARCH', personId: task.primaryPersonId });

      // Round 1
      const round1Prompt = buildDeepResearchUserPrompt(task, person, parents, children, sources, personFlags, locationContext);
      const messages: LLMMessage[] = [{ role: 'user', content: round1Prompt }];

      const maxRounds = 5;
      for (let round = 1; round <= maxRounds; round++) {
        if (controller.signal.aborted) return;

        const response = await sendSearchConversation('deepResearch', DEEP_RESEARCH_SYSTEM_PROMPT, messages, {
          maxTokens: 4096,
        });
        if (!response) return;

        const parsed = parseDeepResearchRound(response.content);
        if (!parsed) return;

        const roundResult: DeepResearchRound = { ...parsed, round };
        dispatch({ type: 'APPEND_DEEP_RESEARCH_ROUND', personId: task.primaryPersonId, round: roundResult });
        yield roundResult;

        if (roundResult.status === 'COMPLETE' || roundResult.status === 'DEAD_END') return;

        // Build follow-up for next round
        messages.push({ role: 'assistant', content: response.content });
        const findingsSummary = roundResult.findings.map(f => `- [${f.type}] ${f.description}`).join('\n');
        const followUp = buildFollowUpPrompt(findingsSummary, roundResult.status);
        messages.push({ role: 'user', content: followUp });
      }
    }

    return {
      rounds: run(),
      abort: () => {
        controller.abort();
        abortControllerRef.current = null;
      },
    };
  }, [state.graph, state.flags, dispatch]);

  const getDeepResearchRounds = useCallback((personId: string): DeepResearchRound[] | undefined => {
    return state.aiDeepResearchSessions.get(personId);
  }, [state.aiDeepResearchSessions]);

  // ── Source Import ───────────────────────────────────────────────

  const importDiscoveredSource = useCallback((
    discovered: DiscoveredSourceImport,
    personIds: string[],
    edgeIds: string[] = [],
  ): void => {
    const source = convertToSource(discovered, personIds, edgeIds);
    dispatch({ type: 'ADD_SOURCE', source, personIds, edgeIds });
  }, [dispatch]);

  return {
    hasApiKey,
    // Legacy methods
    validatePerson,
    validateEdge,
    getNotableContext,
    getValidation,
    getEdgeValidation,
    getCachedNotableContext,
    enrichPerson,
    getEnrichResult,
    // Three-tier AI methods
    quickCheck,
    getQuickCheck,
    validateStandard,
    getValidationReport,
    startDeepResearch,
    getDeepResearchRounds,
    // Source import
    importDiscoveredSource,
  };
}
