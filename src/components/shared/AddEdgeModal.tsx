import { useState, useMemo, useCallback } from 'react';
import { useTree } from '@/hooks/index.ts';
import { generateEdgeId } from '@/utils/id-generator.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { RelationshipType, Legitimacy } from '@/types/edge.ts';

interface AddEdgeModalProps {
  graph: TreeGraph;
  onClose: () => void;
  /** Pre-fill the child side (e.g. when clicking "Add Parent" on a person) */
  presetChildId?: string;
  /** Pre-fill the parent side (e.g. when clicking "Add Child" on a person) */
  presetParentId?: string;
}

const RELATIONSHIP_TYPES: Array<{ value: RelationshipType; label: string }> = [
  { value: 'biological', label: 'Biological' },
  { value: 'adoptive', label: 'Adoptive' },
  { value: 'step', label: 'Step' },
  { value: 'foster', label: 'Foster' },
  { value: 'unknown', label: 'Unknown' },
];

export function AddEdgeModal({ graph, onClose, presetChildId, presetParentId }: AddEdgeModalProps) {
  const { dispatch } = useTree();

  const [parentId, setParentId] = useState(presetParentId ?? '');
  const [childId, setChildId] = useState(presetChildId ?? '');
  const [parentSearch, setParentSearch] = useState('');
  const [childSearch, setChildSearch] = useState('');
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('biological');
  const [legitimacy, setLegitimacy] = useState<Legitimacy>('unknown');

  const persons = useMemo(() => {
    const arr = Array.from(graph.persons.values());
    arr.sort((a, b) => a.name.full.localeCompare(b.name.full));
    return arr;
  }, [graph]);

  const filteredParents = useMemo(() => {
    if (!parentSearch.trim()) return persons.slice(0, 20);
    const q = parentSearch.toLowerCase();
    return persons.filter(p => p.name.full.toLowerCase().includes(q)).slice(0, 20);
  }, [persons, parentSearch]);

  const filteredChildren = useMemo(() => {
    if (!childSearch.trim()) return persons.slice(0, 20);
    const q = childSearch.toLowerCase();
    return persons.filter(p => p.name.full.toLowerCase().includes(q)).slice(0, 20);
  }, [persons, childSearch]);

  const selectedParent = parentId ? graph.persons.get(parentId) : null;
  const selectedChild = childId ? graph.persons.get(childId) : null;

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!parentId || !childId || parentId === childId) return;

    dispatch({
      type: 'ADD_EDGE',
      edge: {
        id: generateEdgeId(),
        parentId,
        childId,
        relationshipType,
        legitimacy,
        marriage: null,
        confidenceTier: 4,
        confidenceReason: 'Newly created, no sources',
        parallelGroupId: null,
        isPrimary: true,
        pathLabel: null,
        sourceIds: [],
        flagIds: [],
        familyGedcomXref: null,
        assertedBy: 'local_user',
        assertedAt: new Date(),
        createdAt: new Date(),
      },
    });

    onClose();
  }, [parentId, childId, relationshipType, legitimacy, dispatch, onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[61]
                      bg-surface border border-border rounded-lg shadow-2xl w-[480px] max-w-[90vw]">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-[family-name:var(--font-heading)] text-lg text-text-primary">
            Connect Persons
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-dim hover:text-text-primary text-xl leading-none p-1"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Parent selector */}
          <div>
            <label className="block text-xs text-text-dim mb-1">Parent</label>
            {selectedParent ? (
              <div className="flex items-center justify-between px-3 py-2 bg-bg border border-border rounded">
                <span className="text-sm text-text-primary">{selectedParent.name.full}</span>
                <button
                  type="button"
                  onClick={() => { setParentId(''); setParentSearch(''); }}
                  className="text-xs text-text-dim hover:text-text-secondary"
                >
                  Change
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={parentSearch}
                  onChange={e => setParentSearch(e.target.value)}
                  autoFocus={!presetParentId}
                  className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary
                             placeholder-text-dim focus:outline-none focus:border-gold/50"
                  placeholder="Search for parent..."
                />
                {filteredParents.length > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto border border-border rounded bg-bg">
                    {filteredParents.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setParentId(p.id); setParentSearch(''); }}
                        className="w-full text-left px-3 py-1.5 text-sm text-text-secondary
                                   hover:bg-surface hover:text-text-primary transition-colors"
                      >
                        {p.name.full}
                        {p.birth.date?.year && (
                          <span className="text-text-dim ml-2">({p.birth.date.year})</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Arrow indicator */}
          <div className="flex justify-center text-text-dim text-xl">&#x2193;</div>

          {/* Child selector */}
          <div>
            <label className="block text-xs text-text-dim mb-1">Child</label>
            {selectedChild ? (
              <div className="flex items-center justify-between px-3 py-2 bg-bg border border-border rounded">
                <span className="text-sm text-text-primary">{selectedChild.name.full}</span>
                <button
                  type="button"
                  onClick={() => { setChildId(''); setChildSearch(''); }}
                  className="text-xs text-text-dim hover:text-text-secondary"
                >
                  Change
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={childSearch}
                  onChange={e => setChildSearch(e.target.value)}
                  autoFocus={!!presetParentId}
                  className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary
                             placeholder-text-dim focus:outline-none focus:border-gold/50"
                  placeholder="Search for child..."
                />
                {filteredChildren.length > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto border border-border rounded bg-bg">
                    {filteredChildren.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setChildId(p.id); setChildSearch(''); }}
                        className="w-full text-left px-3 py-1.5 text-sm text-text-secondary
                                   hover:bg-surface hover:text-text-primary transition-colors"
                      >
                        {p.name.full}
                        {p.birth.date?.year && (
                          <span className="text-text-dim ml-2">({p.birth.date.year})</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Relationship type */}
          <div>
            <label className="block text-xs text-text-dim mb-1">Relationship</label>
            <select
              value={relationshipType}
              onChange={e => setRelationshipType(e.target.value as RelationshipType)}
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text-primary"
            >
              {RELATIONSHIP_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Legitimacy */}
          <div>
            <label className="block text-xs text-text-dim mb-1">Legitimacy</label>
            <div className="flex gap-4">
              {([['legitimate', 'Legitimate'], ['illegitimate', 'Illegitimate'], ['unknown', 'Unknown']] as [Legitimacy, string][]).map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 cursor-pointer text-sm text-text-secondary">
                  <input
                    type="radio"
                    name="legitimacy"
                    value={val}
                    checked={legitimacy === val}
                    onChange={() => setLegitimacy(val)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Validation message */}
          {parentId && childId && parentId === childId && (
            <p className="text-xs text-tier4">A person cannot be their own parent.</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary
                         hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!parentId || !childId || parentId === childId}
              className="px-4 py-1.5 text-sm rounded bg-gold text-bg font-medium
                         hover:bg-gold-light transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Connect
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
