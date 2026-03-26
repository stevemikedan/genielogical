import { useState } from 'react';
import type { Source } from '@/types/source.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { TreeAction } from '@/context/tree-state.ts';
import { AddSourceForm } from './AddSourceForm.tsx';

const CLASS_COLORS: Record<string, string> = {
  primary: 'text-tier1',
  secondary: 'text-tier2',
  tertiary: 'text-tier3',
  derivative: 'text-text-dim',
};

interface SourcesSectionProps {
  sources: Source[];
  person: Person;
  parentEdges: Edge[];
  graph: TreeGraph;
  dispatch: React.Dispatch<TreeAction>;
}

export function SourcesSection({ sources, person, parentEdges, graph, dispatch }: SourcesSectionProps) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
          Sources ({sources.length})
        </h3>
        <button
          type="button"
          onClick={() => setShowForm(s => !s)}
          className="text-xs text-gold hover:text-gold-light transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Source'}
        </button>
      </div>

      {showForm && (
        <AddSourceForm
          personId={person.id}
          parentEdges={parentEdges}
          graph={graph}
          dispatch={dispatch}
          onDone={() => setShowForm(false)}
        />
      )}

      {sources.length === 0 && !showForm && (
        <p className="text-xs text-text-dim">No sources attached. Add one to improve confidence.</p>
      )}

      {sources.length > 0 && (
        <div className="space-y-2">
          {sources.map(source => (
            <div key={source.id} className="border border-border rounded p-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-text-primary">{source.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs font-medium ${CLASS_COLORS[source.sourceClass] ?? ''}`}>
                      {source.sourceClass}
                    </span>
                    <span className="text-xs text-text-dim">{source.sourceType.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                {source.origin === 'user_added' && (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'REMOVE_SOURCE', sourceId: source.id })}
                    className="text-text-dim hover:text-tier4 transition-colors text-xs flex-shrink-0"
                    title="Remove source"
                  >
                    &times;
                  </button>
                )}
              </div>
              {source.citation && (
                <p className="text-xs text-text-secondary mt-1">{source.citation}</p>
              )}
              {source.provesWhat.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {source.provesWhat.map(p => (
                    <span key={p} className="text-xs px-1 py-0.5 rounded bg-surface text-text-dim">
                      {p}
                    </span>
                  ))}
                </div>
              )}
              {source.url && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gold hover:text-gold-light mt-1 block truncate"
                >
                  {source.url}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
