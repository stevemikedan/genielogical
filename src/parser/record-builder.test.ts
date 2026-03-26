import { describe, it, expect } from 'vitest';
import { buildRecords } from './record-builder.ts';
import type { GedcomToken } from './tokenizer.ts';

/** Helper to create a GedcomToken */
function makeToken(
  level: number,
  tag: string,
  value: string = '',
  xref: string | null = null,
  lineNumber: number = 1
): GedcomToken {
  return { level, xref, tag, value, lineNumber };
}

describe('buildRecords', () => {
  describe('basic grouping', () => {
    it('should return an empty array for empty token array', () => {
      const result = buildRecords([]);
      expect(result).toEqual([]);
    });

    it('should return a single root node for a single level-0 token', () => {
      const tokens = [makeToken(0, 'HEAD', '', null, 1)];
      const result = buildRecords(tokens);
      expect(result).toHaveLength(1);
      expect(result[0].tag).toBe('HEAD');
      expect(result[0].level).toBe(0);
      expect(result[0].children).toEqual([]);
    });

    it('should create separate root nodes for multiple level-0 tokens', () => {
      const tokens = [
        makeToken(0, 'HEAD', '', null, 1),
        makeToken(0, 'INDI', '', '@I1@', 2),
        makeToken(0, 'TRLR', '', null, 3),
      ];
      const result = buildRecords(tokens);
      expect(result).toHaveLength(3);
      expect(result[0].tag).toBe('HEAD');
      expect(result[1].tag).toBe('INDI');
      expect(result[1].xref).toBe('@I1@');
      expect(result[2].tag).toBe('TRLR');
    });
  });

  describe('nesting', () => {
    it('should nest level-1 tokens under level-0', () => {
      const tokens = [
        makeToken(0, 'INDI', '', '@I1@', 1),
        makeToken(1, 'NAME', 'John /Smith/', null, 2),
        makeToken(1, 'SEX', 'M', null, 3),
      ];
      const result = buildRecords(tokens);
      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(2);
      expect(result[0].children[0].tag).toBe('NAME');
      expect(result[0].children[0].value).toBe('John /Smith/');
      expect(result[0].children[1].tag).toBe('SEX');
      expect(result[0].children[1].value).toBe('M');
    });

    it('should nest level-2 tokens under level-1', () => {
      const tokens = [
        makeToken(0, 'INDI', '', '@I1@', 1),
        makeToken(1, 'NAME', 'John /Smith/', null, 2),
        makeToken(2, 'GIVN', 'John', null, 3),
        makeToken(2, 'SURN', 'Smith', null, 4),
      ];
      const result = buildRecords(tokens);
      expect(result).toHaveLength(1);
      const nameNode = result[0].children[0];
      expect(nameNode.tag).toBe('NAME');
      expect(nameNode.children).toHaveLength(2);
      expect(nameNode.children[0].tag).toBe('GIVN');
      expect(nameNode.children[0].value).toBe('John');
      expect(nameNode.children[1].tag).toBe('SURN');
      expect(nameNode.children[1].value).toBe('Smith');
    });

    it('should handle deep nesting (level 0 -> 1 -> 2 -> 3)', () => {
      const tokens = [
        makeToken(0, 'HEAD', '', null, 1),
        makeToken(1, 'SOUR', 'MyApp', null, 2),
        makeToken(2, 'VERS', '1.0', null, 3),
        makeToken(3, 'NOTE', 'beta', null, 4),
      ];
      const result = buildRecords(tokens);
      expect(result).toHaveLength(1);
      expect(result[0].tag).toBe('HEAD');
      const sourNode = result[0].children[0];
      expect(sourNode.tag).toBe('SOUR');
      const versNode = sourNode.children[0];
      expect(versNode.tag).toBe('VERS');
      expect(versNode.value).toBe('1.0');
      const noteNode = versNode.children[0];
      expect(noteNode.tag).toBe('NOTE');
      expect(noteNode.value).toBe('beta');
    });

    it('should correctly handle siblings at the same nesting level', () => {
      const tokens = [
        makeToken(0, 'INDI', '', '@I1@', 1),
        makeToken(1, 'BIRT', '', null, 2),
        makeToken(2, 'DATE', '10 Apr 1990', null, 3),
        makeToken(2, 'PLAC', 'London, England', null, 4),
        makeToken(1, 'DEAT', '', null, 5),
        makeToken(2, 'DATE', '5 Jan 2050', null, 6),
      ];
      const result = buildRecords(tokens);
      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(2);

      const birt = result[0].children[0];
      expect(birt.tag).toBe('BIRT');
      expect(birt.children).toHaveLength(2);
      expect(birt.children[0].tag).toBe('DATE');
      expect(birt.children[1].tag).toBe('PLAC');

      const deat = result[0].children[1];
      expect(deat.tag).toBe('DEAT');
      expect(deat.children).toHaveLength(1);
      expect(deat.children[0].tag).toBe('DATE');
    });

    it('should handle going back up the nesting hierarchy', () => {
      // Level 0 -> 1 -> 2 -> back to 1 -> 2
      const tokens = [
        makeToken(0, 'INDI', '', '@I1@', 1),
        makeToken(1, 'NAME', 'John /Smith/', null, 2),
        makeToken(2, 'GIVN', 'John', null, 3),
        makeToken(1, 'BIRT', '', null, 4),
        makeToken(2, 'DATE', '1990', null, 5),
      ];
      const result = buildRecords(tokens);
      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(2);

      const nameNode = result[0].children[0];
      expect(nameNode.tag).toBe('NAME');
      expect(nameNode.children).toHaveLength(1);
      expect(nameNode.children[0].tag).toBe('GIVN');

      const birtNode = result[0].children[1];
      expect(birtNode.tag).toBe('BIRT');
      expect(birtNode.children).toHaveLength(1);
      expect(birtNode.children[0].tag).toBe('DATE');
    });
  });

  describe('edge cases', () => {
    it('should silently drop orphaned tokens when level jumps (e.g., 0 then 2 without 1)', () => {
      // The stack at level 1 will be undefined, so parent is undefined
      // and the node is not added anywhere
      const tokens = [
        makeToken(0, 'HEAD', '', null, 1),
        makeToken(2, 'VERS', '5.5.1', null, 2),
      ];
      const result = buildRecords(tokens);
      expect(result).toHaveLength(1);
      expect(result[0].tag).toBe('HEAD');
      // The level-2 token has no parent at level 1, so it is dropped
      expect(result[0].children).toHaveLength(0);
    });

    it('should handle level jump after valid nesting has been established', () => {
      const tokens = [
        makeToken(0, 'HEAD', '', null, 1),
        makeToken(1, 'SOUR', 'MyApp', null, 2),
        makeToken(2, 'VERS', '1.0', null, 3),
        // Now jump to level 3 without a level 2 parent being the most recent
        // stack is [HEAD, SOUR, VERS], so level 3 would look for stack[2] = VERS
        makeToken(3, 'NOTE', 'deep', null, 4),
      ];
      const result = buildRecords(tokens);
      // The level-3 NOTE should nest under VERS (stack[2])
      const versNode = result[0].children[0].children[0];
      expect(versNode.tag).toBe('VERS');
      expect(versNode.children).toHaveLength(1);
      expect(versNode.children[0].tag).toBe('NOTE');
    });

    it('should preserve lineNumber on nodes', () => {
      const tokens = [
        makeToken(0, 'HEAD', '', null, 42),
        makeToken(1, 'CHAR', 'UTF-8', null, 43),
      ];
      const result = buildRecords(tokens);
      expect(result[0].lineNumber).toBe(42);
      expect(result[0].children[0].lineNumber).toBe(43);
    });

    it('should preserve xref and value on nodes', () => {
      const tokens = [
        makeToken(0, 'INDI', '', '@I99@', 1),
        makeToken(1, 'NAME', 'Test /Person/', null, 2),
      ];
      const result = buildRecords(tokens);
      expect(result[0].xref).toBe('@I99@');
      expect(result[0].value).toBe('');
      expect(result[0].children[0].xref).toBeNull();
      expect(result[0].children[0].value).toBe('Test /Person/');
    });
  });

  describe('real-world GEDCOM structures', () => {
    it('should build a HEAD record with typical sub-tags', () => {
      const tokens = [
        makeToken(0, 'HEAD', '', null, 1),
        makeToken(1, 'SOUR', 'Ancestry.com', null, 2),
        makeToken(2, 'NAME', 'Ancestry.com Family Trees', null, 3),
        makeToken(2, 'VERS', '2.0', null, 4),
        makeToken(1, 'GEDC', '', null, 5),
        makeToken(2, 'VERS', '5.5.1', null, 6),
        makeToken(2, 'FORM', 'LINEAGE-LINKED', null, 7),
        makeToken(1, 'CHAR', 'UTF-8', null, 8),
      ];
      const result = buildRecords(tokens);
      expect(result).toHaveLength(1);
      const head = result[0];
      expect(head.tag).toBe('HEAD');
      expect(head.children).toHaveLength(3);

      // SOUR with NAME and VERS sub-tags
      const sour = head.children[0];
      expect(sour.tag).toBe('SOUR');
      expect(sour.value).toBe('Ancestry.com');
      expect(sour.children).toHaveLength(2);
      expect(sour.children[0].tag).toBe('NAME');
      expect(sour.children[1].tag).toBe('VERS');

      // GEDC with VERS and FORM
      const gedc = head.children[1];
      expect(gedc.tag).toBe('GEDC');
      expect(gedc.children).toHaveLength(2);
      expect(gedc.children[0].tag).toBe('VERS');
      expect(gedc.children[0].value).toBe('5.5.1');

      // CHAR
      expect(head.children[2].tag).toBe('CHAR');
      expect(head.children[2].value).toBe('UTF-8');
    });

    it('should build an INDI record with NAME, SEX, BIRT, DEAT sub-tags', () => {
      const tokens = [
        makeToken(0, 'INDI', '', '@I1@', 1),
        makeToken(1, 'NAME', 'John /Smith/', null, 2),
        makeToken(2, 'GIVN', 'John', null, 3),
        makeToken(2, 'SURN', 'Smith', null, 4),
        makeToken(1, 'SEX', 'M', null, 5),
        makeToken(1, 'BIRT', '', null, 6),
        makeToken(2, 'DATE', '10 Apr 1990', null, 7),
        makeToken(2, 'PLAC', 'London, England', null, 8),
        makeToken(1, 'DEAT', '', null, 9),
        makeToken(2, 'DATE', '1 Jan 2070', null, 10),
      ];
      const result = buildRecords(tokens);
      expect(result).toHaveLength(1);
      const indi = result[0];
      expect(indi.tag).toBe('INDI');
      expect(indi.xref).toBe('@I1@');
      expect(indi.children).toHaveLength(4); // NAME, SEX, BIRT, DEAT

      const name = indi.children[0];
      expect(name.tag).toBe('NAME');
      expect(name.children).toHaveLength(2); // GIVN, SURN

      const birt = indi.children[2];
      expect(birt.tag).toBe('BIRT');
      expect(birt.children).toHaveLength(2); // DATE, PLAC

      const deat = indi.children[3];
      expect(deat.tag).toBe('DEAT');
      expect(deat.children).toHaveLength(1); // DATE
    });

    it('should build a FAM record with HUSB, WIFE, CHIL, MARR sub-tags', () => {
      const tokens = [
        makeToken(0, 'FAM', '', '@F1@', 1),
        makeToken(1, 'HUSB', '@I1@', null, 2),
        makeToken(1, 'WIFE', '@I2@', null, 3),
        makeToken(1, 'CHIL', '@I3@', null, 4),
        makeToken(1, 'CHIL', '@I4@', null, 5),
        makeToken(1, 'MARR', '', null, 6),
        makeToken(2, 'DATE', '15 Jun 1985', null, 7),
        makeToken(2, 'PLAC', 'New York, USA', null, 8),
      ];
      const result = buildRecords(tokens);
      expect(result).toHaveLength(1);
      const fam = result[0];
      expect(fam.tag).toBe('FAM');
      expect(fam.xref).toBe('@F1@');
      expect(fam.children).toHaveLength(5); // HUSB, WIFE, CHIL, CHIL, MARR

      const marr = fam.children[4];
      expect(marr.tag).toBe('MARR');
      expect(marr.children).toHaveLength(2); // DATE, PLAC
    });

    it('should handle a multi-record file with HEAD, INDI, FAM, TRLR', () => {
      const tokens = [
        makeToken(0, 'HEAD', '', null, 1),
        makeToken(1, 'CHAR', 'UTF-8', null, 2),
        makeToken(0, 'INDI', '', '@I1@', 3),
        makeToken(1, 'NAME', 'John /Smith/', null, 4),
        makeToken(0, 'FAM', '', '@F1@', 5),
        makeToken(1, 'HUSB', '@I1@', null, 6),
        makeToken(0, 'TRLR', '', null, 7),
      ];
      const result = buildRecords(tokens);
      expect(result).toHaveLength(4);
      expect(result[0].tag).toBe('HEAD');
      expect(result[0].children).toHaveLength(1);
      expect(result[1].tag).toBe('INDI');
      expect(result[1].children).toHaveLength(1);
      expect(result[2].tag).toBe('FAM');
      expect(result[2].children).toHaveLength(1);
      expect(result[3].tag).toBe('TRLR');
      expect(result[3].children).toHaveLength(0);
    });
  });
});
