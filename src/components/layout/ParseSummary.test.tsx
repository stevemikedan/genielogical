import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParseSummary } from './ParseSummary.tsx';
import type { ParseStats } from '@/types/index.ts';

function createMockStats(overrides: Partial<ParseStats> = {}): ParseStats {
  return {
    individualCount: 5720,
    familyCount: 1956,
    sourceCount: 5,
    edgeCount: 3000,
    generationCount: 19,
    parseTimeMs: 1234,
    gedcomVersion: '5.5.1',
    charset: 'UTF-8',
    software: 'Ancestry.com Family Trees',
    warningCount: 15,
    errorCount: 0,
    ...overrides,
  };
}

describe('ParseSummary', () => {
  describe('stat cards', () => {
    it('renders all stat cards', () => {
      const stats = createMockStats();
      render(<ParseSummary stats={stats} />);

      expect(screen.getByText('Individuals')).toBeInTheDocument();
      expect(screen.getByText('Families')).toBeInTheDocument();
      expect(screen.getByText('Sources')).toBeInTheDocument();
      expect(screen.getByText('Generations')).toBeInTheDocument();
      expect(screen.getByText('Parse Time')).toBeInTheDocument();
    });

    it('formats large numbers with toLocaleString', () => {
      const stats = createMockStats();
      render(<ParseSummary stats={stats} />);

      // 5720 formatted with toLocaleString will use locale-specific separator
      // In most locales it would be "5,720"
      const formatted = (5720).toLocaleString();
      expect(screen.getByText(formatted)).toBeInTheDocument();

      const familiesFormatted = (1956).toLocaleString();
      expect(screen.getByText(familiesFormatted)).toBeInTheDocument();
    });

    it('displays generation count', () => {
      const stats = createMockStats({ generationCount: 19 });
      render(<ParseSummary stats={stats} />);

      expect(screen.getByText('19')).toBeInTheDocument();
    });

    it('formats parse time as seconds', () => {
      const stats = createMockStats({ parseTimeMs: 1234 });
      render(<ParseSummary stats={stats} />);

      // 1234ms -> 1.23s
      expect(screen.getByText('1.23s')).toBeInTheDocument();
    });

    it('formats sub-second parse time correctly', () => {
      const stats = createMockStats({ parseTimeMs: 42 });
      render(<ParseSummary stats={stats} />);

      // 42ms -> 0.04s
      expect(screen.getByText('0.04s')).toBeInTheDocument();
    });
  });

  describe('heading', () => {
    it('renders the Parse Summary heading', () => {
      const stats = createMockStats();
      render(<ParseSummary stats={stats} />);

      expect(screen.getByText('Parse Summary')).toBeInTheDocument();
    });
  });

  describe('errors and warnings', () => {
    it('shows warning count when > 0', () => {
      const stats = createMockStats({ warningCount: 15 });
      render(<ParseSummary stats={stats} />);

      expect(screen.getByText('15 warnings')).toBeInTheDocument();
    });

    it('shows error count when > 0', () => {
      const stats = createMockStats({ errorCount: 3 });
      render(<ParseSummary stats={stats} />);

      expect(screen.getByText('3 errors')).toBeInTheDocument();
    });

    it('uses singular "error" for count of 1', () => {
      const stats = createMockStats({ errorCount: 1 });
      render(<ParseSummary stats={stats} />);

      expect(screen.getByText('1 error')).toBeInTheDocument();
    });

    it('uses singular "warning" for count of 1', () => {
      const stats = createMockStats({ warningCount: 1 });
      render(<ParseSummary stats={stats} />);

      expect(screen.getByText('1 warning')).toBeInTheDocument();
    });

    it('shows both errors and warnings when both > 0', () => {
      const stats = createMockStats({ errorCount: 2, warningCount: 5 });
      render(<ParseSummary stats={stats} />);

      expect(screen.getByText('2 errors')).toBeInTheDocument();
      expect(screen.getByText('5 warnings')).toBeInTheDocument();
    });

    it('hides error/warning section when both are 0', () => {
      const stats = createMockStats({ warningCount: 0, errorCount: 0 });
      render(<ParseSummary stats={stats} />);

      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/warning/i)).not.toBeInTheDocument();
    });
  });

  describe('software info', () => {
    it('shows software info when available', () => {
      const stats = createMockStats({ software: 'Ancestry.com Family Trees' });
      render(<ParseSummary stats={stats} />);

      expect(screen.getByText(/Exported from Ancestry\.com Family Trees/)).toBeInTheDocument();
    });

    it('shows GEDCOM version alongside software', () => {
      const stats = createMockStats({ software: 'Ancestry.com Family Trees', gedcomVersion: '5.5.1' });
      render(<ParseSummary stats={stats} />);

      expect(screen.getByText(/GEDCOM 5\.5\.1/)).toBeInTheDocument();
    });

    it('hides software info when software is null', () => {
      const stats = createMockStats({ software: null });
      render(<ParseSummary stats={stats} />);

      expect(screen.queryByText(/Exported from/)).not.toBeInTheDocument();
    });

    it('shows software without version when gedcomVersion is null', () => {
      const stats = createMockStats({ software: 'TestApp', gedcomVersion: null });
      render(<ParseSummary stats={stats} />);

      expect(screen.getByText('Exported from TestApp')).toBeInTheDocument();
      expect(screen.queryByText(/GEDCOM/)).not.toBeInTheDocument();
    });
  });
});
