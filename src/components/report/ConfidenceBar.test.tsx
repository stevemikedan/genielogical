import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfidenceBar } from './ConfidenceBar.tsx';

describe('ConfidenceBar', () => {
  it('renders correct percentage text', () => {
    render(<ConfidenceBar score={0.73} />);
    expect(screen.getByText('73%')).toBeInTheDocument();
  });

  it('renders correct bar width', () => {
    const { container } = render(<ConfidenceBar score={0.65} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '65%' });
  });

  it('applies tier 1 color for high scores', () => {
    const { container } = render(<ConfidenceBar score={0.85} />);
    const bar = container.querySelector('.bg-tier1');
    expect(bar).toBeInTheDocument();
  });

  it('applies tier 2 color for medium-high scores', () => {
    const { container } = render(<ConfidenceBar score={0.60} />);
    const bar = container.querySelector('.bg-tier2');
    expect(bar).toBeInTheDocument();
  });

  it('applies tier 3 color for medium-low scores', () => {
    const { container } = render(<ConfidenceBar score={0.35} />);
    const bar = container.querySelector('.bg-tier3');
    expect(bar).toBeInTheDocument();
  });

  it('applies tier 4 color for low scores', () => {
    const { container } = render(<ConfidenceBar score={0.10} />);
    const bar = container.querySelector('.bg-tier4');
    expect(bar).toBeInTheDocument();
  });

  it('handles 0% score', () => {
    const { container } = render(<ConfidenceBar score={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '0%' });
  });

  it('handles 100% score', () => {
    const { container } = render(<ConfidenceBar score={1} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '100%' });
  });

  it('clamps above 1', () => {
    render(<ConfidenceBar score={1.5} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('clamps below 0', () => {
    render(<ConfidenceBar score={-0.3} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    render(<ConfidenceBar score={0.5} label="Identity" />);
    expect(screen.getByText('Identity')).toBeInTheDocument();
  });

  it('does not render label when not provided', () => {
    render(<ConfidenceBar score={0.5} />);
    expect(screen.queryByText('Identity')).not.toBeInTheDocument();
  });

  it('hides value when showValue is false', () => {
    render(<ConfidenceBar score={0.73} showValue={false} />);
    expect(screen.queryByText('73%')).not.toBeInTheDocument();
  });

  it('overrides auto tier with explicit tier prop', () => {
    // Score 0.9 would auto-select tier 1, but force tier 4
    const { container } = render(<ConfidenceBar score={0.9} tier={4} />);
    const bar = container.querySelector('.bg-tier4');
    expect(bar).toBeInTheDocument();
  });
});
