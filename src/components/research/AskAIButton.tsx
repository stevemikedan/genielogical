import { useState, useRef, useEffect } from 'react';
import { getApiKey } from '@/ai/ai-client.ts';
import { estimateQuickCheckCost, estimateValidationCost, estimateDeepResearchCost, formatCost } from '@/ai/cost-estimator.ts';
import type { AIMode } from '@/types/ai.ts';

interface AskAIButtonProps {
  onSelect: (mode: AIMode) => void;
  loading?: boolean;
  disabled?: boolean;
}

const MODE_OPTIONS: { mode: AIMode; label: string; desc: string }[] = [
  { mode: 'quick', label: 'Quick Check', desc: 'Plausibility scan (~2s)' },
  { mode: 'standard', label: 'Validate', desc: 'Web search + report (~15s)' },
  { mode: 'deep', label: 'Deep Research', desc: 'Multi-round investigation (~60s)' },
];

export function AskAIButton({ onSelect, loading, disabled }: AskAIButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasKey = getApiKey() !== null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const costs = [
    formatCost(estimateQuickCheckCost(1).estimatedCostUsd),
    formatCost(estimateValidationCost(1).estimatedCostUsd),
    formatCost(estimateDeepResearchCost(3).estimatedCostUsd),
  ];

  if (loading) {
    return (
      <button
        type="button"
        disabled
        className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary
                   disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <span className="w-3 h-3 border border-gold/50 border-t-gold rounded-full animate-spin" />
        Working...
      </button>
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled || !hasKey}
        className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary
                   hover:text-gold hover:border-gold/40 transition-colors
                   disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
      >
        Ask AI
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 rounded border border-border bg-surface shadow-lg z-50">
          {MODE_OPTIONS.map((opt, i) => (
            <button
              key={opt.mode}
              type="button"
              onClick={() => {
                setOpen(false);
                onSelect(opt.mode);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-bg transition-colors
                         first:rounded-t last:rounded-b border-b border-border last:border-b-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-text-primary font-medium">{opt.label}</span>
                <span className="text-xs text-text-dim font-mono">{costs[i]}</span>
              </div>
              <p className="text-xs text-text-dim mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
