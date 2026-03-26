/**
 * Parse user-typed place strings into PlaceNormalized objects.
 * More lenient than GEDCOM place normalization — handles various formats.
 *
 * Accepts: "Richmond, Virginia, USA", "Scotland", "London, England", etc.
 */

import type { PlaceNormalized } from '@/types/common.ts';

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
  'netherlands': 'Netherlands',
  'holland': 'Netherlands',
  'sweden': 'Sweden',
  'norway': 'Norway',
  'denmark': 'Denmark',
  'switzerland': 'Switzerland',
};

/** US state name → abbreviation map for recognition */
const US_STATES: Record<string, string> = {
  'alabama': 'Alabama', 'al': 'Alabama',
  'alaska': 'Alaska', 'ak': 'Alaska',
  'arizona': 'Arizona', 'az': 'Arizona',
  'arkansas': 'Arkansas', 'ar': 'Arkansas',
  'california': 'California', 'ca': 'California',
  'colorado': 'Colorado', 'co': 'Colorado',
  'connecticut': 'Connecticut', 'ct': 'Connecticut',
  'delaware': 'Delaware', 'de': 'Delaware',
  'florida': 'Florida', 'fl': 'Florida',
  'georgia': 'Georgia', 'ga': 'Georgia',
  'hawaii': 'Hawaii', 'hi': 'Hawaii',
  'idaho': 'Idaho', 'id': 'Idaho',
  'illinois': 'Illinois', 'il': 'Illinois',
  'indiana': 'Indiana', 'in': 'Indiana',
  'iowa': 'Iowa', 'ia': 'Iowa',
  'kansas': 'Kansas', 'ks': 'Kansas',
  'kentucky': 'Kentucky', 'ky': 'Kentucky',
  'louisiana': 'Louisiana', 'la': 'Louisiana',
  'maine': 'Maine', 'me': 'Maine',
  'maryland': 'Maryland', 'md': 'Maryland',
  'massachusetts': 'Massachusetts', 'ma': 'Massachusetts',
  'michigan': 'Michigan', 'mi': 'Michigan',
  'minnesota': 'Minnesota', 'mn': 'Minnesota',
  'mississippi': 'Mississippi', 'ms': 'Mississippi',
  'missouri': 'Missouri', 'mo': 'Missouri',
  'montana': 'Montana', 'mt': 'Montana',
  'nebraska': 'Nebraska', 'ne': 'Nebraska',
  'nevada': 'Nevada', 'nv': 'Nevada',
  'new hampshire': 'New Hampshire', 'nh': 'New Hampshire',
  'new jersey': 'New Jersey', 'nj': 'New Jersey',
  'new mexico': 'New Mexico', 'nm': 'New Mexico',
  'new york': 'New York', 'ny': 'New York',
  'north carolina': 'North Carolina', 'nc': 'North Carolina',
  'north dakota': 'North Dakota', 'nd': 'North Dakota',
  'ohio': 'Ohio', 'oh': 'Ohio',
  'oklahoma': 'Oklahoma', 'ok': 'Oklahoma',
  'oregon': 'Oregon', 'or': 'Oregon',
  'pennsylvania': 'Pennsylvania', 'pa': 'Pennsylvania',
  'rhode island': 'Rhode Island', 'ri': 'Rhode Island',
  'south carolina': 'South Carolina', 'sc': 'South Carolina',
  'south dakota': 'South Dakota', 'sd': 'South Dakota',
  'tennessee': 'Tennessee', 'tn': 'Tennessee',
  'texas': 'Texas', 'tx': 'Texas',
  'utah': 'Utah', 'ut': 'Utah',
  'vermont': 'Vermont', 'vt': 'Vermont',
  'virginia': 'Virginia', 'va': 'Virginia',
  'washington': 'Washington', 'wa': 'Washington',
  'west virginia': 'West Virginia', 'wv': 'West Virginia',
  'wisconsin': 'Wisconsin', 'wi': 'Wisconsin',
  'wyoming': 'Wyoming', 'wy': 'Wyoming',
  'district of columbia': 'District of Columbia', 'dc': 'District of Columbia',
};

function normalizeCountry(text: string): string {
  return COUNTRY_ALIASES[text.toLowerCase().trim()] ?? text.trim();
}

function isKnownCountry(text: string): boolean {
  return text.toLowerCase().trim() in COUNTRY_ALIASES;
}

function resolveUSState(text: string): string | null {
  return US_STATES[text.toLowerCase().trim()] ?? null;
}

/**
 * Parse a user-typed place string into a PlaceNormalized object.
 * Splits on commas, attempts to identify country/state/city.
 */
export function parsePlaceInput(raw: string): PlaceNormalized {
  if (!raw || !raw.trim()) {
    return { raw, city: null, county: null, state: null, country: null, parts: [] };
  }

  const parts = raw.split(',').map(p => p.trim()).filter(p => p.length > 0);

  if (parts.length === 0) {
    return { raw, city: null, county: null, state: null, country: null, parts: [] };
  }

  let city: string | null = null;
  let county: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  if (parts.length === 1) {
    // Single part — could be country, state, or city
    if (isKnownCountry(parts[0])) {
      country = normalizeCountry(parts[0]);
    } else if (resolveUSState(parts[0])) {
      state = resolveUSState(parts[0]);
      country = 'United States';
    } else {
      city = parts[0];
    }
  } else if (parts.length === 2) {
    // "City, State" or "City, Country"
    city = parts[0];
    if (isKnownCountry(parts[1])) {
      country = normalizeCountry(parts[1]);
    } else if (resolveUSState(parts[1])) {
      state = resolveUSState(parts[1]);
      country = 'United States';
    } else {
      country = normalizeCountry(parts[1]);
    }
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

  return { raw, city, county, state, country, parts };
}
