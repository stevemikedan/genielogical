import type { GeocodedPlace, GeocodeBatchProgress } from '@/types/geocode.ts';
import { loadFromCache, saveToCache } from './geocache-storage.ts';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'GenieLogical/0.1 (genealogy-app)';
const MIN_REQUEST_INTERVAL_MS = 1100; // respect Nominatim rate limit

// ── In-memory cache ───────────────────────────────────────────────

const memoryCache = new Map<string, GeocodedPlace | null>();

// ── Rate limiter ──────────────────────────────────────────────────

let lastRequestTime = 0;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// ── Nominatim API call ────────────────────────────────────────────

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
}

function classifyConfidence(result: NominatimResult): GeocodedPlace['confidence'] {
  // Nominatim doesn't return a direct confidence score, infer from type
  if (result.type === 'city' || result.type === 'town' || result.type === 'village' ||
      result.type === 'administrative' || result.type === 'country' || result.type === 'state') {
    return 'exact';
  }
  if (result.importance > 0.5) return 'interpolated';
  return 'approximate';
}

async function fetchNominatim(query: string): Promise<GeocodedPlace | null> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) return null;

  const results: NominatimResult[] = await response.json();
  if (results.length === 0) return null;

  const top = results[0];
  return {
    lat: parseFloat(top.lat),
    lng: parseFloat(top.lon),
    displayName: top.display_name,
    confidence: classifyConfidence(top),
    queryString: query,
    geocodedAt: new Date(),
  };
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Geocode a place string. Checks memory cache → IndexedDB cache → Nominatim API.
 * Returns null if the place cannot be geocoded (and caches the negative result).
 */
export async function geocodePlace(query: string): Promise<GeocodedPlace | null> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return null;

  // 1. Memory cache
  if (memoryCache.has(normalizedQuery)) {
    return memoryCache.get(normalizedQuery)!;
  }

  // 2. IndexedDB cache
  const cached = await loadFromCache(normalizedQuery);
  if (cached !== undefined) {
    memoryCache.set(normalizedQuery, cached);
    return cached;
  }

  // 3. Nominatim API
  await waitForRateLimit();
  const result = await fetchNominatim(normalizedQuery);

  // Cache result (including null for negative caching)
  memoryCache.set(normalizedQuery, result);
  await saveToCache(normalizedQuery, result);

  return result;
}

/**
 * Geocode a batch of place strings. Deduplicates by query string,
 * calls geocodePlace sequentially respecting rate limits.
 */
export async function geocodeBatch(
  queries: string[],
  onProgress?: (progress: GeocodeBatchProgress) => void,
  signal?: AbortSignal,
): Promise<Map<string, GeocodedPlace | null>> {
  // Deduplicate
  const unique = [...new Set(queries.map(q => q.trim()).filter(Boolean))];
  const results = new Map<string, GeocodedPlace | null>();

  const progress: GeocodeBatchProgress = {
    total: unique.length,
    completed: 0,
    failed: 0,
    inProgress: true,
  };
  onProgress?.(progress);

  for (const query of unique) {
    if (signal?.aborted) break;

    try {
      const result = await geocodePlace(query);
      results.set(query, result);
      if (result === null) progress.failed++;
    } catch {
      results.set(query, null);
      progress.failed++;
    }

    progress.completed++;
    onProgress?.({ ...progress });
  }

  progress.inProgress = false;
  onProgress?.({ ...progress });

  return results;
}

/**
 * Get the current in-memory cache (for building map data without waiting).
 */
export function getMemoryCache(): ReadonlyMap<string, GeocodedPlace | null> {
  return memoryCache;
}

/**
 * Clear in-memory cache (useful for testing).
 */
export function clearMemoryCache(): void {
  memoryCache.clear();
  lastRequestTime = 0;
}
