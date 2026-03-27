import { useState, useCallback } from 'react';
import { useAI } from '@/hooks/use-ai.ts';
import { getApiKey } from '@/ai/ai-client.ts';
import { TIER_BG_CLASSES, getTierLabel } from '@/types/tier-labels.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import type { AIMode, DeepResearchTask } from '@/types/ai.ts';
import { AskAIButton } from '@/components/research/AskAIButton.tsx';
import { FindingsPanel } from '@/components/research/FindingsPanel.tsx';
import { ResearchProgress } from '@/components/research/ResearchProgress.tsx';
import { estimateDeepResearchCost } from '@/ai/cost-estimator.ts';

interface AIValidationSectionProps {
  personId: string;
}

export function AIValidationSection({ personId }: AIValidationSectionProps) {
  const {
    quickCheck, getQuickCheck,
    validateStandard, getValidationReport,
    startDeepResearch, getDeepResearchRounds,
    importDiscoveredSource,
  } = useAI();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deepRunning, setDeepRunning] = useState(false);
  const [cancelFn, setCancelFn] = useState<(() => void) | null>(null);

  const quickCheckResult = getQuickCheck(personId);
  const validationReport = getValidationReport(personId);
  const deepRounds = getDeepResearchRounds(personId);
  const hasKey = getApiKey() !== null;

  const handleModeSelect = useCallback(async (mode: AIMode) => {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'quick') {
        const result = await quickCheck(personId);
        if (!result) setError('Failed to parse AI response.');
      } else if (mode === 'standard') {
        const result = await validateStandard(personId);
        if (!result) setError('Failed to parse AI response.');
      } else if (mode === 'deep') {
        // Build a deep research task from person context
        // We need to access the graph to compute era/location
        // The hook internally does this, but we need a task object
        const task = buildResearchTask(personId);
        if (!task) {
          setError('Could not build research task.');
          setLoading(false);
          return;
        }

        const session = startDeepResearch(task);
        if (!session) {
          setError('No AI provider configured.');
          setLoading(false);
          return;
        }

        setDeepRunning(true);
        setCancelFn(() => session.abort);

        try {
          for await (const _round of session.rounds) {
            // Rounds are dispatched to state automatically
          }
        } finally {
          setDeepRunning(false);
          setCancelFn(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI operation failed.');
    } finally {
      setLoading(false);
    }
  }, [quickCheck, validateStandard, startDeepResearch, personId]);

  const hasAnyResult = quickCheckResult || validationReport || (deepRounds && deepRounds.length > 0);

  return (
    <div>
      <h3 className="font-[family-name:var(--font-heading)] text-sm font-medium text-text-secondary mb-2 flex items-center gap-2">
        AI Validation
        {!hasKey && (
          <span className="text-xs text-text-dim font-sans font-normal">(configure API key first)</span>
        )}
      </h3>

      {/* Ask AI button with mode dropdown */}
      <div className="mb-2">
        <AskAIButton
          onSelect={handleModeSelect}
          loading={loading || deepRunning}
          disabled={!hasKey}
        />
      </div>

      {error && (
        <p className="text-xs text-tier4 mt-1 mb-2">{error}</p>
      )}

      {/* Mode 1: Quick Check results */}
      {quickCheckResult && (
        <div className="rounded border border-border bg-bg p-3 mb-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-bg text-text-dim">Quick Check</span>
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TIER_BG_CLASSES[quickCheckResult.suggestedTier as ConfidenceTier]}`}>
              {getTierLabel(quickCheckResult.suggestedTier)}
            </span>
            <span className={`text-xs ${plausibilityColor(quickCheckResult.plausibility)}`}>
              {quickCheckResult.plausibility}
            </span>
          </div>

          <p className="text-xs text-text-secondary mb-1">{quickCheckResult.tierReason}</p>

          {quickCheckResult.issues.length > 0 && (
            <ul className="text-xs text-text-secondary space-y-0.5 mb-1">
              {quickCheckResult.issues.map((issue, i) => (
                <li key={i} className="pl-2 border-l-2 border-tier3/30">
                  <span className="text-text-dim">[{issue.type}]</span> {issue.description}
                  {issue.correction && (
                    <span className="text-tier1 block">Suggestion: {issue.correction}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {quickCheckResult.quickWin && (
            <p className="text-xs text-gold mt-1">Quick win: {quickCheckResult.quickWin}</p>
          )}
        </div>
      )}

      {/* Mode 2: Validation Report */}
      {validationReport && (
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-bg text-text-dim">Validation</span>
          </div>
          <FindingsPanel
            report={validationReport}
            personId={personId}
            onImportSource={(source, pids) => importDiscoveredSource(source, pids)}
          />
        </div>
      )}

      {/* Mode 3: Deep Research Progress/Results */}
      {(deepRunning || (deepRounds && deepRounds.length > 0)) && (
        <div className="mb-2">
          <ResearchProgress
            rounds={deepRounds ?? []}
            running={deepRunning}
            estimatedCostUsd={estimateDeepResearchCost(deepRounds?.length ?? 1).estimatedCostUsd}
            onCancel={() => cancelFn?.()}
          />

          {/* Show findings from rounds */}
          {deepRounds && deepRounds.length > 0 && (
            <div className="mt-2 space-y-1">
              {deepRounds.flatMap(r => r.findings).map((f, i) => (
                <div key={i} className={`text-xs pl-2 border-l-2 ${
                  f.type === 'confirmation' ? 'border-tier1/30 text-tier1'
                    : f.type === 'contradiction' ? 'border-tier4/30 text-tier4'
                      : f.type === 'absence' ? 'border-tier3/30 text-tier3'
                        : 'border-gold/30 text-gold'
                }`}>
                  <span className="text-text-dim">[{f.type}]</span>{' '}
                  <span className="text-text-secondary">{f.description}</span>
                  {f.url && (
                    <a href={f.url} target="_blank" rel="noopener noreferrer"
                       className="text-gold hover:text-gold-light ml-1">[link]</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Re-run button */}
      {hasAnyResult && !loading && !deepRunning && (
        <p className="text-xs text-text-dim mt-1">
          Use the Ask AI button above to run a new check.
        </p>
      )}
    </div>
  );
}

function plausibilityColor(p: string): string {
  switch (p) {
    case 'confirmed': return 'text-tier1';
    case 'plausible': return 'text-tier2';
    case 'questionable': return 'text-tier3';
    case 'implausible': return 'text-tier4';
    default: return 'text-text-dim';
  }
}

/**
 * Build a basic deep research task from a person ID.
 * This is a helper that creates the minimal task object.
 * Full context is computed inside the hook.
 */
function buildResearchTask(personId: string): DeepResearchTask | null {
  // We can't access the graph directly here (no hook context in helper fn).
  // Return a minimal task — the hook's startDeepResearch will fill in context.
  return {
    type: 'verify_person',
    primaryPersonId: personId,
    secondaryPersonId: null,
    edgeIds: [],
    eraTag: 'us_modern',
    locationContext: { region: 'unknown', country: 'unknown', availableRepositories: [], knownGaps: [] },
    existingSources: [],
    activeFlags: [],
    researchQuestions: [],
    pathPersonIds: null,
    notableAncestorName: null,
  };
}
