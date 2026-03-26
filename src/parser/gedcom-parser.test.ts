import { describe, it, expect } from 'vitest';
import { parseGedcom } from './gedcom-parser.ts';

/** A small but complete GEDCOM fixture for integration testing. */
const SMALL_GEDCOM = `0 HEAD
1 SOUR TestApp
2 NAME Test Application
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
2 GIVN John
2 SURN Smith
1 SEX M
1 BIRT
2 DATE 10 Apr 1950
2 PLAC Springfield, Illinois, USA
1 DEAT
2 DATE 15 JAN 2020
2 PLAC Chicago, Illinois, USA
1 FAMS @F1@
1 SOUR @S1@
0 @I2@ INDI
1 NAME Mary /Jones/
1 SEX F
1 BIRT
2 DATE 22 AUG 1955
1 FAMS @F1@
0 @I3@ INDI
1 NAME James /Smith/
1 SEX M
1 BIRT
2 DATE 5 MAR 1980
2 PLAC Chicago, Illinois, USA
1 FAMC @F1@
0 @I4@ INDI
1 NAME Sarah /Smith/
1 SEX F
1 BIRT
2 DATE 12 JUL 1983
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 CHIL @I4@
1 MARR
2 DATE 15 JUN 1975
2 PLAC Las Vegas, Nevada, USA
0 @S1@ SOUR
1 TITL Illinois Birth Records
1 AUTH State of Illinois
1 PUBL Springfield, IL
0 TRLR`;

describe('parseGedcom', () => {
  describe('basic parsing', () => {
    it('should parse a complete GEDCOM file', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      expect(result.errors).toHaveLength(0);
    });

    it('should extract all individuals', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      expect(result.persons.size).toBe(4);
      expect(result.stats.individualCount).toBe(4);
    });

    it('should extract families', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      expect(result.families).toHaveLength(1);
      expect(result.stats.familyCount).toBe(1);
    });

    it('should extract sources', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      expect(result.sources.size).toBe(1);
      expect(result.stats.sourceCount).toBe(1);
    });
  });

  describe('person extraction', () => {
    it('should parse person names correctly', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      const john = result.persons.get('@I1@');
      expect(john).toBeDefined();
      expect(john!.name.given).toBe('John');
      expect(john!.name.surname).toBe('Smith');
      expect(john!.sex).toBe('M');
    });

    it('should parse birth and death events', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      const john = result.persons.get('@I1@');
      expect(john!.birth.date).not.toBeNull();
      expect(john!.birth.date!.year).toBe(1950);
      expect(john!.birth.place).not.toBeNull();
      expect(john!.birth.place!.city).toBe('Springfield');
      expect(john!.death.date!.year).toBe(2020);
    });
  });

  describe('family linking', () => {
    it('should create parent-child edges', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      // 2 parents * 2 children = 4 edges
      expect(result.edges.length).toBe(4);
      expect(result.stats.edgeCount).toBe(4);
    });

    it('should create edges with correct parent and child IDs', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      const fatherToSon = result.edges.find(
        (e) => e.parentId === '@I1@' && e.childId === '@I3@'
      );
      expect(fatherToSon).toBeDefined();
      expect(fatherToSon!.familyGedcomXref).toBe('@F1@');
    });

    it('should set default relationship type to biological', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      for (const edge of result.edges) {
        expect(edge.relationshipType).toBe('biological');
      }
    });

    it('should set edges as primary when no parallel paths exist', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      for (const edge of result.edges) {
        expect(edge.isPrimary).toBe(true);
        expect(edge.parallelGroupId).toBeNull();
      }
    });
  });

  describe('source linking', () => {
    it('should link person source references to source objects', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      const john = result.persons.get('@I1@');
      expect(john!.sourceIds).toContain('@S1@');

      const source = result.sources.get('@S1@');
      expect(source).toBeDefined();
      expect(source!.attachedToPersonIds).toContain('@I1@');
    });

    it('should parse source details', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      const source = result.sources.get('@S1@');
      expect(source!.title).toBe('Illinois Birth Records');
      expect(source!.sourceClass).toBe('tertiary');
      expect(source!.origin).toBe('gedcom_import');
    });
  });

  describe('format detection', () => {
    it('should detect GEDCOM version', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      expect(result.stats.gedcomVersion).toBe('5.5.1');
    });

    it('should detect character set', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      expect(result.stats.charset).toBe('UTF-8');
    });

    it('should detect software', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      expect(result.stats.software).toBe('Test Application');
    });
  });

  describe('generation count', () => {
    it('should estimate generation count', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      // John/Mary -> James/Sarah = 2 generations
      expect(result.stats.generationCount).toBe(2);
    });
  });

  describe('marriage parsing', () => {
    it('should parse marriage date in family', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      const family = result.families[0];
      expect(family.marriageDate).not.toBeNull();
      expect(family.marriageDate!.year).toBe(1975);
    });

    it('should parse marriage place in family', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      const family = result.families[0];
      expect(family.marriagePlace).not.toBeNull();
      expect(family.marriagePlace!.city).toBe('Las Vegas');
    });
  });

  describe('parallel paths', () => {
    it('should create parallel group for child in multiple families', () => {
      const gedcom = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Father /One/
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Mother /One/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Father /Two/
1 SEX M
1 FAMS @F2@
0 @I4@ INDI
1 NAME Mother /Two/
1 SEX F
1 FAMS @F2@
0 @I5@ INDI
1 NAME Shared /Child/
1 FAMC @F1@
1 FAMC @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I5@
0 @F2@ FAM
1 HUSB @I3@
1 WIFE @I4@
1 CHIL @I5@
0 TRLR`;

      const result = parseGedcom(gedcom);

      // I5 has 2 sets of parents: 2 parents * 2 families = 4 edges to I5
      const childEdges = result.edges.filter((e) => e.childId === '@I5@');
      expect(childEdges.length).toBe(4);

      // All should have a parallelGroupId
      for (const edge of childEdges) {
        expect(edge.parallelGroupId).not.toBeNull();
      }

      // Edges from F1 should be primary, F2 should not
      const f1Edges = childEdges.filter((e) => e.familyGedcomXref === '@F1@');
      const f2Edges = childEdges.filter((e) => e.familyGedcomXref === '@F2@');
      expect(f1Edges.every((e) => e.isPrimary)).toBe(true);
      expect(f2Edges.every((e) => !e.isPrimary)).toBe(true);
    });
  });

  describe('custom tags', () => {
    it('should warn about custom tags but not fail', () => {
      const gedcom = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME John /Smith/
1 _APID 1,1234::5678
1 _TREE MyTree
0 TRLR`;

      const result = parseGedcom(gedcom);
      expect(result.errors).toHaveLength(0);
      expect(result.persons.size).toBe(1);

      // Should have warnings for custom tags
      const customWarnings = result.warnings.filter((w) => w.tag.startsWith('_'));
      expect(customWarnings.length).toBeGreaterThan(0);
    });
  });

  describe('resilience', () => {
    it('should handle empty input', () => {
      const result = parseGedcom('');
      expect(result.persons.size).toBe(0);
      expect(result.edges).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle minimal GEDCOM', () => {
      const result = parseGedcom('0 HEAD\n0 TRLR');
      expect(result.persons.size).toBe(0);
      expect(result.families).toHaveLength(0);
    });

    it('should handle GEDCOM with BOM', () => {
      const result = parseGedcom('\uFEFF0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 TRLR');
      expect(result.stats.gedcomVersion).toBe('5.5.1');
    });
  });

  describe('parse stats', () => {
    it('should report parse time in milliseconds', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      expect(result.stats.parseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should report warning and error counts', () => {
      const result = parseGedcom(SMALL_GEDCOM);
      expect(result.stats.warningCount).toBeGreaterThanOrEqual(0);
      expect(result.stats.errorCount).toBe(0);
    });
  });

  describe('PEDI sub-tag', () => {
    it('should detect adopted relationship from PEDI sub-tag', () => {
      const gedcom = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Father /Smith/
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Child /Smith/
1 FAMC @F1@
2 PEDI adopted
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
0 TRLR`;

      const result = parseGedcom(gedcom);
      const edge = result.edges.find(
        (e) => e.parentId === '@I1@' && e.childId === '@I2@'
      );
      expect(edge).toBeDefined();
      expect(edge!.relationshipType).toBe('adoptive');
    });
  });
});
