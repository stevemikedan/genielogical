import { describe, it, expect } from 'vitest';
import { treeReducer, initialTreeState } from './tree-state.ts';
import type { TreeState, TreeAction } from './tree-state.ts';
import type { ParseStats } from '@/types/index.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';

/**
 * Create a minimal mock TreeGraph for testing purposes.
 * The real TreeGraph is being built in parallel — we only need
 * a stand-in object to verify the reducer stores it correctly.
 */
function createMockGraph(): TreeGraph {
  return {
    persons: new Map(),
    edges: new Map(),
    sources: new Map(),
  } as unknown as TreeGraph;
}

function createMockStats(overrides: Partial<ParseStats> = {}): ParseStats {
  return {
    individualCount: 100,
    familyCount: 50,
    sourceCount: 10,
    edgeCount: 200,
    generationCount: 5,
    parseTimeMs: 42,
    gedcomVersion: '5.5.1',
    charset: 'UTF-8',
    software: 'TestApp',
    warningCount: 0,
    errorCount: 0,
    ...overrides,
  };
}

describe('treeReducer', () => {
  it('starts with the correct initial state', () => {
    expect(initialTreeState).toEqual({
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
    });
  });

  describe('PARSE_START', () => {
    it('sets phase to parsing and clears error', () => {
      const stateWithError: TreeState = {
        ...initialTreeState,
        phase: 'error',
        error: 'previous error',
      };

      const result = treeReducer(stateWithError, { type: 'PARSE_START' });

      expect(result.phase).toBe('parsing');
      expect(result.error).toBeNull();
    });

    it('preserves other state fields', () => {
      const stateWithSelection: TreeState = {
        ...initialTreeState,
        selectedPersonId: '@I1@',
        searchQuery: 'Daniel',
      };

      const result = treeReducer(stateWithSelection, { type: 'PARSE_START' });

      expect(result.selectedPersonId).toBe('@I1@');
      expect(result.searchQuery).toBe('Daniel');
    });
  });

  describe('PARSE_SUCCESS', () => {
    it('sets phase to loaded with graph and stats', () => {
      const graph = createMockGraph();
      const stats = createMockStats();
      const parsingState: TreeState = {
        ...initialTreeState,
        phase: 'parsing',
      };

      const action: TreeAction = { type: 'PARSE_SUCCESS', graph, stats };
      const result = treeReducer(parsingState, action);

      expect(result.phase).toBe('loaded');
      expect(result.graph).toBe(graph);
      expect(result.stats).toBe(stats);
      expect(result.error).toBeNull();
    });

    it('clears any previous error', () => {
      const graph = createMockGraph();
      const stats = createMockStats();
      const errorState: TreeState = {
        ...initialTreeState,
        phase: 'error',
        error: 'something went wrong',
      };

      const result = treeReducer(errorState, {
        type: 'PARSE_SUCCESS',
        graph,
        stats,
      });

      expect(result.error).toBeNull();
      expect(result.phase).toBe('loaded');
    });
  });

  describe('PARSE_ERROR', () => {
    it('sets phase to error and stores the message', () => {
      const parsingState: TreeState = {
        ...initialTreeState,
        phase: 'parsing',
      };

      const result = treeReducer(parsingState, {
        type: 'PARSE_ERROR',
        error: 'Invalid GEDCOM format',
      });

      expect(result.phase).toBe('error');
      expect(result.error).toBe('Invalid GEDCOM format');
    });

    it('clears graph and stats on error', () => {
      const loadedState: TreeState = {
        ...initialTreeState,
        phase: 'loaded',
        graph: createMockGraph(),
        stats: createMockStats(),
      };

      const result = treeReducer(loadedState, {
        type: 'PARSE_ERROR',
        error: 'Re-import failed',
      });

      expect(result.graph).toBeNull();
      expect(result.stats).toBeNull();
    });
  });

  describe('SELECT_PERSON', () => {
    it('sets the selectedPersonId', () => {
      const result = treeReducer(initialTreeState, {
        type: 'SELECT_PERSON',
        personId: '@I42@',
      });

      expect(result.selectedPersonId).toBe('@I42@');
    });

    it('can clear selection with null', () => {
      const withSelection: TreeState = {
        ...initialTreeState,
        selectedPersonId: '@I42@',
      };

      const result = treeReducer(withSelection, {
        type: 'SELECT_PERSON',
        personId: null,
      });

      expect(result.selectedPersonId).toBeNull();
    });

    it('does not affect other state fields', () => {
      const loadedState: TreeState = {
        ...initialTreeState,
        phase: 'loaded',
        graph: createMockGraph(),
        stats: createMockStats(),
        searchQuery: 'Smith',
      };

      const result = treeReducer(loadedState, {
        type: 'SELECT_PERSON',
        personId: '@I99@',
      });

      expect(result.phase).toBe('loaded');
      expect(result.graph).toBe(loadedState.graph);
      expect(result.stats).toBe(loadedState.stats);
      expect(result.searchQuery).toBe('Smith');
    });
  });

  describe('SET_SEARCH', () => {
    it('sets the search query', () => {
      const result = treeReducer(initialTreeState, {
        type: 'SET_SEARCH',
        query: 'Daniel',
      });

      expect(result.searchQuery).toBe('Daniel');
    });

    it('can set search to empty string', () => {
      const withSearch: TreeState = {
        ...initialTreeState,
        searchQuery: 'Daniel',
      };

      const result = treeReducer(withSearch, {
        type: 'SET_SEARCH',
        query: '',
      });

      expect(result.searchQuery).toBe('');
    });

    it('does not affect other state fields', () => {
      const loadedState: TreeState = {
        ...initialTreeState,
        phase: 'loaded',
        selectedPersonId: '@I1@',
      };

      const result = treeReducer(loadedState, {
        type: 'SET_SEARCH',
        query: 'Stewart',
      });

      expect(result.phase).toBe('loaded');
      expect(result.selectedPersonId).toBe('@I1@');
    });
  });

  describe('RESET', () => {
    it('returns to initial state from loaded state', () => {
      const loadedState: TreeState = {
        phase: 'loaded',
        graph: createMockGraph(),
        stats: createMockStats(),
        currentTreeId: null,
        flags: [],
        conjectures: new Map(),
        selectedPersonId: '@I42@',
        searchQuery: 'Daniel',
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

      const result = treeReducer(loadedState, { type: 'RESET' });

      expect(result).toEqual(initialTreeState);
    });

    it('returns to initial state from error state', () => {
      const errorState: TreeState = {
        phase: 'error',
        graph: null,
        stats: null,
        currentTreeId: null,
        flags: [],
        conjectures: new Map(),
        selectedPersonId: null,
        searchQuery: '',
        error: 'Something broke',
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

      const result = treeReducer(errorState, { type: 'RESET' });

      expect(result).toEqual(initialTreeState);
    });
  });

  describe('EXPAND_TO_ANCESTOR', () => {
    it('sets expandToAncestor target', () => {
      const result = treeReducer(initialTreeState, {
        type: 'EXPAND_TO_ANCESTOR',
        targetPersonId: '@I42@',
      });
      expect(result.expandToAncestor).toBe('@I42@');
    });

    it('clears expandToAncestor with null', () => {
      const withTarget: TreeState = {
        ...initialTreeState,
        expandToAncestor: '@I42@',
      };
      const result = treeReducer(withTarget, {
        type: 'EXPAND_TO_ANCESTOR',
        targetPersonId: null,
      });
      expect(result.expandToAncestor).toBeNull();
    });
  });

  describe('reducer purity', () => {
    it('does not mutate the original state', () => {
      const original: TreeState = { ...initialTreeState };
      const frozen = Object.freeze({ ...original });

      // These should all return new objects, not mutate frozen
      treeReducer(frozen as TreeState, { type: 'PARSE_START' });
      treeReducer(frozen as TreeState, { type: 'SELECT_PERSON', personId: '@I1@' });
      treeReducer(frozen as TreeState, { type: 'SET_SEARCH', query: 'test' });
      treeReducer(frozen as TreeState, { type: 'RESET' });

      // If we got here without throwing, the reducer didn't mutate
      expect(frozen).toEqual(original);
    });
  });
});
