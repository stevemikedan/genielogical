import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportCandidateCard } from './ReportCandidateCard.tsx';
import type { ReportCandidate } from '@/types/report.ts';
import { makePerson } from '@/test/test-utils.ts';

function makeCandidate(overrides: Partial<ReportCandidate> = {}): ReportCandidate {
  const person = makePerson({
    id: 'p1',
    name: { full: 'Queen Margaret', given: 'Margaret', surname: '' },
    birth: { date: { date: new Date('1045-01-01'), endDate: null, qualifier: 'about', raw: 'ABT 1045', year: 1045 }, place: null },
    death: { date: { date: new Date('1093-11-16'), endDate: null, qualifier: 'exact', raw: '16 NOV 1093', year: 1093 }, place: null },
  });
  return {
    personId: 'p1',
    person,
    section: 'direct_line',
    matchReasons: ['Title: Queen', 'Known figure match'],
    categories: ['royalty', 'clergy'],
    generationsFromRoot: 5,
    pathToRoot: [],
    personIdentityScore: 0.65,
    chainConfidence: 0.45,
    ancestralConfidence: 0.29,
    personTier: 2,
    weakestChainTier: 3,
    bridgeZones: [],
    aiNarrative: null,
    aiQuickCheck: null,
    ...overrides,
  };
}

describe('ReportCandidateCard', () => {
  const onSelectPerson = vi.fn();

  it('renders person name', () => {
    render(<ReportCandidateCard candidate={makeCandidate()} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('Queen Margaret')).toBeInTheDocument();
  });

  it('renders dates', () => {
    render(<ReportCandidateCard candidate={makeCandidate()} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('1045–1093')).toBeInTheDocument();
  });

  it('renders ancestral confidence percentage', () => {
    render(<ReportCandidateCard candidate={makeCandidate()} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('29%')).toBeInTheDocument();
  });

  it('renders category badges', () => {
    render(<ReportCandidateCard candidate={makeCandidate()} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('royalty')).toBeInTheDocument();
    expect(screen.getByText('clergy')).toBeInTheDocument();
  });

  it('renders generation badge', () => {
    render(<ReportCandidateCard candidate={makeCandidate()} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('Gen 5')).toBeInTheDocument();
  });

  it('renders section badge', () => {
    render(<ReportCandidateCard candidate={makeCandidate()} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('Direct line')).toBeInTheDocument();
  });

  it('renders confidence bars', () => {
    render(<ReportCandidateCard candidate={makeCandidate()} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('Identity')).toBeInTheDocument();
    expect(screen.getByText('Chain')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('renders match reasons', () => {
    render(<ReportCandidateCard candidate={makeCandidate()} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('Title: Queen · Known figure match')).toBeInTheDocument();
  });

  it('calls onSelectPerson when name clicked', () => {
    render(<ReportCandidateCard candidate={makeCandidate()} onSelectPerson={onSelectPerson} />);
    fireEvent.click(screen.getByText('Queen Margaret'));
    expect(onSelectPerson).toHaveBeenCalledWith('p1');
  });

  it('shows bridge zone warning when present', () => {
    const candidate = makeCandidate({
      bridgeZones: [
        { startPersonId: 'a', endPersonId: 'b', startGen: 5, endGen: 7, edgeCount: 2, averageTier: 4, description: '2 weak edges' },
      ],
    });
    render(<ReportCandidateCard candidate={candidate} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText(/1 bridge zone/)).toBeInTheDocument();
  });

  it('shows multiple bridge zone warning', () => {
    const candidate = makeCandidate({
      bridgeZones: [
        { startPersonId: 'a', endPersonId: 'b', startGen: 3, endGen: 5, edgeCount: 2, averageTier: 4, description: 'zone 1' },
        { startPersonId: 'c', endPersonId: 'd', startGen: 7, endGen: 9, edgeCount: 2, averageTier: 3, description: 'zone 2' },
      ],
    });
    render(<ReportCandidateCard candidate={candidate} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText(/2 bridge zones/)).toBeInTheDocument();
  });

  it('does not show bridge zone warning when none', () => {
    render(<ReportCandidateCard candidate={makeCandidate()} onSelectPerson={onSelectPerson} />);
    expect(screen.queryByText(/bridge zone/)).not.toBeInTheDocument();
  });

  it('shows expandable AI narrative when present', () => {
    const candidate = makeCandidate({ aiNarrative: 'Queen Margaret was a notable figure in medieval Scotland.' });
    render(<ReportCandidateCard candidate={candidate} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('▶ AI narrative')).toBeInTheDocument();
    expect(screen.queryByText(/Queen Margaret was a notable/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('▶ AI narrative'));
    expect(screen.getByText(/Queen Margaret was a notable/)).toBeInTheDocument();
    expect(screen.getByText('▼ Hide narrative')).toBeInTheDocument();
  });

  it('does not show AI narrative toggle when null', () => {
    render(<ReportCandidateCard candidate={makeCandidate()} onSelectPerson={onSelectPerson} />);
    expect(screen.queryByText(/AI narrative/)).not.toBeInTheDocument();
  });

  it('handles person with no dates', () => {
    const person = makePerson({ id: 'p1' });
    const candidate = makeCandidate({ person });
    render(<ReportCandidateCard candidate={candidate} onSelectPerson={onSelectPerson} />);
    expect(screen.getByText('Test Person')).toBeInTheDocument();
    expect(screen.queryByText('?–?')).not.toBeInTheDocument();
  });
});
