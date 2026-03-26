import type { Edge } from '@/types/edge.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { TreeAction } from '@/context/tree-state.ts';
import { ConfidenceBadge } from './ConfidenceBadge.tsx';

interface ParallelPathsSectionProps {
  parallelEdges: Edge[];
  graph: TreeGraph;
  dispatch: React.Dispatch<TreeAction>;
}

export function ParallelPathsSection({ parallelEdges, graph, dispatch }: ParallelPathsSectionProps) {
  if (parallelEdges.length === 0) return null;

  // Group by parallelGroupId
  const groups = new Map<string, Edge[]>();
  for (const edge of parallelEdges) {
    if (!edge.parallelGroupId) continue;
    const group = groups.get(edge.parallelGroupId) ?? [];
    group.push(edge);
    groups.set(edge.parallelGroupId, group);
  }

  return (
    <section>
      <h3 className="text-sm font-medium text-text-secondary mb-2 uppercase tracking-wide">
        Parallel Paths
      </h3>

      {[...groups.entries()].map(([groupId, edges]) => (
        <div key={groupId} className="space-y-1">
          {edges.map(edge => {
            const parent = graph.persons.get(edge.parentId);
            return (
              <div
                key={edge.id}
                className={`flex items-center justify-between gap-2 p-2 rounded border text-sm ${
                  edge.isPrimary ? 'border-gold bg-gold/5' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-[family-name:var(--font-heading)] text-text-primary truncate">
                    {parent?.name.full ?? edge.parentId}
                  </span>
                  <ConfidenceBadge tier={edge.confidenceTier} />
                  {edge.pathLabel && (
                    <span className="text-xs text-text-dim">({edge.pathLabel})</span>
                  )}
                  {edge.isPrimary && (
                    <span className="text-xs text-gold font-medium">Primary</span>
                  )}
                </div>

                {!edge.isPrimary && (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'SET_PRIMARY_PATH', edgeId: edge.id })}
                    className="text-xs px-2 py-0.5 rounded border border-border text-text-secondary
                               hover:text-gold hover:border-gold transition-colors flex-shrink-0"
                  >
                    Set Primary
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
