import { describe, it, expect } from 'vitest';
import { compareAncestry, detectAncestryConflicts, isAutoResolvable } from './ancestry-conflict-detector.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { ConfidenceTier } from '@/types/common.ts';

// ── Factories ─────────────────────────────────────────────────────────

function makeDate(year: number) {
  return { date: new Date(year, 0, 1), endDate: null, qualifier: 'exact' as const, raw: String(year), year };
}

function makePerson(overrides: Partial<Person> & { id: string }): Person {
  return {
    name: { full: 'Test Person', given: 'Test', middle: '', surname: 'Person', maidenName: '', prefix: '', suffix: '', raw: 'Test /Person/' },
    alternateNames: [],
    sex: 'M',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 3 as ConfidenceTier,
    confidenceReason: '',
    status: 'tentative',
    sourceIds: [],
    flagIds: [],
    researchStepIds: [],
    conjectureIds: [],
    gedcomXref: null,
    familyIdAsSpouse: [],
    familyIdAsChild: [],
    identityHash: '',
    privacyLevel: 'public',
    externalIds: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEdge(overrides: Partial<Edge> & { id: string; parentId: string; childId: string }): Edge {
  return {
    relationshipType: 'biological',
    legitimacy: 'unknown',
    marriage: null,
    confidenceTier: 3 as ConfidenceTier,
    confidenceReason: '',
    parallelGroupId: null,
    isPrimary: true,
    pathLabel: null,
    sourceIds: [],
    flagIds: [],
    familyGedcomXref: null,
    assertedBy: 'local_user',
    assertedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function buildGraph(persons: Person[], edges: Edge[], sources: Source[] = []): TreeGraph {
  const graph = new TreeGraph();
  for (const p of persons) graph.persons.set(p.id, p);
  for (const s of sources) graph.sources.set(s.id, s);
  for (const e of edges) {
    graph.edges.set(e.id, e);
    const pEdges = graph.parentEdges.get(e.childId) ?? [];
    pEdges.push(e);
    graph.parentEdges.set(e.childId, pEdges);
    const cEdges = graph.childEdges.get(e.parentId) ?? [];
    cEdges.push(e);
    graph.childEdges.set(e.parentId, cEdges);
  }
  return graph;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('compareAncestry', () => {
  it('returns null when neither person has parents', () => {
    const personA = makePerson({ id: 'a', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } });
    const personB = makePerson({ id: 'b', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } });
    const graph = buildGraph([personA, personB], []);

    expect(compareAncestry(graph, 'a', 'b')).toBeNull();
  });

  it('detects additional_parents when only one has parents', () => {
    const father = makePerson({ id: 'father', name: { full: 'James Smith', given: 'James', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'James /Smith/' } });
    const personA = makePerson({ id: 'a', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } });
    const personB = makePerson({ id: 'b', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } });
    const edge = makeEdge({ id: 'e1', parentId: 'father', childId: 'a' });
    const graph = buildGraph([father, personA, personB], [edge]);

    const result = compareAncestry(graph, 'a', 'b');
    expect(result).not.toBeNull();
    expect(result!.conflictType).toBe('additional_parents');
  });

  it('detects different_parents when parents differ completely', () => {
    const fatherA = makePerson({ id: 'fatherA', name: { full: 'James Smith', given: 'James', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'James /Smith/' } });
    const motherA = makePerson({ id: 'motherA', sex: 'F', name: { full: 'Mary Jones', given: 'Mary', middle: '', surname: 'Jones', maidenName: '', prefix: '', suffix: '', raw: 'Mary /Jones/' } });
    const fatherB = makePerson({ id: 'fatherB', name: { full: 'Robert Smith', given: 'Robert', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'Robert /Smith/' } });
    const motherB = makePerson({ id: 'motherB', sex: 'F', name: { full: 'Jane Doe', given: 'Jane', middle: '', surname: 'Doe', maidenName: '', prefix: '', suffix: '', raw: 'Jane /Doe/' } });
    const personA = makePerson({ id: 'a', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } });
    const personB = makePerson({ id: 'b', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'fatherA', childId: 'a' }),
      makeEdge({ id: 'e2', parentId: 'motherA', childId: 'a' }),
      makeEdge({ id: 'e3', parentId: 'fatherB', childId: 'b' }),
      makeEdge({ id: 'e4', parentId: 'motherB', childId: 'b' }),
    ];

    const graph = buildGraph([fatherA, motherA, fatherB, motherB, personA, personB], edges);
    const result = compareAncestry(graph, 'a', 'b');

    expect(result).not.toBeNull();
    expect(result!.conflictType).toBe('different_parents');
    expect(result!.pathA.fatherName).toBe('James Smith');
    expect(result!.pathB.fatherName).toBe('Robert Smith');
  });

  it('detects different_father when only father differs', () => {
    const mother = makePerson({ id: 'mother', sex: 'F', name: { full: 'Mary Jones', given: 'Mary', middle: '', surname: 'Jones', maidenName: '', prefix: '', suffix: '', raw: 'Mary /Jones/' } });
    const fatherA = makePerson({ id: 'fatherA', name: { full: 'James Smith', given: 'James', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'James /Smith/' } });
    const fatherB = makePerson({ id: 'fatherB', name: { full: 'Robert Smith', given: 'Robert', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'Robert /Smith/' } });
    const personA = makePerson({ id: 'a', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } });
    const personB = makePerson({ id: 'b', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'fatherA', childId: 'a' }),
      makeEdge({ id: 'e2', parentId: 'mother', childId: 'a' }),
      makeEdge({ id: 'e3', parentId: 'fatherB', childId: 'b' }),
      makeEdge({ id: 'e4', parentId: 'mother', childId: 'b' }),
    ];

    const graph = buildGraph([mother, fatherA, fatherB, personA, personB], edges);
    const result = compareAncestry(graph, 'a', 'b');

    expect(result).not.toBeNull();
    expect(result!.conflictType).toBe('different_father');
  });

  it('detects different_mother when only mother differs', () => {
    const father = makePerson({ id: 'father', name: { full: 'James Smith', given: 'James', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'James /Smith/' } });
    const motherA = makePerson({ id: 'motherA', sex: 'F', name: { full: 'Mary Jones', given: 'Mary', middle: '', surname: 'Jones', maidenName: '', prefix: '', suffix: '', raw: 'Mary /Jones/' } });
    const motherB = makePerson({ id: 'motherB', sex: 'F', name: { full: 'Jane Doe', given: 'Jane', middle: '', surname: 'Doe', maidenName: '', prefix: '', suffix: '', raw: 'Jane /Doe/' } });
    const personA = makePerson({ id: 'a', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } });
    const personB = makePerson({ id: 'b', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'a' }),
      makeEdge({ id: 'e2', parentId: 'motherA', childId: 'a' }),
      makeEdge({ id: 'e3', parentId: 'father', childId: 'b' }),
      makeEdge({ id: 'e4', parentId: 'motherB', childId: 'b' }),
    ];

    const graph = buildGraph([father, motherA, motherB, personA, personB], edges);
    const result = compareAncestry(graph, 'a', 'b');

    expect(result).not.toBeNull();
    expect(result!.conflictType).toBe('different_mother');
  });

  it('returns null when both have identical parents', () => {
    const father = makePerson({ id: 'father', name: { full: 'James Smith', given: 'James', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'James /Smith/' } });
    const mother = makePerson({ id: 'mother', sex: 'F', name: { full: 'Mary Jones', given: 'Mary', middle: '', surname: 'Jones', maidenName: '', prefix: '', suffix: '', raw: 'Mary /Jones/' } });
    const personA = makePerson({ id: 'a', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } });
    const personB = makePerson({ id: 'b', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' } });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'father', childId: 'a' }),
      makeEdge({ id: 'e2', parentId: 'mother', childId: 'a' }),
      makeEdge({ id: 'e3', parentId: 'father', childId: 'b' }),
      makeEdge({ id: 'e4', parentId: 'mother', childId: 'b' }),
    ];

    const graph = buildGraph([father, mother, personA, personB], edges);
    const result = compareAncestry(graph, 'a', 'b');

    // Same parents, no upstream divergence → null
    expect(result).toBeNull();
  });

  it('includes source counts and confidence tiers', () => {
    const fatherA = makePerson({ id: 'fatherA', name: { full: 'James Smith', given: 'James', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'James /Smith/' }, sourceIds: ['s1', 's2'] });
    const fatherB = makePerson({ id: 'fatherB', name: { full: 'Robert Smith', given: 'Robert', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'Robert /Smith/' } });
    const personA = makePerson({ id: 'a', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' }, sourceIds: ['s1'], confidenceTier: 2 as ConfidenceTier });
    const personB = makePerson({ id: 'b', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' }, confidenceTier: 4 as ConfidenceTier });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'fatherA', childId: 'a' }),
      makeEdge({ id: 'e3', parentId: 'fatherB', childId: 'b' }),
    ];

    const graph = buildGraph([fatherA, fatherB, personA, personB], edges);
    const result = compareAncestry(graph, 'a', 'b');

    expect(result).not.toBeNull();
    expect(result!.confidenceTierA).toBe(2);
    expect(result!.confidenceTierB).toBe(4);
    expect(result!.sourceCountA).toBeGreaterThan(0);
  });
});

describe('detectAncestryConflicts', () => {
  it('returns empty array when no duplicates exist', () => {
    const p1 = makePerson({ id: 'p1', name: { full: 'Alice Smith', given: 'Alice', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'Alice /Smith/' } });
    const p2 = makePerson({ id: 'p2', name: { full: 'Bob Jones', given: 'Bob', middle: '', surname: 'Jones', maidenName: '', prefix: '', suffix: '', raw: 'Bob /Jones/' } });
    const graph = buildGraph([p1, p2], []);

    expect(detectAncestryConflicts(graph)).toHaveLength(0);
  });

  it('finds conflicts for duplicate-like persons with different parents', () => {
    const fatherA = makePerson({ id: 'fA', name: { full: 'James Smith', given: 'James', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'James /Smith/' } });
    const motherA = makePerson({ id: 'mA', sex: 'F', name: { full: 'Mary Jones', given: 'Mary', middle: '', surname: 'Jones', maidenName: '', prefix: '', suffix: '', raw: 'Mary /Jones/' } });
    const fatherB = makePerson({ id: 'fB', name: { full: 'Robert Smith', given: 'Robert', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'Robert /Smith/' } });
    const motherB = makePerson({ id: 'mB', sex: 'F', name: { full: 'Jane Doe', given: 'Jane', middle: '', surname: 'Doe', maidenName: '', prefix: '', suffix: '', raw: 'Jane /Doe/' } });
    // Two persons with matching surname + first 3 given chars + similar birth
    const personA = makePerson({
      id: 'a',
      name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
      birth: { date: makeDate(1850), place: null },
    });
    const personB = makePerson({
      id: 'b',
      name: { full: 'John Smith', given: 'Johnny', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'Johnny /Smith/' },
      birth: { date: makeDate(1852), place: null },
    });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'fA', childId: 'a' }),
      makeEdge({ id: 'e2', parentId: 'mA', childId: 'a' }),
      makeEdge({ id: 'e3', parentId: 'fB', childId: 'b' }),
      makeEdge({ id: 'e4', parentId: 'mB', childId: 'b' }),
    ];

    const graph = buildGraph([fatherA, motherA, fatherB, motherB, personA, personB], edges);
    const conflicts = detectAncestryConflicts(graph);

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].conflictType).toBe('different_parents');
  });

  it('skips pairs with birth years more than 10 years apart', () => {
    const personA = makePerson({
      id: 'a',
      name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
      birth: { date: makeDate(1800), place: null },
    });
    const personB = makePerson({
      id: 'b',
      name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
      birth: { date: makeDate(1830), place: null },
    });

    const graph = buildGraph([personA, personB], []);
    expect(detectAncestryConflicts(graph)).toHaveLength(0);
  });
});

describe('isAutoResolvable', () => {
  it('returns true when confidence tier difference is >= 2', () => {
    const conflict = {
      personIdA: 'a',
      personIdB: 'b',
      pathA: { fatherId: null, fatherName: null, motherId: null, motherName: null, grandparentCount: 0 },
      pathB: { fatherId: null, fatherName: null, motherId: null, motherName: null, grandparentCount: 0 },
      conflictType: 'different_parents' as const,
      descendantsAffectedA: 0,
      descendantsAffectedB: 0,
      sharedDescendants: [],
      sourceCountA: 0,
      sourceCountB: 0,
      confidenceTierA: 1,
      confidenceTierB: 3,
    };
    expect(isAutoResolvable(conflict)).toBe(true);
  });

  it('returns true when one has sources and other has none', () => {
    const conflict = {
      personIdA: 'a',
      personIdB: 'b',
      pathA: { fatherId: null, fatherName: null, motherId: null, motherName: null, grandparentCount: 0 },
      pathB: { fatherId: null, fatherName: null, motherId: null, motherName: null, grandparentCount: 0 },
      conflictType: 'different_parents' as const,
      descendantsAffectedA: 0,
      descendantsAffectedB: 0,
      sharedDescendants: [],
      sourceCountA: 3,
      sourceCountB: 0,
      confidenceTierA: 2,
      confidenceTierB: 3,
    };
    expect(isAutoResolvable(conflict)).toBe(true);
  });

  it('returns false when tiers are close and both have sources', () => {
    const conflict = {
      personIdA: 'a',
      personIdB: 'b',
      pathA: { fatherId: null, fatherName: null, motherId: null, motherName: null, grandparentCount: 0 },
      pathB: { fatherId: null, fatherName: null, motherId: null, motherName: null, grandparentCount: 0 },
      conflictType: 'different_parents' as const,
      descendantsAffectedA: 0,
      descendantsAffectedB: 0,
      sharedDescendants: [],
      sourceCountA: 2,
      sourceCountB: 1,
      confidenceTierA: 2,
      confidenceTierB: 3,
    };
    expect(isAutoResolvable(conflict)).toBe(false);
  });
});
