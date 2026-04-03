import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BatchValidationPanel } from './BatchValidationPanel.tsx';
import { makePerson, makeFlag, makeGraph } from '@/test/test-utils.ts';

// Mock ai-client
vi.mock('@/ai/ai-client.ts', () => ({
  getApiKey: vi.fn().mockReturnValue('test-key'),
}));

// Mock batch-runner
vi.mock('@/ai/batch-runner.ts', () => ({
  runBatchQuickCheck: vi.fn(),
}));

// Mock cost-estimator
vi.mock('@/ai/cost-estimator.ts', () => ({
  estimateQuickCheckCost: vi.fn((n: number) => ({ personCount: n, estimatedCostUsd: n * 0.001 })),
}));

// Mock useTree
const mockGraph = makeGraph([
  makePerson({ id: 'p1', confidenceTier: 4 }),
  makePerson({ id: 'p2', confidenceTier: 2 }),
  makePerson({ id: 'p3', confidenceTier: 3 }),
]);

const mockState = {
  graph: mockGraph,
  flags: [
    makeFlag({ id: 'f1', affectedPersonIds: ['p1'] }),
    makeFlag({ id: 'f2', affectedPersonIds: ['p2'] }),
  ],
};

vi.mock('@/hooks/use-tree.ts', () => ({
  useTree: () => ({ state: mockState, dispatch: vi.fn() }),
}));

import { getApiKey } from '@/ai/ai-client.ts';

describe('BatchValidationPanel', () => {
  const onOpenSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiKey).mockReturnValue('test-key');
  });

  it('renders heading', () => {
    render(<BatchValidationPanel onOpenSettings={onOpenSettings} />);
    expect(screen.getByText('Batch AI Quick Check')).toBeInTheDocument();
  });

  it('shows scope selector', () => {
    render(<BatchValidationPanel onOpenSettings={onOpenSettings} />);
    expect(screen.getByText('Scope:')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All Flagged')).toBeInTheDocument();
  });

  it('shows "Estimate Cost" button when API key present', () => {
    render(<BatchValidationPanel onOpenSettings={onOpenSettings} />);
    expect(screen.getByText('Estimate Cost')).toBeInTheDocument();
  });

  it('shows "Configure your API key" when no key', () => {
    vi.mocked(getApiKey).mockReturnValue(null);
    render(<BatchValidationPanel onOpenSettings={onOpenSettings} />);
    expect(screen.getByText('Configure your API key')).toBeInTheDocument();
  });

  it('calls onOpenSettings when configure link clicked', () => {
    vi.mocked(getApiKey).mockReturnValue(null);
    render(<BatchValidationPanel onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByText('Configure your API key'));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('shows cost estimate after clicking Estimate Cost', () => {
    render(<BatchValidationPanel onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByText('Estimate Cost'));
    expect(screen.getByText('Start Quick Check')).toBeInTheDocument();
  });

  it('has scope options', () => {
    render(<BatchValidationPanel onOpenSettings={onOpenSettings} />);
    const select = screen.getByDisplayValue('All Flagged');
    expect(select).toBeInTheDocument();
    // Check options exist in the select
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(3);
  });

  it('shows cancel button in confirm dialog', () => {
    render(<BatchValidationPanel onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByText('Estimate Cost'));
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('closes confirm dialog on cancel', () => {
    render(<BatchValidationPanel onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByText('Estimate Cost'));
    expect(screen.getByText('Start Quick Check')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Start Quick Check')).not.toBeInTheDocument();
  });
});
