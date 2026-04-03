import { useState, useMemo, useCallback } from 'react';
import { useTree } from '@/hooks/index.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { formatDisplayName } from '@/utils/name-display.ts';

interface MergePersonsModalProps {
  personIdA: string;
  personIdB: string;
  onClose: () => void;
}

/** Compute a simple connection score: sources + parent edges + child edges */
function connectionScore(person: Person, graph: TreeGraph): number {
  const parentEdges = graph.parentEdges.get(person.id)?.length ?? 0;
  const childEdges = graph.childEdges.get(person.id)?.length ?? 0;
  return person.sourceIds.length + parentEdges + childEdges;
}

function formatDate(person: Person, type: 'birth' | 'death'): string {
  const d = person[type].date;
  return d?.raw ?? '—';
}

export function MergePersonsModal({ personIdA, personIdB, onClose }: MergePersonsModalProps) {
  const { state, dispatch } = useTree();
  const graph = state.graph;

  const personA = graph?.persons.get(personIdA);
  const personB = graph?.persons.get(personIdB);

  // Default: keep the one with more connections
  const defaultKeep = useMemo(() => {
    if (!personA || !personB || !graph) return personIdA;
    return connectionScore(personA, graph) >= connectionScore(personB, graph)
      ? personIdA
      : personIdB;
  }, [personA, personB, graph, personIdA, personIdB]);

  const [keepId, setKeepId] = useState(defaultKeep);
  const removeId = keepId === personIdA ? personIdB : personIdA;

  // Analyze the merge preview
  const preview = useMemo(() => {
    if (!graph || !personA || !personB) return null;

    // Check if they're directly connected by a parent-child edge
    const connectingEdges: Edge[] = [];
    for (const edge of graph.edges.values()) {
      if (
        (edge.parentId === personIdA && edge.childId === personIdB) ||
        (edge.parentId === personIdB && edge.childId === personIdA)
      ) {
        connectingEdges.push(edge);
      }
    }
    const isParentChild = connectingEdges.length > 0;

    // Edges that will be reassigned (from removeId)
    const reassignedEdges: { edge: Edge; change: string }[] = [];
    // Edges that will become self-loops (to be removed)
    const selfLoopEdges: Edge[] = [];
    // Edges that will duplicate existing edges
    const duplicateEdges: { existing: Edge; incoming: Edge }[] = [];

    // Simulate reassignment
    const existingPairs = new Set<string>();
    for (const edge of graph.edges.values()) {
      if (edge.parentId !== removeId && edge.childId !== removeId) {
        existingPairs.add(`${edge.parentId}→${edge.childId}`);
      }
    }

    for (const edge of graph.edges.values()) {
      if (edge.parentId !== removeId && edge.childId !== removeId) continue;

      let newParent = edge.parentId === removeId ? keepId : edge.parentId;
      let newChild = edge.childId === removeId ? keepId : edge.childId;

      if (newParent === newChild) {
        selfLoopEdges.push(edge);
        continue;
      }

      const pair = `${newParent}→${newChild}`;
      if (existingPairs.has(pair)) {
        // Find the existing edge it would duplicate
        const existing = [...graph.edges.values()].find(
          e => e.parentId === newParent && e.childId === newChild
        );
        if (existing) {
          duplicateEdges.push({ existing, incoming: edge });
        }
      } else {
        existingPairs.add(pair);
        const parentName = graph.persons.get(newParent)?.name.full ?? newParent;
        const childName = graph.persons.get(newChild)?.name.full ?? newChild;
        reassignedEdges.push({
          edge,
          change: `${parentName} → ${childName}`,
        });
      }
    }

    return { isParentChild, connectingEdges, reassignedEdges, selfLoopEdges, duplicateEdges };
  }, [graph, personA, personB, personIdA, personIdB, keepId, removeId]);

  const handleMerge = useCallback(() => {
    dispatch({ type: 'MERGE_PERSONS', keepId, removeId });
    onClose();
  }, [dispatch, keepId, removeId, onClose]);

  if (!graph || !personA || !personB || !preview) return null;

  const keepPerson = graph.persons.get(keepId)!;
  const removePerson = graph.persons.get(removeId)!;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[61]
                      bg-surface border border-border rounded-lg shadow-2xl w-[600px] max-w-[90vw] max-h-[85vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-[family-name:var(--font-heading)] text-lg text-text-primary">
            Merge Persons
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-dim hover:text-text-primary text-xl leading-none p-1"
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Relationship warning */}
          {preview.isParentChild && (
            <div className="px-3 py-2 bg-tier3-bg border border-tier3 rounded text-sm text-tier3">
              These two persons are connected by a parent-child edge.
              Merging will dissolve that connecting edge (removing the self-loop)
              and preserve all other relationships.
            </div>
          )}

          {/* Side-by-side cards with radio selection */}
          <div className="grid grid-cols-2 gap-3">
            {[{ id: personIdA, person: personA }, { id: personIdB, person: personB }].map(({ id, person }) => (
              <label
                key={id}
                className={`block cursor-pointer rounded-lg border p-3 transition-colors ${
                  keepId === id
                    ? 'border-gold bg-gold/5'
                    : 'border-border hover:border-text-dim'
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="keepPerson"
                    checked={keepId === id}
                    onChange={() => setKeepId(id)}
                    className="mt-1 accent-[var(--color-gold)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-[family-name:var(--font-heading)] text-sm text-text-primary truncate">
                      {formatDisplayName(person.name)}
                    </div>
                    <div className="text-xs text-text-dim mt-1 space-y-0.5">
                      <div>b. {formatDate(person, 'birth')}</div>
                      <div>d. {formatDate(person, 'death')}</div>
                      <div>{person.sourceIds.length} source{person.sourceIds.length !== 1 ? 's' : ''}</div>
                      <div>
                        {graph.parentEdges.get(id)?.length ?? 0} parent{(graph.parentEdges.get(id)?.length ?? 0) !== 1 ? 's' : ''},
                        {' '}{graph.childEdges.get(id)?.length ?? 0} child{(graph.childEdges.get(id)?.length ?? 0) !== 1 ? 'ren' : ''}
                      </div>
                    </div>
                    <div className={`text-xs mt-1.5 font-medium ${keepId === id ? 'text-gold' : 'text-tier4'}`}>
                      {keepId === id ? 'Keep' : 'Remove'}
                    </div>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* Preview */}
          <div className="text-xs text-text-dim space-y-2">
            {preview.selfLoopEdges.length > 0 && (
              <div>
                <span className="font-medium text-tier3">Self-loops removed:</span>{' '}
                {preview.selfLoopEdges.length} edge{preview.selfLoopEdges.length !== 1 ? 's' : ''}
              </div>
            )}
            {preview.duplicateEdges.length > 0 && (
              <div>
                <span className="font-medium text-tier2">Duplicate edges merged:</span>{' '}
                {preview.duplicateEdges.length} edge{preview.duplicateEdges.length !== 1 ? 's' : ''} (sources combined)
              </div>
            )}
            {preview.reassignedEdges.length > 0 && (
              <div>
                <div className="font-medium text-text-secondary mb-1">Edges reassigned:</div>
                <ul className="ml-3 space-y-0.5">
                  {preview.reassignedEdges.slice(0, 8).map(({ edge, change }) => (
                    <li key={edge.id} className="text-text-dim">{change}</li>
                  ))}
                  {preview.reassignedEdges.length > 8 && (
                    <li className="text-text-dim">...and {preview.reassignedEdges.length - 8} more</li>
                  )}
                </ul>
              </div>
            )}
            <div className="text-text-dim">
              {removePerson.name.full !== keepPerson.name.full
                ? `"${removePerson.name.full}" will be saved as an alternate name.`
                : 'Names are identical.'}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMerge}
              className="px-4 py-2 text-sm font-medium bg-gold text-bg rounded hover:bg-gold-light transition-colors"
            >
              Merge
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
