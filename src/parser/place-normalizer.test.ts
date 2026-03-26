import { describe, it, expect } from 'vitest';
import { normalizePlace } from './place-normalizer.ts';

describe('normalizePlace', () => {
  it('should parse a full 4-part place', () => {
    const result = normalizePlace('Springfield, Sangamon, Illinois, United States');
    expect(result.city).toBe('Springfield');
    expect(result.county).toBe('Sangamon');
    expect(result.state).toBe('Illinois');
    expect(result.country).toBe('United States');
    expect(result.parts).toHaveLength(4);
  });

  it('should parse a 3-part place (city, state, country)', () => {
    const result = normalizePlace('London, England, United Kingdom');
    expect(result.city).toBe('London');
    expect(result.county).toBeNull();
    expect(result.state).toBe('England');
    expect(result.country).toBe('United Kingdom');
  });

  it('should parse a 2-part place (city, country)', () => {
    const result = normalizePlace('Paris, France');
    expect(result.city).toBe('Paris');
    expect(result.country).toBe('France');
    expect(result.county).toBeNull();
    expect(result.state).toBeNull();
  });

  it('should parse a 1-part place as city', () => {
    const result = normalizePlace('Edinburgh');
    expect(result.city).toBe('Edinburgh');
    expect(result.county).toBeNull();
    expect(result.state).toBeNull();
    expect(result.country).toBeNull();
  });

  it('should handle empty string', () => {
    const result = normalizePlace('');
    expect(result.city).toBeNull();
    expect(result.parts).toHaveLength(0);
  });

  it('should handle whitespace-only string', () => {
    const result = normalizePlace('   ');
    expect(result.city).toBeNull();
    expect(result.parts).toHaveLength(0);
  });

  it('should trim whitespace from each segment', () => {
    const result = normalizePlace('  Boston ,  Suffolk , Massachusetts ,  USA  ');
    expect(result.city).toBe('Boston');
    expect(result.county).toBe('Suffolk');
    expect(result.state).toBe('Massachusetts');
    expect(result.country).toBe('United States');
  });

  it('should skip empty segments', () => {
    const result = normalizePlace('Boston, , Massachusetts, USA');
    expect(result.parts).toHaveLength(3);
    expect(result.city).toBe('Boston');
    expect(result.state).toBe('Massachusetts');
    expect(result.country).toBe('United States');
  });

  it('should normalize "USA" to "United States"', () => {
    const result = normalizePlace('New York, New York, USA');
    expect(result.country).toBe('United States');
  });

  it('should normalize "US" to "United States"', () => {
    const result = normalizePlace('Austin, Texas, US');
    expect(result.country).toBe('United States');
  });

  it('should normalize "United States of America" to "United States"', () => {
    const result = normalizePlace('Denver, Colorado, United States of America');
    expect(result.country).toBe('United States');
  });

  it('should normalize "Holland" to "Netherlands"', () => {
    const result = normalizePlace('Amsterdam, Holland');
    expect(result.country).toBe('Netherlands');
  });

  it('should normalize "Deutschland" to "Germany"', () => {
    const result = normalizePlace('Berlin, Deutschland');
    expect(result.country).toBe('Germany');
  });

  it('should preserve the raw value', () => {
    const raw = 'Springfield, Sangamon, Illinois, USA';
    const result = normalizePlace(raw);
    expect(result.raw).toBe(raw);
  });

  it('should handle places with 5+ parts', () => {
    const result = normalizePlace('Village, Parish, County, State, Country');
    // Only first 4 get assigned
    expect(result.city).toBe('Village');
    expect(result.county).toBe('Parish');
    expect(result.state).toBe('County');
    expect(result.country).toBe('State');
    expect(result.parts).toHaveLength(5);
  });
});
