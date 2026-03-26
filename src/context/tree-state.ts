import type { ParseStats } from '@/types/index.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Flag } from '@/types/flag.ts';
import type { Conjecture } from '@/types/conjecture.ts';
import type { Source } from '@/types/source.ts';
import type { NodeStatus } from '@/types/common.ts';
import type { DeepScanResult } from '@/types/deep-scan.ts';
import type { StoryPathResult } from '@/types/story-path.ts';
import type { ResearchPriority, ResearchStep } from '@/types/research.ts';
import type { AIPersonValidation, AIEdgeValidation, AINotableContext, AIEnrichResult, BatchProgress } from '@/types/ai.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import { scoreAllConfidence } from '@/engine/confidence-scorer.ts';

export type TreePhase = 'empty' | 'parsing' | 'loaded' | 'error';

export interface TreeState {
  phase: TreePhase;
  graph: TreeGraph | null;
  stats: ParseStats | null;
  currentTreeId: string | null;
  flags: Flag[];
  conjectures: Map<string, Conjecture>;
  selectedPersonId: string | null;
  searchQuery: string;
  error: string | null;
  expandToAncestor: string | null;
  deepScanResult: DeepScanResult | null;
  storyPathResult: StoryPathResult | null;
  researchPriorities: ResearchPriority[];
  aiValidations: Map<string, AIPersonValidation>;
  aiEdgeValidations: Map<string, AIEdgeValidation>;
  aiNotableContexts: Map<string, AINotableContext>;
  aiBatchProgress: BatchProgress | null;
  aiEnrichResults: Map<string, AIEnrichResult>;
  researchSteps: ResearchStep[];
}

export type TreeAction =
  | { type: 'PARSE_START' }
  | { type: 'PARSE_SUCCESS'; graph: TreeGraph; stats: ParseStats }
  | { type: 'PARSE_ERROR'; error: string }
  | { type: 'SELECT_PERSON'; personId: string | null }
  | { type: 'SET_SEARCH'; query: string }
  | { type: 'SET_FLAGS'; flags: Flag[] }
  | { type: 'RESET' }
  | { type: 'UPDATE_PERSON_STATUS'; personId: string; status: NodeStatus }
  | { type: 'ADD_SOURCE'; source: Source; personIds: string[]; edgeIds: string[] }
  | { type: 'REMOVE_SOURCE'; sourceId: string }
  | { type: 'UPDATE_FLAG_STATUS'; flagId: string; userStatus: Flag['userStatus']; userNote: string | null }
  | { type: 'SET_PRIMARY_PATH'; edgeId: string }
  | { type: 'ADD_CONJECTURE'; conjecture: Conjecture }
  | { type: 'UPDATE_CONJECTURE'; conjectureId: string; updates: Partial<Pick<Conjecture, 'hypothesis' | 'status' | 'confidencePercent' | 'supportingEvidence' | 'contradictingEvidence'>> }
  | { type: 'SET_DEEP_SCAN'; result: DeepScanResult }
  | { type: 'SET_STORY_PATHS'; result: StoryPathResult }
  | { type: 'SET_RESEARCH_PRIORITIES'; priorities: ResearchPriority[] }
  | { type: 'SET_AI_VALIDATION'; validation: AIPersonValidation }
  | { type: 'SET_AI_EDGE_VALIDATION'; validation: AIEdgeValidation }
  | { type: 'SET_AI_NOTABLE_CONTEXT'; context: AINotableContext }
  | { type: 'SET_BATCH_PROGRESS'; progress: BatchProgress | null }
  | { type: 'SET_RESEARCH_STEPS'; steps: ResearchStep[] }
  | { type: 'UPDATE_RESEARCH_STEP'; stepId: string; status: ResearchStep['status'] }
  | { type: 'ADD_PERSON'; person: Person }
  | { type: 'UPDATE_PERSON'; personId: string; updates: Partial<Omit<Person, 'id'>> }
  | { type: 'REMOVE_PERSON'; personId: string }
  | { type: 'ADD_EDGE'; edge: Edge }
  | { type: 'REMOVE_EDGE'; edgeId: string }
  | { type: 'MERGE_PERSONS'; keepId: string; removeId: string }
  | { type: 'INIT_EMPTY_TREE' }
  | { type: 'SET_AI_ENRICH'; result: AIEnrichResult }
  | { type: 'EXPAND_TO_ANCESTOR'; targetPersonId: string | null }
  | { type: 'LOAD_TREE'; graph: TreeGraph; flags: Flag[]; currentTreeId: string };

export const initialTreeState: TreeState = {
  phase: 'empty',
  graph: null,
  stats: null,
  currentTreeId: null,
  flags: [],
  conjectures: new Map(),
  selectedPersonId: null,
  searchQuery: '',
  error: null,
  expandToAncestor: null,
  deepScanResult: null,
  storyPathResult: null,
  researchPriorities: [],
  aiValidations: new Map(),
  aiEdgeValidations: new Map(),
  aiNotableContexts: new Map(),
  aiBatchProgress: null,
  aiEnrichResults: new Map(),
  researchSteps: [],
};

function reScore(graph: TreeGraph, flags: Flag[]): void {
  scoreAllConfidence(graph, flags);
}

export function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case 'PARSE_START':
      return {
        ...state,
        phase: 'parsing',
        error: null,
      };

    case 'PARSE_SUCCESS':
      return {
        ...state,
        phase: 'loaded',
        graph: action.graph,
        stats: action.stats,
        conjectures: new Map(),
        aiValidations: new Map(),
        aiEdgeValidations: new Map(),
        aiNotableContexts: new Map(),
        aiBatchProgress: null,
        aiEnrichResults: new Map(),
        researchSteps: [],
        error: null,
      };

    case 'PARSE_ERROR':
      return {
        ...state,
        phase: 'error',
        graph: null,
        stats: null,
        error: action.error,
      };

    case 'SELECT_PERSON':
      return {
        ...state,
        selectedPersonId: action.personId,
      };

    case 'SET_SEARCH':
      return {
        ...state,
        searchQuery: action.query,
      };

    case 'SET_FLAGS':
      return {
        ...state,
        flags: action.flags,
      };

    case 'RESET':
      return initialTreeState;

    case 'UPDATE_PERSON_STATUS': {
      if (!state.graph) return state;
      const person = state.graph.persons.get(action.personId);
      if (!person) return state;
      person.status = action.status;
      person.updatedAt = new Date();
      return { ...state };
    }

    case 'ADD_SOURCE': {
      if (!state.graph) return state;
      const { source, personIds, edgeIds } = action;

      // Add source to graph
      state.graph.sources.set(source.id, source);

      // Attach to persons
      for (const pid of personIds) {
        const person = state.graph.persons.get(pid);
        if (person && !person.sourceIds.includes(source.id)) {
          person.sourceIds.push(source.id);
          person.updatedAt = new Date();
        }
      }

      // Attach to edges
      for (const eid of edgeIds) {
        const edge = state.graph.edges.get(eid);
        if (edge && !edge.sourceIds.includes(source.id)) {
          edge.sourceIds.push(source.id);
        }
      }

      // Update source's attachment lists
      source.attachedToPersonIds = [...personIds];
      source.attachedToEdgeIds = [...edgeIds];

      reScore(state.graph, state.flags);
      return { ...state };
    }

    case 'REMOVE_SOURCE': {
      if (!state.graph) return state;
      const source = state.graph.sources.get(action.sourceId);
      if (!source) return state;

      // Detach from persons
      for (const pid of source.attachedToPersonIds) {
        const person = state.graph.persons.get(pid);
        if (person) {
          person.sourceIds = person.sourceIds.filter(id => id !== action.sourceId);
          person.updatedAt = new Date();
        }
      }

      // Detach from edges
      for (const eid of source.attachedToEdgeIds) {
        const edge = state.graph.edges.get(eid);
        if (edge) {
          edge.sourceIds = edge.sourceIds.filter(id => id !== action.sourceId);
        }
      }

      state.graph.sources.delete(action.sourceId);
      reScore(state.graph, state.flags);
      return { ...state };
    }

    case 'UPDATE_FLAG_STATUS': {
      const flags = state.flags.map(f => {
        if (f.id !== action.flagId) return f;
        return {
          ...f,
          userStatus: action.userStatus,
          userNote: action.userNote ?? f.userNote,
          resolvedAt: action.userStatus === 'resolved' ? new Date() : f.resolvedAt,
        };
      });

      if (state.graph) {
        reScore(state.graph, flags);
      }
      return { ...state, flags };
    }

    case 'SET_PRIMARY_PATH': {
      if (!state.graph) return state;
      const targetEdge = state.graph.edges.get(action.edgeId);
      if (!targetEdge || !targetEdge.parallelGroupId) return state;

      // Find all edges in this parallel group
      const groupId = targetEdge.parallelGroupId;
      for (const edge of state.graph.edges.values()) {
        if (edge.parallelGroupId === groupId) {
          edge.isPrimary = edge.id === action.edgeId;
        }
      }

      reScore(state.graph, state.flags);
      return { ...state };
    }

    case 'ADD_CONJECTURE': {
      if (!state.graph) return state;
      const person = state.graph.persons.get(action.conjecture.personId);
      if (person && !person.conjectureIds.includes(action.conjecture.id)) {
        person.conjectureIds.push(action.conjecture.id);
        person.updatedAt = new Date();
      }
      const conjectures = new Map(state.conjectures);
      conjectures.set(action.conjecture.id, action.conjecture);
      return { ...state, conjectures };
    }

    case 'UPDATE_CONJECTURE': {
      const existing = state.conjectures.get(action.conjectureId);
      if (!existing) return state;
      const conjectures = new Map(state.conjectures);
      conjectures.set(action.conjectureId, {
        ...existing,
        ...action.updates,
        updatedAt: new Date(),
      });
      return { ...state, conjectures };
    }

    case 'SET_DEEP_SCAN':
      return { ...state, deepScanResult: action.result };

    case 'SET_STORY_PATHS':
      return { ...state, storyPathResult: action.result };

    case 'SET_RESEARCH_PRIORITIES':
      return { ...state, researchPriorities: action.priorities };

    case 'SET_AI_VALIDATION': {
      const aiValidations = new Map(state.aiValidations);
      aiValidations.set(action.validation.personId, action.validation);
      return { ...state, aiValidations };
    }

    case 'SET_AI_EDGE_VALIDATION': {
      const aiEdgeValidations = new Map(state.aiEdgeValidations);
      aiEdgeValidations.set(action.validation.edgeId, action.validation);
      return { ...state, aiEdgeValidations };
    }

    case 'SET_AI_NOTABLE_CONTEXT': {
      const aiNotableContexts = new Map(state.aiNotableContexts);
      aiNotableContexts.set(action.context.personId, action.context);
      return { ...state, aiNotableContexts };
    }

    case 'SET_BATCH_PROGRESS':
      return { ...state, aiBatchProgress: action.progress };

    case 'SET_AI_ENRICH': {
      const aiEnrichResults = new Map(state.aiEnrichResults);
      aiEnrichResults.set(action.result.personId, action.result);
      return { ...state, aiEnrichResults };
    }

    case 'SET_RESEARCH_STEPS':
      return { ...state, researchSteps: action.steps };

    case 'UPDATE_RESEARCH_STEP': {
      const researchSteps = state.researchSteps.map(s =>
        s.id === action.stepId
          ? { ...s, status: action.status, completedAt: action.status === 'complete' ? new Date() : s.completedAt }
          : s
      );
      return { ...state, researchSteps };
    }

    case 'ADD_PERSON': {
      if (!state.graph) return state;
      state.graph.addPerson(action.person);
      reScore(state.graph, state.flags);
      return { ...state };
    }

    case 'UPDATE_PERSON': {
      if (!state.graph) return state;
      state.graph.updatePerson(action.personId, action.updates);
      reScore(state.graph, state.flags);
      return { ...state };
    }

    case 'REMOVE_PERSON': {
      if (!state.graph) return state;
      state.graph.removePerson(action.personId);
      // Clear selection if the removed person was selected
      const selectedPersonId =
        state.selectedPersonId === action.personId ? null : state.selectedPersonId;
      // Remove flags referencing this person
      const flags = state.flags.filter(
        f => !f.affectedPersonIds.includes(action.personId)
      );
      reScore(state.graph, flags);
      return { ...state, selectedPersonId, flags };
    }

    case 'ADD_EDGE': {
      if (!state.graph) return state;
      state.graph.addEdge(action.edge);
      reScore(state.graph, state.flags);
      return { ...state };
    }

    case 'REMOVE_EDGE': {
      if (!state.graph) return state;
      state.graph.removeEdge(action.edgeId);
      // Remove flags referencing this edge
      const remainingFlags = state.flags.filter(
        f => !f.affectedEdgeIds.includes(action.edgeId)
      );
      reScore(state.graph, remainingFlags);
      return { ...state, flags: remainingFlags };
    }

    case 'MERGE_PERSONS': {
      if (!state.graph) return state;
      const { keepId, removeId } = action;
      const keepPerson = state.graph.persons.get(keepId);
      const removePerson = state.graph.persons.get(removeId);
      if (!keepPerson || !removePerson) return state;

      // Merge sources from remove → keep
      for (const sid of removePerson.sourceIds) {
        if (!keepPerson.sourceIds.includes(sid)) {
          keepPerson.sourceIds.push(sid);
        }
        // Update source attachment
        const source = state.graph.sources.get(sid);
        if (source) {
          source.attachedToPersonIds = source.attachedToPersonIds
            .filter(pid => pid !== removeId);
          if (!source.attachedToPersonIds.includes(keepId)) {
            source.attachedToPersonIds.push(keepId);
          }
        }
      }

      // Reassign edges from removeId → keepId
      for (const edge of state.graph.edges.values()) {
        if (edge.parentId === removeId) {
          edge.parentId = keepId;
        }
        if (edge.childId === removeId) {
          edge.childId = keepId;
        }
      }

      // Remove the merged person
      state.graph.persons.delete(removeId);
      state.graph.rebuildIndices();

      keepPerson.updatedAt = new Date();

      // Clear selection if the removed person was selected
      const newSelectedId =
        state.selectedPersonId === removeId ? keepId : state.selectedPersonId;
      // Remove flags about the removed person
      const mergedFlags = state.flags.filter(
        f => !f.affectedPersonIds.includes(removeId)
      );

      reScore(state.graph, mergedFlags);
      return { ...state, selectedPersonId: newSelectedId, flags: mergedFlags };
    }

    case 'EXPAND_TO_ANCESTOR':
      return { ...state, expandToAncestor: action.targetPersonId };

    case 'LOAD_TREE': {
      return {
        ...initialTreeState,
        phase: 'loaded',
        graph: action.graph,
        flags: action.flags,
        currentTreeId: action.currentTreeId,
        stats: {
          individualCount: action.graph.persons.size,
          familyCount: 0,
          sourceCount: action.graph.sources.size,
          edgeCount: action.graph.edges.size,
          generationCount: action.graph.getGenerationDepth(),
          parseTimeMs: 0,
          gedcomVersion: null,
          charset: null,
          software: null,
          warningCount: 0,
          errorCount: 0,
        },
      };
    }

    case 'INIT_EMPTY_TREE': {
      const graph = new TreeGraph();
      return {
        ...state,
        phase: 'loaded',
        graph,
        stats: {
          individualCount: 0,
          familyCount: 0,
          sourceCount: 0,
          edgeCount: 0,
          generationCount: 0,
          parseTimeMs: 0,
          gedcomVersion: null,
          charset: null,
          software: null,
          warningCount: 0,
          errorCount: 0,
        },
        flags: [],
        conjectures: new Map(),
        aiValidations: new Map(),
        aiEdgeValidations: new Map(),
        aiNotableContexts: new Map(),
        aiBatchProgress: null,
        aiEnrichResults: new Map(),
        researchSteps: [],
        error: null,
      };
    }
  }
}
