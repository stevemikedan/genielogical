import type { Flag } from '@/types/flag.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';

interface SummaryCardsProps {
  graph: TreeGraph;
  flags: Flag[];
}

export function SummaryCards({ graph, flags }: SummaryCardsProps) {
  const totalPersons = graph.persons.size;
  const totalFamilies = graph.familyIndex.size;
  const generations = graph.getGenerationDepth();

  const personsWithSources = [...graph.persons.values()].filter(p => p.sourceIds.length > 0).length;
  const sourceCoverage = totalPersons > 0 ? Math.round((personsWithSources / totalPersons) * 100) : 0;

  const criticalCount = flags.filter(f => f.severity === 'critical').length;
  const warningCount = flags.filter(f => f.severity === 'warning').length;
  const infoCount = flags.filter(f => f.severity === 'info').length;

  const cards = [
    { label: 'People', value: totalPersons.toLocaleString(), accent: 'text-text-primary' },
    { label: 'Families', value: totalFamilies.toLocaleString(), accent: 'text-text-primary' },
    { label: 'Generations', value: String(generations), accent: 'text-text-primary' },
    { label: 'Source Coverage', value: `${sourceCoverage}%`, accent: sourceCoverage < 20 ? 'text-tier4-text' : sourceCoverage < 50 ? 'text-tier3-text' : 'text-tier1-text' },
    { label: 'Critical Issues', value: String(criticalCount), accent: criticalCount > 0 ? 'text-tier4-text' : 'text-tier1-text' },
    { label: 'Warnings', value: String(warningCount), accent: warningCount > 0 ? 'text-tier3-text' : 'text-text-secondary' },
    { label: 'Info', value: String(infoCount), accent: 'text-tier2-text' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {cards.map(card => (
        <div key={card.label} className="bg-surface border border-border rounded-lg p-4 text-center">
          <div className={`font-[family-name:var(--font-mono)] text-2xl font-bold ${card.accent}`}>
            {card.value}
          </div>
          <div className="text-text-secondary text-xs mt-1 uppercase tracking-wide">
            {card.label}
          </div>
        </div>
      ))}
    </div>
  );
}
