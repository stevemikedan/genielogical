import { describe, it, expect } from 'vitest';
import { extractFamily } from './family-extractor.ts';
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

describe('extractFamily', () => {
  describe('family ID', () => {
    it('should use xref as family ID', () => {
      const node = makeNode(0, 'FAM', '', '@F1@');
      const family = extractFamily(node);
      expect(family.id).toBe('@F1@');
    });

    it('should fall back to value when xref is null', () => {
      const node = makeNode(0, 'FAM', 'F100');
      const family = extractFamily(node);
      expect(family.id).toBe('F100');
    });

    it('should set empty string when both xref and value are empty', () => {
      const node = makeNode(0, 'FAM', '');
      const family = extractFamily(node);
      expect(family.id).toBe('');
    });
  });

  describe('husband extraction', () => {
    it('should extract husband ID from HUSB tag', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'HUSB', '@I1@'),
      ]);
      const family = extractFamily(node);
      expect(family.husbandId).toBe('@I1@');
    });

    it('should trim whitespace from husband ID', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'HUSB', '  @I1@  '),
      ]);
      const family = extractFamily(node);
      expect(family.husbandId).toBe('@I1@');
    });

    it('should return null husbandId when no HUSB tag', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'WIFE', '@I2@'),
      ]);
      const family = extractFamily(node);
      expect(family.husbandId).toBeNull();
    });

    it('should return null husbandId when HUSB has empty value', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'HUSB', ''),
      ]);
      const family = extractFamily(node);
      expect(family.husbandId).toBeNull();
    });
  });

  describe('wife extraction', () => {
    it('should extract wife ID from WIFE tag', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'WIFE', '@I2@'),
      ]);
      const family = extractFamily(node);
      expect(family.wifeId).toBe('@I2@');
    });

    it('should trim whitespace from wife ID', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'WIFE', '  @I2@  '),
      ]);
      const family = extractFamily(node);
      expect(family.wifeId).toBe('@I2@');
    });

    it('should return null wifeId when no WIFE tag', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'HUSB', '@I1@'),
      ]);
      const family = extractFamily(node);
      expect(family.wifeId).toBeNull();
    });

    it('should return null wifeId when WIFE has empty value', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'WIFE', ''),
      ]);
      const family = extractFamily(node);
      expect(family.wifeId).toBeNull();
    });
  });

  describe('children extraction', () => {
    it('should extract single child ID from CHIL tag', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'CHIL', '@I3@'),
      ]);
      const family = extractFamily(node);
      expect(family.childIds).toEqual(['@I3@']);
    });

    it('should extract multiple children IDs from CHIL tags', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'CHIL', '@I3@'),
        makeNode(1, 'CHIL', '@I4@'),
        makeNode(1, 'CHIL', '@I5@'),
      ]);
      const family = extractFamily(node);
      expect(family.childIds).toEqual(['@I3@', '@I4@', '@I5@']);
    });

    it('should return empty array when no CHIL tags', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'HUSB', '@I1@'),
        makeNode(1, 'WIFE', '@I2@'),
      ]);
      const family = extractFamily(node);
      expect(family.childIds).toEqual([]);
    });

    it('should trim whitespace from child IDs', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'CHIL', '  @I3@  '),
      ]);
      const family = extractFamily(node);
      expect(family.childIds).toEqual(['@I3@']);
    });

    it('should filter out empty child values', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'CHIL', '@I3@'),
        makeNode(1, 'CHIL', ''),
        makeNode(1, 'CHIL', '@I4@'),
      ]);
      const family = extractFamily(node);
      expect(family.childIds).toEqual(['@I3@', '@I4@']);
    });
  });

  describe('marriage event', () => {
    it('should extract marriage date from MARR > DATE', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'MARR', '', null, [
          makeNode(2, 'DATE', '15 Jun 1985'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.marriageDate).not.toBeNull();
      expect(family.marriageDate!.raw).toBe('15 Jun 1985');
      expect(family.marriageDate!.year).toBe(1985);
    });

    it('should extract marriage place from MARR > PLAC', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'MARR', '', null, [
          makeNode(2, 'PLAC', 'New York, New York, USA'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.marriagePlace).not.toBeNull();
      expect(family.marriagePlace!.raw).toBe('New York, New York, USA');
      expect(family.marriagePlace!.city).toBe('New York');
      expect(family.marriagePlace!.country).toBe('United States');
    });

    it('should extract both date and place from MARR', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'MARR', '', null, [
          makeNode(2, 'DATE', '25 Dec 1900'),
          makeNode(2, 'PLAC', 'London, England'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.marriageDate).not.toBeNull();
      expect(family.marriagePlace).not.toBeNull();
    });

    it('should return null marriage date and place when no MARR tag', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'HUSB', '@I1@'),
      ]);
      const family = extractFamily(node);
      expect(family.marriageDate).toBeNull();
      expect(family.marriagePlace).toBeNull();
    });

    it('should return null date when MARR has no DATE sub-tag', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'MARR', '', null, [
          makeNode(2, 'PLAC', 'Boston, USA'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.marriageDate).toBeNull();
      expect(family.marriagePlace).not.toBeNull();
    });

    it('should return null place when MARR has no PLAC sub-tag', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'MARR', '', null, [
          makeNode(2, 'DATE', '1 Jan 1900'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.marriageDate).not.toBeNull();
      expect(family.marriagePlace).toBeNull();
    });
  });

  describe('divorce event', () => {
    it('should extract divorce date from DIV > DATE', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'DIV', '', null, [
          makeNode(2, 'DATE', '10 Mar 1995'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.divorceDate).not.toBeNull();
      expect(family.divorceDate!.raw).toBe('10 Mar 1995');
      expect(family.divorceDate!.year).toBe(1995);
    });

    it('should return null divorce date when no DIV tag', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'HUSB', '@I1@'),
      ]);
      const family = extractFamily(node);
      expect(family.divorceDate).toBeNull();
    });

    it('should return null divorce date when DIV has no DATE sub-tag', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'DIV', ''),
      ]);
      const family = extractFamily(node);
      expect(family.divorceDate).toBeNull();
    });
  });

  describe('family events', () => {
    it('should collect MARR as a marriage event', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'MARR', '', null, [
          makeNode(2, 'DATE', '15 Jun 1985'),
          makeNode(2, 'PLAC', 'New York, USA'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.events).toHaveLength(1);
      expect(family.events[0].type).toBe('marriage');
      expect(family.events[0].date).not.toBeNull();
      expect(family.events[0].place).not.toBeNull();
    });

    it('should collect DIV as a divorce event', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'DIV', '', null, [
          makeNode(2, 'DATE', '1 Jan 2000'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.events).toHaveLength(1);
      expect(family.events[0].type).toBe('divorce');
    });

    it('should collect ANUL as a divorce event', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'ANUL', '', null, [
          makeNode(2, 'DATE', '5 May 1990'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.events).toHaveLength(1);
      expect(family.events[0].type).toBe('divorce');
    });

    it('should collect EVEN as an "other" event', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'EVEN', '', null, [
          makeNode(2, 'DATE', '1850'),
          makeNode(2, 'NOTE', 'Family reunion'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.events).toHaveLength(1);
      expect(family.events[0].type).toBe('other');
      expect(family.events[0].notes).toBe('Family reunion');
    });

    it('should collect CENS as a census event', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'CENS', '', null, [
          makeNode(2, 'DATE', '1880'),
          makeNode(2, 'PLAC', 'Ohio, USA'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.events).toHaveLength(1);
      expect(family.events[0].type).toBe('census');
    });

    it('should collect multiple events', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'MARR', '', null, [
          makeNode(2, 'DATE', '15 Jun 1985'),
        ]),
        makeNode(1, 'DIV', '', null, [
          makeNode(2, 'DATE', '1 Jan 2000'),
        ]),
        makeNode(1, 'CENS', '', null, [
          makeNode(2, 'DATE', '1990'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.events).toHaveLength(3);
      expect(family.events[0].type).toBe('marriage');
      expect(family.events[1].type).toBe('divorce');
      expect(family.events[2].type).toBe('census');
    });

    it('should return empty events array when no event tags exist', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'HUSB', '@I1@'),
        makeNode(1, 'WIFE', '@I2@'),
      ]);
      const family = extractFamily(node);
      expect(family.events).toEqual([]);
    });

    it('should collect event source references from SOUR sub-tags', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'MARR', '', null, [
          makeNode(2, 'DATE', '15 Jun 1985'),
          makeNode(2, 'SOUR', '@S1@'),
          makeNode(2, 'SOUR', '@S2@'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.events[0].sourceIds).toEqual(['@S1@', '@S2@']);
    });

    it('should default event notes to empty string when NOTE is missing', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'MARR', '', null, [
          makeNode(2, 'DATE', '1900'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.events[0].notes).toBe('');
    });

    it('should not include non-event tags (HUSB, WIFE, CHIL) in events', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'HUSB', '@I1@'),
        makeNode(1, 'WIFE', '@I2@'),
        makeNode(1, 'CHIL', '@I3@'),
        makeNode(1, 'MARR', '', null, [
          makeNode(2, 'DATE', '1900'),
        ]),
      ]);
      const family = extractFamily(node);
      expect(family.events).toHaveLength(1);
      expect(family.events[0].type).toBe('marriage');
    });
  });

  describe('inline source references', () => {
    it('should collect source references from SOUR sub-tags on the family', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'SOUR', '@S1@'),
        makeNode(1, 'SOUR', '@S2@'),
      ]);
      const family = extractFamily(node);
      expect(family.sourceIds).toEqual(['@S1@', '@S2@']);
    });

    it('should return empty sourceIds when no SOUR tags', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'HUSB', '@I1@'),
      ]);
      const family = extractFamily(node);
      expect(family.sourceIds).toEqual([]);
    });

    it('should filter out SOUR tags with empty values', () => {
      const node = makeNode(0, 'FAM', '', '@F1@', [
        makeNode(1, 'SOUR', '@S1@'),
        makeNode(1, 'SOUR', ''),
        makeNode(1, 'SOUR', '@S3@'),
      ]);
      const family = extractFamily(node);
      expect(family.sourceIds).toEqual(['@S1@', '@S3@']);
    });
  });

  describe('complete family record', () => {
    it('should correctly parse a complete real-world family record', () => {
      const node = makeNode(0, 'FAM', '', '@F42@', [
        makeNode(1, 'HUSB', '@I100@'),
        makeNode(1, 'WIFE', '@I101@'),
        makeNode(1, 'CHIL', '@I102@'),
        makeNode(1, 'CHIL', '@I103@'),
        makeNode(1, 'CHIL', '@I104@'),
        makeNode(1, 'MARR', '', null, [
          makeNode(2, 'DATE', '15 Jun 1950'),
          makeNode(2, 'PLAC', 'Springfield, Sangamon, Illinois, USA'),
          makeNode(2, 'SOUR', '@S10@'),
        ]),
        makeNode(1, 'SOUR', '@S5@'),
      ]);
      const family = extractFamily(node);
      expect(family.id).toBe('@F42@');
      expect(family.husbandId).toBe('@I100@');
      expect(family.wifeId).toBe('@I101@');
      expect(family.childIds).toEqual(['@I102@', '@I103@', '@I104@']);
      expect(family.marriageDate).not.toBeNull();
      expect(family.marriageDate!.year).toBe(1950);
      expect(family.marriagePlace).not.toBeNull();
      expect(family.marriagePlace!.city).toBe('Springfield');
      expect(family.marriagePlace!.state).toBe('Illinois');
      expect(family.marriagePlace!.country).toBe('United States');
      expect(family.divorceDate).toBeNull();
      expect(family.events).toHaveLength(1);
      expect(family.events[0].sourceIds).toEqual(['@S10@']);
      expect(family.sourceIds).toEqual(['@S5@']);
    });
  });
});
