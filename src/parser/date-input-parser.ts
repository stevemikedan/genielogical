/**
 * Parse user-typed date strings into DateParsed objects.
 *
 * Handles flexible formats:
 *   "15 Mar 1842", "March 15, 1842", "1842", "about 1840",
 *   "before 1900", "after 1600", "between 1800 and 1810",
 *   "abt 1750", "circa 1650", "~1700", "1627 or 1628",
 *   "3/15/1842", "1842-03-15"
 */

import type { DateParsed, DateQualifier } from '@/types/common.ts';

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function resolveMonth(token: string): number | null {
  return MONTH_MAP[token.toLowerCase().replace(/[.,]/g, '')] ?? null;
}

/** Extract qualifier prefix from user input. Returns qualifier and remaining text. */
function extractQualifier(input: string): { qualifier: DateQualifier; rest: string } {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // "~1700" shorthand
  if (trimmed.startsWith('~')) {
    return { qualifier: 'about', rest: trimmed.slice(1).trim() };
  }

  const qualifierPrefixes: Array<[string[], DateQualifier]> = [
    [['about', 'abt', 'abt.', 'circa', 'ca.', 'ca', 'approximately', 'approx'], 'about'],
    [['before', 'bef', 'bef.', 'prior to'], 'before'],
    [['after', 'aft', 'aft.'], 'after'],
    [['between', 'bet', 'bet.', 'from'], 'between'],
    [['calculated', 'cal', 'cal.'], 'calculated'],
    [['estimated', 'est', 'est.'], 'estimated'],
  ];

  for (const [prefixes, qualifier] of qualifierPrefixes) {
    for (const prefix of prefixes) {
      if (lower.startsWith(prefix + ' ') || lower === prefix) {
        return { qualifier, rest: trimmed.slice(prefix.length).trim() };
      }
    }
  }

  return { qualifier: 'exact', rest: trimmed };
}

/** Try to parse a simple date string (no qualifier). */
function parseDatePart(input: string): { date: Date | null; year: number | null } {
  const trimmed = input.trim().replace(/,/g, '');
  if (!trimmed) return { date: null, year: null };

  // ISO format: "1842-03-15"
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    const yr = parseInt(isoMatch[1], 10);
    const mo = parseInt(isoMatch[2], 10) - 1;
    const dy = parseInt(isoMatch[3], 10);
    return { date: new Date(Date.UTC(yr, mo, dy)), year: yr };
  }

  // US date format: "3/15/1842" or "03/15/1842"
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (usMatch) {
    const mo = parseInt(usMatch[1], 10) - 1;
    const dy = parseInt(usMatch[2], 10);
    const yr = parseInt(usMatch[3], 10);
    return { date: new Date(Date.UTC(yr, mo, dy)), year: yr };
  }

  const tokens = trimmed.split(/\s+/);

  // Year only
  if (tokens.length === 1) {
    const yr = parseInt(tokens[0], 10);
    if (!isNaN(yr) && /^\d{3,4}$/.test(tokens[0])) {
      return { date: new Date(Date.UTC(yr, 0, 1)), year: yr };
    }
    return { date: null, year: null };
  }

  // Two tokens: "Mar 1842" or "1842 Mar"
  if (tokens.length === 2) {
    const m0 = resolveMonth(tokens[0]);
    const m1 = resolveMonth(tokens[1]);
    const n0 = parseInt(tokens[0], 10);
    const n1 = parseInt(tokens[1], 10);

    if (m0 !== null && !isNaN(n1) && n1 > 31) {
      return { date: new Date(Date.UTC(n1, m0, 1)), year: n1 };
    }
    if (!isNaN(n0) && n0 > 31 && m1 !== null) {
      return { date: new Date(Date.UTC(n0, m1, 1)), year: n0 };
    }
    return { date: null, year: null };
  }

  // Three tokens: "15 Mar 1842", "March 15 1842", "1842 Mar 15"
  if (tokens.length >= 3) {
    const n0 = parseInt(tokens[0], 10);
    const n1 = parseInt(tokens[1], 10);
    const n2 = parseInt(tokens[2], 10);
    const m0 = resolveMonth(tokens[0]);
    const m1 = resolveMonth(tokens[1]);

    // "15 Mar 1842"
    if (!isNaN(n0) && n0 <= 31 && m1 !== null && !isNaN(n2)) {
      return { date: new Date(Date.UTC(n2, m1, n0)), year: n2 };
    }
    // "March 15 1842"
    if (m0 !== null && !isNaN(n1) && n1 <= 31 && !isNaN(n2)) {
      return { date: new Date(Date.UTC(n2, m0, n1)), year: n2 };
    }
    // "1842 Mar 15" (reversed)
    if (!isNaN(n0) && n0 > 31 && m1 !== null && !isNaN(n2)) {
      return { date: new Date(Date.UTC(n0, m1, n2)), year: n0 };
    }
  }

  return { date: null, year: null };
}

/**
 * Parse a user-typed date string into a DateParsed object.
 * More lenient than GEDCOM date parsing — accepts natural language dates.
 */
export function parseDateInput(raw: string): DateParsed {
  if (!raw || !raw.trim()) {
    return { date: null, endDate: null, qualifier: 'unknown', raw, year: null };
  }

  const trimmed = raw.trim();

  // "X or Y" pattern: "1627 or 1628"
  const orMatch = /^(\d{3,4})\s+or\s+(\d{3,4})$/i.exec(trimmed);
  if (orMatch) {
    const y1 = parseInt(orMatch[1], 10);
    const y2 = parseInt(orMatch[2], 10);
    return {
      date: new Date(Date.UTC(y1, 0, 1)),
      endDate: new Date(Date.UTC(y2, 0, 1)),
      qualifier: 'between',
      raw,
      year: y1,
    };
  }

  const { qualifier, rest } = extractQualifier(trimmed);

  // "between X and Y"
  if (qualifier === 'between') {
    const andParts = rest.split(/\s+and\s+|\s+to\s+|\s*[-–—]\s*/i);
    if (andParts.length >= 2) {
      const d1 = parseDatePart(andParts[0]);
      const d2 = parseDatePart(andParts[1]);
      return {
        date: d1.date,
        endDate: d2.date,
        qualifier: 'between',
        raw,
        year: d1.year,
      };
    }
    const d = parseDatePart(rest);
    return { date: d.date, endDate: null, qualifier: 'between', raw, year: d.year };
  }

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

  return {
    date: null,
    endDate: null,
    qualifier: qualifier === 'exact' ? 'unknown' : qualifier,
    raw,
    year: null,
  };
}
