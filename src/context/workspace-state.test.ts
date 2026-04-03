import { describe, it, expect } from 'vitest';
import { workspaceReducer, initialWorkspaceState } from './workspace-state.ts';
import type { TreeMetadata } from '@/types/tree.ts';

function makeTreeMeta(id: string, name: string = 'Test Tree'): TreeMetadata {
  return {
    id,
    name,
    description: '',
    gedcomFileName: null,
    personCount: 0,
    edgeCount: 0,
    generationCount: 0,
    createdAt: new Date('2024-01-01'),
    lastModifiedAt: new Date('2024-01-01'),
    lastOpenedAt: new Date('2024-01-01'),
  };
}

describe('workspaceReducer', () => {
  it('starts with correct initial state', () => {
    expect(initialWorkspaceState).toEqual({
      trees: [],
      currentTreeId: null,
      isLoading: false,
      saveStatus: 'saved',
    });
  });

  describe('SET_TREES', () => {
    it('replaces trees array', () => {
      const trees = [makeTreeMeta('t1'), makeTreeMeta('t2')];
      const result = workspaceReducer(initialWorkspaceState, { type: 'SET_TREES', trees });
      expect(result.trees).toHaveLength(2);
      expect(result.trees[0].id).toBe('t1');
    });

    it('can set empty array', () => {
      const state = { ...initialWorkspaceState, trees: [makeTreeMeta('t1')] };
      const result = workspaceReducer(state, { type: 'SET_TREES', trees: [] });
      expect(result.trees).toHaveLength(0);
    });
  });

  describe('SET_CURRENT_TREE', () => {
    it('sets currentTreeId', () => {
      const result = workspaceReducer(initialWorkspaceState, { type: 'SET_CURRENT_TREE', treeId: 't1' });
      expect(result.currentTreeId).toBe('t1');
    });

    it('clears currentTreeId with null', () => {
      const state = { ...initialWorkspaceState, currentTreeId: 't1' };
      const result = workspaceReducer(state, { type: 'SET_CURRENT_TREE', treeId: null });
      expect(result.currentTreeId).toBeNull();
    });
  });

  describe('ADD_TREE', () => {
    it('prepends tree to list', () => {
      const state = { ...initialWorkspaceState, trees: [makeTreeMeta('t1', 'First')] };
      const result = workspaceReducer(state, { type: 'ADD_TREE', tree: makeTreeMeta('t2', 'Second') });
      expect(result.trees).toHaveLength(2);
      expect(result.trees[0].id).toBe('t2');
      expect(result.trees[1].id).toBe('t1');
    });

    it('adds to empty list', () => {
      const result = workspaceReducer(initialWorkspaceState, { type: 'ADD_TREE', tree: makeTreeMeta('t1') });
      expect(result.trees).toHaveLength(1);
    });
  });

  describe('UPDATE_TREE', () => {
    it('updates matching tree metadata', () => {
      const state = { ...initialWorkspaceState, trees: [makeTreeMeta('t1', 'Old Name')] };
      const result = workspaceReducer(state, { type: 'UPDATE_TREE', treeId: 't1', updates: { name: 'New Name' } });
      expect(result.trees[0].name).toBe('New Name');
      expect(result.trees[0].id).toBe('t1');
    });

    it('does not affect other trees', () => {
      const state = {
        ...initialWorkspaceState,
        trees: [makeTreeMeta('t1', 'Tree A'), makeTreeMeta('t2', 'Tree B')],
      };
      const result = workspaceReducer(state, { type: 'UPDATE_TREE', treeId: 't1', updates: { name: 'Updated A' } });
      expect(result.trees[0].name).toBe('Updated A');
      expect(result.trees[1].name).toBe('Tree B');
    });
  });

  describe('REMOVE_TREE', () => {
    it('removes tree by id', () => {
      const state = {
        ...initialWorkspaceState,
        trees: [makeTreeMeta('t1'), makeTreeMeta('t2')],
      };
      const result = workspaceReducer(state, { type: 'REMOVE_TREE', treeId: 't1' });
      expect(result.trees).toHaveLength(1);
      expect(result.trees[0].id).toBe('t2');
    });

    it('clears currentTreeId if removed tree was current', () => {
      const state = {
        ...initialWorkspaceState,
        trees: [makeTreeMeta('t1')],
        currentTreeId: 't1',
      };
      const result = workspaceReducer(state, { type: 'REMOVE_TREE', treeId: 't1' });
      expect(result.currentTreeId).toBeNull();
    });

    it('preserves currentTreeId if different tree removed', () => {
      const state = {
        ...initialWorkspaceState,
        trees: [makeTreeMeta('t1'), makeTreeMeta('t2')],
        currentTreeId: 't2',
      };
      const result = workspaceReducer(state, { type: 'REMOVE_TREE', treeId: 't1' });
      expect(result.currentTreeId).toBe('t2');
    });
  });

  describe('SET_SAVE_STATUS', () => {
    it('updates save status', () => {
      const result = workspaceReducer(initialWorkspaceState, { type: 'SET_SAVE_STATUS', status: 'saving' });
      expect(result.saveStatus).toBe('saving');
    });
  });

  describe('SET_LOADING', () => {
    it('sets loading state', () => {
      const result = workspaceReducer(initialWorkspaceState, { type: 'SET_LOADING', isLoading: true });
      expect(result.isLoading).toBe(true);
    });

    it('clears loading state', () => {
      const state = { ...initialWorkspaceState, isLoading: true };
      const result = workspaceReducer(state, { type: 'SET_LOADING', isLoading: false });
      expect(result.isLoading).toBe(false);
    });
  });
});
