import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConflictResolutionSection } from './ConflictResolutionSection.tsx';
import type { AncestryConflict } from '@/types/conflict.ts';

// Mock useTree hook
const mockState = {
  ancestryConflicts: [] as AncestryConflict[],
};

vi.mock('@/hooks/use-tree.ts', () => ({
  useTree: () => ({ state: mockState, dispatch: vi.fn() }),
}));

function makeConflict(overrides: Partial<AncestryConflict> = {}): AncestryConflict {
  return {
    personIdA: 'person-1',
    personIdB: 'person-2',
    pathA: { fatherId: 'fA', fatherName: 'John Sr', motherId: 'mA', motherName: 'Jane', grandparentCount: 2 },
    pathB: { fatherId: 'fB', fatherName: 'James', motherId: 'mB', motherName: 'Mary', grandparentCount: 1 },
    conflictType: 'different_parents',
    descendantsAffectedA: 3,
    descendantsAffectedB: 2,
    sharedDescendants: ['d1'],
    sourceCountA: 2,
    sourceCountB: 1,
    confidenceTierA: 2,
    confidenceTierB: 3,
    ...overrides,
  };
}

describe('ConflictResolutionSection', () => {
  beforeEach(() => {
    mockState.ancestryConflicts = [];
  });

  it('renders nothing when no conflicts match personId', () => {
    mockState.ancestryConflicts = [makeConflict({ personIdA: 'other', personIdB: 'another' })];
    const { container } = render(<ConflictResolutionSection personId="person-1" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when personId matches personIdA', () => {
    mockState.ancestryConflicts = [makeConflict({ personIdA: 'person-1' })];
    render(<ConflictResolutionSection personId="person-1" />);
    expect(screen.getByText('Ancestry Conflicts (1)')).toBeInTheDocument();
  });

  it('renders when personId matches personIdB', () => {
    mockState.ancestryConflicts = [makeConflict({ personIdB: 'person-1' })];
    render(<ConflictResolutionSection personId="person-1" />);
    expect(screen.getByText('Ancestry Conflicts (1)')).toBeInTheDocument();
  });

  it('shows conflict type badge', () => {
    mockState.ancestryConflicts = [makeConflict({ personIdA: 'p1', conflictType: 'different_father' })];
    render(<ConflictResolutionSection personId="p1" />);
    expect(screen.getByText('Different Father')).toBeInTheDocument();
  });

  it('shows shared descendants count', () => {
    mockState.ancestryConflicts = [makeConflict({ personIdA: 'p1', sharedDescendants: ['d1', 'd2'] })];
    render(<ConflictResolutionSection personId="p1" />);
    expect(screen.getByText('2 shared descendants')).toBeInTheDocument();
  });

  it('shows singular "descendant" for 1', () => {
    mockState.ancestryConflicts = [makeConflict({ personIdA: 'p1', sharedDescendants: ['d1'] })];
    render(<ConflictResolutionSection personId="p1" />);
    expect(screen.getByText('1 shared descendant')).toBeInTheDocument();
  });

  it('shows Version A and Version B panels', () => {
    mockState.ancestryConflicts = [makeConflict({ personIdA: 'p1' })];
    render(<ConflictResolutionSection personId="p1" />);
    expect(screen.getByText('Version A')).toBeInTheDocument();
    expect(screen.getByText('Version B')).toBeInTheDocument();
  });

  it('shows father and mother names in version panels', () => {
    mockState.ancestryConflicts = [makeConflict({ personIdA: 'p1' })];
    render(<ConflictResolutionSection personId="p1" />);
    expect(screen.getByText('John Sr')).toBeInTheDocument();
    expect(screen.getByText('James')).toBeInTheDocument();
  });

  it('shows source counts and tiers', () => {
    mockState.ancestryConflicts = [makeConflict({ personIdA: 'p1', sourceCountA: 2, confidenceTierA: 2 })];
    render(<ConflictResolutionSection personId="p1" />);
    expect(screen.getByText('2 sources | Tier 2')).toBeInTheDocument();
  });

  it('shows "View other version" button with onNavigate', () => {
    const onNavigate = vi.fn();
    mockState.ancestryConflicts = [makeConflict({ personIdA: 'p1', personIdB: 'p2' })];
    render(<ConflictResolutionSection personId="p1" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('View other version'));
    expect(onNavigate).toHaveBeenCalledWith('p2');
  });

  it('navigates to personIdA when current is personIdB', () => {
    const onNavigate = vi.fn();
    mockState.ancestryConflicts = [makeConflict({ personIdA: 'pA', personIdB: 'pB' })];
    render(<ConflictResolutionSection personId="pB" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('View other version'));
    expect(onNavigate).toHaveBeenCalledWith('pA');
  });
});
