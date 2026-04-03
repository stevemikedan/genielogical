import type { Person } from '@/types/person.ts';
import type { PlaceNormalized } from '@/types/common.ts';

/**
 * Check if a place matches a query string (case-insensitive).
 * Searches raw, city, county, state, and country fields.
 */
function placeMatches(place: PlaceNormalized | null | undefined, query: string): boolean {
  if (!place) return false;
  const q = query.toLowerCase();
  if (place.raw.toLowerCase().includes(q)) return true;
  if (place.city?.toLowerCase().includes(q)) return true;
  if (place.county?.toLowerCase().includes(q)) return true;
  if (place.state?.toLowerCase().includes(q)) return true;
  if (place.country?.toLowerCase().includes(q)) return true;
  return false;
}

/**
 * Check if a person has any place field matching the query.
 * Searches birth, death, burial, and all events.
 */
export function matchesPlaceQuery(person: Person, query: string): boolean {
  if (!query.trim()) return true;

  if (placeMatches(person.birth?.place, query)) return true;
  if (placeMatches(person.death?.place, query)) return true;
  if (placeMatches(person.burial?.place, query)) return true;

  for (const event of person.events) {
    if (placeMatches(event.place, query)) return true;
  }

  return false;
}
