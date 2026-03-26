import type { Flag } from '@/types/flag.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';

interface IssueCardProps {
  flag: Flag;
  graph: TreeGraph;
  onSelectPerson: (id: string) => void;
}

const SEVERITY_STYLES = {
  critical: 'bg-tier4-bg text-tier4-text border-tier4-border',
  warning: 'bg-tier3-bg text-tier3-text border-tier3-border',
  info: 'bg-tier2-bg text-tier2-text border-tier2-border',
} as const;

export function IssueCard({ flag, graph, onSelectPerson }: IssueCardProps) {
  const personNames = flag.affectedPersonIds
    .map(id => {
      const person = graph.persons.get(id);
      return person ? { id, name: person.name.full } : null;
    })
    .filter((p): p is { id: string; name: string } => p !== null);

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-start gap-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${SEVERITY_STYLES[flag.severity]}`}>
          {flag.severity}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="font-[family-name:var(--font-display)] text-text-primary text-sm font-medium">
            {flag.title}
          </h4>
          <p className="text-text-secondary text-xs mt-1">{flag.description}</p>
          {personNames.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {personNames.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectPerson(p.id)}
                  className="text-gold hover:text-gold-light text-xs underline decoration-dotted cursor-pointer"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <p className="text-text-dim text-xs mt-2 italic">{flag.suggestedAction}</p>
        </div>
      </div>
    </div>
  );
}
