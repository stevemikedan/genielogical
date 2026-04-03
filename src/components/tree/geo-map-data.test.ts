import { describe, it, expect } from 'vitest';
import { extractAllPlaces, buildPersonLocations, buildJourneyLine, collectUniquePlaceStrings, classifyEra, filterByTimeRange, computeYearBounds, buildHeatmapData, augmentWithEra } from './geo-map-data.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { GeocodedPlace } from '@/types/geocode.ts';

function makePerson(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    name: { full: `Person ${id}`, given: 'Test', middle: '', surname: 'Person', maidenName: '', prefix: '', suffix: '', raw: `Test /Person ${id}/` },
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

function makePlace(raw: string) {
  return { raw, city: null, county: null, state: null, country: null, parts: raw.split(', ') };
}

function makeDate(year: number) {
  return { date: null, endDate: null, qualifier: 'exact' as const, raw: String(year), year };
}

function makeGraph(persons: Person[]): TreeGraph {
  const graph = new TreeGraph();
  for (const p of persons) {
    graph.persons.set(p.id, p);
  }
  graph.rebuildIndices();
  return graph;
}

function makeGeocodedPlace(lat: number, lng: number): GeocodedPlace {
  return { lat, lng, displayName: 'Test', confidence: 'exact', queryString: 'test', geocodedAt: new Date() };
}

describe('extractAllPlaces', () => {
  it('extracts birth, death, burial places', () => {
    const person = makePerson('p1', {
      birth: { date: null, place: makePlace('Edinburgh, Scotland') },
      death: { date: null, place: makePlace('Glasgow, Scotland') },
      burial: { date: null, place: makePlace('Greyfriars') },
    });
    const graph = makeGraph([person]);
    const places = extractAllPlaces(graph);

    expect(places).toHaveLength(3);
    expect(places.map(p => p.locationType)).toEqual(['birth', 'death', 'burial']);
    expect(places.map(p => p.place.raw)).toEqual(['Edinburgh, Scotland', 'Glasgow, Scotland', 'Greyfriars']);
  });

  it('extracts event places', () => {
    const person = makePerson('p1', {
      events: [
        { type: 'residence', date: null, place: makePlace('London'), notes: '', sourceIds: [] },
        { type: 'census', date: null, place: makePlace('Manchester'), notes: '', sourceIds: [] },
        { type: 'immigration', date: null, place: makePlace('New York'), notes: '', sourceIds: [] },
      ],
    });
    const graph = makeGraph([person]);
    const places = extractAllPlaces(graph);

    expect(places).toHaveLength(3);
    expect(places.map(p => p.locationType)).toEqual(['residence', 'census', 'immigration']);
  });

  it('skips null/empty places', () => {
    const person = makePerson('p1', {
      birth: { date: null, place: null },
      events: [
        { type: 'residence', date: null, place: null, notes: '', sourceIds: [] },
      ],
    });
    const graph = makeGraph([person]);
    const places = extractAllPlaces(graph);

    expect(places).toHaveLength(0);
  });

  it('includes metadata from person', () => {
    const person = makePerson('p1', {
      name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
      confidenceTier: 2,
      status: 'validated',
      birth: { date: null, place: makePlace('Edinburgh') },
    });
    const graph = makeGraph([person]);
    const places = extractAllPlaces(graph);

    expect(places[0].personId).toBe('p1');
    expect(places[0].personName).toBe('John Smith');
    expect(places[0].confidenceTier).toBe(2);
    expect(places[0].status).toBe('validated');
  });
});

describe('buildPersonLocations', () => {
  it('resolves places from geocode cache', () => {
    const person = makePerson('p1', {
      birth: { date: null, place: makePlace('Edinburgh') },
      death: { date: null, place: makePlace('Glasgow') },
    });
    const graph = makeGraph([person]);

    const cache = new Map<string, GeocodedPlace | null>([
      ['Edinburgh', makeGeocodedPlace(55.95, -3.19)],
      ['Glasgow', makeGeocodedPlace(55.86, -4.25)],
    ]);

    const locs = buildPersonLocations(graph, cache, new Set([1, 2, 3, 4]), false);
    expect(locs).toHaveLength(2);
    expect(locs[0].lat).toBeCloseTo(55.95);
    expect(locs[1].lat).toBeCloseTo(55.86);
  });

  it('filters by tier visibility', () => {
    const person = makePerson('p1', {
      confidenceTier: 4,
      birth: { date: null, place: makePlace('Edinburgh') },
    });
    const graph = makeGraph([person]);
    const cache = new Map([['Edinburgh', makeGeocodedPlace(55.95, -3.19)]]);

    const withTier4 = buildPersonLocations(graph, cache, new Set([1, 2, 3, 4]), false);
    expect(withTier4).toHaveLength(1);

    const withoutTier4 = buildPersonLocations(graph, cache, new Set([1, 2, 3]), false);
    expect(withoutTier4).toHaveLength(0);
  });

  it('filters rejected persons', () => {
    const person = makePerson('p1', {
      status: 'rejected',
      birth: { date: null, place: makePlace('Edinburgh') },
    });
    const graph = makeGraph([person]);
    const cache = new Map([['Edinburgh', makeGeocodedPlace(55.95, -3.19)]]);

    const hidden = buildPersonLocations(graph, cache, new Set([1, 2, 3, 4]), false);
    expect(hidden).toHaveLength(0);

    const shown = buildPersonLocations(graph, cache, new Set([1, 2, 3, 4]), true);
    expect(shown).toHaveLength(1);
  });

  it('skips places not in cache', () => {
    const person = makePerson('p1', {
      birth: { date: null, place: makePlace('Edinburgh') },
      death: { date: null, place: makePlace('Unknown Place') },
    });
    const graph = makeGraph([person]);
    const cache = new Map([['Edinburgh', makeGeocodedPlace(55.95, -3.19)]]);

    const locs = buildPersonLocations(graph, cache, new Set([1, 2, 3, 4]), false);
    expect(locs).toHaveLength(1);
    expect(locs[0].placeRaw).toBe('Edinburgh');
  });
});

describe('buildJourneyLine', () => {
  it('sorts locations by date', () => {
    const locs = [
      { personId: 'p1', personName: 'Test', confidenceTier: 4 as const, status: 'tentative' as const, locationType: 'death' as const, lat: 0, lng: 0, date: makeDate(1900), placeRaw: 'B' },
      { personId: 'p1', personName: 'Test', confidenceTier: 4 as const, status: 'tentative' as const, locationType: 'birth' as const, lat: 0, lng: 0, date: makeDate(1850), placeRaw: 'A' },
      { personId: 'p1', personName: 'Test', confidenceTier: 4 as const, status: 'tentative' as const, locationType: 'residence' as const, lat: 0, lng: 0, date: makeDate(1875), placeRaw: 'C' },
    ];

    const journey = buildJourneyLine('p1', locs);
    expect(journey.map(l => l.date?.year)).toEqual([1850, 1875, 1900]);
  });

  it('sorts by type when dates are equal', () => {
    const locs = [
      { personId: 'p1', personName: 'Test', confidenceTier: 4 as const, status: 'tentative' as const, locationType: 'death' as const, lat: 0, lng: 0, date: makeDate(1900), placeRaw: 'B' },
      { personId: 'p1', personName: 'Test', confidenceTier: 4 as const, status: 'tentative' as const, locationType: 'birth' as const, lat: 0, lng: 0, date: makeDate(1900), placeRaw: 'A' },
    ];

    const journey = buildJourneyLine('p1', locs);
    expect(journey.map(l => l.locationType)).toEqual(['birth', 'death']);
  });

  it('filters to requested person only', () => {
    const locs = [
      { personId: 'p1', personName: 'A', confidenceTier: 4 as const, status: 'tentative' as const, locationType: 'birth' as const, lat: 0, lng: 0, date: makeDate(1850), placeRaw: 'X' },
      { personId: 'p2', personName: 'B', confidenceTier: 4 as const, status: 'tentative' as const, locationType: 'birth' as const, lat: 0, lng: 0, date: makeDate(1850), placeRaw: 'Y' },
    ];

    const journey = buildJourneyLine('p1', locs);
    expect(journey).toHaveLength(1);
    expect(journey[0].personId).toBe('p1');
  });

  it('puts null-date locations last', () => {
    const locs = [
      { personId: 'p1', personName: 'Test', confidenceTier: 4 as const, status: 'tentative' as const, locationType: 'residence' as const, lat: 0, lng: 0, date: null, placeRaw: 'X' },
      { personId: 'p1', personName: 'Test', confidenceTier: 4 as const, status: 'tentative' as const, locationType: 'birth' as const, lat: 0, lng: 0, date: makeDate(1850), placeRaw: 'Y' },
    ];

    const journey = buildJourneyLine('p1', locs);
    expect(journey[0].date?.year).toBe(1850);
    expect(journey[1].date).toBeNull();
  });
});

describe('collectUniquePlaceStrings', () => {
  it('collects unique place strings', () => {
    const p1 = makePerson('p1', {
      birth: { date: null, place: makePlace('Edinburgh') },
      death: { date: null, place: makePlace('Glasgow') },
    });
    const p2 = makePerson('p2', {
      birth: { date: null, place: makePlace('Edinburgh') },
    });
    const graph = makeGraph([p1, p2]);

    const strings = collectUniquePlaceStrings(graph);
    expect(strings.sort()).toEqual(['Edinburgh', 'Glasgow']);
  });

  it('returns empty for graph with no places', () => {
    const graph = makeGraph([makePerson('p1')]);
    expect(collectUniquePlaceStrings(graph)).toEqual([]);
  });
});

// ── New map feature tests ──

function makeLoc(overrides: Partial<{ personId: string; year: number | null; lat: number; lng: number; tier: 1 | 2 | 3 | 4 }> = {}) {
  const year = overrides.year;
  return {
    personId: overrides.personId ?? 'p1',
    personName: 'Test',
    confidenceTier: (overrides.tier ?? 4) as 1 | 2 | 3 | 4,
    status: 'tentative' as const,
    locationType: 'birth' as const,
    lat: overrides.lat ?? 55.95,
    lng: overrides.lng ?? -3.19,
    date: year != null ? makeDate(year) : null,
    placeRaw: 'Test Place',
  };
}

describe('classifyEra', () => {
  it('returns unknown for null', () => {
    expect(classifyEra(null)).toBe('unknown');
  });

  it('classifies medieval (pre-1500)', () => {
    expect(classifyEra(800)).toBe('medieval');
    expect(classifyEra(1499)).toBe('medieval');
  });

  it('classifies early_modern (1500-1699)', () => {
    expect(classifyEra(1500)).toBe('early_modern');
    expect(classifyEra(1699)).toBe('early_modern');
  });

  it('classifies colonial (1700-1799)', () => {
    expect(classifyEra(1700)).toBe('colonial');
    expect(classifyEra(1799)).toBe('colonial');
  });

  it('classifies nineteenth (1800-1899)', () => {
    expect(classifyEra(1800)).toBe('nineteenth');
    expect(classifyEra(1899)).toBe('nineteenth');
  });

  it('classifies modern (1900+)', () => {
    expect(classifyEra(1900)).toBe('modern');
    expect(classifyEra(2024)).toBe('modern');
  });
});

describe('filterByTimeRange', () => {
  const locs = [
    makeLoc({ year: 1750 }),
    makeLoc({ year: 1820 }),
    makeLoc({ year: 1900 }),
    makeLoc({ year: null }),
  ];

  it('returns all when range is null', () => {
    expect(filterByTimeRange(locs, null)).toHaveLength(4);
  });

  it('filters to range (inclusive boundaries)', () => {
    const result = filterByTimeRange(locs, { startYear: 1750, endYear: 1820 });
    expect(result).toHaveLength(2);
    expect(result.map(l => l.date?.year)).toEqual([1750, 1820]);
  });

  it('excludes null-date locations when filtering', () => {
    const result = filterByTimeRange(locs, { startYear: 1700, endYear: 2000 });
    expect(result).toHaveLength(3);
    expect(result.every(l => l.date != null)).toBe(true);
  });

  it('returns empty for non-overlapping range', () => {
    expect(filterByTimeRange(locs, { startYear: 2000, endYear: 2100 })).toHaveLength(0);
  });
});

describe('computeYearBounds', () => {
  it('returns null for empty array', () => {
    expect(computeYearBounds([])).toBeNull();
  });

  it('returns null when all dates are null', () => {
    expect(computeYearBounds([makeLoc({ year: null })])).toBeNull();
  });

  it('computes correct min and max', () => {
    const locs = [makeLoc({ year: 1850 }), makeLoc({ year: 1700 }), makeLoc({ year: 1920 })];
    expect(computeYearBounds(locs)).toEqual({ minYear: 1700, maxYear: 1920 });
  });

  it('handles single location', () => {
    expect(computeYearBounds([makeLoc({ year: 1800 })])).toEqual({ minYear: 1800, maxYear: 1800 });
  });

  it('ignores null dates', () => {
    const locs = [makeLoc({ year: null }), makeLoc({ year: 1800 }), makeLoc({ year: null })];
    expect(computeYearBounds(locs)).toEqual({ minYear: 1800, maxYear: 1800 });
  });
});

describe('buildHeatmapData', () => {
  it('returns [lat, lng, 1.0] tuples', () => {
    const locs = [
      makeLoc({ lat: 55.95, lng: -3.19 }),
      makeLoc({ lat: 51.50, lng: -0.12 }),
    ];
    const result = buildHeatmapData(locs);
    expect(result).toEqual([
      [55.95, -3.19, 1.0],
      [51.50, -0.12, 1.0],
    ]);
  });

  it('returns empty for no locations', () => {
    expect(buildHeatmapData([])).toEqual([]);
  });
});

describe('augmentWithEra', () => {
  it('adds correct era field based on year', () => {
    const locs = [
      makeLoc({ year: 1400 }),
      makeLoc({ year: 1600 }),
      makeLoc({ year: 1750 }),
      makeLoc({ year: 1850 }),
      makeLoc({ year: 1950 }),
      makeLoc({ year: null }),
    ];
    const result = augmentWithEra(locs);
    expect(result.map(l => l.era)).toEqual([
      'medieval', 'early_modern', 'colonial', 'nineteenth', 'modern', 'unknown',
    ]);
  });

  it('preserves all original fields', () => {
    const loc = makeLoc({ personId: 'p42', year: 1800, lat: 10, lng: 20 });
    const [result] = augmentWithEra([loc]);
    expect(result.personId).toBe('p42');
    expect(result.lat).toBe(10);
    expect(result.lng).toBe(20);
    expect(result.era).toBe('nineteenth');
  });
});
