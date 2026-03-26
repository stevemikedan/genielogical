import { describe, it, expect } from 'vitest';
import { parsePlaceInput } from './place-input-parser.ts';

describe('parsePlaceInput', () => {
  it('parses "Richmond, Virginia, USA"', () => {
    const result = parsePlaceInput('Richmond, Virginia, USA');
    expect(result.city).toBe('Richmond');
    expect(result.state).toBe('Virginia');
    expect(result.country).toBe('United States');
  });

  it('parses "London, England"', () => {
    const result = parsePlaceInput('London, England');
    expect(result.city).toBe('London');
    expect(result.country).toBe('England');
  });

  it('parses single country "Scotland"', () => {
    const result = parsePlaceInput('Scotland');
    expect(result.country).toBe('Scotland');
    expect(result.city).toBeNull();
  });

  it('parses single US state "Virginia"', () => {
    const result = parsePlaceInput('Virginia');
    expect(result.state).toBe('Virginia');
    expect(result.country).toBe('United States');
  });

  it('parses 4-part place "Richmond, Henrico County, Virginia, USA"', () => {
    const result = parsePlaceInput('Richmond, Henrico County, Virginia, USA');
    expect(result.city).toBe('Richmond');
    expect(result.county).toBe('Henrico County');
    expect(result.state).toBe('Virginia');
    expect(result.country).toBe('United States');
  });

  it('normalizes country aliases', () => {
    expect(parsePlaceInput('London, UK').country).toBe('United Kingdom');
    expect(parsePlaceInput('Berlin, Deutschland').country).toBe('Germany');
    expect(parsePlaceInput('New York, U.S.A.').country).toBe('United States');
  });

  it('recognizes US state abbreviations', () => {
    const result = parsePlaceInput('Richmond, VA');
    expect(result.city).toBe('Richmond');
    expect(result.state).toBe('Virginia');
    expect(result.country).toBe('United States');
  });

  it('preserves raw input', () => {
    const result = parsePlaceInput('London, England');
    expect(result.raw).toBe('London, England');
  });

  it('returns empty for empty string', () => {
    const result = parsePlaceInput('');
    expect(result.city).toBeNull();
    expect(result.country).toBeNull();
    expect(result.parts).toEqual([]);
  });

  it('handles single city name', () => {
    const result = parsePlaceInput('Springfield');
    expect(result.city).toBe('Springfield');
    expect(result.country).toBeNull();
  });

  it('trims whitespace in parts', () => {
    const result = parsePlaceInput('  London  ,  England  ');
    expect(result.city).toBe('London');
    expect(result.country).toBe('England');
  });
});
