import { useState, useCallback } from 'react';
import { useTree } from '@/hooks/use-tree.ts';
import type { ResearchStep } from '@/types/research.ts';

interface ResearchStepsSectionProps {
  personId: string;
}

export function ResearchStepsSection({ personId }: ResearchStepsSectionProps) {
  const { state, dispatch } = useTree();
  const [expanded, setExpanded] = useState(true);

  const steps = state.researchSteps.filter(s => s.personId === personId);
  if (steps.length === 0) return null;

  const completedCount = steps.filter(s => s.status === 'complete').length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between group"
      >
        <h3 className="font-[family-name:var(--font-heading)] text-sm font-medium text-text-secondary flex items-center gap-2">
          Research Steps
          <span className="text-xs text-text-dim font-sans font-normal">
            ({completedCount}/{steps.length})
          </span>
        </h3>
        <span className="text-text-dim group-hover:text-text-secondary text-xs">
          {expanded ? '−' : '+'}
        </span>
      </button>

      {expanded && (
        <ul className="mt-2 space-y-2">
          {steps.map(step => (
            <StepItem key={step.id} step={step} dispatch={dispatch} />
          ))}
        </ul>
      )}
    </div>
  );
}

function StepItem({ step, dispatch }: { step: ResearchStep; dispatch: React.Dispatch<import('@/context/tree-state.ts').TreeAction> }) {
  const handleToggle = useCallback(() => {
    dispatch({
      type: 'UPDATE_RESEARCH_STEP',
      stepId: step.id,
      status: step.status === 'complete' ? 'not_started' : 'complete',
    });
  }, [step.id, step.status, dispatch]);

  const impactColor = step.impact === 'high'
    ? 'text-tier4-text bg-tier4-bg'
    : step.impact === 'medium'
    ? 'text-tier3-text bg-tier3-bg'
    : 'text-text-dim bg-surface-2';

  return (
    <li className={`rounded border border-border bg-bg p-2.5 ${step.status === 'complete' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={step.status === 'complete'}
          onChange={handleToggle}
          className="mt-0.5 shrink-0 accent-gold"
        />
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${step.status === 'complete' ? 'line-through text-text-dim' : 'text-text-primary'}`}>
            {step.description}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs px-1.5 py-0.5 rounded ${impactColor}`}>
              {step.impact}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-text-dim">
              {step.origin === 'rule_based' ? 'Rule' : 'AI'}
            </span>
            {step.suggestedSource && (
              <span className="text-xs text-text-secondary">
                {step.suggestedUrl ? (
                  <a
                    href={step.suggestedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold hover:text-gold-light"
                  >
                    {step.suggestedSource}
                  </a>
                ) : (
                  step.suggestedSource
                )}
              </span>
            )}
          </div>
          {step.reasoning && (
            <p className="text-xs text-text-dim mt-1">{step.reasoning}</p>
          )}
        </div>
      </div>
    </li>
  );
}
