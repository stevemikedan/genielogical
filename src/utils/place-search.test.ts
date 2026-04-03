import { describe, it, expect } from 'vitest';
import { matchesPlaceQuery } from './place-search.ts';
import type { Person } from '@/types/person.ts';

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'test-1',
    name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
    alternateNames: [],
    sex: 'M',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 4,
    confidenceReason: '',
    status: 'tentative',
    sourceIds: [],
    flagIds: [],
    researchStepIds: [],
    conjectureIds: [],
    gedcomXref: null,
    familyIdAsSpouse: [],
    familyIdAsChild: [],
    identityHash: '',
    privacyLevel: 'public',
    externalIds: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePlace(raw: string, parts: Partial<{ city: string; county: string; state: string; country: string }> = {}) {
  return {
    raw,
    city: parts.city ?? null,
    county: parts.county ?? null,
    state: parts.state ?? null,
    country: parts.country ?? null,
    parts: raw.split(', '),
  };
}

describe('matchesPlaceQuery', () => {
  it('returns true for empty query', () => {
    expect(matchesPlaceQuery(makePerson(), '')).toBe(true);
    expect(matchesPlaceQuery(makePerson(), '   ')).toBe(true);
  });

  it('matches birth place raw string', () => {
    const person = makePerson({
      birth: { date: null, place: makePlace('Edinburgh, Scotland', { city: 'Edinburgh', country: 'Scotland' }) },
    });
    expect(matchesPlaceQuery(person, 'Edinburgh')).toBe(true);
    expect(matchesPlaceQuery(person, 'scotland')).toBe(true);
    expect(matchesPlaceQuery(person, 'London')).toBe(false);
  });

  it('matches death place', () => {
    const person = makePerson({
      death: { date: null, place: makePlace('London, England', { city: 'London', country: 'England' }) },
    });
    expect(matchesPlaceQuery(person, 'london')).toBe(true);
    expect(matchesPlaceQuery(person, 'England')).toBe(true);
  });

  it('matches burial place', () => {
    const person = makePerson({
      burial: { date: null, place: makePlace('Greyfriars Kirkyard, Edinburgh', { city: 'Edinburgh' }) },
    });
    expect(matchesPlaceQuery(person, 'Greyfriars')).toBe(true);
  });

  it('matches event places', () => {
    const person = makePerson({
      events: [
        { type: 'residence', date: null, place: makePlace('Glasgow, Scotland', { city: 'Glasgow', country: 'Scotland' }), notes: '', sourceIds: [] },
        { type: 'census', date: null, place: makePlace('Dundee, Scotland', { city: 'Dundee', country: 'Scotland' }), notes: '', sourceIds: [] },
      ],
    });
    expect(matchesPlaceQuery(person, 'Glasgow')).toBe(true);
    expect(matchesPlaceQuery(person, 'Dundee')).toBe(true);
    expect(matchesPlaceQuery(person, 'Aberdeen')).toBe(false);
  });

  it('matches city, county, state, country fields individually', () => {
    const person = makePerson({
      birth: {
        date: null,
        place: {
          raw: 'Some Place',
          city: 'Richmond',
          county: 'Henrico',
          state: 'Virginia',
          country: 'United States',
          parts: ['Some Place'],
        },
      },
    });
    expect(matchesPlaceQuery(person, 'Richmond')).toBe(true);
    expect(matchesPlaceQuery(person, 'Henrico')).toBe(true);
    expect(matchesPlaceQuery(person, 'Virginia')).toBe(true);
    expect(matchesPlaceQuery(person, 'United States')).toBe(true);
  });

  it('is case-insensitive', () => {
    const person = makePerson({
      birth: { date: null, place: makePlace('EDINBURGH, SCOTLAND') },
    });
    expect(matchesPlaceQuery(person, 'edinburgh')).toBe(true);
    expect(matchesPlaceQuery(person, 'SCOTLAND')).toBe(true);
  });

  it('returns false when no places match', () => {
    const person = makePerson({
      birth: { date: null, place: makePlace('Edinburgh, Scotland') },
      death: { date: null, place: makePlace('Glasgow, Scotland') },
    });
    expect(matchesPlaceQuery(person, 'France')).toBe(false);
  });

  it('returns false for person with no places at all', () => {
    const person = makePerson();
    expect(matchesPlaceQuery(person, 'Scotland')).toBe(false);
  });
});
