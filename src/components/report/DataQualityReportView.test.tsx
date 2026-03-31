import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataQualityReportView } from './DataQualityReportView.tsx';
import type { DataQualityReport, DataQualityCandidate } from '@/types/report.ts';
import { makePerson } from '@/test/test-utils.ts';

function makeDQCandidate(overrides: Partial<DataQualityCandidate> & { personId: string }): DataQualityCandidate {
  const person = makePerson({
    id: overrides.personId,
    name: { full: overrides.personId },
  });
  return {
    person,
    issues: [],
    qualityScore: 0.8,
    ...overrides,
  };
}

function makeDQReport(overrides: Partial<DataQualityReport> = {}): DataQualityReport {
  return {
    id: 'rpt-dq-1',
    config: {
      reportType: 'data_quality',
      scope: { mode: 'full_tree', rootPersonId: null, sexFilter: null, minConfidenceTier: null, generationRange: null },
      aiDepth: 'none',
    },
    generatedAt: new Date('2024-06-15'),
    rootPersonId: 'root',
    candidates: [
      makeDQCandidate({
        personId: 'Alice',
        qualityScore: 0.3,
        issues: [
          { type: 'missing_date', severity: 'warning', description: 'No birth date', suggestedFix: 'Add birth date' },
          { type: 'no_sources', severity: 'critical', description: 'No sources', suggestedFix: 'Add sources' },
        ],
      }),
      makeDQCandidate({
        personId: 'Bob',
        qualityScore: 0.7,
        issues: [
          { type: 'missing_place', severity: 'info', description: 'No birth place', suggestedFix: 'Add birth place' },
        ],
      }),
      makeDQCandidate({
        personId: 'Carol',
        qualityScore: 1.0,
        issues: [],
      }),
    ],
    methodology: {
      description: 'Quality analysis',
      personIdentityFactors: [],
      chainExplanation: '',
      tierDefinitions: [],
    },
    aggregateStats: {
      totalCandidates: 3,
      directLineCandidates: 0,
      historicalCandidates: 0,
      averageAncestralConfidence: 0,
      averagePersonIdentity: 0.67,
      sourceCoverage: 33,
      bridgeZoneCount: 0,
      duplicateSuspectCount: 0,
      byCategory: {},
      byTier: {},
    },
    status: 'complete',
    costUsd: 0,
    durationMs: 50,
    branchCoverage: [
      { branchLabel: 'Paternal', ancestorId: 'gf', ancestorName: 'Grandpa', totalPersons: 10, withSources: 3, coveragePercent: 30 },
      { branchLabel: 'Maternal', ancestorId: 'gm', ancestorName: 'Grandma', totalPersons: 8, withSources: 6, coveragePercent: 75 },
    ],
    dateQualityStats: { valid: 20, approximate: 5, missing: 10, impossible: 1 },
    placeQualityStats: { normalized: 15, raw_only: 5, missing: 10 },
    ...overrides,
  };
}

describe('DataQualityReportView', () => {
  const onSelectPerson = vi.fn();
  const onNewReport = vi.fn();

  it('renders heading', () => {
    render(<DataQualityReportView report={makeDQReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    expect(screen.getByText('Data Quality Dashboard')).toBeInTheDocument();
  });

  it('renders summary stats', () => {
    render(<DataQualityReportView report={makeDQReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    expect(screen.getByText('Date Quality')).toBeInTheDocument();
    expect(screen.getByText('57%')).toBeInTheDocument();
    expect(screen.getByText('Place Quality')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Source Coverage')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('renders branch coverage table', () => {
    render(<DataQualityReportView report={makeDQReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    expect(screen.getByText('Branch Coverage')).toBeInTheDocument();
    expect(screen.getByText('Paternal')).toBeInTheDocument();
    expect(screen.getByText('Maternal')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders persons with issues', () => {
    render(<DataQualityReportView report={makeDQReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Carol')).not.toBeInTheDocument();
  });

  it('shows issue badges', () => {
    render(<DataQualityReportView report={makeDQReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    expect(screen.getByText('missing date')).toBeInTheDocument();
    expect(screen.getByText('no sources')).toBeInTheDocument();
    expect(screen.getByText('missing place')).toBeInTheDocument();
  });

  it('calls onSelectPerson when person name clicked', () => {
    render(<DataQualityReportView report={makeDQReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    fireEvent.click(screen.getByText('Alice'));
    expect(onSelectPerson).toHaveBeenCalledWith('Alice');
  });

  it('calls onNewReport when New Report clicked', () => {
    render(<DataQualityReportView report={makeDQReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    fireEvent.click(screen.getByText('New Report'));
    expect(onNewReport).toHaveBeenCalled();
  });

  it('shows quality score for each person', () => {
    render(<DataQualityReportView report={makeDQReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    expect(screen.getByText('Quality: 30%')).toBeInTheDocument();
    expect(screen.getByText('Quality: 70%')).toBeInTheDocument();
  });

  it('hides branch coverage when empty', () => {
    render(<DataQualityReportView report={makeDQReport({ branchCoverage: [] })} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    expect(screen.queryByText('Branch Coverage')).not.toBeInTheDocument();
  });

  it('renders persons analyzed count', () => {
    render(<DataQualityReportView report={makeDQReport()} onSelectPerson={onSelectPerson} onNewReport={onNewReport} />);
    expect(screen.getByText('3 persons analyzed')).toBeInTheDocument();
  });
});
