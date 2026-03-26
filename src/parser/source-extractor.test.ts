import { describe, it, expect } from 'vitest';
import { extractSource } from './source-extractor.ts';
import type { GedcomNode } from './record-builder.ts';

/** Helper to create a minimal GedcomNode */
function makeNode(
  level: number,
  tag: string,
  value: string = '',
  xref: string | null = null,
  children: GedcomNode[] = []
): GedcomNode {
  return { level, xref, tag, value, lineNumber: 1, children };
}

describe('extractSource', () => {
  describe('defaults', () => {
    it('should set sourceClass to "tertiary"', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@');
      const source = extractSource(node);
      expect(source.sourceClass).toBe('tertiary');
    });

    it('should set sourceType to "other"', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@');
      const source = extractSource(node);
      expect(source.sourceType).toBe('other');
    });

    it('should set origin to "gedcom_import"', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@');
      const source = extractSource(node);
      expect(source.origin).toBe('gedcom_import');
    });

    it('should set addedBy to "gedcom_import"', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@');
      const source = extractSource(node);
      expect(source.addedBy).toBe('gedcom_import');
    });

    it('should set url to null', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@');
      const source = extractSource(node);
      expect(source.url).toBeNull();
    });

    it('should set provesWhat to empty array', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@');
      const source = extractSource(node);
      expect(source.provesWhat).toEqual([]);
    });

    it('should set attachedToPersonIds and attachedToEdgeIds to empty arrays', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@');
      const source = extractSource(node);
      expect(source.attachedToPersonIds).toEqual([]);
      expect(source.attachedToEdgeIds).toEqual([]);
    });

    it('should set addedAt to a Date', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@');
      const source = extractSource(node);
      expect(source.addedAt).toBeInstanceOf(Date);
    });
  });

  describe('ID and gedcomTag', () => {
    it('should use xref as the source ID', () => {
      const node = makeNode(0, 'SOUR', '', '@S42@');
      const source = extractSource(node);
      expect(source.id).toBe('@S42@');
    });

    it('should set gedcomTag to the xref', () => {
      const node = makeNode(0, 'SOUR', '', '@S42@');
      const source = extractSource(node);
      expect(source.gedcomTag).toBe('@S42@');
    });

    it('should fall back to node value if xref is null', () => {
      const node = makeNode(0, 'SOUR', 'S100');
      const source = extractSource(node);
      expect(source.id).toBe('S100');
    });

    it('should set id and gedcomTag to empty string if both xref and value are empty', () => {
      const node = makeNode(0, 'SOUR', '');
      const source = extractSource(node);
      expect(source.id).toBe('');
      expect(source.gedcomTag).toBeNull();
    });
  });

  describe('title extraction (TITL)', () => {
    it('should extract title from TITL sub-tag', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'TITL', 'Birth Certificate of John Smith'),
      ]);
      const source = extractSource(node);
      expect(source.title).toBe('Birth Certificate of John Smith');
    });

    it('should trim whitespace from title', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'TITL', '  Birth Certificate  '),
      ]);
      const source = extractSource(node);
      expect(source.title).toBe('Birth Certificate');
    });

    it('should default title to "Untitled Source" when TITL is missing', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@');
      const source = extractSource(node);
      expect(source.title).toBe('Untitled Source');
    });

    it('should default title to "Untitled Source" when TITL value is empty', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'TITL', ''),
      ]);
      const source = extractSource(node);
      expect(source.title).toBe('Untitled Source');
    });
  });

  describe('author extraction (AUTH)', () => {
    it('should extract author from AUTH sub-tag', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'TITL', 'A Book'),
        makeNode(1, 'AUTH', 'Jane Doe'),
      ]);
      const source = extractSource(node);
      // Author is included in citation
      expect(source.citation).toContain('Jane Doe');
    });

    it('should trim whitespace from author', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'TITL', 'A Book'),
        makeNode(1, 'AUTH', '  Jane Doe  '),
      ]);
      const source = extractSource(node);
      expect(source.citation).toContain('Jane Doe');
    });
  });

  describe('publication extraction (PUBL)', () => {
    it('should extract publication from PUBL sub-tag', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'TITL', 'A Book'),
        makeNode(1, 'PUBL', 'Oxford University Press, 1995'),
      ]);
      const source = extractSource(node);
      expect(source.citation).toContain('Oxford University Press, 1995');
    });
  });

  describe('text/notes extraction (TEXT)', () => {
    it('should extract notes from TEXT sub-tag', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'TEXT', 'This source contains important genealogical data.'),
      ]);
      const source = extractSource(node);
      expect(source.notes).toBe('This source contains important genealogical data.');
    });

    it('should trim whitespace from notes', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'TEXT', '  Some notes  '),
      ]);
      const source = extractSource(node);
      expect(source.notes).toBe('Some notes');
    });

    it('should default notes to empty string when TEXT is missing', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@');
      const source = extractSource(node);
      expect(source.notes).toBe('');
    });
  });

  describe('repository extraction (REPO)', () => {
    it('should extract repository from REPO sub-tag', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'REPO', '@R1@'),
      ]);
      const source = extractSource(node);
      expect(source.repository).toBe('@R1@');
    });

    it('should trim whitespace from repository', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'REPO', '  @R1@  '),
      ]);
      const source = extractSource(node);
      expect(source.repository).toBe('@R1@');
    });

    it('should default repository to null when REPO is missing', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@');
      const source = extractSource(node);
      expect(source.repository).toBeNull();
    });

    it('should set repository to null when REPO value is empty', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'REPO', ''),
      ]);
      const source = extractSource(node);
      expect(source.repository).toBeNull();
    });
  });

  describe('citation building', () => {
    it('should build citation from author, title, and publication', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'AUTH', 'John Author'),
        makeNode(1, 'TITL', 'The Book Title'),
        makeNode(1, 'PUBL', 'Publisher, 2000'),
      ]);
      const source = extractSource(node);
      expect(source.citation).toBe('John Author. The Book Title. Publisher, 2000');
    });

    it('should build citation from title only when auth and publ are missing', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'TITL', 'Just a Title'),
      ]);
      const source = extractSource(node);
      expect(source.citation).toBe('Just a Title');
    });

    it('should build citation from author and title when publication is missing', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'AUTH', 'Jane Author'),
        makeNode(1, 'TITL', 'The Title'),
      ]);
      const source = extractSource(node);
      expect(source.citation).toBe('Jane Author. The Title');
    });

    it('should use "Untitled Source" in citation when title is missing but other fields present', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'AUTH', 'An Author'),
        makeNode(1, 'PUBL', 'A Publisher'),
      ]);
      const source = extractSource(node);
      expect(source.citation).toBe('An Author. Untitled Source. A Publisher');
    });
  });

  describe('minimal source', () => {
    it('should not crash with minimal data (just xref, no sub-tags)', () => {
      const node = makeNode(0, 'SOUR', '', '@S99@');
      const source = extractSource(node);
      expect(source.id).toBe('@S99@');
      expect(source.title).toBe('Untitled Source');
      expect(source.citation).toBe('Untitled Source');
      expect(source.notes).toBe('');
      expect(source.repository).toBeNull();
      expect(source.sourceClass).toBe('tertiary');
      expect(source.sourceType).toBe('other');
      expect(source.origin).toBe('gedcom_import');
    });
  });

  describe('source with all sub-tags', () => {
    it('should populate all fields from complete source record', () => {
      const node = makeNode(0, 'SOUR', '', '@S1@', [
        makeNode(1, 'TITL', 'Census of 1850'),
        makeNode(1, 'AUTH', 'US Census Bureau'),
        makeNode(1, 'PUBL', 'National Archives'),
        makeNode(1, 'TEXT', 'Federal population census for the year 1850'),
        makeNode(1, 'REPO', '@R1@'),
      ]);
      const source = extractSource(node);
      expect(source.id).toBe('@S1@');
      expect(source.title).toBe('Census of 1850');
      expect(source.citation).toBe('US Census Bureau. Census of 1850. National Archives');
      expect(source.notes).toBe('Federal population census for the year 1850');
      expect(source.repository).toBe('@R1@');
      expect(source.gedcomTag).toBe('@S1@');
      expect(source.sourceClass).toBe('tertiary');
      expect(source.sourceType).toBe('other');
      expect(source.origin).toBe('gedcom_import');
      expect(source.url).toBeNull();
      expect(source.provesWhat).toEqual([]);
      expect(source.attachedToPersonIds).toEqual([]);
      expect(source.attachedToEdgeIds).toEqual([]);
    });
  });
});
