import type { ReportType } from '@/types/report.ts';

interface ReportCatalogProps {
  onSelect: (reportType: ReportType) => void;
}

const REPORT_CARDS: Array<{ type: ReportType; title: string; icon: string; description: string }> = [
  {
    type: 'notable_women',
    title: 'Notable Women',
    icon: '♀',
    description: 'Discover queens, pioneers, and influential women in your maternal and paternal lines. Pattern-matched and confidence-scored.',
  },
  {
    type: 'notable_men',
    title: 'Notable Men',
    icon: '♂',
    description: 'Identify kings, military officers, scholars, and other notable men across your ancestry. Includes chain confidence analysis.',
  },
  {
    type: 'data_quality',
    title: 'Data Quality',
    icon: '✓',
    description: 'Analyze your tree for missing dates, places, and sources. See branch coverage and per-person quality scores.',
  },
];

export function ReportCatalog({ onSelect }: ReportCatalogProps) {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="font-[family-name:var(--font-brand)] text-2xl text-gold mb-2">
          Reports
        </h2>
        <p className="text-text-secondary text-sm">
          Generate structured reports from your tree data with confidence scoring.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {REPORT_CARDS.map(card => (
          <button
            key={card.type}
            type="button"
            onClick={() => onSelect(card.type)}
            className="text-left p-5 rounded-lg border border-border bg-surface
                       hover:border-gold/40 hover:bg-surface-alt transition-colors group"
          >
            <div className="text-3xl mb-3">{card.icon}</div>
            <h3 className="font-[family-name:var(--font-heading)] text-lg text-text-primary group-hover:text-gold transition-colors mb-2">
              {card.title}
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              {card.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
