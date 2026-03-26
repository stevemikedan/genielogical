/**
 * Workspace state — manages multiple trees and their metadata.
 */

import type { TreeMetadata } from '@/types/tree.ts';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export interface WorkspaceState {
  trees: TreeMetadata[];
  currentTreeId: string | null;
  isLoading: boolean;
  saveStatus: SaveStatus;
}

export type WorkspaceAction =
  | { type: 'SET_TREES'; trees: TreeMetadata[] }
  | { type: 'SET_CURRENT_TREE'; treeId: string | null }
  | { type: 'ADD_TREE'; tree: TreeMetadata }
  | { type: 'UPDATE_TREE'; treeId: string; updates: Partial<TreeMetadata> }
  | { type: 'REMOVE_TREE'; treeId: string }
  | { type: 'SET_SAVE_STATUS'; status: SaveStatus }
  | { type: 'SET_LOADING'; isLoading: boolean };

export const initialWorkspaceState: WorkspaceState = {
  trees: [],
  currentTreeId: null,
  isLoading: false,
  saveStatus: 'saved',
};

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case 'SET_TREES':
      return { ...state, trees: action.trees };

    case 'SET_CURRENT_TREE':
      return { ...state, currentTreeId: action.treeId };

    case 'ADD_TREE':
      return { ...state, trees: [action.tree, ...state.trees] };

    case 'UPDATE_TREE':
      return {
        ...state,
        trees: state.trees.map(t =>
          t.id === action.treeId ? { ...t, ...action.updates } : t,
        ),
      };

    case 'REMOVE_TREE': {
      const nextCurrentId =
        state.currentTreeId === action.treeId ? null : state.currentTreeId;
      return {
        ...state,
        trees: state.trees.filter(t => t.id !== action.treeId),
        currentTreeId: nextCurrentId,
      };
    }

    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.status };

    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };
  }
}
