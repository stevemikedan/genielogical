/**
 * useWorkspace — workspace management hook.
 *
 * Handles tree switching, creation, import, and deletion.
 * Saves current tree before loading a new one.
 */

import { useContext, useCallback } from 'react';
import { WorkspaceContext } from '@/context/workspace-context.tsx';
import type { WorkspaceContextValue } from '@/context/workspace-context.tsx';
import { useTree } from './use-tree.ts';
import {
  createTree,
  loadTreeGraph,
  saveTreeGraph,
  deleteTree as deleteTreeFromDb,
} from '@/storage/tree-repository.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import { parseGedcom } from '@/parser/index.ts';
import { runFlagEngine, scoreAllConfidence, runDeepScan, findNotableAncestors, computeResearchPriorities } from '@/engine/index.ts';
import { generateResearchSteps } from '@/engine/research-recommender.ts';

function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

export function useWorkspace() {
  const { state: workspaceState, dispatch: workspaceDispatch } = useWorkspaceContext();
  const { state: treeState, dispatch: treeDispatch } = useTree();

  /**
   * Save the current tree to IndexedDB (if one is loaded).
   */
  const saveCurrentTree = useCallback(async () => {
    const treeId = treeState.currentTreeId;
    if (!treeId || !treeState.graph) return;
    workspaceDispatch({ type: 'SET_SAVE_STATUS', status: 'saving' });
    try {
      await saveTreeGraph(treeId, treeState.graph, treeState.flags);
      workspaceDispatch({ type: 'SET_SAVE_STATUS', status: 'saved' });
      workspaceDispatch({
        type: 'UPDATE_TREE',
        treeId,
        updates: {
          personCount: treeState.graph.persons.size,
          edgeCount: treeState.graph.edges.size,
          lastModifiedAt: new Date(),
        },
      });
    } catch {
      workspaceDispatch({ type: 'SET_SAVE_STATUS', status: 'error' });
    }
  }, [treeState.currentTreeId, treeState.graph, treeState.flags, workspaceDispatch]);

  /**
   * Switch to a different tree. Saves current tree first.
   */
  const switchTree = useCallback(async (treeId: string) => {
    workspaceDispatch({ type: 'SET_LOADING', isLoading: true });

    // Save current tree
    await saveCurrentTree();

    try {
      const { graph, flags } = await loadTreeGraph(treeId);
      treeDispatch({ type: 'LOAD_TREE', graph, flags, currentTreeId: treeId });
      workspaceDispatch({ type: 'SET_CURRENT_TREE', treeId });
      workspaceDispatch({ type: 'SET_SAVE_STATUS', status: 'saved' });
    } catch {
      // Failed to load — stay on current tree
    } finally {
      workspaceDispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, [saveCurrentTree, treeDispatch, workspaceDispatch]);

  /**
   * Create a new empty tree and switch to it.
   */
  const createNewTree = useCallback(async (name: string) => {
    workspaceDispatch({ type: 'SET_LOADING', isLoading: true });

    // Save current tree first
    await saveCurrentTree();

    try {
      const tree = await createTree(name);
      workspaceDispatch({ type: 'ADD_TREE', tree });

      // Initialize empty graph in state
      const graph = new TreeGraph();
      treeDispatch({ type: 'LOAD_TREE', graph, flags: [], currentTreeId: tree.id });
      workspaceDispatch({ type: 'SET_CURRENT_TREE', treeId: tree.id });
      workspaceDispatch({ type: 'SET_SAVE_STATUS', status: 'saved' });

      return tree;
    } finally {
      workspaceDispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, [saveCurrentTree, treeDispatch, workspaceDispatch]);

  /**
   * Import a GEDCOM file into a new tree.
   */
  const importIntoNewTree = useCallback(async (file: File, name: string) => {
    workspaceDispatch({ type: 'SET_LOADING', isLoading: true });

    // Save current tree first
    await saveCurrentTree();

    try {
      treeDispatch({ type: 'PARSE_START' });

      const text = await file.text();
      const result = parseGedcom(text);

      const graph = new TreeGraph();
      graph.loadFromParseResult(result);

      // Run engines
      const flags = runFlagEngine(graph);
      scoreAllConfidence(graph, flags);

      const tree = await createTree(name, { gedcomFileName: file.name });
      await saveTreeGraph(tree.id, graph, flags);

      // Update tree metadata with counts
      tree.personCount = graph.persons.size;
      tree.edgeCount = graph.edges.size;
      tree.generationCount = graph.getGenerationDepth();
      workspaceDispatch({ type: 'ADD_TREE', tree });

      // Load into state
      treeDispatch({ type: 'LOAD_TREE', graph, flags, currentTreeId: tree.id });
      treeDispatch({ type: 'PARSE_SUCCESS', graph, stats: result.stats });
      treeDispatch({ type: 'SET_FLAGS', flags });
      workspaceDispatch({ type: 'SET_CURRENT_TREE', treeId: tree.id });
      workspaceDispatch({ type: 'SET_SAVE_STATUS', status: 'saved' });

      // Run Phase E engines
      const leaves = graph.getLeaves();
      if (leaves.length > 0) {
        const subjectId = leaves[0].id;
        const storyResult = findNotableAncestors(graph, subjectId);
        treeDispatch({ type: 'SET_STORY_PATHS', result: storyResult });
        const deepScanResult = runDeepScan(graph, subjectId);
        treeDispatch({ type: 'SET_DEEP_SCAN', result: deepScanResult });
        const priorities = computeResearchPriorities(graph, storyResult.notableAncestors);
        treeDispatch({ type: 'SET_RESEARCH_PRIORITIES', priorities });
      }

      const researchSteps = generateResearchSteps(graph, flags);
      treeDispatch({ type: 'SET_RESEARCH_STEPS', steps: researchSteps });

      return tree;
    } catch (err) {
      treeDispatch({
        type: 'PARSE_ERROR',
        error: err instanceof Error ? err.message : 'Unknown error during import',
      });
      return null;
    } finally {
      workspaceDispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, [saveCurrentTree, treeDispatch, workspaceDispatch]);

  /**
   * Delete a tree from IndexedDB. Cannot delete the currently open tree.
   */
  const removeTree = useCallback(async (treeId: string) => {
    await deleteTreeFromDb(treeId);
    workspaceDispatch({ type: 'REMOVE_TREE', treeId });

    // If we deleted the current tree, reset
    if (treeState.currentTreeId === treeId) {
      treeDispatch({ type: 'RESET' });
      workspaceDispatch({ type: 'SET_CURRENT_TREE', treeId: null });
    }
  }, [treeState.currentTreeId, treeDispatch, workspaceDispatch]);

  return {
    workspaceState,
    switchTree,
    createNewTree,
    importIntoNewTree,
    removeTree,
    saveCurrentTree,
  };
}
