import { getDb } from '@/storage/db.ts';
import type { GeocodedPlace } from '@/types/geocode.ts';

/**
 * Load a geocode result from IndexedDB cache.
 * Returns the cached GeocodedPlace, null (negative cache), or undefined (not cached).
 */
export async function loadFromCache(query: string): Promise<GeocodedPlace | null | undefined> {
  const db = await getDb();
  const record = await db.get('geocache', query);
  if (!record) return undefined;
  return record.result;
}

/**
 * Save a geocode result to IndexedDB cache.
 * Pass null for places that failed to geocode (negative caching).
 */
export async function saveToCache(query: string, result: GeocodedPlace | null): Promise<void> {
  const db = await getDb();
  await db.put('geocache', { query, result, createdAt: new Date() });
}
