/**
 * Integration tests: AI flow — quick check, batch, and deep research state management.
 * Mocks the AI provider but tests real state transitions.
 */
import { describe, it, expect } from 'vitest';
import { treeReducer, initialTreeState } from '@/context/tree-state.ts';
import { makePerson, makeGraph, makeFlag, makeStats } from '@/test/test-utils.ts';
import type { QuickCheckResult, ValidationReport } from '@/types/ai.ts';
import type { TreeState } from '@/context/tree-state.ts';

function loadedState(): TreeState {
  const graph = makeGraph([
    makePerson({ id: 'p1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } }),
    makePerson({ id: 'p2', name: { full: 'Jane Doe', given: 'Jane', middle: '', surname: 'Doe', maidenName: '', prefix: '', suffix: '', raw: 'Jane /Doe/' } }),
  ]);
  const flags = [makeFlag({ id: 'f1', affectedPersonIds: ['p1'] })];

  let state = treeReducer(initialTreeState, {
    type: 'PARSE_SUCCESS',
    graph,
    stats: makeStats({ individualCount: 2 }),
  });
  state = treeReducer(state, { type: 'SET_FLAGS', flags });
  return state;
}

describe('AI flow integration', () => {
  it('quick check result stored and retrievable from state', () => {
    let state = loadedState();

    const qcResult: QuickCheckResult = {
      plausibility: 'plausible',
      issues: [],
      suggestedTier: 3,
      tierReason: 'Unsourced but plausible dates',
      quickWin: 'Check census records',
    };

    state = treeReducer(state, { type: 'SET_AI_QUICK_CHECK', personId: 'p1', result: qcResult });

    expect(state.aiQuickChecks.get('p1')).toBe(qcResult);
    expect(state.aiQuickChecks.get('p1')?.plausibility).toBe('plausible');
    expect(state.aiQuickChecks.get('p1')?.quickWin).toBe('Check census records');
  });

  it('batch progress updates accumulate correctly', () => {
    let state = loadedState();

    // First progress update
    state = treeReducer(state, {
      type: 'SET_BATCH_PROGRESS',
      progress: { scope: 'all_flagged', total: 2, completed: 1, failed: 0, estimatedCostUsd: 0.01, status: 'running', actualCostUsd: 0.001, startedAt: new Date() },
    });
    expect(state.aiBatchProgress?.completed).toBe(1);
    expect(state.aiBatchProgress?.status).toBe('running');

    // Second progress update
    state = treeReducer(state, {
      type: 'SET_BATCH_PROGRESS',
      progress: { scope: 'all_flagged', total: 2, completed: 2, failed: 0, estimatedCostUsd: 0.01, status: 'complete', actualCostUsd: 0.002, startedAt: new Date() },
    });
    expect(state.aiBatchProgress?.completed).toBe(2);
    expect(state.aiBatchProgress?.status).toBe('complete');
    expect(state.aiBatchProgress?.actualCostUsd).toBe(0.002);
  });

  it('validation report stored for person', () => {
    let state = loadedState();

    const report: ValidationReport = {
      personAssessment: { plausibility: 'plausible', summary: 'Likely valid based on records' },
      parentalLink: null,
      recordsFound: [],
      recordsExpectedButNotFound: [],
      dateDiscrepancies: [],
      suggestedTier: 2,
      nextStep: null,
    };

    state = treeReducer(state, { type: 'SET_AI_VALIDATION_REPORT', personId: 'p1', report });

    expect(state.aiValidationReports.get('p1')).toBe(report);
    expect(state.aiValidationReports.get('p1')?.personAssessment.plausibility).toBe('plausible');
  });

  it('deep research rounds append and can be cleared', () => {
    let state = loadedState();

    // Append round 1
    state = treeReducer(state, {
      type: 'APPEND_DEEP_RESEARCH_ROUND',
      personId: 'p1',
      round: {
        round: 1,
        searchesPerformed: ['birth records search'],
        findings: [{ type: 'new_lead', description: 'Found possible match in county records', url: null, sourceClass: null, relevantTo: 'birth' }],
        status: 'CONTINUE',
      },
    });

    const rounds1 = state.aiDeepResearchSessions.get('p1');
    expect(rounds1).toBeDefined();
    expect(rounds1).toHaveLength(1);
    expect(rounds1![0].round).toBe(1);

    // Append round 2
    state = treeReducer(state, {
      type: 'APPEND_DEEP_RESEARCH_ROUND',
      personId: 'p1',
      round: {
        round: 2,
        searchesPerformed: ['marriage records search'],
        findings: [{ type: 'confirmation', description: 'Marriage record found', url: 'http://example.com', sourceClass: 'primary', relevantTo: 'marriage' }],
        status: 'COMPLETE',
      },
    });

    const rounds2 = state.aiDeepResearchSessions.get('p1');
    expect(rounds2).toHaveLength(2);

    // Clear
    state = treeReducer(state, { type: 'CLEAR_DEEP_RESEARCH', personId: 'p1' });
    expect(state.aiDeepResearchSessions.has('p1')).toBe(false);
  });

  it('multiple persons can have independent AI results', () => {
    let state = loadedState();

    state = treeReducer(state, {
      type: 'SET_AI_QUICK_CHECK',
      personId: 'p1',
      result: { plausibility: 'plausible', issues: [], suggestedTier: 3, tierReason: 'ok', quickWin: null },
    });
    state = treeReducer(state, {
      type: 'SET_AI_QUICK_CHECK',
      personId: 'p2',
      result: { plausibility: 'implausible', issues: [{ type: 'date', description: 'Date impossible', correction: null }], suggestedTier: 4, tierReason: 'bad dates', quickWin: 'Fix dates' },
    });

    expect(state.aiQuickChecks.size).toBe(2);
    expect(state.aiQuickChecks.get('p1')?.plausibility).toBe('plausible');
    expect(state.aiQuickChecks.get('p2')?.plausibility).toBe('implausible');
  });

  it('ancestry conflicts and convergence points stored via reducer', () => {
    let state = loadedState();

    state = treeReducer(state, {
      type: 'SET_ANCESTRY_CONFLICTS',
      conflicts: [{
        personIdA: 'p1',
        personIdB: 'p2',
        pathA: { fatherId: 'fA', fatherName: 'Father A', motherId: null, motherName: null, grandparentCount: 0 },
        pathB: { fatherId: 'fB', fatherName: 'Father B', motherId: null, motherName: null, grandparentCount: 0 },
        conflictType: 'different_father',
        descendantsAffectedA: 1,
        descendantsAffectedB: 1,
        sharedDescendants: [],
        sourceCountA: 0,
        sourceCountB: 0,
        confidenceTierA: 4,
        confidenceTierB: 4,
      }],
    });

    expect(state.ancestryConflicts).toHaveLength(1);
    expect(state.ancestryConflicts[0].conflictType).toBe('different_father');

    state = treeReducer(state, {
      type: 'SET_CONVERGENCE_POINTS',
      points: [{
        ancestorId: 'p1',
        ancestorName: 'John Smith',
        paths: [],
        conflictDetected: false,
        divergenceGeneration: 3,
      }],
    });

    expect(state.convergencePoints).toHaveLength(1);
    expect(state.convergencePoints[0].ancestorName).toBe('John Smith');
  });
});
