import { describe, it, expect } from 'vitest';
import { formatDisplayName } from './name-display.ts';
import type { PersonName } from '@/types/person.ts';

function makeName(overrides: Partial<PersonName> = {}): PersonName {
  return {
    full: 'John Smith',
    given: 'John',
    middle: '',
    surname: 'Smith',
    maidenName: '',
    prefix: '',
    suffix: '',
    raw: 'John /Smith/',
    ...overrides,
  };
}

describe('formatDisplayName', () => {
  it('returns full name when no maiden name', () => {
    expect(formatDisplayName(makeName())).toBe('John Smith');
  });

  it('appends (nee ...) when maiden name is set', () => {
    expect(formatDisplayName(makeName({ full: 'Mary Gibson', maidenName: 'McRee' })))
      .toBe('Mary Gibson (nee McRee)');
  });

  it('handles full name with prefix/suffix and maiden name', () => {
    expect(formatDisplayName(makeName({
      full: 'Dr. Mary Hannah Gibson Jr.',
      maidenName: 'McRee',
    }))).toBe('Dr. Mary Hannah Gibson Jr. (nee McRee)');
  });

  it('returns (unnamed) when full is empty and no name parts', () => {
    expect(formatDisplayName(makeName({
      full: '', given: '', surname: '', middle: '',
    }))).toBe('(unnamed)');
  });

  it('builds from parts when full is empty but parts exist', () => {
    expect(formatDisplayName(makeName({
      full: '', given: 'Jane', surname: 'Doe',
    }))).toBe('Jane Doe');
  });
});
