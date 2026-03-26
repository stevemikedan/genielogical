/**
 * MergeTreesModal — preview linked pairs, resolve conflicts, merge using MERGE_PERSONS.
 *
 * Merges source tree data into the current (target) tree:
 * 1. Copies all persons from source tree that don't have cross-tree links
 * 2. For linked pairs: merges the source person into the target person
 * 3. Copies all edges, remapping person IDs as needed
 */

import { useState, useEffect, useCallback } from 'react';
import type { TreeMetadata } from '@/types/tree.ts';
import type { CrossTreeLink } from '@/types/cross-tree-link.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import { loadTreeGraph, getCrossTreeLinksForTree, deleteTree } from '@/storage/tree-repository.ts';
import { useTree } from '@/hooks/use-tree.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';

interface MergeTreesModalProps {
  targetTreeId: string;
  sourceTree: TreeMetadata;
  onClose: () => void;
  onMerged: () => void;
}

interface LinkedPair {
  link: CrossTreeLink;
  targetPerson: Person | null;
  sourcePerson: Person | null;
}

export function MergeTreesModal({
  targetTreeId,
  sourceTree,
  onClose,
  onMerged,
}: MergeTreesModalProps) {
  const { state, dispatch } = useTree();
  const [sourceGraph, setSourceGraph] = useState<TreeGraph | null>(null);
  const [pairs, setPairs] = useState<LinkedPair[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMerging, setIsMerging] = useState(false);
  const [deleteSourceAfter, setDeleteSourceAfter] = useState(false);
  const [mergeLog, setMergeLog] = useState<string[]>([]);

  // Load source tree and cross-tree links
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [sourceData, allLinks] = await Promise.all([
          loadTreeGraph(sourceTree.id),
          getCrossTreeLinksForTree(sourceTree.id),
        ]);

        if (cancelled) return;

        setSourceGraph(sourceData.graph);

        // Filter to links between target and source
        const relevantLinks = allLinks.filter(l =>
          (l.treeIdA === targetTreeId && l.treeIdB === sourceTree.id) ||
          (l.treeIdB === targetTreeId && l.treeIdA === sourceTree.id)
        );
        // Build linked pairs
        const resolvedPairs: LinkedPair[] = relevantLinks.map(link => {
          const targetId = link.treeIdA === targetTreeId ? link.personIdA : link.personIdB;
          const sourceId = link.treeIdA === targetTreeId ? link.personIdB : link.personIdA;
          return {
            link,
            targetPerson: state.graph?.persons.get(targetId) ?? null,
            sourcePerson: sourceData.graph.persons.get(sourceId) ?? null,
          };
        });
        setPairs(resolvedPairs);
      } catch {
        // loading failed
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sourceTree.id, targetTreeId, state.graph]);

  const handleMerge = useCallback(async () => {
    if (!sourceGraph || !state.graph) return;
    setIsMerging(true);
    const log: string[] = [];

    // Build remap: source person ID → target person ID (for linked pairs)
    const idRemap = new Map<string, string>();
    for (const pair of pairs) {
      if (pair.targetPerson && pair.sourcePerson) {
        idRemap.set(pair.sourcePerson.id, pair.targetPerson.id);
      }
    }

    // 1. Copy unlinked persons from source to target
    for (const person of sourceGraph.persons.values()) {
      if (!idRemap.has(person.id)) {
        // Check if person ID already exists in target (unlikely with UUID prefix)
        if (!state.graph.persons.has(person.id)) {
          dispatch({ type: 'ADD_PERSON', person: { ...person } });
          log.push(`Added ${person.name.full}`);
        }
      }
    }

    // 2. Merge linked pairs
    for (const pair of pairs) {
      if (pair.targetPerson && pair.sourcePerson) {
        dispatch({
          type: 'MERGE_PERSONS',
          keepId: pair.targetPerson.id,
          removeId: pair.sourcePerson.id,
        });
        log.push(`Merged ${pair.sourcePerson.name.full} into ${pair.targetPerson.name.full}`);
      }
    }

    // 3. Copy edges from source (remap IDs)
    for (const edge of sourceGraph.edges.values()) {
      const remappedParentId = idRemap.get(edge.parentId) ?? edge.parentId;
      const remappedChildId = idRemap.get(edge.childId) ?? edge.childId;

      // Skip if both parties already have an edge connecting them
      const existingEdges = state.graph.parentEdges.get(remappedChildId) ?? [];
      const alreadyConnected = existingEdges.some(e => e.parentId === remappedParentId);
      if (alreadyConnected) continue;

      // Only add if both persons exist in target graph
      if (state.graph.persons.has(remappedParentId) && state.graph.persons.has(remappedChildId)) {
        const newEdge: Edge = {
          ...edge,
          parentId: remappedParentId,
          childId: remappedChildId,
        };
        dispatch({ type: 'ADD_EDGE', edge: newEdge });
        log.push(`Added edge: ${remappedParentId} → ${remappedChildId}`);
      }
    }

    // 4. Copy sources from source tree
    for (const source of sourceGraph.sources.values()) {
      if (!state.graph.sources.has(source.id)) {
        // Remap person attachments
        const remappedPersonIds = source.attachedToPersonIds.map(
          id => idRemap.get(id) ?? id,
        );
        const remappedEdgeIds = source.attachedToEdgeIds; // edge IDs are copied as-is
        dispatch({
          type: 'ADD_SOURCE',
          source: { ...source, attachedToPersonIds: remappedPersonIds, attachedToEdgeIds: remappedEdgeIds },
          personIds: remappedPersonIds,
          edgeIds: remappedEdgeIds,
        });
      }
    }

    // 5. Optionally delete the source tree
    if (deleteSourceAfter) {
      await deleteTree(sourceTree.id);
      log.push(`Deleted source tree: ${sourceTree.name}`);
    }

    setMergeLog(log);
    setIsMerging(false);
    onMerged();
  }, [sourceGraph, state.graph, pairs, dispatch, deleteSourceAfter, sourceTree, onMerged]);

  const confidenceColor = {
    confirmed: 'text-tier1',
    probable: 'text-tier2',
    possible: 'text-tier3',
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[61]
                      bg-surface border border-border rounded-lg shadow-2xl w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <h3 className="font-[family-name:var(--font-heading)] text-lg text-text-primary">
            Merge Trees
          </h3>
          <p className="text-sm text-text-dim mt-0.5">
            Merging "{sourceTree.name}" into the current tree
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading && (
            <div className="text-center py-8 text-text-dim">Loading source tree...</div>
          )}

          {!isLoading && mergeLog.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-tier1">Merge complete!</h4>
              {mergeLog.map((entry, i) => (
                <div key={i} className="text-xs text-text-dim font-[family-name:var(--font-mono)]">
                  {entry}
                </div>
              ))}
            </div>
          )}

          {!isLoading && mergeLog.length === 0 && (
            <>
              {/* Linked pairs summary */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-text-primary mb-2">
                  Linked Pairs ({pairs.length})
                </h4>
                {pairs.length === 0 && (
                  <p className="text-sm text-text-dim">
                    No linked pairs. All persons from the source tree will be copied as new entries.
                  </p>
                )}
                {pairs.map(pair => (
                  <div key={pair.link.id}
                    className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                  >
                    <div className="flex-1 text-sm">
                      <span className="text-text-primary">{pair.targetPerson?.name.full ?? '?'}</span>
                    </div>
                    <span className={`text-xs ${confidenceColor[pair.link.confidence]}`}>
                      {pair.link.confidence}
                    </span>
                    <div className="flex-1 text-sm text-right">
                      <span className="text-text-secondary">{pair.sourcePerson?.name.full ?? '?'}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Stats preview */}
              {sourceGraph && (
                <div className="mb-4 p-3 bg-bg rounded border border-border">
                  <h4 className="text-sm font-medium text-text-primary mb-1">Merge preview</h4>
                  <div className="text-xs text-text-dim space-y-0.5">
                    <div>Persons to copy: {sourceGraph.persons.size - pairs.filter(p => p.sourcePerson).length}</div>
                    <div>Persons to merge: {pairs.filter(p => p.targetPerson && p.sourcePerson).length}</div>
                    <div>Edges to copy: {sourceGraph.edges.size}</div>
                    <div>Sources to copy: {sourceGraph.sources.size}</div>
                  </div>
                </div>
              )}

              {/* Delete source option */}
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={deleteSourceAfter}
                  onChange={e => setDeleteSourceAfter(e.target.checked)}
                  className="accent-gold"
                />
                Delete source tree after merge
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary
                       hover:text-text-primary transition-colors"
          >
            {mergeLog.length > 0 ? 'Close' : 'Cancel'}
          </button>
          {mergeLog.length === 0 && (
            <button
              type="button"
              onClick={handleMerge}
              disabled={isMerging || isLoading}
              className="px-4 py-1.5 text-sm rounded bg-gold text-bg font-medium
                         hover:bg-gold-light transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isMerging ? 'Merging...' : 'Merge'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
