import type { Flag } from '@/types/flag.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { SummaryCards } from './SummaryCards.tsx';
import { IssueList } from './IssueList.tsx';

interface HealthDashboardProps {
  graph: TreeGraph;
  flags: Flag[];
  onSelectPerson: (id: string) => void;
}

export function HealthDashboard({ graph, flags, onSelectPerson }: HealthDashboardProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-text-primary">
          Tree Health
        </h2>
        <span className="font-[family-name:var(--font-mono)] text-sm text-text-secondary">
          {flags.length} issue{flags.length !== 1 ? 's' : ''} detected
        </span>
      </div>

      <SummaryCards graph={graph} flags={flags} />

      <IssueList
        flags={flags}
        graph={graph}
        onSelectPerson={onSelectPerson}
      />
    </div>
  );
}
