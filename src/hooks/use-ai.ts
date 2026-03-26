import { useCallback, useMemo } from 'react';
import { useTree } from './use-tree.ts';
import { getApiKey, sendMessage, sendAgentSearchMessage } from '@/ai/ai-client.ts';
import {
  buildPersonValidationPrompt,
  parsePersonValidation,
  buildEdgeValidationPrompt,
  parseEdgeValidation,
  buildNotableContextPrompt,
  parseNotableContext,
} from '@/ai/validation-prompts.ts';
import { buildEnrichPrompt, parseEnrichResponse } from '@/ai/enrich-prompts.ts';
import type { AIPersonValidation, AIEdgeValidation, AINotableContext, AIEnrichResult } from '@/types/ai.ts';
import type { Person } from '@/types/person.ts';
import type { Source } from '@/types/source.ts';

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

  return {
    hasApiKey,
    validatePerson,
    validateEdge,
    getNotableContext,
    getValidation,
    getEdgeValidation,
    getCachedNotableContext,
    enrichPerson,
    getEnrichResult,
  };
}
