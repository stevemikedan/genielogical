import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportView } from './ReportView.tsx';
import type { ReportResult, ReportCandidate } from '@/types/report.ts';
import { makePerson } from '@/test/test-utils.ts';

// Mock formatCost
vi.mock('@/ai/cost-estimator.ts', () => ({
  formatCost: (usd: number) => `$${usd.toFixed(2)}`,
}));

function makeCandidate(overrides: Partial<ReportCandidate> & { personId: string }): ReportCandidate {
  const person = makePerson({ id: overrides.personId, name: { full: overrides.personId, given: overrides.personId, surname: '' } });
  return {
    person,
    section: 'historical',
    matchReasons: ['pattern match'],
    categories: [],
    generationsFromRoot: 3,
    pathToRoot: [],
    personIdentityScore: 0.5,
    chainConfidence: 0.5,
    ancestralConfidence: 0.25,
    personTier: 2,
    weakestChainTier: 2,
    bridgeZones: [],
    aiNarrative: null,
    aiQuickCheck: null,
    ...overrides,
  };
}

function makeReport(overrides: Partial<ReportResult> = {}): ReportResult {
  return {
    id: 'rpt-1',
    config: {
      reportType: 'notable_women',
      scope: { mode: 'full_tree', rootPersonId: null, sexFilter: 'F', minConfidenceTier: null, generationRange: null },
      aiDepth: 'none',
    },
    generatedAt: new Date('2024-06-15'),
    rootPersonId: 'root',
    candidates: [
      makeCandidate({ personId: 'queen-alice', section: 'direct_line', ancestralConfidence: 0.7, generationsFromRoot: 2 }),
      makeCandidate({ personId: 'lady-beatrice', section: 'historical', ancestralConfidence: 0.4, generationsFromRoot: 5 }),
      makeCandidate({ personId: 'countess-carol', section: 'historical', ancestralConfidence: 0.2, generationsFromRoot: 8 }),
    ],
    methodology: {
      description: 'Test methodology',
      personIdentityFactors: ['Sources', 'Names'],
      chainExplanation: 'Chain test',
      tierDefinitions: ['Tier 1 = Documented'],
    },
    aggregateStats: {
      totalCandidates: 3,
      directLineCandidates: 1,
      historicalCandidates: 2,
      averageAncestralConfidence: 0.43,
      averagePersonIdentity: 0.5,
      sourceCoverage: 33,
      bridgeZoneCount: 0,
      duplicateSuspectCount: 0,
      byCategory: {},
      byTier: {},
    },
    status: 'complete',
    costUsd: 0,
    durationMs: 150,
    ...overrides,
  };
}

describe('ReportView', () => {
  const onSelectPerson = vi.fn();
  const onNewReport = vi.fn();

  it('renders report title', () => {
    render(<ReportView report={makeReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    expect(screen.getByText('Notable Women in Your Ancestry')).toBeInTheDocument();
  });

  it('renders correct number of candidate cards', () => {
    render(<ReportView report={makeReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    // All 3 candidates visible by default
    expect(screen.getByText('queen-alice')).toBeInTheDocument();
    expect(screen.getByText('lady-beatrice')).toBeInTheDocument();
    expect(screen.getByText('countess-carol')).toBeInTheDocument();
  });

  it('renders stat cards', () => {
    render(<ReportView report={makeReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    // Stat card labels are inside divs with specific class
    expect(screen.getByText('Avg Confidence')).toBeInTheDocument();
    expect(screen.getByText('Source Coverage')).toBeInTheDocument();
    // "Direct Line" and "Historical" appear in multiple places — check stat values
    expect(screen.getByText('1')).toBeInTheDocument(); // direct line count
    expect(screen.getByText('2')).toBeInTheDocument(); // historical count
  });

  it('filters to direct_line only', () => {
    render(<ReportView report={makeReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    // Filter buttons are the smaller ones in the filter bar
    const filterButtons = screen.getAllByRole('button');
    const directLineBtn = filterButtons.find(b => b.textContent === 'Direct Line' && b.classList.contains('px-3'));
    expect(directLineBtn).toBeDefined();
    fireEvent.click(directLineBtn!);
    expect(screen.getByText('queen-alice')).toBeInTheDocument();
    expect(screen.queryByText('lady-beatrice')).not.toBeInTheDocument();
    expect(screen.queryByText('countess-carol')).not.toBeInTheDocument();
  });

  it('filters to historical only', () => {
    render(<ReportView report={makeReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    const filterButtons = screen.getAllByRole('button');
    const historicalBtn = filterButtons.find(b => b.textContent === 'Historical' && b.classList.contains('px-3'));
    expect(historicalBtn).toBeDefined();
    fireEvent.click(historicalBtn!);
    expect(screen.queryByText('queen-alice')).not.toBeInTheDocument();
    expect(screen.getByText('lady-beatrice')).toBeInTheDocument();
    expect(screen.getByText('countess-carol')).toBeInTheDocument();
  });

  it('shows "No results" when filter matches nothing', () => {
    const report = makeReport({
      candidates: [makeCandidate({ personId: 'only-historical', section: 'historical' })],
    });
    render(<ReportView report={report} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    const filterButtons = screen.getAllByRole('button');
    const directLineBtn = filterButtons.find(b => b.textContent === 'Direct Line' && b.classList.contains('px-3'));
    fireEvent.click(directLineBtn!);
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('sorts by name', () => {
    render(<ReportView report={makeReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    fireEvent.change(screen.getByDisplayValue('Sort: Confidence'), { target: { value: 'name' } });
    // After sorting by name, countess-carol comes before lady-beatrice and queen-alice
    const cards = screen.getAllByText(/queen-alice|lady-beatrice|countess-carol/);
    expect(cards[0]).toHaveTextContent('countess-carol');
    expect(cards[1]).toHaveTextContent('lady-beatrice');
    expect(cards[2]).toHaveTextContent('queen-alice');
  });

  it('calls onNewReport when New Report clicked', () => {
    render(<ReportView report={makeReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    fireEvent.click(screen.getByText('New Report'));
    expect(onNewReport).toHaveBeenCalled();
  });

  it('shows cost when report has non-zero cost', () => {
    render(<ReportView report={makeReport({ costUsd: 0.15 })} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    expect(screen.getByText('Cost: $0.15')).toBeInTheDocument();
  });

  it('renders methodology toggle', () => {
    render(<ReportView report={makeReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    expect(screen.getByText('Methodology')).toBeInTheDocument();
  });

  it('renders empty candidates report', () => {
    const report = makeReport({ candidates: [], aggregateStats: { ...makeReport().aggregateStats, totalCandidates: 0 } });
    render(<ReportView report={report} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    expect(screen.getByText('No results')).toBeInTheDocument();
  });
});
