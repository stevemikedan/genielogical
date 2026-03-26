import { describe, it, expect } from 'vitest';
import { buildSourceSearchPlan, formatSourceContext, GENEALOGY_SOURCES } from './genealogy-source-registry.ts';
import type { Person } from '@/types/person.ts';
import type { DateParsed, PlaceNormalized } from '@/types/common.ts';

function makePerson(id: string, name: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    name: { full: name, given: name.split(' ')[0], middle: '', surname: name.split(' ').slice(1).join(' '), maidenName: '', prefix: '', suffix: '', raw: name },
    alternateNames: [],
    sex: 'U',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 4,
    confidenceReason: 'test',
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
    ...overrides,
  };
}

function makeDate(year: number): DateParsed {
  return { date: null, endDate: null, qualifier: 'exact', raw: String(year), year };
}

function makePlace(country: string, state?: string): PlaceNormalized {
  return { raw: country, country, state: state ?? null, county: null, city: null, parts: [] };
}

describe('GENEALOGY_SOURCES', () => {
  it('has unique IDs', () => {
    const ids = GENEALOGY_SOURCES.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all sources have buildSearchUrl functions', () => {
    for (const source of GENEALOGY_SOURCES) {
      expect(typeof source.buildSearchUrl).toBe('function');
    }
  });

  it('includes FamilySearch as top priority', () => {
    const fs = GENEALOGY_SOURCES.find(s => s.id === 'familysearch-records');
    expect(fs).toBeDefined();
    expect(fs!.priority).toBe(1);
  });
});

describe('buildSourceSearchPlan', () => {
  it('returns global sources for a person with no location', () => {
    const person = makePerson('p1', 'John Smith');
    const plan = buildSourceSearchPlan(person);
    expect(plan.sources.length).toBeGreaterThan(0);
    // Should include global sources but not region-specific ones
    const sourceIds = plan.sources.map(s => s.source.id);
    expect(sourceIds).toContain('familysearch-records');
    expect(sourceIds).not.toContain('scotlandspeople');
  });

  it('includes ScotlandsPeople for Scottish person', () => {
    const person = makePerson('p1', 'Robert Burns', {
      birth: { date: makeDate(1759), place: makePlace('Scotland') },
    });
    const plan = buildSourceSearchPlan(person);
    const sourceIds = plan.sources.map(s => s.source.id);
    expect(sourceIds).toContain('scotlandspeople');
    expect(plan.region).toBe('Scotland');
  });

  it('includes IrishGenealogy for Irish person', () => {
    const person = makePerson('p1', 'Patrick Murphy', {
      birth: { date: makeDate(1860), place: makePlace('Ireland') },
    });
    const plan = buildSourceSearchPlan(person);
    const sourceIds = plan.sources.map(s => s.source.id);
    expect(sourceIds).toContain('irishgenealogy');
  });

  it('includes Archion for German person', () => {
    const person = makePerson('p1', 'Hans Schmidt', {
      birth: { date: makeDate(1750), place: makePlace('Germany') },
    });
    const plan = buildSourceSearchPlan(person);
    const sourceIds = plan.sources.map(s => s.source.id);
    expect(sourceIds).toContain('archion');
  });

  it('classifies era correctly', () => {
    const medieval = makePerson('p1', 'King Someone', {
      birth: { date: makeDate(1200), place: null },
    });
    expect(buildSourceSearchPlan(medieval).era).toBe('medieval');

    const modern = makePerson('p2', 'Jane Doe', {
      birth: { date: makeDate(1900), place: null },
    });
    expect(buildSourceSearchPlan(modern).era).toBe('modern');
  });

  it('filters out sources outside year coverage', () => {
    const ancient = makePerson('p1', 'Old Person', {
      birth: { date: makeDate(600), place: null },
    });
    const plan = buildSourceSearchPlan(ancient);
    // Most sources don't cover before 1200
    const sourceIds = plan.sources.map(s => s.source.id);
    expect(sourceIds).not.toContain('findagrave');
  });

  it('builds search URLs for sources', () => {
    const person = makePerson('p1', 'John Smith', {
      birth: { date: makeDate(1850), place: makePlace('United States', 'Virginia') },
    });
    const plan = buildSourceSearchPlan(person);
    const fsSource = plan.sources.find(s => s.source.id === 'familysearch-records');
    expect(fsSource).toBeDefined();
    expect(fsSource!.searchUrl).not.toBeNull();
    expect(fsSource!.searchUrl).toContain('familysearch.org');
    expect(fsSource!.searchUrl).toContain('John');
    expect(fsSource!.searchUrl).toContain('Smith');
  });

  it('returns null search URL when name is missing', () => {
    const person = makePerson('p1', '', {
      name: { full: '', given: '', middle: '', surname: '', maidenName: '', prefix: '', suffix: '', raw: '' },
    });
    const plan = buildSourceSearchPlan(person);
    const fsSource = plan.sources.find(s => s.source.id === 'familysearch-records');
    if (fsSource) {
      expect(fsSource.searchUrl).toBeNull();
    }
  });

  it('prioritizes region-specific sources over global ones', () => {
    const person = makePerson('p1', 'Robert Burns', {
      birth: { date: makeDate(1759), place: makePlace('Scotland') },
    });
    const plan = buildSourceSearchPlan(person);
    const scotIdx = plan.sources.findIndex(s => s.source.id === 'scotlandspeople');
    const ancestryIdx = plan.sources.findIndex(s => s.source.id === 'ancestry');
    expect(scotIdx).toBeLessThan(ancestryIdx);
  });
});

describe('formatSourceContext', () => {
  it('formats plan as readable text', () => {
    const person = makePerson('p1', 'John Smith', {
      birth: { date: makeDate(1850), place: makePlace('United States') },
    });
    const plan = buildSourceSearchPlan(person);
    const text = formatSourceContext(plan);
    expect(text).toContain('FamilySearch');
    expect(text).toContain('Search URL');
  });

  it('returns fallback for empty plan', () => {
    const plan = { person: makePerson('p1', 'X'), era: 'ancient', region: 'unknown', sources: [] };
    const text = formatSourceContext(plan);
    expect(text).toContain('No specific genealogical databases');
  });
});

describe('search URL builders', () => {
  it('FamilySearch URL includes birth year range', () => {
    const person = makePerson('p1', 'John Smith', {
      birth: { date: makeDate(1850), place: null },
    });
    const plan = buildSourceSearchPlan(person);
    const fsSource = plan.sources.find(s => s.source.id === 'familysearch-records');
    expect(fsSource!.searchUrl).toContain('1848'); // year - 2
    expect(fsSource!.searchUrl).toContain('1852'); // year + 2
  });

  it('FindAGrave URL includes death year', () => {
    const person = makePerson('p1', 'John Smith', {
      death: { date: makeDate(1900), place: null },
    });
    const plan = buildSourceSearchPlan(person);
    const fagSource = plan.sources.find(s => s.source.id === 'findagrave');
    expect(fagSource!.searchUrl).toContain('1900');
    expect(fagSource!.searchUrl).toContain('findagrave.com');
  });

  it('WikiTree URL includes person names', () => {
    const person = makePerson('p1', 'John Smith', {
      birth: { date: makeDate(1850), place: null },
    });
    const plan = buildSourceSearchPlan(person);
    const wt = plan.sources.find(s => s.source.id === 'wikitree');
    expect(wt!.searchUrl).toContain('wikitree.com');
    expect(wt!.searchUrl).toContain('Smith');
  });
});
