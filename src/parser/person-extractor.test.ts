import { describe, it, expect } from 'vitest';
import { extractPerson } from './person-extractor.ts';
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

describe('extractPerson', () => {
  describe('name parsing', () => {
    it('should parse name with /Surname/ pattern', () => {
      const node = makeNode(0, 'INDI', '', '@I1@', [
        makeNode(1, 'NAME', 'John /Smith/'),
        makeNode(1, 'SEX', 'M'),
      ]);

      const person = extractPerson(node);
      expect(person.name.given).toBe('John');
      expect(person.name.surname).toBe('Smith');
      expect(person.name.full).toBe('John Smith');
      expect(person.name.raw).toBe('John /Smith/');
    });

    it('should handle name with no surname delimiters', () => {
      const node = makeNode(0, 'INDI', '', '@I2@', [
        makeNode(1, 'NAME', 'Mary Jane'),
      ]);

      const person = extractPerson(node);
      expect(person.name.given).toBe('Mary Jane');
      expect(person.name.surname).toBe('');
    });

    it('should use GIVN and SURN sub-tags when present', () => {
      const nameNode = makeNode(1, 'NAME', 'John /Smith/', null, [
        makeNode(2, 'GIVN', 'Jonathan'),
        makeNode(2, 'SURN', 'Smyth'),
      ]);

      const node = makeNode(0, 'INDI', '', '@I3@', [nameNode]);
      const person = extractPerson(node);
      expect(person.name.given).toBe('Jonathan');
      expect(person.name.surname).toBe('Smyth');
    });

    it('should handle NPFX (name prefix)', () => {
      const nameNode = makeNode(1, 'NAME', 'John /Smith/', null, [
        makeNode(2, 'NPFX', 'Dr.'),
      ]);

      const node = makeNode(0, 'INDI', '', '@I4@', [nameNode]);
      const person = extractPerson(node);
      expect(person.name.prefix).toBe('Dr.');
      expect(person.name.full).toContain('Dr.');
    });

    it('should handle NSFX (name suffix)', () => {
      const nameNode = makeNode(1, 'NAME', 'John /Smith/', null, [
        makeNode(2, 'NSFX', 'Jr.'),
      ]);

      const node = makeNode(0, 'INDI', '', '@I5@', [nameNode]);
      const person = extractPerson(node);
      expect(person.name.suffix).toBe('Jr.');
      expect(person.name.full).toContain('Jr.');
    });

    it('should strip embedded titles from display suffix', () => {
      const nameNode = makeNode(1, 'NAME', 'Robert /Stewart/', null, [
        makeNode(2, 'NSFX', '15th GGF'),
      ]);

      const node = makeNode(0, 'INDI', '', '@I6@', [nameNode]);
      const person = extractPerson(node);
      expect(person.name.suffix).toBe('');
      expect(person.name.full).toBe('Robert Stewart');
    });

    it('should handle empty name', () => {
      const node = makeNode(0, 'INDI', '', '@I7@', []);
      const person = extractPerson(node);
      expect(person.name.full).toBe('Unknown');
    });
  });

  describe('sex parsing', () => {
    it('should parse SEX M', () => {
      const node = makeNode(0, 'INDI', '', '@I1@', [
        makeNode(1, 'NAME', 'John /Smith/'),
        makeNode(1, 'SEX', 'M'),
      ]);
      expect(extractPerson(node).sex).toBe('M');
    });

    it('should parse SEX F', () => {
      const node = makeNode(0, 'INDI', '', '@I2@', [
        makeNode(1, 'NAME', 'Jane /Smith/'),
        makeNode(1, 'SEX', 'F'),
      ]);
      expect(extractPerson(node).sex).toBe('F');
    });

    it('should default to U for unknown sex', () => {
      const node = makeNode(0, 'INDI', '', '@I3@', [
        makeNode(1, 'NAME', 'Pat /Smith/'),
      ]);
      expect(extractPerson(node).sex).toBe('U');
    });
  });

  describe('event parsing', () => {
    it('should parse BIRT with DATE and PLAC', () => {
      const birtNode = makeNode(1, 'BIRT', '', null, [
        makeNode(2, 'DATE', '10 Apr 1990'),
        makeNode(2, 'PLAC', 'Springfield, Illinois, USA'),
      ]);
      const node = makeNode(0, 'INDI', '', '@I1@', [
        makeNode(1, 'NAME', 'John /Smith/'),
        birtNode,
      ]);

      const person = extractPerson(node);
      expect(person.birth.date).not.toBeNull();
      expect(person.birth.date!.year).toBe(1990);
      expect(person.birth.place).not.toBeNull();
      expect(person.birth.place!.city).toBe('Springfield');
    });

    it('should parse DEAT event', () => {
      const deatNode = makeNode(1, 'DEAT', '', null, [
        makeNode(2, 'DATE', '15 JAN 2020'),
      ]);
      const node = makeNode(0, 'INDI', '', '@I1@', [
        makeNode(1, 'NAME', 'John /Smith/'),
        deatNode,
      ]);

      const person = extractPerson(node);
      expect(person.death.date).not.toBeNull();
      expect(person.death.date!.year).toBe(2020);
    });

    it('should parse BURI event', () => {
      const buriNode = makeNode(1, 'BURI', '', null, [
        makeNode(2, 'PLAC', 'Oak Hill Cemetery'),
      ]);
      const node = makeNode(0, 'INDI', '', '@I1@', [
        makeNode(1, 'NAME', 'John /Smith/'),
        buriNode,
      ]);

      const person = extractPerson(node);
      expect(person.burial).not.toBeNull();
      expect(person.burial!.place!.city).toBe('Oak Hill Cemetery');
    });

    it('should parse other life events (OCCU, RESI, etc.)', () => {
      const occuNode = makeNode(1, 'OCCU', 'Farmer', null, [
        makeNode(2, 'DATE', '1850'),
      ]);
      const node = makeNode(0, 'INDI', '', '@I1@', [
        makeNode(1, 'NAME', 'John /Smith/'),
        occuNode,
      ]);

      const person = extractPerson(node);
      expect(person.events).toHaveLength(1);
      expect(person.events[0].type).toBe('occupation');
    });
  });

  describe('source references', () => {
    it('should collect inline SOUR references', () => {
      const node = makeNode(0, 'INDI', '', '@I1@', [
        makeNode(1, 'NAME', 'John /Smith/'),
        makeNode(1, 'SOUR', '@S1@'),
        makeNode(1, 'SOUR', '@S2@'),
      ]);

      const person = extractPerson(node);
      expect(person.sourceIds).toContain('@S1@');
      expect(person.sourceIds).toContain('@S2@');
    });
  });

  describe('defaults', () => {
    it('should set defaults for confidenceTier and status', () => {
      const node = makeNode(0, 'INDI', '', '@I1@', [
        makeNode(1, 'NAME', 'John /Smith/'),
      ]);

      const person = extractPerson(node);
      expect(person.confidenceTier).toBe(3);
      expect(person.status).toBe('tentative');
    });

    it('should set GEDCOM xref', () => {
      const node = makeNode(0, 'INDI', '', '@I99@', [
        makeNode(1, 'NAME', 'John /Smith/'),
      ]);

      const person = extractPerson(node);
      expect(person.gedcomXref).toBe('@I99@');
      expect(person.id).toBe('@I99@');
    });

    it('should collect FAMS and FAMC xrefs', () => {
      const node = makeNode(0, 'INDI', '', '@I1@', [
        makeNode(1, 'NAME', 'John /Smith/'),
        makeNode(1, 'FAMS', '@F1@'),
        makeNode(1, 'FAMS', '@F2@'),
        makeNode(1, 'FAMC', '@F3@'),
      ]);

      const person = extractPerson(node);
      expect(person.familyIdAsSpouse).toEqual(['@F1@', '@F2@']);
      expect(person.familyIdAsChild).toEqual(['@F3@']);
    });
  });
});
