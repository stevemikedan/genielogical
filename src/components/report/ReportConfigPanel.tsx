import { useState, useCallback } from 'react';
import type { ReportType, ReportConfig, AIDepth, ReportScope } from '@/types/report.ts';
import type { CostEstimate } from '@/types/ai.ts';
import { formatCost } from '@/ai/cost-estimator.ts';
import { getApiKey } from '@/ai/ai-client.ts';

interface ReportConfigPanelProps {
  reportType: ReportType;
  onGenerate: (config: ReportConfig) => void;
  onEstimate: (config: ReportConfig) => { candidateCount: number; estimate: CostEstimate } | null;
  onBack: () => void;
  onOpenSettings?: () => void;
}

const REPORT_TITLES: Record<ReportType, string> = {
  notable_women: 'Notable Women Report',
  notable_men: 'Notable Men Report',
  data_quality: 'Data Quality Dashboard',
};

export function ReportConfigPanel({ reportType, onGenerate, onEstimate, onBack, onOpenSettings }: ReportConfigPanelProps) {
  const [scopeMode, setScopeMode] = useState<ReportScope['mode']>('full_tree');
  const [aiDepth, setAiDepth] = useState<AIDepth>('none');
  const [estimation, setEstimation] = useState<{ candidateCount: number; estimate: CostEstimate } | null>(null);
  const [showApproval, setShowApproval] = useState(false);

  const hasApiKey = !!getApiKey();
  const isDataQuality = reportType === 'data_quality';
  const sexFilter = reportType === 'notable_women' ? 'F' as const : reportType === 'notable_men' ? 'M' as const : null;

  const buildConfig = useCallback((): ReportConfig => ({
    reportType,
    scope: {
      mode: scopeMode,
      rootPersonId: null,
      sexFilter,
      minConfidenceTier: null,
      generationRange: null,
    },
    aiDepth,
  }), [reportType, scopeMode, aiDepth, sexFilter]);

  const handleEstimate = useCallback(() => {
    const config = buildConfig();
    const result = onEstimate(config);
    setEstimation(result);
    setShowApproval(true);
  }, [buildConfig, onEstimate]);

  const handleGenerate = useCallback(() => {
    onGenerate(buildConfig());
  }, [buildConfig, onGenerate]);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          ← Back
        </button>
        <h2 className="font-[family-name:var(--font-heading)] text-xl text-text-primary">
          {REPORT_TITLES[reportType]}
        </h2>
      </div>

      {/* Scope selector */}
      {!isDataQuality && (
        <div className="space-y-2">
          <label className="text-sm text-text-secondary">Scope</label>
          <div className="flex gap-2">
            {(['full_tree', 'direct_line'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => { setScopeMode(mode); setShowApproval(false); }}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  scopeMode === mode
                    ? 'bg-gold text-bg font-medium'
                    : 'border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {mode === 'full_tree' ? 'Full tree' : 'Direct line'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI depth selector */}
      <div className="space-y-2">
        <label className="text-sm text-text-secondary">AI Analysis</label>
        <div className="flex gap-2">
          {(['none', 'quick'] as const).map(depth => (
            <button
              key={depth}
              type="button"
              onClick={() => { setAiDepth(depth); setShowApproval(false); }}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                aiDepth === depth
                  ? 'bg-gold text-bg font-medium'
                  : 'border border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {depth === 'none' ? 'No AI' : 'Quick check (~$0.003/person)'}
            </button>
          ))}
        </div>
        {aiDepth !== 'none' && !hasApiKey && (
          <div className="text-xs text-tier4">
            API key required.{' '}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-gold hover:text-gold-light underline"
              >
                Configure AI
              </button>
            )}
          </div>
        )}
      </div>

      {/* Estimate button */}
      {!showApproval && (
        <button
          type="button"
          onClick={handleEstimate}
          className="w-full py-2.5 rounded-lg border border-gold/40 text-gold
                     hover:bg-gold/10 transition-colors text-sm font-medium"
        >
          Estimate
        </button>
      )}

      {/* Approval gate */}
      {showApproval && estimation && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-surface-alt">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Candidates found</span>
            <span className="text-text-primary font-mono">{estimation.candidateCount}</span>
          </div>
          {aiDepth !== 'none' && (
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Estimated cost</span>
              <span className="text-gold font-mono">{formatCost(estimation.estimate.estimatedCostUsd)}</span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={aiDepth !== 'none' && !hasApiKey}
              className="flex-1 py-2 rounded-lg bg-gold text-bg font-medium text-sm
                         hover:bg-gold-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Report
            </button>
            {aiDepth !== 'none' && (
              <button
                type="button"
                onClick={() => { setAiDepth('none'); handleGenerate(); }}
                className="px-3 py-2 rounded-lg border border-border text-text-secondary text-sm
                           hover:text-text-primary transition-colors"
              >
                Skip AI
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
