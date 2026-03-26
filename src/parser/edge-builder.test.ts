import { describe, it, expect } from 'vitest';
import { buildEdges, extractPediInfo } from './edge-builder.ts';
import type { GedcomNode } from './record-builder.ts';
import type { ParsedFamily } from '@/types/family.ts';

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

/** Helper to create a ParsedFamily with sensible defaults */
function makeFamily(overrides: Partial<ParsedFamily> & { id: string }): ParsedFamily {
  return {
    husbandId: null,
    wifeId: null,
    childIds: [],
    marriageDate: null,
    marriagePlace: null,
    divorceDate: null,
    events: [],
    sourceIds: [],
    ...overrides,
  };
}

// UUID v4 pattern
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('extractPediInfo', () => {
  it('should return empty map for empty INDI records', () => {
    const result = extractPediInfo([]);
    expect(result.size).toBe(0);
  });

  it('should return empty map when INDI has no FAMC tags', () => {
    const indi = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'NAME', 'John /Smith/'),
    ]);
    const result = extractPediInfo([indi]);
    expect(result.size).toBe(0);
  });

  it('should return empty map when FAMC has no PEDI sub-tag', () => {
    const indi = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'FAMC', '@F1@'),
    ]);
    const result = extractPediInfo([indi]);
    expect(result.size).toBe(0);
  });

  it('should extract PEDI birth as biological', () => {
    const indi = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'FAMC', '@F1@', null, [
        makeNode(2, 'PEDI', 'birth'),
      ]),
    ]);
    const result = extractPediInfo([indi]);
    expect(result.get('@I1@')?.get('@F1@')).toBe('biological');
  });

  it('should extract PEDI adopted as adoptive', () => {
    const indi = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'FAMC', '@F1@', null, [
        makeNode(2, 'PEDI', 'adopted'),
      ]),
    ]);
    const result = extractPediInfo([indi]);
    expect(result.get('@I1@')?.get('@F1@')).toBe('adoptive');
  });

  it('should extract PEDI foster as foster', () => {
    const indi = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'FAMC', '@F1@', null, [
        makeNode(2, 'PEDI', 'foster'),
      ]),
    ]);
    const result = extractPediInfo([indi]);
    expect(result.get('@I1@')?.get('@F1@')).toBe('foster');
  });

  it('should extract PEDI sealing as sealing', () => {
    const indi = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'FAMC', '@F1@', null, [
        makeNode(2, 'PEDI', 'sealing'),
      ]),
    ]);
    const result = extractPediInfo([indi]);
    expect(result.get('@I1@')?.get('@F1@')).toBe('sealing');
  });

  it('should extract PEDI step as step', () => {
    const indi = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'FAMC', '@F1@', null, [
        makeNode(2, 'PEDI', 'step'),
      ]),
    ]);
    const result = extractPediInfo([indi]);
    expect(result.get('@I1@')?.get('@F1@')).toBe('step');
  });

  it('should map unknown PEDI value to "unknown"', () => {
    const indi = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'FAMC', '@F1@', null, [
        makeNode(2, 'PEDI', 'guardianship'),
      ]),
    ]);
    const result = extractPediInfo([indi]);
    expect(result.get('@I1@')?.get('@F1@')).toBe('unknown');
  });

  it('should be case-insensitive for PEDI values', () => {
    const indi = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'FAMC', '@F1@', null, [
        makeNode(2, 'PEDI', 'ADOPTED'),
      ]),
    ]);
    const result = extractPediInfo([indi]);
    expect(result.get('@I1@')?.get('@F1@')).toBe('adoptive');
  });

  it('should trim whitespace from PEDI values', () => {
    const indi = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'FAMC', '@F1@', null, [
        makeNode(2, 'PEDI', '  foster  '),
      ]),
    ]);
    const result = extractPediInfo([indi]);
    expect(result.get('@I1@')?.get('@F1@')).toBe('foster');
  });

  it('should handle child in multiple families with different PEDI values', () => {
    const indi = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'FAMC', '@F1@', null, [
        makeNode(2, 'PEDI', 'birth'),
      ]),
      makeNode(1, 'FAMC', '@F2@', null, [
        makeNode(2, 'PEDI', 'adopted'),
      ]),
    ]);
    const result = extractPediInfo([indi]);
    const childMap = result.get('@I1@');
    expect(childMap?.get('@F1@')).toBe('biological');
    expect(childMap?.get('@F2@')).toBe('adoptive');
  });

  it('should skip INDI records with no xref', () => {
    const indi = makeNode(0, 'INDI', '', null, [
      makeNode(1, 'FAMC', '@F1@', null, [
        makeNode(2, 'PEDI', 'birth'),
      ]),
    ]);
    const result = extractPediInfo([indi]);
    expect(result.size).toBe(0);
  });

  it('should handle multiple INDI records', () => {
    const indi1 = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'FAMC', '@F1@', null, [
        makeNode(2, 'PEDI', 'birth'),
      ]),
    ]);
    const indi2 = makeNode(0, 'INDI', '', '@I2@', [
      makeNode(1, 'FAMC', '@F1@', null, [
        makeNode(2, 'PEDI', 'adopted'),
      ]),
    ]);
    const result = extractPediInfo([indi1, indi2]);
    expect(result.get('@I1@')?.get('@F1@')).toBe('biological');
    expect(result.get('@I2@')?.get('@F1@')).toBe('adoptive');
  });

  it('should trim whitespace from FAMC value', () => {
    const indi = makeNode(0, 'INDI', '', '@I1@', [
      makeNode(1, 'FAMC', '  @F1@  ', null, [
        makeNode(2, 'PEDI', 'birth'),
      ]),
    ]);
    const result = extractPediInfo([indi]);
    expect(result.get('@I1@')?.get('@F1@')).toBe('biological');
  });
});

describe('buildEdges', () => {
  describe('basic edge creation', () => {
    it('should create 2 edges for one family with 2 parents and 1 child', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          wifeId: '@I2@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges).toHaveLength(2);
      expect(edges[0].parentId).toBe('@I1@');
      expect(edges[0].childId).toBe('@I3@');
      expect(edges[1].parentId).toBe('@I2@');
      expect(edges[1].childId).toBe('@I3@');
    });

    it('should create 6 edges for one family with 2 parents and 3 children', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          wifeId: '@I2@',
          childIds: ['@I3@', '@I4@', '@I5@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges).toHaveLength(6);

      // Verify all parent-child combinations
      const combos = edges.map((e) => `${e.parentId}->${e.childId}`);
      expect(combos).toContain('@I1@->@I3@');
      expect(combos).toContain('@I2@->@I3@');
      expect(combos).toContain('@I1@->@I4@');
      expect(combos).toContain('@I2@->@I4@');
      expect(combos).toContain('@I1@->@I5@');
      expect(combos).toContain('@I2@->@I5@');
    });

    it('should create 1 edge for single parent (no wife) with 1 child', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges).toHaveLength(1);
      expect(edges[0].parentId).toBe('@I1@');
      expect(edges[0].childId).toBe('@I3@');
    });

    it('should create 1 edge for single parent (no husband) with 1 child', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          wifeId: '@I2@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges).toHaveLength(1);
      expect(edges[0].parentId).toBe('@I2@');
      expect(edges[0].childId).toBe('@I3@');
    });

    it('should create 0 edges for family with no parents but children', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          childIds: ['@I3@', '@I4@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges).toHaveLength(0);
    });

    it('should create 0 edges for family with parents but no children', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          wifeId: '@I2@',
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges).toHaveLength(0);
    });

    it('should create 0 edges for empty families array', () => {
      const edges = buildEdges([], []);
      expect(edges).toHaveLength(0);
    });
  });

  describe('edge defaults', () => {
    it('should set unique UUID IDs on each edge', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          wifeId: '@I2@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges[0].id).toMatch(UUID_PATTERN);
      expect(edges[1].id).toMatch(UUID_PATTERN);
      expect(edges[0].id).not.toBe(edges[1].id);
    });

    it('should default confidenceTier to 3', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges[0].confidenceTier).toBe(3);
    });

    it('should default legitimacy to "unknown"', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges[0].legitimacy).toBe('unknown');
    });

    it('should set confidenceReason to GEDCOM import message', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges[0].confidenceReason).toBe('GEDCOM import — no sources evaluated');
    });

    it('should set pathLabel to null', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges[0].pathLabel).toBeNull();
    });

    it('should set flagIds to empty array', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges[0].flagIds).toEqual([]);
    });

    it('should set createdAt to a Date', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges[0].createdAt).toBeInstanceOf(Date);
    });
  });

  describe('familyGedcomXref', () => {
    it('should set familyGedcomXref to the family ID', () => {
      const families = [
        makeFamily({
          id: '@F42@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges[0].familyGedcomXref).toBe('@F42@');
    });

    it('should set familyGedcomXref to null when family ID is empty string', () => {
      const families = [
        makeFamily({
          id: '',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges[0].familyGedcomXref).toBeNull();
    });
  });

  describe('source IDs', () => {
    it('should copy sourceIds from family to edge', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
          sourceIds: ['@S1@', '@S2@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges[0].sourceIds).toEqual(['@S1@', '@S2@']);
    });

    it('should create independent copies of sourceIds array', () => {
      const sourceIds = ['@S1@'];
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          wifeId: '@I2@',
          childIds: ['@I3@'],
          sourceIds,
        }),
      ];
      const edges = buildEdges(families, []);
      // Mutating the original should not affect edges
      sourceIds.push('@S99@');
      expect(edges[0].sourceIds).toEqual(['@S1@']);
      // Each edge should have its own copy
      expect(edges[0].sourceIds).not.toBe(edges[1].sourceIds);
    });
  });

  describe('relationship type from PEDI', () => {
    it('should default to "biological" when no PEDI info exists', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges[0].relationshipType).toBe('biological');
    });

    it('should use PEDI birth as "biological"', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const indiRecords = [
        makeNode(0, 'INDI', '', '@I3@', [
          makeNode(1, 'FAMC', '@F1@', null, [
            makeNode(2, 'PEDI', 'birth'),
          ]),
        ]),
      ];
      const edges = buildEdges(families, indiRecords);
      expect(edges[0].relationshipType).toBe('biological');
    });

    it('should use PEDI adopted as "adoptive"', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const indiRecords = [
        makeNode(0, 'INDI', '', '@I3@', [
          makeNode(1, 'FAMC', '@F1@', null, [
            makeNode(2, 'PEDI', 'adopted'),
          ]),
        ]),
      ];
      const edges = buildEdges(families, indiRecords);
      expect(edges[0].relationshipType).toBe('adoptive');
    });

    it('should use PEDI foster as "foster"', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const indiRecords = [
        makeNode(0, 'INDI', '', '@I3@', [
          makeNode(1, 'FAMC', '@F1@', null, [
            makeNode(2, 'PEDI', 'foster'),
          ]),
        ]),
      ];
      const edges = buildEdges(families, indiRecords);
      expect(edges[0].relationshipType).toBe('foster');
    });

    it('should use PEDI sealing as "sealing"', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const indiRecords = [
        makeNode(0, 'INDI', '', '@I3@', [
          makeNode(1, 'FAMC', '@F1@', null, [
            makeNode(2, 'PEDI', 'sealing'),
          ]),
        ]),
      ];
      const edges = buildEdges(families, indiRecords);
      expect(edges[0].relationshipType).toBe('sealing');
    });

    it('should apply same PEDI type to all parent edges for that child-family', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          wifeId: '@I2@',
          childIds: ['@I3@'],
        }),
      ];
      const indiRecords = [
        makeNode(0, 'INDI', '', '@I3@', [
          makeNode(1, 'FAMC', '@F1@', null, [
            makeNode(2, 'PEDI', 'adopted'),
          ]),
        ]),
      ];
      const edges = buildEdges(families, indiRecords);
      expect(edges).toHaveLength(2);
      expect(edges[0].relationshipType).toBe('adoptive');
      expect(edges[1].relationshipType).toBe('adoptive');
    });

    it('should use different PEDI types for same child in different families', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
        makeFamily({
          id: '@F2@',
          husbandId: '@I5@',
          childIds: ['@I3@'],
        }),
      ];
      const indiRecords = [
        makeNode(0, 'INDI', '', '@I3@', [
          makeNode(1, 'FAMC', '@F1@', null, [
            makeNode(2, 'PEDI', 'birth'),
          ]),
          makeNode(1, 'FAMC', '@F2@', null, [
            makeNode(2, 'PEDI', 'adopted'),
          ]),
        ]),
      ];
      const edges = buildEdges(families, indiRecords);
      const f1Edge = edges.find((e) => e.familyGedcomXref === '@F1@');
      const f2Edge = edges.find((e) => e.familyGedcomXref === '@F2@');
      expect(f1Edge?.relationshipType).toBe('biological');
      expect(f2Edge?.relationshipType).toBe('adoptive');
    });
  });

  describe('parallel paths', () => {
    it('should not set parallelGroupId for child in only one family', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges[0].parallelGroupId).toBeNull();
      expect(edges[0].isPrimary).toBe(true);
    });

    it('should set parallelGroupId for child in two families', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
        makeFamily({
          id: '@F2@',
          husbandId: '@I5@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges).toHaveLength(2);
      // Both edges for @I3@ should have the same parallelGroupId
      expect(edges[0].parallelGroupId).not.toBeNull();
      expect(edges[0].parallelGroupId).toBe(edges[1].parallelGroupId);
      expect(edges[0].parallelGroupId).toMatch(UUID_PATTERN);
    });

    it('should set isPrimary=true for first family, isPrimary=false for second', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
        makeFamily({
          id: '@F2@',
          husbandId: '@I5@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      const f1Edge = edges.find((e) => e.familyGedcomXref === '@F1@')!;
      const f2Edge = edges.find((e) => e.familyGedcomXref === '@F2@')!;
      expect(f1Edge.isPrimary).toBe(true);
      expect(f2Edge.isPrimary).toBe(false);
    });

    it('should set parallelGroupId for child in 3+ families', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@'],
        }),
        makeFamily({
          id: '@F2@',
          husbandId: '@I5@',
          childIds: ['@I3@'],
        }),
        makeFamily({
          id: '@F3@',
          husbandId: '@I7@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges).toHaveLength(3);
      // All edges for @I3@ should have the same parallelGroupId
      const groupId = edges[0].parallelGroupId;
      expect(groupId).not.toBeNull();
      expect(edges[1].parallelGroupId).toBe(groupId);
      expect(edges[2].parallelGroupId).toBe(groupId);
      // Only first family is primary
      const f1Edge = edges.find((e) => e.familyGedcomXref === '@F1@')!;
      const f2Edge = edges.find((e) => e.familyGedcomXref === '@F2@')!;
      const f3Edge = edges.find((e) => e.familyGedcomXref === '@F3@')!;
      expect(f1Edge.isPrimary).toBe(true);
      expect(f2Edge.isPrimary).toBe(false);
      expect(f3Edge.isPrimary).toBe(false);
    });

    it('should handle parallel paths with 2 parents per family', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          wifeId: '@I2@',
          childIds: ['@I3@'],
        }),
        makeFamily({
          id: '@F2@',
          husbandId: '@I5@',
          wifeId: '@I6@',
          childIds: ['@I3@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges).toHaveLength(4); // 2 parents x 1 child x 2 families

      const f1Edges = edges.filter((e) => e.familyGedcomXref === '@F1@');
      const f2Edges = edges.filter((e) => e.familyGedcomXref === '@F2@');
      expect(f1Edges).toHaveLength(2);
      expect(f2Edges).toHaveLength(2);

      // All should share the same parallelGroupId
      const groupId = edges[0].parallelGroupId;
      for (const edge of edges) {
        expect(edge.parallelGroupId).toBe(groupId);
      }

      // F1 edges are primary, F2 edges are not
      for (const edge of f1Edges) {
        expect(edge.isPrimary).toBe(true);
      }
      for (const edge of f2Edges) {
        expect(edge.isPrimary).toBe(false);
      }
    });

    it('should only create parallel groups for children in multiple families, not all children', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          childIds: ['@I3@', '@I4@'], // I3 is also in F2; I4 is only in F1
        }),
        makeFamily({
          id: '@F2@',
          husbandId: '@I5@',
          childIds: ['@I3@'], // I3 is in both families
        }),
      ];
      const edges = buildEdges(families, []);

      // I3 edges: 1 from F1 + 1 from F2 = 2 edges, both with parallelGroupId
      const i3Edges = edges.filter((e) => e.childId === '@I3@');
      expect(i3Edges).toHaveLength(2);
      expect(i3Edges[0].parallelGroupId).not.toBeNull();
      expect(i3Edges[1].parallelGroupId).toBe(i3Edges[0].parallelGroupId);

      // I4 edge: 1 from F1, no parallelGroupId
      const i4Edges = edges.filter((e) => e.childId === '@I4@');
      expect(i4Edges).toHaveLength(1);
      expect(i4Edges[0].parallelGroupId).toBeNull();
      expect(i4Edges[0].isPrimary).toBe(true);
    });
  });

  describe('multiple families', () => {
    it('should create edges across multiple independent families', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          wifeId: '@I2@',
          childIds: ['@I3@'],
        }),
        makeFamily({
          id: '@F2@',
          husbandId: '@I10@',
          wifeId: '@I11@',
          childIds: ['@I12@'],
        }),
      ];
      const edges = buildEdges(families, []);
      expect(edges).toHaveLength(4); // 2 per family

      const f1Edges = edges.filter((e) => e.familyGedcomXref === '@F1@');
      const f2Edges = edges.filter((e) => e.familyGedcomXref === '@F2@');
      expect(f1Edges).toHaveLength(2);
      expect(f2Edges).toHaveLength(2);

      // No parallel groups since children are different
      for (const edge of edges) {
        expect(edge.parallelGroupId).toBeNull();
      }
    });
  });

  describe('edge uniqueness', () => {
    it('should generate unique IDs for every edge', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          wifeId: '@I2@',
          childIds: ['@I3@', '@I4@', '@I5@'],
        }),
      ];
      const edges = buildEdges(families, []);
      const ids = edges.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('integration with PEDI and parallel paths', () => {
    it('should correctly combine PEDI info with parallel path detection', () => {
      const families = [
        makeFamily({
          id: '@F1@',
          husbandId: '@I1@',
          wifeId: '@I2@',
          childIds: ['@I3@'],
        }),
        makeFamily({
          id: '@F2@',
          husbandId: '@I5@',
          wifeId: '@I6@',
          childIds: ['@I3@'],
        }),
      ];
      const indiRecords = [
        makeNode(0, 'INDI', '', '@I3@', [
          makeNode(1, 'FAMC', '@F1@', null, [
            makeNode(2, 'PEDI', 'birth'),
          ]),
          makeNode(1, 'FAMC', '@F2@', null, [
            makeNode(2, 'PEDI', 'adopted'),
          ]),
        ]),
      ];
      const edges = buildEdges(families, indiRecords);
      expect(edges).toHaveLength(4);

      const f1Edges = edges.filter((e) => e.familyGedcomXref === '@F1@');
      const f2Edges = edges.filter((e) => e.familyGedcomXref === '@F2@');

      // F1: biological, primary
      for (const e of f1Edges) {
        expect(e.relationshipType).toBe('biological');
        expect(e.isPrimary).toBe(true);
        expect(e.parallelGroupId).not.toBeNull();
      }

      // F2: adoptive, not primary
      for (const e of f2Edges) {
        expect(e.relationshipType).toBe('adoptive');
        expect(e.isPrimary).toBe(false);
        expect(e.parallelGroupId).not.toBeNull();
      }

      // Same parallel group
      expect(f1Edges[0].parallelGroupId).toBe(f2Edges[0].parallelGroupId);
    });
  });
});
