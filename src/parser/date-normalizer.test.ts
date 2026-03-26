import { describe, it, expect } from 'vitest';
import { parseGedcomDate } from './date-normalizer.ts';

describe('parseGedcomDate', () => {
  describe('standard dates', () => {
    it('should parse "10 Apr 1990" (day month year)', () => {
      const result = parseGedcomDate('10 Apr 1990');
      expect(result.qualifier).toBe('exact');
      expect(result.year).toBe(1990);
      expect(result.date).not.toBeNull();
      expect(result.date!.getUTCFullYear()).toBe(1990);
      expect(result.date!.getUTCMonth()).toBe(3); // April = 3
      expect(result.date!.getUTCDate()).toBe(10);
    });

    it('should parse "Apr 1990" (month year)', () => {
      const result = parseGedcomDate('Apr 1990');
      expect(result.qualifier).toBe('exact');
      expect(result.year).toBe(1990);
      expect(result.date!.getUTCMonth()).toBe(3);
    });

    it('should parse "1800" (year only)', () => {
      const result = parseGedcomDate('1800');
      expect(result.qualifier).toBe('exact');
      expect(result.year).toBe(1800);
      expect(result.date!.getUTCFullYear()).toBe(1800);
    });

    it('should parse full month names like "10 April 1990"', () => {
      const result = parseGedcomDate('10 April 1990');
      expect(result.year).toBe(1990);
      expect(result.date!.getUTCMonth()).toBe(3);
      expect(result.date!.getUTCDate()).toBe(10);
    });

    it('should parse "25 DEC 1800" (uppercase GEDCOM months)', () => {
      const result = parseGedcomDate('25 DEC 1800');
      expect(result.year).toBe(1800);
      expect(result.date!.getUTCMonth()).toBe(11);
      expect(result.date!.getUTCDate()).toBe(25);
    });
  });

  describe('qualifiers', () => {
    it('should parse "ABT 1750"', () => {
      const result = parseGedcomDate('ABT 1750');
      expect(result.qualifier).toBe('about');
      expect(result.year).toBe(1750);
    });

    it('should parse "BEF 1900"', () => {
      const result = parseGedcomDate('BEF 1900');
      expect(result.qualifier).toBe('before');
      expect(result.year).toBe(1900);
    });

    it('should parse "AFT 1600"', () => {
      const result = parseGedcomDate('AFT 1600');
      expect(result.qualifier).toBe('after');
      expect(result.year).toBe(1600);
    });

    it('should parse "BET 1700 AND 1750"', () => {
      const result = parseGedcomDate('BET 1700 AND 1750');
      expect(result.qualifier).toBe('between');
      expect(result.year).toBe(1700);
      expect(result.date!.getUTCFullYear()).toBe(1700);
      expect(result.endDate).not.toBeNull();
      expect(result.endDate!.getUTCFullYear()).toBe(1750);
    });

    it('should parse "CAL 1800"', () => {
      const result = parseGedcomDate('CAL 1800');
      expect(result.qualifier).toBe('calculated');
      expect(result.year).toBe(1800);
    });

    it('should parse "EST 1800"', () => {
      const result = parseGedcomDate('EST 1800');
      expect(result.qualifier).toBe('estimated');
      expect(result.year).toBe(1800);
    });

    it('should parse "BET 10 MAR 1700 AND 15 JUN 1750"', () => {
      const result = parseGedcomDate('BET 10 MAR 1700 AND 15 JUN 1750');
      expect(result.qualifier).toBe('between');
      expect(result.date!.getUTCFullYear()).toBe(1700);
      expect(result.date!.getUTCMonth()).toBe(2); // March
      expect(result.endDate!.getUTCFullYear()).toBe(1750);
      expect(result.endDate!.getUTCMonth()).toBe(5); // June
    });
  });

  describe('French months', () => {
    it('should parse "9 Juin 1600"', () => {
      const result = parseGedcomDate('9 Juin 1600');
      expect(result.year).toBe(1600);
      expect(result.date!.getUTCMonth()).toBe(5); // June
      expect(result.date!.getUTCDate()).toBe(9);
    });

    it('should parse "21 Juillet 1654"', () => {
      const result = parseGedcomDate('21 Juillet 1654');
      expect(result.year).toBe(1654);
      expect(result.date!.getUTCMonth()).toBe(6); // July
    });

    it('should parse "Février" as month-only (no year = unparseable)', () => {
      const result = parseGedcomDate('Février');
      // Single token that isn't a year
      expect(result.year).toBeNull();
    });

    it('should parse "Août 1700" (accented French month)', () => {
      const result = parseGedcomDate('Août 1700');
      expect(result.year).toBe(1700);
      expect(result.date!.getUTCMonth()).toBe(7); // August
    });
  });

  describe('reversed dates', () => {
    it('should parse "1962 May 18"', () => {
      const result = parseGedcomDate('1962 May 18');
      expect(result.year).toBe(1962);
      expect(result.date!.getUTCMonth()).toBe(4); // May
      expect(result.date!.getUTCDate()).toBe(18);
    });

    it('should parse "1963 January 12"', () => {
      const result = parseGedcomDate('1963 January 12');
      expect(result.year).toBe(1963);
      expect(result.date!.getUTCMonth()).toBe(0); // January
      expect(result.date!.getUTCDate()).toBe(12);
    });
  });

  describe('non-standard formats', () => {
    it('should parse "Abt." as about qualifier', () => {
      const result = parseGedcomDate('Abt. 1700');
      expect(result.qualifier).toBe('about');
      expect(result.year).toBe(1700);
    });

    it('should parse "1627 or 1628" as between', () => {
      const result = parseGedcomDate('1627 or 1628');
      expect(result.qualifier).toBe('between');
      expect(result.year).toBe(1627);
      expect(result.endDate!.getUTCFullYear()).toBe(1628);
    });

    it('should parse "about 1700"', () => {
      const result = parseGedcomDate('about 1700');
      expect(result.qualifier).toBe('about');
      expect(result.year).toBe(1700);
    });

    it('should parse "circa 1650"', () => {
      const result = parseGedcomDate('circa 1650');
      expect(result.qualifier).toBe('about');
      expect(result.year).toBe(1650);
    });
  });

  describe('empty and unparseable', () => {
    it('should handle empty string', () => {
      const result = parseGedcomDate('');
      expect(result.date).toBeNull();
      expect(result.endDate).toBeNull();
      expect(result.qualifier).toBe('unknown');
      expect(result.year).toBeNull();
    });

    it('should handle whitespace-only string', () => {
      const result = parseGedcomDate('   ');
      expect(result.date).toBeNull();
      expect(result.qualifier).toBe('unknown');
    });

    it('should handle unparseable string', () => {
      const result = parseGedcomDate('Not a date');
      expect(result.qualifier).toBe('unknown');
      expect(result.raw).toBe('Not a date');
    });

    it('should always preserve raw value', () => {
      const result = parseGedcomDate('ABT 1750');
      expect(result.raw).toBe('ABT 1750');

      const result2 = parseGedcomDate('gibberish');
      expect(result2.raw).toBe('gibberish');
    });
  });
});
