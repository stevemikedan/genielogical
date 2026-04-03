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
import type { AINotableContext, AIEnrichResult, BatchProgress, QuickCheckResult, ValidationReport, DeepResearchRound } from '@/types/ai.ts';
import type { AncestryConflict, ConvergencePoint, MergeDecision } from '@/types/conflict.ts';
import type { ReportResult, DataQualityReport, ReportProgress } from '@/types/report.ts';
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
  aiNotableContexts: Map<string, AINotableContext>;
  aiBatchProgress: BatchProgress | null;
  aiEnrichResults: Map<string, AIEnrichResult>;
  aiQuickChecks: Map<string, QuickCheckResult>;
  aiValidationReports: Map<string, ValidationReport>;
  aiDeepResearchSessions: Map<string, DeepResearchRound[]>;
  ancestryConflicts: AncestryConflict[];
  convergencePoints: ConvergencePoint[];
  researchSteps: ResearchStep[];
  activeReport: ReportResult | DataQualityReport | null;
  reportProgress: ReportProgress | null;
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
  | { type: 'SET_AI_QUICK_CHECK'; personId: string; result: QuickCheckResult }
  | { type: 'SET_AI_VALIDATION_REPORT'; personId: string; report: ValidationReport }
  | { type: 'APPEND_DEEP_RESEARCH_ROUND'; personId: string; round: DeepResearchRound }
  | { type: 'CLEAR_DEEP_RESEARCH'; personId: string }
  | { type: 'SET_ANCESTRY_CONFLICTS'; conflicts: AncestryConflict[] }
  | { type: 'RESOLVE_ANCESTRY_CONFLICT'; decision: MergeDecision }
  | { type: 'SET_CONVERGENCE_POINTS'; points: ConvergencePoint[] }
  | { type: 'EXPAND_TO_ANCESTOR'; targetPersonId: string | null }
  | { type: 'LOAD_TREE'; graph: TreeGraph; flags: Flag[]; currentTreeId: string }
  | { type: 'SET_REPORT'; report: ReportResult | DataQualityReport }
  | { type: 'SET_REPORT_PROGRESS'; progress: ReportProgress | null }
  | { type: 'CLEAR_REPORT' };

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
  aiNotableContexts: new Map(),
  aiBatchProgress: null,
  aiEnrichResults: new Map(),
  aiQuickChecks: new Map(),
  aiValidationReports: new Map(),
  aiDeepResearchSessions: new Map(),
  ancestryConflicts: [],
  convergencePoints: [],
  researchSteps: [],
  activeReport: null,
  reportProgress: null,
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
        aiNotableContexts: new Map(),
        aiBatchProgress: null,
        aiEnrichResults: new Map(),
        aiQuickChecks: new Map(),
        aiValidationReports: new Map(),
        aiDeepResearchSessions: new Map(),
        ancestryConflicts: [],
        convergencePoints: [],
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

      // Merge person data fields from removed into kept
      if (removePerson.name.full !== keepPerson.name.full) {
        keepPerson.alternateNames.push({
          name: { ...removePerson.name },
          type: 'aka',
          notes: 'Added during merge',
        });
      }
      for (const altName of removePerson.alternateNames) {
        if (!keepPerson.alternateNames.some(a => a.name.full === altName.name.full)) {
          keepPerson.alternateNames.push(altName);
        }
      }
      for (const evt of removePerson.events) {
        if (!keepPerson.events.some(e => e.type === evt.type && e.date?.raw === evt.date?.raw)) {
          keepPerson.events.push(evt);
        }
      }
      if (removePerson.notes && !keepPerson.notes.includes(removePerson.notes)) {
        keepPerson.notes = keepPerson.notes
          ? `${keepPerson.notes}\n${removePerson.notes}`
          : removePerson.notes;
      }
      for (const tag of removePerson.customTags) {
        if (!keepPerson.customTags.some(t => t.key === tag.key)) {
          keepPerson.customTags.push(tag);
        }
      }
      for (const rid of removePerson.researchStepIds) {
        if (!keepPerson.researchStepIds.includes(rid)) {
          keepPerson.researchStepIds.push(rid);
        }
      }
      for (const cid of removePerson.conjectureIds) {
        if (!keepPerson.conjectureIds.includes(cid)) {
          keepPerson.conjectureIds.push(cid);
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

      // Remove self-loop edges (person became their own parent/child)
      const selfLoopIds: string[] = [];
      for (const [edgeId, edge] of state.graph.edges) {
        if (edge.parentId === edge.childId) {
          selfLoopIds.push(edgeId);
        }
      }
      for (const id of selfLoopIds) {
        state.graph.edges.delete(id);
      }

      // Deduplicate edges with same parentId+childId pair
      const edgesByPair = new Map<string, string[]>();
      for (const [edgeId, edge] of state.graph.edges) {
        const key = `${edge.parentId}→${edge.childId}`;
        const existing = edgesByPair.get(key);
        if (existing) {
          existing.push(edgeId);
        } else {
          edgesByPair.set(key, [edgeId]);
        }
      }
      for (const edgeIds of edgesByPair.values()) {
        if (edgeIds.length <= 1) continue;
        // Keep the edge with the most sources
        const sorted = edgeIds
          .map(id => ({ id, edge: state.graph!.edges.get(id)! }))
          .sort((a, b) => b.edge.sourceIds.length - a.edge.sourceIds.length);
        const keeper = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
          // Merge sourceIds into keeper
          for (const sid of sorted[i].edge.sourceIds) {
            if (!keeper.edge.sourceIds.includes(sid)) {
              keeper.edge.sourceIds.push(sid);
            }
          }
          state.graph!.edges.delete(sorted[i].id);
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

    case 'SET_AI_QUICK_CHECK': {
      const aiQuickChecks = new Map(state.aiQuickChecks);
      aiQuickChecks.set(action.personId, action.result);
      return { ...state, aiQuickChecks };
    }

    case 'SET_AI_VALIDATION_REPORT': {
      const aiValidationReports = new Map(state.aiValidationReports);
      aiValidationReports.set(action.personId, action.report);
      return { ...state, aiValidationReports };
    }

    case 'APPEND_DEEP_RESEARCH_ROUND': {
      const aiDeepResearchSessions = new Map(state.aiDeepResearchSessions);
      const existing = aiDeepResearchSessions.get(action.personId) ?? [];
      aiDeepResearchSessions.set(action.personId, [...existing, action.round]);
      return { ...state, aiDeepResearchSessions };
    }

    case 'CLEAR_DEEP_RESEARCH': {
      const aiDeepResearchSessions = new Map(state.aiDeepResearchSessions);
      aiDeepResearchSessions.delete(action.personId);
      return { ...state, aiDeepResearchSessions };
    }

    case 'SET_ANCESTRY_CONFLICTS':
      return { ...state, ancestryConflicts: action.conflicts };

    case 'RESOLVE_ANCESTRY_CONFLICT': {
      if (!state.graph) return state;
      const { decision } = action;
      const winner = state.graph.persons.get(decision.winnerPersonId);
      const loser = state.graph.persons.get(decision.loserPersonId);
      if (!winner || !loser) return state;

      if (decision.action === 'merge_keep_winner') {
        // Use existing MERGE_PERSONS logic via recursive dispatch
        // But since we're in the reducer, apply it inline:
        // The MERGE_PERSONS case handles sources, edges, self-loops, dedup, and field merge.
        // We delegate to it by constructing the same action.
        const mergedState = treeReducer(state, {
          type: 'MERGE_PERSONS',
          keepId: decision.winnerPersonId,
          removeId: decision.loserPersonId,
        });
        // Remove the resolved conflict from the list
        const remainingConflicts = mergedState.ancestryConflicts.filter(
          c => c.personIdA !== decision.loserPersonId && c.personIdB !== decision.loserPersonId,
        );
        return { ...mergedState, ancestryConflicts: remainingConflicts };
      }

      if (decision.action === 'convert_to_parallel') {
        // Keep both persons but mark the loser's parent edges as non-primary parallel paths
        const loserParentEdges = state.graph.parentEdges.get(decision.loserPersonId) ?? [];
        const groupId = `conflict-${decision.winnerPersonId}-${decision.loserPersonId}`;
        for (const edge of loserParentEdges) {
          edge.isPrimary = false;
          edge.parallelGroupId = groupId;
          edge.pathLabel = 'Disputed ancestry';
        }
        // Also mark winner's parent edges as primary in the group
        const winnerParentEdges = state.graph.parentEdges.get(decision.winnerPersonId) ?? [];
        for (const edge of winnerParentEdges) {
          if (!edge.parallelGroupId) {
            edge.parallelGroupId = groupId;
          }
        }
        // Remove the resolved conflict
        const remainingConflicts = state.ancestryConflicts.filter(
          c => !(
            (c.personIdA === decision.winnerPersonId && c.personIdB === decision.loserPersonId) ||
            (c.personIdA === decision.loserPersonId && c.personIdB === decision.winnerPersonId)
          ),
        );
        reScore(state.graph, state.flags);
        return { ...state, ancestryConflicts: remainingConflicts };
      }

      return state;
    }

    case 'SET_CONVERGENCE_POINTS':
      return { ...state, convergencePoints: action.points };

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
        aiNotableContexts: new Map(),
        aiBatchProgress: null,
        aiEnrichResults: new Map(),
        aiQuickChecks: new Map(),
        aiValidationReports: new Map(),
        aiDeepResearchSessions: new Map(),
        ancestryConflicts: [],
        convergencePoints: [],
        researchSteps: [],
        activeReport: null,
        reportProgress: null,
        error: null,
      };
    }

    case 'SET_REPORT':
      return { ...state, activeReport: action.report };

    case 'SET_REPORT_PROGRESS':
      return { ...state, reportProgress: action.progress };

    case 'CLEAR_REPORT':
      return { ...state, activeReport: null, reportProgress: null };
  }
}
