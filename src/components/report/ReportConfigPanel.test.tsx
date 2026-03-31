import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportConfigPanel } from './ReportConfigPanel.tsx';
import type { CostEstimate } from '@/types/ai.ts';

// Mock getApiKey — defaults to no key
vi.mock('@/ai/ai-client.ts', () => ({
  getApiKey: vi.fn(() => null),
  setApiKey: vi.fn(),
  clearApiKey: vi.fn(),
  testApiKey: vi.fn(),
  createClient: vi.fn(),
  sendMessage: vi.fn(),
}));

// Mock formatCost
vi.mock('@/ai/cost-estimator.ts', () => ({
  formatCost: (usd: number) => `$${usd.toFixed(4)}`,
}));

import { getApiKey } from '@/ai/ai-client.ts';

function makeEstimate(): { candidateCount: number; estimate: CostEstimate } {
  return {
    candidateCount: 12,
    estimate: {
      personCount: 12,
      estimatedInputTokens: 6000,
      estimatedOutputTokens: 3000,
      estimatedCostUsd: 0.036,
    },
  };
}

describe('ReportConfigPanel', () => {
  const defaultProps = {
    reportType: 'notable_women' as const,
    onGenerate: vi.fn(),
    onEstimate: vi.fn(() => makeEstimate()),
    onBack: vi.fn(),
    onOpenSettings: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders report title', () => {
    render(<ReportConfigPanel {...defaultProps} />);
    expect(screen.getByText('Notable Women Report')).toBeInTheDocument();
  });

  it('renders scope selector for notable reports', () => {
    render(<ReportConfigPanel {...defaultProps} />);
    expect(screen.getByText('Full tree')).toBeInTheDocument();
    expect(screen.getByText('Direct line')).toBeInTheDocument();
  });

  it('hides scope selector for data quality reports', () => {
    render(<ReportConfigPanel {...defaultProps} reportType="data_quality" />);
    expect(screen.queryByText('Full tree')).not.toBeInTheDocument();
    expect(screen.queryByText('Direct line')).not.toBeInTheDocument();
  });

  it('renders AI depth selector', () => {
    render(<ReportConfigPanel {...defaultProps} />);
    expect(screen.getByText('No AI')).toBeInTheDocument();
    expect(screen.getByText(/Quick check/)).toBeInTheDocument();
  });

  it('renders Estimate button', () => {
    render(<ReportConfigPanel {...defaultProps} />);
    expect(screen.getByText('Estimate')).toBeInTheDocument();
  });

  it('calls onBack when Back clicked', () => {
    render(<ReportConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('← Back'));
    expect(defaultProps.onBack).toHaveBeenCalled();
  });

  it('shows approval gate after Estimate clicked', () => {
    render(<ReportConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Estimate'));
    expect(defaultProps.onEstimate).toHaveBeenCalled();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Generate Report')).toBeInTheDocument();
  });

  it('calls onGenerate when Generate Report clicked', () => {
    render(<ReportConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Estimate'));
    fireEvent.click(screen.getByText('Generate Report'));
    expect(defaultProps.onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        reportType: 'notable_women',
        aiDepth: 'none',
        scope: expect.objectContaining({ sexFilter: 'F' }),
      })
    );
  });

  it('shows API key required when quick AI selected without key', () => {
    render(<ReportConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText(/Quick check/));
    expect(screen.getByText('API key required.')).toBeInTheDocument();
  });

  it('shows Configure AI link when onOpenSettings provided', () => {
    render(<ReportConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText(/Quick check/));
    expect(screen.getByText('Configure AI')).toBeInTheDocument();
  });

  it('disables Generate Report when AI selected without key', () => {
    render(<ReportConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText(/Quick check/));
    fireEvent.click(screen.getByText('Estimate'));
    const genButton = screen.getByText('Generate Report');
    expect(genButton).toBeDisabled();
  });

  it('shows Skip AI button when AI depth is quick', () => {
    render(<ReportConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText(/Quick check/));
    fireEvent.click(screen.getByText('Estimate'));
    expect(screen.getByText('Skip AI')).toBeInTheDocument();
  });

  it('does not show cost when AI depth is none', () => {
    render(<ReportConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Estimate'));
    expect(screen.queryByText('Estimated cost')).not.toBeInTheDocument();
  });

  it('shows cost when AI depth is quick and has key', () => {
    vi.mocked(getApiKey).mockReturnValue('test-key');
    render(<ReportConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText(/Quick check/));
    fireEvent.click(screen.getByText('Estimate'));
    expect(screen.getByText('Estimated cost')).toBeInTheDocument();
  });

  it('renders Notable Men title correctly', () => {
    render(<ReportConfigPanel {...defaultProps} reportType="notable_men" />);
    expect(screen.getByText('Notable Men Report')).toBeInTheDocument();
  });

  it('renders Data Quality title correctly', () => {
    render(<ReportConfigPanel {...defaultProps} reportType="data_quality" />);
    expect(screen.getByText('Data Quality Dashboard')).toBeInTheDocument();
  });
});
