import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { ConfidenceTier, PlaceNormalized, DateParsed } from '@/types/common.ts';
import type { GeocodedPlace, PersonLocation } from '@/types/geocode.ts';

// ── Era Classification ──

export type MapEra = 'medieval' | 'early_modern' | 'colonial' | 'nineteenth' | 'modern' | 'unknown';

export const MAP_ERA_LABELS: Record<MapEra, string> = {
  medieval: 'Medieval (pre-1500)',
  early_modern: 'Early Modern (1500–1699)',
  colonial: 'Colonial (1700–1799)',
  nineteenth: '19th Century (1800–1899)',
  modern: 'Modern (1900+)',
  unknown: 'Unknown Date',
};

export const MAP_ERA_COLORS: Record<MapEra, string> = {
  medieval: '#a78bfa',   // purple
  early_modern: '#f97316', // orange
  colonial: '#facc15',   // yellow
  nineteenth: '#60a5fa', // blue
  modern: '#34d399',     // green
  unknown: '#6b7280',    // gray
};

export function classifyEra(year: number | null): MapEra {
  if (year == null) return 'unknown';
  if (year < 1500) return 'medieval';
  if (year < 1700) return 'early_modern';
  if (year < 1800) return 'colonial';
  if (year < 1900) return 'nineteenth';
  return 'modern';
}

// ── Time Range Filtering ──

export interface TimeRange {
  startYear: number;
  endYear: number;
}

export function filterByTimeRange(locations: PersonLocation[], range: TimeRange | null): PersonLocation[] {
  if (!range) return locations;
  return locations.filter(loc => {
    if (!loc.date?.year) return false;
    return loc.date.year >= range.startYear && loc.date.year <= range.endYear;
  });
}

// ── Year Bounds ──

export function computeYearBounds(locations: PersonLocation[]): { minYear: number; maxYear: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const loc of locations) {
    if (loc.date?.year != null) {
      if (loc.date.year < min) min = loc.date.year;
      if (loc.date.year > max) max = loc.date.year;
    }
  }
  if (min === Infinity) return null;
  return { minYear: min, maxYear: max };
}

// ── Heatmap Data ──

export function buildHeatmapData(locations: PersonLocation[]): [number, number, number][] {
  return locations.map(loc => [loc.lat, loc.lng, 1.0]);
}

// ── Era Augmentation ──

export interface PersonLocationWithEra extends PersonLocation {
  era: MapEra;
}

export function augmentWithEra(locations: PersonLocation[]): PersonLocationWithEra[] {
  return locations.map(loc => ({
    ...loc,
    era: classifyEra(loc.date?.year ?? null),
  }));
}

interface PlaceWithMeta {
  place: PlaceNormalized;
  personId: string;
  personName: string;
  confidenceTier: ConfidenceTier;
  status: Person['status'];
  locationType: PersonLocation['locationType'];
  date: DateParsed | null;
}

/**
 * Extract all places from all persons in the graph, with metadata.
 */
export function extractAllPlaces(graph: TreeGraph): PlaceWithMeta[] {
  const results: PlaceWithMeta[] = [];

  for (const person of graph.persons.values()) {
    const base = {
      personId: person.id,
      personName: person.name.full,
      confidenceTier: person.confidenceTier,
      status: person.status,
    };

    if (person.birth?.place?.raw) {
      results.push({ ...base, place: person.birth.place, locationType: 'birth', date: person.birth.date });
    }
    if (person.death?.place?.raw) {
      results.push({ ...base, place: person.death.place, locationType: 'death', date: person.death.date });
    }
    if (person.burial?.place?.raw) {
      results.push({ ...base, place: person.burial.place, locationType: 'burial', date: person.burial.date });
    }

    for (const event of person.events) {
      if (event.place?.raw) {
        let locationType: PersonLocation['locationType'];
        switch (event.type) {
          case 'residence': locationType = 'residence'; break;
          case 'census': locationType = 'census'; break;
          case 'immigration':
          case 'emigration': locationType = 'immigration'; break;
          default: locationType = 'other'; break;
        }
        results.push({ ...base, place: event.place, locationType, date: event.date });
      }
    }
  }

  return results;
}

/**
 * Build PersonLocation[] by resolving places against geocode cache,
 * then applying tier/rejected visibility filters.
 */
export function buildPersonLocations(
  graph: TreeGraph,
  geocodeCache: ReadonlyMap<string, GeocodedPlace | null>,
  visibleTiers: Set<ConfidenceTier>,
  showRejected: boolean,
): PersonLocation[] {
  const places = extractAllPlaces(graph);
  const locations: PersonLocation[] = [];

  for (const pm of places) {
    // Visibility filters
    if (!visibleTiers.has(pm.confidenceTier)) continue;
    if (!showRejected && pm.status === 'rejected') continue;

    // Resolve coordinates from cache
    const geocoded = geocodeCache.get(pm.place.raw);
    if (!geocoded) continue;

    locations.push({
      personId: pm.personId,
      personName: pm.personName,
      confidenceTier: pm.confidenceTier,
      status: pm.status,
      locationType: pm.locationType,
      lat: geocoded.lat,
      lng: geocoded.lng,
      date: pm.date,
      placeRaw: pm.place.raw,
    });
  }

  return locations;
}

/**
 * Build a journey line for a single person: their locations sorted by date.
 */
export function buildJourneyLine(personId: string, locations: PersonLocation[]): PersonLocation[] {
  const personLocs = locations.filter(l => l.personId === personId);

  // Sort by date — null dates go last
  return personLocs.sort((a, b) => {
    const aYear = a.date?.year ?? Infinity;
    const bYear = b.date?.year ?? Infinity;
    if (aYear !== bYear) return aYear - bYear;
    // Secondary sort: birth < residence/census < death < burial
    const typeOrder: Record<string, number> = { birth: 0, residence: 1, census: 2, immigration: 3, other: 4, death: 5, burial: 6 };
    return (typeOrder[a.locationType] ?? 4) - (typeOrder[b.locationType] ?? 4);
  });
}

/**
 * Collect all unique place raw strings from the graph (for batch geocoding).
 */
export function collectUniquePlaceStrings(graph: TreeGraph): string[] {
  const places = extractAllPlaces(graph);
  const unique = new Set<string>();
  for (const p of places) {
    if (p.place.raw.trim()) {
      unique.add(p.place.raw.trim());
    }
  }
  return [...unique];
}
