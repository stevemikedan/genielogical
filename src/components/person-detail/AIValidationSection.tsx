import { useState, useCallback } from 'react';
import { useAI } from '@/hooks/use-ai.ts';
import { getApiKey } from '@/ai/ai-client.ts';
import { TIER_BG_CLASSES, getTierLabel } from '@/types/tier-labels.ts';
import type { ConfidenceTier } from '@/types/common.ts';

interface AIValidationSectionProps {
  personId: string;
}

export function AIValidationSection({ personId }: AIValidationSectionProps) {
  const { validatePerson, getValidation } = useAI();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = getValidation(personId);
  const hasKey = getApiKey() !== null;

  const handleValidate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await validatePerson(personId);
      if (!result) setError('Failed to parse AI response.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI validation failed.');
    } finally {
      setLoading(false);
    }
  }, [validatePerson, personId]);

  return (
    <div>
      <h3 className="font-[family-name:var(--font-heading)] text-sm font-medium text-text-secondary mb-2 flex items-center gap-2">
        AI Validation
        {!hasKey && (
          <span className="text-xs text-text-dim font-sans font-normal">(configure API key first)</span>
        )}
      </h3>

      {!validation && (
        <button
          type="button"
          onClick={handleValidate}
          disabled={loading || !hasKey}
          className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary
                     hover:text-gold hover:border-gold/40 transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-3 h-3 border border-gold/50 border-t-gold rounded-full animate-spin" />
              Validating...
            </>
          ) : (
            'Ask AI'
          )}
        </button>
      )}

      {error && (
        <p className="text-xs text-tier4 mt-1">{error}</p>
      )}

      {validation && (
        <div className="space-y-3 mt-1">
          <div className="rounded border border-border bg-bg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TIER_BG_CLASSES[validation.suggestedTier as ConfidenceTier]}`}>
                AI suggests: {getTierLabel(validation.suggestedTier)}
              </span>
              <span className="text-xs text-text-dim">
                {formatTimeAgo(validation.validatedAt)}
              </span>
            </div>

            <p className="text-sm text-text-secondary mb-2">{validation.summary}</p>

            {validation.historicalNotes.length > 0 && (
              <div className="mb-2">
                <p className="text-xs text-text-dim mb-1">Historical notes:</p>
                <ul className="text-xs text-text-secondary space-y-0.5">
                  {validation.historicalNotes.map((note, i) => (
                    <li key={i} className="pl-2 border-l-2 border-border">{note}</li>
                  ))}
                </ul>
              </div>
            )}

            {validation.sourceSuggestions.length > 0 && (
              <div>
                <p className="text-xs text-text-dim mb-1">Suggested sources:</p>
                <ul className="text-xs text-text-secondary space-y-1">
                  {validation.sourceSuggestions.map((s, i) => (
                    <li key={i} className="pl-2 border-l-2 border-gold/30">
                      <span className="font-medium text-text-primary">{s.sourceName}</span>
                      <span className="text-text-dim"> — {s.repository}</span>
                      {s.url && (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 text-gold hover:text-gold-light"
                        >
                          [link]
                        </a>
                      )}
                      <p className="text-text-dim">{s.reasoning}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleValidate}
            disabled={loading}
            className="text-xs text-text-dim hover:text-text-secondary transition-colors flex items-center gap-1"
          >
            {loading ? (
              <>
                <span className="w-2.5 h-2.5 border border-text-dim/50 border-t-text-dim rounded-full animate-spin" />
                Re-validating...
              </>
            ) : (
              'Re-validate'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
