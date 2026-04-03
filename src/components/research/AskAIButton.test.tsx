import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AskAIButton } from './AskAIButton.tsx';

// Mock ai-client
vi.mock('@/ai/ai-client.ts', () => ({
  getApiKey: vi.fn().mockReturnValue('test-key'),
}));

// Mock cost-estimator
vi.mock('@/ai/cost-estimator.ts', () => ({
  estimateQuickCheckCost: vi.fn(() => ({ estimatedCostUsd: 0.001 })),
  estimateValidationCost: vi.fn(() => ({ estimatedCostUsd: 0.01 })),
  estimateDeepResearchCost: vi.fn(() => ({ estimatedCostUsd: 0.05 })),
  formatCost: vi.fn((v: number) => `$${v.toFixed(3)}`),
}));

import { getApiKey } from '@/ai/ai-client.ts';

describe('AskAIButton', () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiKey).mockReturnValue('test-key');
  });

  it('renders "Ask AI" button', () => {
    render(<AskAIButton onSelect={onSelect} />);
    expect(screen.getByText('Ask AI')).toBeInTheDocument();
  });

  it('shows dropdown on click', () => {
    render(<AskAIButton onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Ask AI'));
    expect(screen.getByText('Quick Check')).toBeInTheDocument();
    expect(screen.getByText('Validate')).toBeInTheDocument();
    expect(screen.getByText('Deep Research')).toBeInTheDocument();
  });

  it('shows 3 mode options', () => {
    render(<AskAIButton onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Ask AI'));
    expect(screen.getByText('Plausibility scan (~2s)')).toBeInTheDocument();
    expect(screen.getByText('Web search + report (~15s)')).toBeInTheDocument();
    expect(screen.getByText('Multi-round investigation (~60s)')).toBeInTheDocument();
  });

  it('calls onSelect with mode when option clicked', () => {
    render(<AskAIButton onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Ask AI'));
    fireEvent.click(screen.getByText('Quick Check'));
    expect(onSelect).toHaveBeenCalledWith('quick');
  });

  it('closes dropdown after selection', () => {
    render(<AskAIButton onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Ask AI'));
    fireEvent.click(screen.getByText('Validate'));
    expect(screen.queryByText('Plausibility scan (~2s)')).not.toBeInTheDocument();
  });

  it('shows cost estimates', () => {
    render(<AskAIButton onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Ask AI'));
    expect(screen.getByText('$0.001')).toBeInTheDocument();
    expect(screen.getByText('$0.010')).toBeInTheDocument();
    expect(screen.getByText('$0.050')).toBeInTheDocument();
  });

  it('disables button when no API key', () => {
    vi.mocked(getApiKey).mockReturnValue(null);
    render(<AskAIButton onSelect={onSelect} />);
    const button = screen.getByText('Ask AI').closest('button');
    expect(button).toBeDisabled();
  });

  it('shows loading state', () => {
    render(<AskAIButton onSelect={onSelect} loading />);
    expect(screen.getByText('Working...')).toBeInTheDocument();
    expect(screen.queryByText('Ask AI')).not.toBeInTheDocument();
  });
});
