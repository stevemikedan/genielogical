import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AncestryConflictCard } from './AncestryConflictCard.tsx';
import type { AncestryConflict } from '@/types/conflict.ts';

function makeConflict(overrides: Partial<AncestryConflict> = {}): AncestryConflict {
  return {
    personIdA: 'pA',
    personIdB: 'pB',
    pathA: { fatherId: 'fA', fatherName: 'Father A', motherId: 'mA', motherName: 'Mother A', grandparentCount: 2 },
    pathB: { fatherId: 'fB', fatherName: 'Father B', motherId: 'mB', motherName: 'Mother B', grandparentCount: 1 },
    conflictType: 'different_parents',
    descendantsAffectedA: 5,
    descendantsAffectedB: 3,
    sharedDescendants: ['d1'],
    sourceCountA: 2,
    sourceCountB: 0,
    confidenceTierA: 2,
    confidenceTierB: 4,
    ...overrides,
  };
}

describe('AncestryConflictCard', () => {
  it('returns null for empty conflicts array', () => {
    const { container } = render(<AncestryConflictCard conflicts={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows total conflict count', () => {
    render(<AncestryConflictCard conflicts={[makeConflict(), makeConflict()]} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows "Ancestry Conflicts" heading', () => {
    render(<AncestryConflictCard conflicts={[makeConflict()]} />);
    expect(screen.getByText('Ancestry Conflicts')).toBeInTheDocument();
  });

  it('shows critical count for different_parents type', () => {
    render(<AncestryConflictCard conflicts={[makeConflict({ conflictType: 'different_parents' })]} />);
    expect(screen.getByText('1 critical')).toBeInTheDocument();
  });

  it('shows warning count for non-critical type', () => {
    render(<AncestryConflictCard conflicts={[makeConflict({ conflictType: 'upstream_divergence' })]} />);
    expect(screen.getByText('1 warning')).toBeInTheDocument();
  });

  it('shows both critical and warning badges', () => {
    const conflicts = [
      makeConflict({ conflictType: 'different_father' }),
      makeConflict({ conflictType: 'upstream_divergence' }),
    ];
    render(<AncestryConflictCard conflicts={conflicts} />);
    expect(screen.getByText('1 critical')).toBeInTheDocument();
    expect(screen.getByText('1 warning')).toBeInTheDocument();
  });

  it('shows "View" buttons when onSelectPerson is provided', () => {
    const onSelect = vi.fn();
    render(<AncestryConflictCard conflicts={[makeConflict()]} onSelectPerson={onSelect} />);
    const viewButton = screen.getByText('View');
    expect(viewButton).toBeInTheDocument();
  });

  it('calls onSelectPerson when View is clicked', () => {
    const onSelect = vi.fn();
    render(<AncestryConflictCard conflicts={[makeConflict({ personIdA: 'person-1' })]} onSelectPerson={onSelect} />);
    fireEvent.click(screen.getByText('View'));
    expect(onSelect).toHaveBeenCalledWith('person-1');
  });

  it('limits displayed conflicts to 5', () => {
    const conflicts = Array.from({ length: 8 }, (_, i) =>
      makeConflict({ personIdA: `p${i}` }),
    );
    render(<AncestryConflictCard conflicts={conflicts} />);
    expect(screen.getByText('+3 more conflicts')).toBeInTheDocument();
  });

  it('does not show "more" text when 5 or fewer', () => {
    const conflicts = Array.from({ length: 5 }, (_, i) =>
      makeConflict({ personIdA: `p${i}` }),
    );
    render(<AncestryConflictCard conflicts={conflicts} />);
    expect(screen.queryByText(/more conflicts/)).not.toBeInTheDocument();
  });
});
