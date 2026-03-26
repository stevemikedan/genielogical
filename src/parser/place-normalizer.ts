/**
 * GEDCOM place string normalizer.
 * Splits comma-delimited place strings into a hierarchy
 * (city, county, state, country) and normalizes country names.
 */

import type { PlaceNormalized } from '@/types/common.ts';

/** Map of common country name variants to a canonical form. */
const COUNTRY_ALIASES: Record<string, string> = {
  'usa': 'United States',
  'us': 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  'united states of america': 'United States',
  'united states': 'United States',
  'uk': 'United Kingdom',
  'u.k.': 'United Kingdom',
  'great britain': 'United Kingdom',
  'england': 'England',
  'scotland': 'Scotland',
  'wales': 'Wales',
  'ireland': 'Ireland',
  'northern ireland': 'Northern Ireland',
  'canada': 'Canada',
  'australia': 'Australia',
  'new zealand': 'New Zealand',
  'france': 'France',
  'germany': 'Germany',
  'deutschland': 'Germany',
  'italia': 'Italy',
  'italy': 'Italy',
  'spain': 'Spain',
  'españa': 'Spain',
  'netherlands': 'Netherlands',
  'holland': 'Netherlands',
  'sweden': 'Sweden',
  'norway': 'Norway',
  'denmark': 'Denmark',
  'switzerland': 'Switzerland',
};

/**
 * Normalize a country name to a canonical form.
 * Returns the input unchanged if no known alias exists.
 */
function normalizeCountry(country: string): string {
  const lower = country.toLowerCase().trim();
  return COUNTRY_ALIASES[lower] ?? country.trim();
}

/**
 * Parse and normalize a GEDCOM place string.
 *
 * GEDCOM convention: most specific to least specific, comma-separated.
 * Typical: "City, County, State, Country"
 *
 * Returns a PlaceNormalized object with city, county, state, country
 * extracted from the parts array based on position.
 */
export function normalizePlace(raw: string): PlaceNormalized {
  if (!raw || !raw.trim()) {
    return {
      raw,
      city: null,
      county: null,
      state: null,
      country: null,
      parts: [],
    };
  }

  // Split on commas, trim each part, filter out empty segments
  const parts = raw.split(',').map((p) => p.trim()).filter((p) => p.length > 0);

  if (parts.length === 0) {
    return {
      raw,
      city: null,
      county: null,
      state: null,
      country: null,
      parts: [],
    };
  }

  // GEDCOM convention: most specific to least specific
  // parts[0] = city (most specific)
  // parts[last] = country (least specific)
  // Middle parts depend on how many segments exist
  let city: string | null = null;
  let county: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  if (parts.length === 1) {
    // Could be just a country or just a city — treat as city
    city = parts[0];
  } else if (parts.length === 2) {
    // "City, Country" or "City, State"
    city = parts[0];
    country = normalizeCountry(parts[1]);
  } else if (parts.length === 3) {
    // "City, State, Country"
    city = parts[0];
    state = parts[1];
    country = normalizeCountry(parts[2]);
  } else if (parts.length >= 4) {
    // "City, County, State, Country"
    city = parts[0];
    county = parts[1];
    state = parts[2];
    country = normalizeCountry(parts[3]);
  }

  return {
    raw,
    city,
    county,
    state,
    country,
    parts,
  };
}
