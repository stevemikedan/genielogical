import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportCatalog } from './ReportCatalog.tsx';

describe('ReportCatalog', () => {
  it('renders 3 report type cards', () => {
    render(<ReportCatalog onSelect={vi.fn()} />);
    expect(screen.getByText('Notable Women')).toBeInTheDocument();
    expect(screen.getByText('Notable Men')).toBeInTheDocument();
    expect(screen.getByText('Data Quality')).toBeInTheDocument();
  });

  it('renders "Reports" heading', () => {
    render(<ReportCatalog onSelect={vi.fn()} />);
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('calls onSelect with "notable_women" when card clicked', () => {
    const onSelect = vi.fn();
    render(<ReportCatalog onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Notable Women'));
    expect(onSelect).toHaveBeenCalledWith('notable_women');
  });

  it('calls onSelect with "notable_men" when card clicked', () => {
    const onSelect = vi.fn();
    render(<ReportCatalog onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Notable Men'));
    expect(onSelect).toHaveBeenCalledWith('notable_men');
  });

  it('calls onSelect with "data_quality" when card clicked', () => {
    const onSelect = vi.fn();
    render(<ReportCatalog onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Data Quality'));
    expect(onSelect).toHaveBeenCalledWith('data_quality');
  });

  it('renders descriptions for each card', () => {
    render(<ReportCatalog onSelect={vi.fn()} />);
    expect(screen.getByText(/queens, pioneers, and influential women/)).toBeInTheDocument();
    expect(screen.getByText(/kings, military officers, scholars/)).toBeInTheDocument();
    expect(screen.getByText(/missing dates, places, and sources/)).toBeInTheDocument();
  });
});
