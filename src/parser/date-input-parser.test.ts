import { describe, it, expect } from 'vitest';
import { parseDateInput } from './date-input-parser.ts';

describe('parseDateInput', () => {
  describe('exact dates', () => {
    it('parses "15 Mar 1842"', () => {
      const result = parseDateInput('15 Mar 1842');
      expect(result.qualifier).toBe('exact');
      expect(result.year).toBe(1842);
      expect(result.date?.getUTCMonth()).toBe(2); // March = 2
      expect(result.date?.getUTCDate()).toBe(15);
    });

    it('parses "March 15 1842"', () => {
      const result = parseDateInput('March 15 1842');
      expect(result.qualifier).toBe('exact');
      expect(result.year).toBe(1842);
      expect(result.date?.getUTCDate()).toBe(15);
    });

    it('parses year only "1842"', () => {
      const result = parseDateInput('1842');
      expect(result.qualifier).toBe('exact');
      expect(result.year).toBe(1842);
    });

    it('parses "Mar 1842"', () => {
      const result = parseDateInput('Mar 1842');
      expect(result.qualifier).toBe('exact');
      expect(result.year).toBe(1842);
      expect(result.date?.getUTCMonth()).toBe(2);
    });

    it('parses ISO format "1842-03-15"', () => {
      const result = parseDateInput('1842-03-15');
      expect(result.qualifier).toBe('exact');
      expect(result.year).toBe(1842);
      expect(result.date?.getUTCMonth()).toBe(2);
      expect(result.date?.getUTCDate()).toBe(15);
    });

    it('parses US format "3/15/1842"', () => {
      const result = parseDateInput('3/15/1842');
      expect(result.qualifier).toBe('exact');
      expect(result.year).toBe(1842);
      expect(result.date?.getUTCMonth()).toBe(2);
      expect(result.date?.getUTCDate()).toBe(15);
    });
  });

  describe('qualified dates', () => {
    it('parses "about 1840"', () => {
      const result = parseDateInput('about 1840');
      expect(result.qualifier).toBe('about');
      expect(result.year).toBe(1840);
    });

    it('parses "abt 1750"', () => {
      const result = parseDateInput('abt 1750');
      expect(result.qualifier).toBe('about');
      expect(result.year).toBe(1750);
    });

    it('parses "circa 1650"', () => {
      const result = parseDateInput('circa 1650');
      expect(result.qualifier).toBe('about');
      expect(result.year).toBe(1650);
    });

    it('parses "~1700"', () => {
      const result = parseDateInput('~1700');
      expect(result.qualifier).toBe('about');
      expect(result.year).toBe(1700);
    });

    it('parses "before 1900"', () => {
      const result = parseDateInput('before 1900');
      expect(result.qualifier).toBe('before');
      expect(result.year).toBe(1900);
    });

    it('parses "after 1600"', () => {
      const result = parseDateInput('after 1600');
      expect(result.qualifier).toBe('after');
      expect(result.year).toBe(1600);
    });

    it('parses "est 1800"', () => {
      const result = parseDateInput('est 1800');
      expect(result.qualifier).toBe('estimated');
      expect(result.year).toBe(1800);
    });
  });

  describe('range dates', () => {
    it('parses "between 1800 and 1810"', () => {
      const result = parseDateInput('between 1800 and 1810');
      expect(result.qualifier).toBe('between');
      expect(result.year).toBe(1800);
      expect(result.endDate).not.toBeNull();
    });

    it('parses "1627 or 1628"', () => {
      const result = parseDateInput('1627 or 1628');
      expect(result.qualifier).toBe('between');
      expect(result.year).toBe(1627);
      expect(result.endDate).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns unknown for empty string', () => {
      const result = parseDateInput('');
      expect(result.qualifier).toBe('unknown');
      expect(result.date).toBeNull();
      expect(result.year).toBeNull();
    });

    it('returns unknown for whitespace', () => {
      const result = parseDateInput('   ');
      expect(result.qualifier).toBe('unknown');
    });

    it('preserves raw input', () => {
      const result = parseDateInput('about 1840');
      expect(result.raw).toBe('about 1840');
    });

    it('handles "September 1842"', () => {
      const result = parseDateInput('September 1842');
      expect(result.year).toBe(1842);
      expect(result.date?.getUTCMonth()).toBe(8);
    });
  });
});
