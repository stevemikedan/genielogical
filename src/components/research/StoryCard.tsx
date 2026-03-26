import { useState, useCallback } from 'react';
import type { NotableAncestor } from '@/types/story-path.ts';
import { TIER_BG_CLASSES, getTierLabel } from '@/types/tier-labels.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import { useAI } from '@/hooks/use-ai.ts';
import { getApiKey } from '@/ai/ai-client.ts';

const CATEGORY_LABELS: Record<string, string> = {
  royalty: 'Royalty',
  military_order: 'Military Order',
  political: 'Political',
  indigenous_leader: 'Indigenous Leader',
  author_theologian: 'Author/Theologian',
  scientist_physician: 'Scientist/Physician',
  artist_musician: 'Artist/Musician',
  legal_scholar: 'Legal Scholar',
  clergy: 'Clergy',
  colonial_gentry: 'Colonial Gentry',
  military: 'Military',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  royalty: 'bg-gold/20 text-gold border-gold/30',
  military_order: 'bg-tier4-bg text-tier4-text border-tier4-border',
  political: 'bg-tier2-bg text-tier2-text border-tier2-border',
  indigenous_leader: 'bg-tier3-bg text-tier3-text border-tier3-border',
  clergy: 'bg-purple-900/30 text-purple-300 border-purple-700/40',
  military: 'bg-tier4-bg text-tier4-text border-tier4-border',
  other: 'bg-surface-2 text-text-secondary border-border',
};

interface StoryCardProps {
  notable: NotableAncestor;
  onSelectPerson?: (personId: string) => void;
}

export function StoryCard({ notable, onSelectPerson }: StoryCardProps) {
  const { getNotableContext, getCachedNotableContext } = useAI();
  const [loading, setLoading] = useState(false);
  const cached = getCachedNotableContext(notable.personId);
  const hasKey = getApiKey() !== null;

  const handleAskAI = useCallback(async () => {
    setLoading(true);
    try {
      await getNotableContext(notable.personId, notable.generationsFromSubject);
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoading(false);
    }
  }, [getNotableContext, notable.personId, notable.generationsFromSubject]);

  const categoryLabel = CATEGORY_LABELS[notable.category] ?? notable.category;
  const categoryColor = CATEGORY_COLORS[notable.category] ?? CATEGORY_COLORS.other;
  const tierLabel = getTierLabel(notable.chainConfidence as ConfidenceTier);
  const tierClass = TIER_BG_CLASSES[notable.chainConfidence as ConfidenceTier] ?? TIER_BG_CLASSES[4];

  const yearStr = notable.birthYear
    ? notable.deathYear
      ? `${notable.birthYear}–${notable.deathYear}`
      : `b. ${notable.birthYear}`
    : notable.deathYear
      ? `d. ${notable.deathYear}`
      : '';

  return (
    <div className="rounded-lg border border-border bg-surface p-4 hover:border-gold/40 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <button
            type="button"
            className="font-serif text-base text-text-primary hover:text-gold transition-colors text-left truncate block w-full"
            onClick={() => onSelectPerson?.(notable.personId)}
          >
            {notable.name}
          </button>
          {yearStr && (
            <span className="text-xs font-mono text-text-dim">{yearStr}</span>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded border shrink-0 ${categoryColor}`}>
          {categoryLabel}
        </span>
      </div>

      <p className="text-sm text-text-secondary mb-3">{notable.significance}</p>

      <div className="flex items-center gap-3 text-xs">
        <span className={`px-1.5 py-0.5 rounded font-medium ${tierClass}`}>
          {tierLabel}
        </span>
        <span className="text-text-dim">
          {notable.generationsFromSubject} gen{notable.generationsFromSubject !== 1 ? 's' : ''} back
        </span>
        {notable.bridgeZone && (
          <span className="text-tier4-text">
            {notable.bridgeZone.edgeCount} weak link{notable.bridgeZone.edgeCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {notable.bridgeZone && (
        <div className="mt-2 text-xs text-tier3-text bg-tier3-bg/30 px-2 py-1 rounded">
          Bridge zone: {notable.bridgeZone.description}
        </div>
      )}

      {/* AI context */}
      {cached && (
        <div className="mt-3 pt-2 border-t border-border space-y-1.5">
          <p className="text-xs text-text-secondary">{cached.historicalContext}</p>
          <p className="text-xs text-text-dim italic">{cached.connectionPlausibility}</p>
          {cached.suggestedReadings.length > 0 && (
            <div className="text-xs text-text-dim">
              Readings: {cached.suggestedReadings.join('; ')}
            </div>
          )}
        </div>
      )}

      {!cached && hasKey && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={handleAskAI}
            disabled={loading}
            className="text-xs text-text-dim hover:text-gold transition-colors flex items-center gap-1"
          >
            {loading ? (
              <>
                <span className="w-2.5 h-2.5 border border-gold/50 border-t-gold rounded-full animate-spin" />
                Loading...
              </>
            ) : (
              'Ask AI'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
