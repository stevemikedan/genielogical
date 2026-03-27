import { describe, it, expect } from 'vitest';
import { computeEraTag, computeLocationContext, normalizeCountry } from './era-context.ts';
import type { Person } from '@/types/person.ts';

function makePerson(overrides: {
  birthYear?: number | null;
  deathYear?: number | null;
  birthCountry?: string | null;
  deathCountry?: string | null;
  birthState?: string | null;
} = {}): Person {
  return {
    id: 'test-1',
    name: { full: 'Test Person', given: 'Test', middle: '', surname: 'Person', maidenName: '', prefix: '', suffix: '', raw: 'Test /Person/' },
    alternateNames: [],
    sex: 'M',
    birth: {
      date: overrides.birthYear != null ? { year: overrides.birthYear!, date: null, endDate: null, raw: String(overrides.birthYear), qualifier: 'exact' as const } : null,
      place: overrides.birthCountry ? { raw: '', country: overrides.birthCountry, state: overrides.birthState ?? null, county: null, city: null, parts: [] } : null,
    },
    death: {
      date: overrides.deathYear != null ? { year: overrides.deathYear!, date: null, endDate: null, raw: String(overrides.deathYear), qualifier: 'exact' as const } : null,
      place: overrides.deathCountry ? { raw: '', country: overrides.deathCountry, state: null, county: null, city: null, parts: [] } : null,
    },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 4,
    confidenceReason: 'Test',
    status: 'tentative',
    sourceIds: [],
    flagIds: [],
    researchStepIds: [],
    conjectureIds: [],
    gedcomXref: null,
    familyIdAsSpouse: [],
    familyIdAsChild: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Person;
}

describe('normalizeCountry', () => {
  it('normalizes US variants', () => {
    expect(normalizeCountry('United States')).toBe('US');
    expect(normalizeCountry('USA')).toBe('US');
    expect(normalizeCountry('U.S.')).toBe('US');
  });

  it('normalizes UK countries', () => {
    expect(normalizeCountry('Scotland')).toBe('Scotland');
    expect(normalizeCountry('England')).toBe('England');
    expect(normalizeCountry('Wales')).toBe('England'); // Grouped with England
  });

  it('detects US states as US', () => {
    expect(normalizeCountry('Virginia')).toBe('US');
    expect(normalizeCountry('North Carolina')).toBe('US');
  });

  it('normalizes Germany variants', () => {
    expect(normalizeCountry('Germany')).toBe('Germany');
    expect(normalizeCountry('Prussia')).toBe('Germany');
    expect(normalizeCountry('Bavaria')).toBe('Germany');
  });

  it('returns unknown for null', () => {
    expect(normalizeCountry(null)).toBe('unknown');
  });

  it('passes through unknown countries', () => {
    expect(normalizeCountry('Japan')).toBe('Japan');
  });
});

describe('computeEraTag', () => {
  it('returns unknown when no year', () => {
    expect(computeEraTag(makePerson())).toBe('unknown');
  });

  it('classifies US modern (1900+)', () => {
    expect(computeEraTag(makePerson({ birthYear: 1950, birthCountry: 'United States' }))).toBe('us_modern');
  });

  it('classifies US antebellum (1800-1865)', () => {
    expect(computeEraTag(makePerson({ birthYear: 1830, birthCountry: 'United States' }))).toBe('us_antebellum');
  });

  it('classifies US colonial (pre-1790)', () => {
    expect(computeEraTag(makePerson({ birthYear: 1720, birthCountry: 'Virginia' }))).toBe('us_colonial');
  });

  it('classifies Scotland OPR (1553-1854)', () => {
    expect(computeEraTag(makePerson({ birthYear: 1700, birthCountry: 'Scotland' }))).toBe('scotland_opr');
  });

  it('classifies Scotland modern (1855+)', () => {
    expect(computeEraTag(makePerson({ birthYear: 1880, birthCountry: 'Scotland' }))).toBe('scotland_modern');
  });

  it('classifies medieval Europe (pre-1500)', () => {
    expect(computeEraTag(makePerson({ birthYear: 1200, birthCountry: 'England' }))).toBe('medieval_europe');
  });

  it('classifies England parish (1538-1837)', () => {
    expect(computeEraTag(makePerson({ birthYear: 1700, birthCountry: 'England' }))).toBe('england_parish');
  });

  it('classifies Ireland modern (1864+)', () => {
    expect(computeEraTag(makePerson({ birthYear: 1880, birthCountry: 'Ireland' }))).toBe('ireland_modern');
  });

  it('classifies Ireland pre-famine (pre-1864)', () => {
    expect(computeEraTag(makePerson({ birthYear: 1820, birthCountry: 'Ireland' }))).toBe('ireland_pre_famine');
  });

  it('classifies Germany church books (pre-1876)', () => {
    expect(computeEraTag(makePerson({ birthYear: 1800, birthCountry: 'Germany' }))).toBe('germany_church_books');
  });

  it('classifies France ancien regime (pre-1792)', () => {
    expect(computeEraTag(makePerson({ birthYear: 1750, birthCountry: 'France' }))).toBe('france_ancien_regime');
  });

  it('falls back to death year when birth year is missing', () => {
    expect(computeEraTag(makePerson({ deathYear: 1920, deathCountry: 'United States' }))).toBe('us_modern');
  });

  it('returns unknown for unrecognized country', () => {
    expect(computeEraTag(makePerson({ birthYear: 1850, birthCountry: 'Japan' }))).toBe('unknown');
  });
});

describe('computeLocationContext', () => {
  it('returns repositories for scotland_opr', () => {
    const person = makePerson({ birthYear: 1700, birthCountry: 'Scotland' });
    const ctx = computeLocationContext(person, 'scotland_opr');
    expect(ctx.country).toBe('Scotland');
    expect(ctx.availableRepositories.length).toBeGreaterThan(0);
    expect(ctx.availableRepositories.some(r => r.name === 'ScotlandsPeople')).toBe(true);
  });

  it('returns repositories for us_modern', () => {
    const person = makePerson({ birthYear: 1950, birthCountry: 'United States' });
    const ctx = computeLocationContext(person, 'us_modern');
    expect(ctx.availableRepositories.some(r => r.name === 'FamilySearch')).toBe(true);
  });

  it('returns known gaps for ireland_pre_famine', () => {
    const person = makePerson({ birthYear: 1820, birthCountry: 'Ireland' });
    const ctx = computeLocationContext(person, 'ireland_pre_famine');
    expect(ctx.knownGaps.length).toBeGreaterThan(0);
    expect(ctx.knownGaps.some(g => g.includes('Four Courts'))).toBe(true);
  });

  it('returns empty repos for unknown era', () => {
    const person = makePerson({ birthYear: 1850, birthCountry: 'Japan' });
    const ctx = computeLocationContext(person, 'unknown');
    expect(ctx.availableRepositories).toEqual([]);
  });

  it('returns medieval gaps', () => {
    const person = makePerson({ birthYear: 1200, birthCountry: 'England' });
    const ctx = computeLocationContext(person, 'medieval_europe');
    expect(ctx.knownGaps.some(g => g.includes('nobility'))).toBe(true);
  });
});
