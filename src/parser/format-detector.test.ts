import { describe, it, expect } from 'vitest';
import { detectFormat } from './format-detector.ts';
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

describe('detectFormat', () => {
  describe('version extraction', () => {
    it('should extract version from HEAD > GEDC > VERS', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'GEDC', '', null, [
            makeNode(2, 'VERS', '5.5.1'),
          ]),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.version).toBe('5.5.1');
    });

    it('should extract version "5.5"', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'GEDC', '', null, [
            makeNode(2, 'VERS', '5.5'),
          ]),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.version).toBe('5.5');
    });

    it('should return null version when GEDC is missing', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'CHAR', 'UTF-8'),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.version).toBeNull();
    });

    it('should return null version when VERS is missing under GEDC', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'GEDC', '', null, [
            makeNode(2, 'FORM', 'LINEAGE-LINKED'),
          ]),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.version).toBeNull();
    });

    it('should return null version when VERS has empty value', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'GEDC', '', null, [
            makeNode(2, 'VERS', ''),
          ]),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.version).toBeNull();
    });
  });

  describe('charset extraction', () => {
    it('should extract charset from HEAD > CHAR', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'CHAR', 'UTF-8'),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.charset).toBe('UTF-8');
    });

    it('should extract ANSEL charset', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'CHAR', 'ANSEL'),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.charset).toBe('ANSEL');
    });

    it('should extract ASCII charset', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'CHAR', 'ASCII'),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.charset).toBe('ASCII');
    });

    it('should return null charset when CHAR is missing', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'GEDC', '', null, [
            makeNode(2, 'VERS', '5.5.1'),
          ]),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.charset).toBeNull();
    });

    it('should return null charset when CHAR has empty value', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'CHAR', ''),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.charset).toBeNull();
    });
  });

  describe('software extraction', () => {
    it('should extract software from HEAD > SOUR > NAME sub-tag', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'SOUR', 'ANCFAM', null, [
            makeNode(2, 'NAME', 'Ancestry.com Family Trees'),
          ]),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.software).toBe('Ancestry.com Family Trees');
    });

    it('should fall back to SOUR value when NAME sub-tag is absent', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'SOUR', 'MyGenealogyApp'),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.software).toBe('MyGenealogyApp');
    });

    it('should prefer NAME sub-tag over SOUR value', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'SOUR', 'SHORTCODE', null, [
            makeNode(2, 'NAME', 'Full Software Name'),
          ]),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.software).toBe('Full Software Name');
    });

    it('should use SOUR value when NAME sub-tag has empty value', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'SOUR', 'FallbackApp', null, [
            makeNode(2, 'NAME', ''),
          ]),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.software).toBe('FallbackApp');
    });

    it('should return null software when SOUR is missing', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'CHAR', 'UTF-8'),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.software).toBeNull();
    });

    it('should return null software when SOUR has empty value and no NAME', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'SOUR', ''),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.software).toBeNull();
    });
  });

  describe('no HEAD record', () => {
    it('should return all nulls when no HEAD record exists', () => {
      const records = [
        makeNode(0, 'INDI', '', '@I1@', [
          makeNode(1, 'NAME', 'John /Smith/'),
        ]),
        makeNode(0, 'TRLR'),
      ];
      const result = detectFormat(records);
      expect(result.version).toBeNull();
      expect(result.charset).toBeNull();
      expect(result.software).toBeNull();
    });

    it('should return all nulls for an empty records array', () => {
      const result = detectFormat([]);
      expect(result.version).toBeNull();
      expect(result.charset).toBeNull();
      expect(result.software).toBeNull();
    });
  });

  describe('HEAD with partial sub-tags', () => {
    it('should return partial results when only some sub-tags exist', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'CHAR', 'UTF-8'),
          // No GEDC, no SOUR
        ]),
      ];
      const result = detectFormat(records);
      expect(result.version).toBeNull();
      expect(result.charset).toBe('UTF-8');
      expect(result.software).toBeNull();
    });

    it('should extract all fields from a complete HEAD record', () => {
      const records = [
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'SOUR', 'PAF', null, [
            makeNode(2, 'NAME', 'Personal Ancestral File'),
            makeNode(2, 'VERS', '5.2'),
          ]),
          makeNode(1, 'GEDC', '', null, [
            makeNode(2, 'VERS', '5.5.1'),
            makeNode(2, 'FORM', 'LINEAGE-LINKED'),
          ]),
          makeNode(1, 'CHAR', 'ANSEL'),
        ]),
      ];
      const result = detectFormat(records);
      expect(result.version).toBe('5.5.1');
      expect(result.charset).toBe('ANSEL');
      expect(result.software).toBe('Personal Ancestral File');
    });
  });

  describe('HEAD not the first record', () => {
    it('should find HEAD even if it is not the first record', () => {
      const records = [
        makeNode(0, 'NOTE', 'This file was created...'),
        makeNode(0, 'HEAD', '', null, [
          makeNode(1, 'CHAR', 'UTF-8'),
          makeNode(1, 'GEDC', '', null, [
            makeNode(2, 'VERS', '5.5'),
          ]),
        ]),
        makeNode(0, 'TRLR'),
      ];
      const result = detectFormat(records);
      expect(result.version).toBe('5.5');
      expect(result.charset).toBe('UTF-8');
    });
  });
});
