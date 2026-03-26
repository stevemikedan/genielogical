import { useState } from 'react';
import type { Conjecture } from '@/types/conjecture.ts';
import type { TreeAction } from '@/context/tree-state.ts';

const STATUS_STYLES: Record<string, string> = {
  open: 'text-tier3',
  confirmed: 'text-tier1',
  disproven: 'text-tier4',
};

interface ConjectureSectionProps {
  conjectures: Conjecture[];
  personId: string;
  dispatch: React.Dispatch<TreeAction>;
}

export function ConjectureSection({ conjectures, personId, dispatch }: ConjectureSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [hypothesis, setHypothesis] = useState('');
  const [confidence, setConfidence] = useState(50);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hypothesis.trim()) return;

    const conjecture: Conjecture = {
      id: `conj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      personId,
      hypothesis: hypothesis.trim(),
      confidencePercent: confidence,
      supportingEvidence: '',
      contradictingEvidence: '',
      sourceIds: [],
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    dispatch({ type: 'ADD_CONJECTURE', conjecture });
    setHypothesis('');
    setConfidence(50);
    setShowForm(false);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
          Hypotheses ({conjectures.length})
        </h3>
        <button
          type="button"
          onClick={() => setShowForm(s => !s)}
          className="text-xs text-gold hover:text-gold-light transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="space-y-2 border border-border rounded p-2 bg-bg mb-2">
          <div>
            <label className="block text-xs text-text-dim mb-1">Hypothesis</label>
            <textarea
              value={hypothesis}
              onChange={e => setHypothesis(e.target.value)}
              rows={2}
              className="w-full bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary resize-y"
              placeholder="e.g., This person may be the same as..."
              required
            />
          </div>
          <div>
            <label className="block text-xs text-text-dim mb-1">Confidence: {confidence}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={confidence}
              onChange={e => setConfidence(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1 rounded bg-gold text-bg text-sm font-medium hover:bg-gold-light transition-colors"
          >
            Add Hypothesis
          </button>
        </form>
      )}

      {conjectures.length === 0 && !showForm && (
        <p className="text-xs text-text-dim">No hypotheses recorded.</p>
      )}

      {conjectures.length > 0 && (
        <div className="space-y-2">
          {conjectures.map(c => (
            <div key={c.id} className="border border-border rounded p-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-text-primary flex-1">{c.hypothesis}</p>
                <span className={`text-xs font-medium flex-shrink-0 ${STATUS_STYLES[c.status] ?? ''}`}>
                  {c.status}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-text-dim">
                <span>{c.confidencePercent}% confidence</span>
              </div>
              {c.status === 'open' && (
                <div className="flex gap-1 mt-2">
                  <button
                    type="button"
                    onClick={() => dispatch({
                      type: 'UPDATE_CONJECTURE',
                      conjectureId: c.id,
                      updates: { status: 'confirmed' },
                    })}
                    className="text-xs px-1.5 py-0.5 rounded border border-border text-text-secondary hover:text-tier1 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch({
                      type: 'UPDATE_CONJECTURE',
                      conjectureId: c.id,
                      updates: { status: 'disproven' },
                    })}
                    className="text-xs px-1.5 py-0.5 rounded border border-border text-text-secondary hover:text-tier4 transition-colors"
                  >
                    Disprove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
