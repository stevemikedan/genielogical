/**
 * GEDCOM date string parser.
 * Handles standard dates, qualifiers, French months, reversed dates,
 * non-standard formats, year-only, and empty/unparseable strings.
 */

import type { DateParsed, DateQualifier } from '@/types/common.ts';

/** Standard GEDCOM month abbreviations (uppercase) */
const GEDCOM_MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/** Full English month names (case-insensitive lookup) */
const FULL_MONTHS: Record<string, number> = {
  JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3,
  MAY: 4, JUNE: 5, JULY: 6, AUGUST: 7,
  SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
};

/** French month names (case-insensitive lookup) */
const FRENCH_MONTHS: Record<string, number> = {
  JANVIER: 0, 'FÉVRIER': 1, FEVRIER: 1, MARS: 2, AVRIL: 3,
  MAI: 4, JUIN: 5, JUILLET: 6, 'AOÛT': 7, AOUT: 7,
  SEPTEMBRE: 8, OCTOBRE: 9, NOVEMBRE: 10, 'DÉCEMBRE': 11, DECEMBRE: 11,
};

/**
 * Try to resolve a month token to a 0-based month number.
 * Checks GEDCOM abbreviations, full English names, and French names.
 */
function resolveMonth(token: string): number | null {
  const upper = token.toUpperCase();
  if (upper in GEDCOM_MONTHS) return GEDCOM_MONTHS[upper];
  if (upper in FULL_MONTHS) return FULL_MONTHS[upper];
  if (upper in FRENCH_MONTHS) return FRENCH_MONTHS[upper];

  // Also handle accented French directly
  const normalized = upper
    .replace(/É/g, 'E')
    .replace(/Û/g, 'U');
  if (normalized in FRENCH_MONTHS) return FRENCH_MONTHS[normalized];

  return null;
}

/**
 * Attempt to parse a simple date string (no qualifier) into a Date.
 * Handles:
 *   "10 Apr 1990" (standard)
 *   "Apr 1990" (month + year)
 *   "1990" (year only)
 *   "1962 May 18" (reversed: year month day)
 *   "9 Juin 1600" (French)
 */
function parseDatePart(part: string): { date: Date | null; year: number | null } {
  const trimmed = part.trim();
  if (!trimmed) return { date: null, year: null };

  const tokens = trimmed.split(/\s+/);

  // Year only: single token that is a 3-4+ digit number
  if (tokens.length === 1) {
    const yr = parseInt(tokens[0], 10);
    if (!isNaN(yr) && /^\d{3,4}$/.test(tokens[0])) {
      return { date: new Date(Date.UTC(yr, 0, 1)), year: yr };
    }
    return { date: null, year: null };
  }

  // Two tokens: could be "Apr 1990" or "1990 May"
  if (tokens.length === 2) {
    const month0 = resolveMonth(tokens[0]);
    const month1 = resolveMonth(tokens[1]);
    const num0 = parseInt(tokens[0], 10);
    const num1 = parseInt(tokens[1], 10);

    // "Apr 1990"
    if (month0 !== null && !isNaN(num1)) {
      return { date: new Date(Date.UTC(num1, month0, 1)), year: num1 };
    }
    // "1990 May" (reversed)
    if (!isNaN(num0) && month1 !== null) {
      return { date: new Date(Date.UTC(num0, month1, 1)), year: num0 };
    }
    return { date: null, year: null };
  }

  // Three tokens: "10 Apr 1990" or "1962 May 18"
  if (tokens.length >= 3) {
    const num0 = parseInt(tokens[0], 10);
    const num2 = parseInt(tokens[2], 10);
    const month0 = resolveMonth(tokens[0]);
    const month1 = resolveMonth(tokens[1]);
    const month2 = resolveMonth(tokens[2]);

    // Pattern: num month num — could be "10 Apr 1990" or "1962 May 18"
    if (!isNaN(num0) && month1 !== null && !isNaN(num2)) {
      // Distinguish standard (day-month-year) vs reversed (year-month-day)
      if (num0 > 31) {
        // First token is too large for a day — must be year (reversed format)
        return { date: new Date(Date.UTC(num0, month1, num2)), year: num0 };
      }
      // Standard: day month year
      return { date: new Date(Date.UTC(num2, month1, num0)), year: num2 };
    }

    // "Apr 10 1990" — month day year
    if (month0 !== null && !isNaN(num2)) {
      const num1mid = parseInt(tokens[1], 10);
      if (!isNaN(num1mid)) {
        return { date: new Date(Date.UTC(num2, month0, num1mid)), year: num2 };
      }
    }

    // "10 1990 Apr" — day year month (unlikely but handled)
    if (!isNaN(num0) && month2 !== null) {
      const num1mid = parseInt(tokens[1], 10);
      if (!isNaN(num1mid)) {
        return { date: new Date(Date.UTC(num1mid, month2, num0)), year: num1mid };
      }
    }
  }

  return { date: null, year: null };
}

/**
 * Extract a qualifier prefix from a GEDCOM date string.
 * Returns the qualifier and the remaining date string.
 */
function extractQualifier(raw: string): { qualifier: DateQualifier; rest: string } {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();

  // "BET ... AND ..." — between
  if (upper.startsWith('BET ') || upper.startsWith('BET.')) {
    return { qualifier: 'between', rest: trimmed.slice(4).trim() };
  }

  // Standard GEDCOM qualifiers
  const prefixes: [string, DateQualifier][] = [
    ['ABT.', 'about'],
    ['ABT', 'about'],
    ['ABOUT', 'about'],
    ['CIRCA', 'about'],
    ['CA.', 'about'],
    ['CA ', 'about'],
    ['BEF.', 'before'],
    ['BEF', 'before'],
    ['BEFORE', 'before'],
    ['AFT.', 'after'],
    ['AFT', 'after'],
    ['AFTER', 'after'],
    ['CAL.', 'calculated'],
    ['CAL', 'calculated'],
    ['EST.', 'estimated'],
    ['EST', 'estimated'],
  ];

  for (const [prefix, qualifier] of prefixes) {
    if (upper.startsWith(prefix + ' ') || upper === prefix) {
      return { qualifier, rest: trimmed.slice(prefix.length).trim() };
    }
    // Handle prefix followed by non-letter (e.g. "ABT.1700", "ABT.  1700")
    if (upper.startsWith(prefix) && upper.length > prefix.length) {
      const nextChar = upper[prefix.length];
      // Only match if next char is not a letter (to avoid "CAL" matching "CALIFORNIA")
      if (nextChar && !/[A-Z]/.test(nextChar)) {
        const after = trimmed.slice(prefix.length).trim();
        if (after.length > 0) {
          return { qualifier, rest: after };
        }
      }
    }
  }

  return { qualifier: 'exact', rest: trimmed };
}

/**
 * Parse a GEDCOM date string into a DateParsed object.
 *
 * Handles:
 * - Standard: "10 Apr 1990", "1800", "Apr 1990"
 * - Qualifiers: "ABT 1750", "BEF 1900", "AFT 1600", "BET 1700 AND 1750", "CAL 1800", "EST 1800"
 * - French: "9 Juin 1600", "21 Juillet 1654"
 * - Reversed: "1962 May 18"
 * - Non-standard: "Abt.", "1627 or 1628", "about 1700", "circa 1650"
 * - Empty/unparseable: returns null date with qualifier "unknown"
 */
export function parseGedcomDate(raw: string): DateParsed {
  if (!raw || !raw.trim()) {
    return { date: null, endDate: null, qualifier: 'unknown', raw, year: null };
  }

  const trimmed = raw.trim();

  // Handle "X or Y" pattern: "1627 or 1628"
  const orMatch = /^(\d{3,4})\s+or\s+(\d{3,4})$/i.exec(trimmed);
  if (orMatch) {
    const year1 = parseInt(orMatch[1], 10);
    const year2 = parseInt(orMatch[2], 10);
    return {
      date: new Date(Date.UTC(year1, 0, 1)),
      endDate: new Date(Date.UTC(year2, 0, 1)),
      qualifier: 'between',
      raw,
      year: year1,
    };
  }

  const { qualifier, rest } = extractQualifier(trimmed);

  // Handle "between" with AND separator
  if (qualifier === 'between') {
    const andIndex = rest.toUpperCase().indexOf(' AND ');
    if (andIndex !== -1) {
      const part1 = rest.slice(0, andIndex).trim();
      const part2 = rest.slice(andIndex + 5).trim();
      const d1 = parseDatePart(part1);
      const d2 = parseDatePart(part2);
      return {
        date: d1.date,
        endDate: d2.date,
        qualifier: 'between',
        raw,
        year: d1.year,
      };
    }
    // No AND found, try parsing the rest as a single date
    const d = parseDatePart(rest);
    if (d.date) {
      return { date: d.date, endDate: null, qualifier: 'between', raw, year: d.year };
    }
    return { date: null, endDate: null, qualifier: 'unknown', raw, year: null };
  }

  // Parse the remaining date string
  const parsed = parseDatePart(rest);
  if (parsed.date) {
    return {
      date: parsed.date,
      endDate: null,
      qualifier,
      raw,
      year: parsed.year,
    };
  }

  // If exact qualifier but couldn't parse, mark as unknown
  return {
    date: null,
    endDate: null,
    qualifier: qualifier === 'exact' ? 'unknown' : qualifier,
    raw,
    year: null,
  };
}
