import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthDashboard } from './HealthDashboard.tsx';
import { makeGraph, makePerson, makeFlag } from '@/test/test-utils.ts';

describe('HealthDashboard', () => {
  const onSelectPerson = vi.fn();

  it('renders "Tree Health" heading', () => {
    const graph = makeGraph();
    render(<HealthDashboard graph={graph} flags={[]} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('Tree Health')).toBeInTheDocument();
  });

  it('shows issue count (plural)', () => {
    const graph = makeGraph();
    const flags = [
      makeFlag({ id: 'f1', category: 'chronological', severity: 'warning' }),
      makeFlag({ id: 'f2', category: 'source_desert', severity: 'info' }),
    ];
    render(<HealthDashboard graph={graph} flags={flags} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('2 issues detected')).toBeInTheDocument();
  });

  it('shows singular "issue" for 1 flag', () => {
    const graph = makeGraph();
    const flags = [makeFlag({ id: 'f1', category: 'chronological', severity: 'critical' })];
    render(<HealthDashboard graph={graph} flags={flags} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('1 issue detected')).toBeInTheDocument();
  });

  it('shows "0 issues detected" when no flags', () => {
    const graph = makeGraph();
    render(<HealthDashboard graph={graph} flags={[]} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('0 issues detected')).toBeInTheDocument();
  });

  it('renders SummaryCards section', () => {
    const graph = makeGraph([makePerson({ id: 'p1' }), makePerson({ id: 'p2' })]);
    render(<HealthDashboard graph={graph} flags={[]} onSelectPerson={onSelectPerson} />);
    // SummaryCards renders "People" label
    expect(screen.getByText('People')).toBeInTheDocument();
  });

  it('does not render AncestryConflictCard when no conflicts', () => {
    const graph = makeGraph();
    render(<HealthDashboard graph={graph} flags={[]} onSelectPerson={onSelectPerson} />);
    expect(screen.queryByText('Ancestry Conflicts')).not.toBeInTheDocument();
  });

  it('does not render AncestryConflictCard when ancestryConflicts is undefined', () => {
    const graph = makeGraph();
    render(<HealthDashboard graph={graph} flags={[]} onSelectPerson={onSelectPerson} />);
    expect(screen.queryByText('Ancestry Conflicts')).not.toBeInTheDocument();
  });

  it('renders AncestryConflictCard when conflicts exist', () => {
    const graph = makeGraph();
    const conflicts = [{
      personIdA: 'p1',
      personIdB: 'p2',
      pathA: { fatherId: 'f1', fatherName: 'Father A', motherId: null, motherName: null, grandparentCount: 0 },
      pathB: { fatherId: 'f2', fatherName: 'Father B', motherId: null, motherName: null, grandparentCount: 0 },
      conflictType: 'different_father' as const,
      descendantsAffectedA: 1,
      descendantsAffectedB: 1,
      sharedDescendants: ['d1'],
      sourceCountA: 1,
      sourceCountB: 0,
      confidenceTierA: 2,
      confidenceTierB: 4,
    }];
    render(<HealthDashboard graph={graph} flags={[]} ancestryConflicts={conflicts} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('Ancestry Conflicts')).toBeInTheDocument();
  });

  it('renders summary card values', () => {
    const graph = makeGraph([makePerson({ id: 'p1' }), makePerson({ id: 'p2' })]);
    const flags = [
      makeFlag({ id: 'f1', severity: 'critical' }),
      makeFlag({ id: 'f2', severity: 'warning' }),
      makeFlag({ id: 'f3', severity: 'info' }),
    ];
    render(<HealthDashboard graph={graph} flags={flags} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('Critical Issues')).toBeInTheDocument();
    expect(screen.getByText('Warnings')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();
  });
});
