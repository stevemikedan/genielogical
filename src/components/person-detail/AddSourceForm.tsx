import { useState } from 'react';
import type { SourceClass, SourceType, ProvesWhat, Source } from '@/types/source.ts';
import type { Edge } from '@/types/edge.ts';
import type { TreeAction } from '@/context/tree-state.ts';
import { computeSourceHash } from '@/utils/identity-hash.ts';

const SOURCE_TYPES: Array<{ value: SourceType; label: string }> = [
  { value: 'vital_record', label: 'Vital Record' },
  { value: 'census', label: 'Census' },
  { value: 'church_register', label: 'Church Register' },
  { value: 'court_record', label: 'Court Record' },
  { value: 'military_record', label: 'Military Record' },
  { value: 'pension_file', label: 'Pension File' },
  { value: 'land_grant', label: 'Land Grant' },
  { value: 'probate', label: 'Probate' },
  { value: 'published_genealogy', label: 'Published Genealogy' },
  { value: 'compiled_tree', label: 'Compiled Tree' },
  { value: 'dna', label: 'DNA' },
  { value: 'family_bible', label: 'Family Bible' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'monument_inscription', label: 'Monument/Inscription' },
  { value: 'personal_knowledge', label: 'Personal Knowledge' },
  { value: 'photograph', label: 'Photograph' },
  { value: 'document_scan', label: 'Document Scan' },
  { value: 'other', label: 'Other' },
];

const SOURCE_CLASSES: Array<{ value: SourceClass; label: string; help: string }> = [
  { value: 'primary', label: 'Primary', help: 'Created at the time of the event by someone with direct knowledge' },
  { value: 'secondary', label: 'Secondary', help: 'Created after the event, or by someone without direct knowledge' },
  { value: 'tertiary', label: 'Tertiary', help: 'Compiled from secondary sources (e.g., published genealogy)' },
  { value: 'derivative', label: 'Derivative', help: 'Transcription, abstract, or extract of another source' },
];

const PROVES_OPTIONS: Array<{ value: ProvesWhat; label: string }> = [
  { value: 'identity', label: 'Identity' },
  { value: 'birth', label: 'Birth' },
  { value: 'death', label: 'Death' },
  { value: 'marriage', label: 'Marriage' },
  { value: 'parentage', label: 'Parentage' },
  { value: 'residence', label: 'Residence' },
  { value: 'occupation', label: 'Occupation' },
];

interface AddSourceFormProps {
  personId: string;
  parentEdges: Edge[];
  graph: { persons: Map<string, { name: { full: string } }> };
  dispatch: React.Dispatch<TreeAction>;
  onDone: () => void;
}

export function AddSourceForm({ personId, parentEdges, graph, dispatch, onDone }: AddSourceFormProps) {
  const [sourceType, setSourceType] = useState<SourceType>('vital_record');
  const [sourceClass, setSourceClass] = useState<SourceClass>('secondary');
  const [title, setTitle] = useState('');
  const [citation, setCitation] = useState('');
  const [url, setUrl] = useState('');
  const [repository, setRepository] = useState('');
  const [notes, setNotes] = useState('');
  const [provesWhat, setProvesWhat] = useState<Set<ProvesWhat>>(new Set());
  const [attachEdgeIds, setAttachEdgeIds] = useState<Set<string>>(new Set());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const source: Source = {
      id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      origin: 'user_added',
      sourceClass,
      sourceType,
      title: title.trim(),
      citation: citation.trim(),
      notes: notes.trim(),
      url: url.trim() || null,
      repository: repository.trim() || null,
      provesWhat: [...provesWhat],
      attachedToPersonIds: [personId],
      attachedToEdgeIds: [...attachEdgeIds],
      gedcomTag: null,
      sourceHash: computeSourceHash(citation.trim(), url.trim() || null),
      addedAt: new Date(),
      addedBy: 'user',
    };

    dispatch({
      type: 'ADD_SOURCE',
      source,
      personIds: [personId],
      edgeIds: [...attachEdgeIds],
    });

    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border border-border rounded p-3 bg-bg">
      <h4 className="text-sm font-medium text-text-primary">Add Source</h4>

      {/* Source Type */}
      <div>
        <label className="block text-xs text-text-dim mb-1">Source Type</label>
        <select
          value={sourceType}
          onChange={e => setSourceType(e.target.value as SourceType)}
          className="w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary"
        >
          {SOURCE_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Source Class */}
      <div>
        <label className="block text-xs text-text-dim mb-1">Source Classification</label>
        <div className="space-y-1">
          {SOURCE_CLASSES.map(c => (
            <label key={c.value} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="sourceClass"
                value={c.value}
                checked={sourceClass === c.value}
                onChange={() => setSourceClass(c.value)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm text-text-primary">{c.label}</span>
                <p className="text-xs text-text-dim">{c.help}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs text-text-dim mb-1">Title *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary"
          placeholder="e.g., Birth Certificate of John Smith"
          required
        />
      </div>

      {/* Citation */}
      <div>
        <label className="block text-xs text-text-dim mb-1">Citation</label>
        <textarea
          value={citation}
          onChange={e => setCitation(e.target.value)}
          rows={2}
          className="w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary resize-y"
          placeholder="Full citation..."
        />
      </div>

      {/* URL */}
      <div>
        <label className="block text-xs text-text-dim mb-1">URL</label>
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          className="w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary"
          placeholder="https://..."
        />
      </div>

      {/* Repository */}
      <div>
        <label className="block text-xs text-text-dim mb-1">Repository</label>
        <input
          type="text"
          value={repository}
          onChange={e => setRepository(e.target.value)}
          className="w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary"
          placeholder="e.g., National Archives"
        />
      </div>

      {/* Proves What */}
      <div>
        <label className="block text-xs text-text-dim mb-1">Proves</label>
        <div className="flex flex-wrap gap-2">
          {PROVES_OPTIONS.map(p => (
            <label key={p.value} className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={provesWhat.has(p.value)}
                onChange={e => {
                  const next = new Set(provesWhat);
                  if (e.target.checked) next.add(p.value);
                  else next.delete(p.value);
                  setProvesWhat(next);
                }}
              />
              <span className="text-xs text-text-secondary">{p.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Attach to edges */}
      {parentEdges.length > 0 && (
        <div>
          <label className="block text-xs text-text-dim mb-1">Also attach to edges</label>
          <div className="space-y-1">
            {parentEdges.map(edge => {
              const parent = graph.persons.get(edge.parentId);
              return (
                <label key={edge.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attachEdgeIds.has(edge.id)}
                    onChange={e => {
                      const next = new Set(attachEdgeIds);
                      if (e.target.checked) next.add(edge.id);
                      else next.delete(edge.id);
                      setAttachEdgeIds(next);
                    }}
                  />
                  <span className="text-xs text-text-secondary">
                    Edge from {parent?.name.full ?? edge.parentId}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs text-text-dim mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary resize-y"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="px-3 py-1 rounded bg-gold text-bg text-sm font-medium hover:bg-gold-light transition-colors"
        >
          Add Source
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1 rounded border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
