import { describe, it, expect } from 'vitest';
import { convertToSource, foundRecordToImport } from './source-importer.ts';
import type { DiscoveredSourceImport, FoundRecord } from '@/types/ai.ts';

describe('convertToSource', () => {
  const baseImport: DiscoveredSourceImport = {
    title: '1851 Scotland Census',
    url: 'https://example.com/census/1851',
    repository: 'ScotlandsPeople',
    sourceClass: 'primary',
    sourceType: 'census',
    provesWhat: ['residence', 'identity'],
  };

  it('creates a Source with correct fields', () => {
    const source = convertToSource(baseImport, ['person-1'], ['edge-1']);

    expect(source.id).toMatch(/^src-/);
    expect(source.origin).toBe('user_added');
    expect(source.sourceClass).toBe('primary');
    expect(source.sourceType).toBe('census');
    expect(source.title).toBe('1851 Scotland Census');
    expect(source.citation).toBe('1851 Scotland Census');
    expect(source.url).toBe('https://example.com/census/1851');
    expect(source.repository).toBe('ScotlandsPeople');
    expect(source.attachedToPersonIds).toEqual(['person-1']);
    expect(source.attachedToEdgeIds).toEqual(['edge-1']);
    expect(source.addedBy).toBe('ai');
    expect(source.gedcomTag).toBeNull();
    expect(source.addedAt).toBeInstanceOf(Date);
  });

  it('maps source types correctly', () => {
    const vital = convertToSource({ ...baseImport, sourceType: 'vital' }, ['p1']);
    expect(vital.sourceType).toBe('vital_record');

    const church = convertToSource({ ...baseImport, sourceType: 'church' }, ['p1']);
    expect(church.sourceType).toBe('church_register');

    const military = convertToSource({ ...baseImport, sourceType: 'military' }, ['p1']);
    expect(military.sourceType).toBe('military_record');
  });

  it('maps unknown source type to other', () => {
    const unknown = convertToSource({ ...baseImport, sourceType: 'newspaper_clipping' }, ['p1']);
    expect(unknown.sourceType).toBe('other');
  });

  it('filters invalid provesWhat values', () => {
    const source = convertToSource(
      { ...baseImport, provesWhat: ['birth', 'invalid_field', 'death'] },
      ['p1'],
    );
    expect(source.provesWhat).toEqual(['birth', 'death']);
  });

  it('defaults edgeIds to empty array', () => {
    const source = convertToSource(baseImport, ['p1']);
    expect(source.attachedToEdgeIds).toEqual([]);
  });

  it('generates unique IDs per call', () => {
    const s1 = convertToSource(baseImport, ['p1']);
    const s2 = convertToSource(baseImport, ['p1']);
    expect(s1.id).not.toBe(s2.id);
  });

  it('handles null url', () => {
    const source = convertToSource({ ...baseImport, url: null }, ['p1']);
    expect(source.url).toBeNull();
  });
});

describe('foundRecordToImport', () => {
  it('converts a FoundRecord to DiscoveredSourceImport', () => {
    const record: FoundRecord = {
      type: 'census',
      title: '1861 England Census',
      url: 'https://example.com/1861',
      repository: 'FindMyPast',
      confirms: ['residence', 'identity'],
      contradicts: [],
      sourceClass: 'primary',
    };

    const imported = foundRecordToImport(record);
    expect(imported.title).toBe('1861 England Census');
    expect(imported.url).toBe('https://example.com/1861');
    expect(imported.repository).toBe('FindMyPast');
    expect(imported.sourceClass).toBe('primary');
    expect(imported.sourceType).toBe('census');
    expect(imported.provesWhat).toEqual(['residence', 'identity']);
  });

  it('handles record with null url', () => {
    const record: FoundRecord = {
      type: 'church',
      title: 'Parish Register',
      url: null,
      repository: 'Local Archive',
      confirms: ['birth'],
      contradicts: ['death'],
      sourceClass: 'secondary',
    };

    const imported = foundRecordToImport(record);
    expect(imported.url).toBeNull();
    expect(imported.sourceType).toBe('church');
  });

  it('can round-trip through convertToSource', () => {
    const record: FoundRecord = {
      type: 'vital',
      title: 'Birth Certificate',
      url: 'https://example.com/birth',
      repository: 'GRO',
      confirms: ['birth', 'parentage'],
      contradicts: [],
      sourceClass: 'primary',
    };

    const imported = foundRecordToImport(record);
    const source = convertToSource(imported, ['p1', 'p2'], ['e1']);

    expect(source.sourceType).toBe('vital_record');
    expect(source.sourceClass).toBe('primary');
    expect(source.provesWhat).toEqual(['birth', 'parentage']);
    expect(source.attachedToPersonIds).toEqual(['p1', 'p2']);
    expect(source.attachedToEdgeIds).toEqual(['e1']);
  });
});
