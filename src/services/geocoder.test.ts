import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocodePlace, geocodeBatch, clearMemoryCache } from './geocoder.ts';

// Mock the geocache storage module
vi.mock('./geocache-storage.ts', () => ({
  loadFromCache: vi.fn().mockResolvedValue(undefined),
  saveToCache: vi.fn().mockResolvedValue(undefined),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeNominatimResponse(lat: string, lon: string, displayName: string) {
  return new Response(JSON.stringify([{
    lat,
    lon,
    display_name: displayName,
    class: 'place',
    type: 'city',
    importance: 0.7,
  }]), { status: 200 });
}

function makeEmptyResponse() {
  return new Response(JSON.stringify([]), { status: 200 });
}

beforeEach(() => {
  clearMemoryCache();
  mockFetch.mockReset();
});

describe('geocodePlace', () => {
  it('returns null for empty query', async () => {
    const result = await geocodePlace('');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('geocodes a place via Nominatim', async () => {
    mockFetch.mockResolvedValueOnce(makeNominatimResponse('55.9533', '-3.1883', 'Edinburgh, Scotland'));

    const result = await geocodePlace('Edinburgh, Scotland');
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(55.9533);
    expect(result!.lng).toBeCloseTo(-3.1883);
    expect(result!.displayName).toBe('Edinburgh, Scotland');
    expect(result!.confidence).toBe('exact');
  });

  it('returns null and caches when Nominatim returns empty', async () => {
    mockFetch.mockResolvedValueOnce(makeEmptyResponse());

    const result = await geocodePlace('Nonexistent Place XYZ');
    expect(result).toBeNull();
  });

  it('uses memory cache on second call', async () => {
    mockFetch.mockResolvedValueOnce(makeNominatimResponse('55.9533', '-3.1883', 'Edinburgh'));

    await geocodePlace('Edinburgh');
    mockFetch.mockClear();

    const result = await geocodePlace('Edinburgh');
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(55.9533);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('caches null results (negative caching)', async () => {
    mockFetch.mockResolvedValueOnce(makeEmptyResponse());

    await geocodePlace('Unknown Place');
    mockFetch.mockClear();

    const result = await geocodePlace('Unknown Place');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('geocodeBatch', () => {
  it('deduplicates queries', async () => {
    mockFetch.mockResolvedValue(makeNominatimResponse('55.9', '-3.1', 'Edinburgh'));

    const results = await geocodeBatch(['Edinburgh', 'Edinburgh', 'Edinburgh']);
    // Only 1 unique query after dedup, so only 1 fetch
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(results.size).toBe(1);
    expect(results.get('Edinburgh')).not.toBeNull();
  });

  it('reports progress', async () => {
    mockFetch
      .mockResolvedValueOnce(makeNominatimResponse('55.9', '-3.1', 'Edinburgh'))
      .mockResolvedValueOnce(makeNominatimResponse('55.8', '-4.2', 'Glasgow'));

    const progressCalls: Array<{ completed: number; total: number }> = [];
    await geocodeBatch(['Edinburgh', 'Glasgow'], (p) => {
      progressCalls.push({ completed: p.completed, total: p.total });
    });

    expect(progressCalls.length).toBeGreaterThanOrEqual(3); // initial + 2 completions + final
    expect(progressCalls[progressCalls.length - 1].completed).toBe(2);
  });

  it('respects AbortSignal', async () => {
    mockFetch.mockResolvedValue(makeNominatimResponse('55.9', '-3.1', 'Edinburgh'));

    const controller = new AbortController();
    controller.abort();

    const results = await geocodeBatch(['Edinburgh', 'Glasgow'], undefined, controller.signal);
    expect(results.size).toBe(0);
  });

  it('skips empty strings', async () => {
    mockFetch.mockResolvedValue(makeNominatimResponse('55.9', '-3.1', 'Edinburgh'));

    const results = await geocodeBatch(['', '  ', 'Edinburgh']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(results.size).toBe(1);
  });
});
