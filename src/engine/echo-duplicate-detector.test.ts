import { describe, it, expect } from 'vitest';
import { detectEchoDuplicates } from './echo-duplicate-detector.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
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

function buildGraph(persons: Person[], edges: Edge[]): TreeGraph {
  const graph = new TreeGraph();
  for (const p of persons) graph.persons.set(p.id, p);
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

describe('detectEchoDuplicates', () => {
  it('returns empty for a tree with unique persons', () => {
    const subject = makePerson({ id: 's', name: { full: 'Subject', given: 'Subject', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Subject /Test/' } });
    const father = makePerson({
      id: 'f',
      name: { full: 'Father Test', given: 'Father', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Father /Test/' },
      birth: { date: makeDate(1950), place: null },
    });
    const grandfather = makePerson({
      id: 'gf',
      name: { full: 'Grandfather Other', given: 'Grandfather', middle: '', surname: 'Other', maidenName: '', prefix: '', suffix: '', raw: 'Grandfather /Other/' },
      birth: { date: makeDate(1920), place: null },
    });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'f', childId: 's' }),
      makeEdge({ id: 'e2', parentId: 'gf', childId: 'f' }),
    ];

    const graph = buildGraph([subject, father, grandfather], edges);
    expect(detectEchoDuplicates(graph, 's')).toHaveLength(0);
  });

  it('detects echo duplicate at different generations', () => {
    // Same person appearing at gen 2 and gen 3 with slightly different names
    const subject = makePerson({ id: 's' });
    const father = makePerson({ id: 'f', name: { full: 'Father Test', given: 'Father', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Father /Test/' } });
    const mother = makePerson({ id: 'm', sex: 'F', name: { full: 'Mother Test', given: 'Mother', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Mother /Test/' } });

    // Same person at gen 2 (grandparent via father)
    const ancestor1 = makePerson({
      id: 'a1',
      name: { full: 'Alexander MacRae', given: 'Alexander', middle: '', surname: 'MacRae', maidenName: '', prefix: '', suffix: '', raw: 'Alexander /MacRae/' },
      birth: { date: makeDate(1610), place: null },
    });

    // Same person at gen 3 (great-grandparent via mother) with typo
    const ancestor2 = makePerson({
      id: 'a2',
      name: { full: 'Alexader MacRae', given: 'Alexader', middle: '', surname: 'MacRae', maidenName: '', prefix: '', suffix: '', raw: 'Alexader /MacRae/' },
      birth: { date: makeDate(1614), place: null },
    });

    // Intermediate person between mother and ancestor2
    const intermediate = makePerson({
      id: 'inter',
      name: { full: 'Intermediate Person', given: 'Intermediate', middle: '', surname: 'Person', maidenName: '', prefix: '', suffix: '', raw: 'Intermediate /Person/' },
    });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'f', childId: 's' }),
      makeEdge({ id: 'e2', parentId: 'm', childId: 's' }),
      makeEdge({ id: 'e3', parentId: 'a1', childId: 'f' }),    // gen 2
      makeEdge({ id: 'e4', parentId: 'inter', childId: 'm' }),
      makeEdge({ id: 'e5', parentId: 'a2', childId: 'inter' }), // gen 3
    ];

    const graph = buildGraph([subject, father, mother, ancestor1, ancestor2, intermediate], edges);
    const echoes = detectEchoDuplicates(graph, 's');

    expect(echoes.length).toBeGreaterThan(0);
    const echo = echoes[0];
    expect(echo.entries.length).toBe(2);
    expect(echo.generationSpread).toBeGreaterThan(0);
    // Should have entries at different generations
    const gens = echo.entries.map(e => e.generation);
    expect(new Set(gens).size).toBe(2);
  });

  it('does not flag same-generation matches (normal pedigree collapse)', () => {
    const subject = makePerson({ id: 's' });
    const father = makePerson({ id: 'f', name: { full: 'Father', given: 'Father', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Father /Test/' } });
    const mother = makePerson({ id: 'm', sex: 'F', name: { full: 'Mother', given: 'Mother', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Mother /Test/' } });

    // Same ancestor at same generation (gen 2) — this is pedigree collapse, not echo
    const ancestor = makePerson({
      id: 'ancestor',
      name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
      birth: { date: makeDate(1800), place: null },
    });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'f', childId: 's' }),
      makeEdge({ id: 'e2', parentId: 'm', childId: 's' }),
      makeEdge({ id: 'e3', parentId: 'ancestor', childId: 'f' }),
      makeEdge({ id: 'e4', parentId: 'ancestor', childId: 'm' }),
    ];

    const graph = buildGraph([subject, father, mother, ancestor], edges);
    const echoes = detectEchoDuplicates(graph, 's');

    // Same person at same generation = not echo
    expect(echoes).toHaveLength(0);
  });

  it('strips titles before matching', () => {
    const subject = makePerson({ id: 's' });
    const father = makePerson({ id: 'f', name: { full: 'Father', given: 'Father', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Father /Test/' } });
    const mother = makePerson({ id: 'm', sex: 'F', name: { full: 'Mother', given: 'Mother', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Mother /Test/' } });

    const ancestor1 = makePerson({
      id: 'a1',
      name: { full: 'Sir James Wallace', given: 'Sir James', middle: '', surname: 'Wallace', maidenName: '', prefix: '', suffix: '', raw: 'Sir James /Wallace/' },
      birth: { date: makeDate(1300), place: null },
    });

    const ancestor2 = makePerson({
      id: 'a2',
      name: { full: 'James Wallace', given: 'James', middle: '', surname: 'Wallace', maidenName: '', prefix: '', suffix: '', raw: 'James /Wallace/' },
      birth: { date: makeDate(1305), place: null },
    });

    const intermediate = makePerson({ id: 'inter', name: { full: 'Intermediate', given: 'Intermediate', middle: '', surname: 'Other', maidenName: '', prefix: '', suffix: '', raw: 'Intermediate /Other/' } });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'f', childId: 's' }),
      makeEdge({ id: 'e2', parentId: 'm', childId: 's' }),
      makeEdge({ id: 'e3', parentId: 'a1', childId: 'f' }),
      makeEdge({ id: 'e4', parentId: 'inter', childId: 'm' }),
      makeEdge({ id: 'e5', parentId: 'a2', childId: 'inter' }),
    ];

    const graph = buildGraph([subject, father, mother, ancestor1, ancestor2, intermediate], edges);
    const echoes = detectEchoDuplicates(graph, 's');

    // "Sir James Wallace" and "James Wallace" should match after title stripping
    expect(echoes.length).toBeGreaterThan(0);
  });

  it('normalizes Mc/Mac prefix variations', () => {
    const subject = makePerson({ id: 's' });
    const father = makePerson({ id: 'f', name: { full: 'Father', given: 'Father', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Father /Test/' } });
    const mother = makePerson({ id: 'm', sex: 'F', name: { full: 'Mother', given: 'Mother', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Mother /Test/' } });

    const ancestor1 = makePerson({
      id: 'a1',
      name: { full: 'John McDonald', given: 'John', middle: '', surname: 'McDonald', maidenName: '', prefix: '', suffix: '', raw: 'John /McDonald/' },
      birth: { date: makeDate(1700), place: null },
    });

    const ancestor2 = makePerson({
      id: 'a2',
      name: { full: 'John MacDonald', given: 'John', middle: '', surname: 'MacDonald', maidenName: '', prefix: '', suffix: '', raw: 'John /MacDonald/' },
      birth: { date: makeDate(1702), place: null },
    });

    const intermediate = makePerson({ id: 'inter', name: { full: 'Int', given: 'Int', middle: '', surname: 'Other', maidenName: '', prefix: '', suffix: '', raw: 'Int /Other/' } });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'f', childId: 's' }),
      makeEdge({ id: 'e2', parentId: 'm', childId: 's' }),
      makeEdge({ id: 'e3', parentId: 'a1', childId: 'f' }),
      makeEdge({ id: 'e4', parentId: 'inter', childId: 'm' }),
      makeEdge({ id: 'e5', parentId: 'a2', childId: 'inter' }),
    ];

    const graph = buildGraph([subject, father, mother, ancestor1, ancestor2, intermediate], edges);
    const echoes = detectEchoDuplicates(graph, 's');

    // McDonald and MacDonald should normalize to the same key
    expect(echoes.length).toBeGreaterThan(0);
  });

  it('includes parent names in echo entries', () => {
    const subject = makePerson({ id: 's' });
    const father = makePerson({ id: 'f', name: { full: 'Father Test', given: 'Father', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Father /Test/' } });
    const mother = makePerson({ id: 'm', sex: 'F', name: { full: 'Mother Test', given: 'Mother', middle: '', surname: 'Test', maidenName: '', prefix: '', suffix: '', raw: 'Mother /Test/' } });

    const gpFather = makePerson({ id: 'gpf', name: { full: 'GP Father', given: 'GP', middle: '', surname: 'Father', maidenName: '', prefix: '', suffix: '', raw: 'GP /Father/' } });
    const gpMother = makePerson({ id: 'gpm', sex: 'F', name: { full: 'GP Mother', given: 'GP', middle: '', surname: 'Mother', maidenName: '', prefix: '', suffix: '', raw: 'GP /Mother/' } });

    const ancestor1 = makePerson({
      id: 'a1',
      name: { full: 'Robert Burns', given: 'Robert', middle: '', surname: 'Burns', maidenName: '', prefix: '', suffix: '', raw: 'Robert /Burns/' },
      birth: { date: makeDate(1759), place: null },
    });

    const ancestor2 = makePerson({
      id: 'a2',
      name: { full: 'Robert Burns', given: 'Robert', middle: '', surname: 'Burns', maidenName: '', prefix: '', suffix: '', raw: 'Robert /Burns/' },
      birth: { date: makeDate(1759), place: null },
    });

    const intermediate = makePerson({ id: 'inter', name: { full: 'Int Person', given: 'Int', middle: '', surname: 'Person', maidenName: '', prefix: '', suffix: '', raw: 'Int /Person/' } });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'f', childId: 's' }),
      makeEdge({ id: 'e2', parentId: 'm', childId: 's' }),
      makeEdge({ id: 'e3', parentId: 'a1', childId: 'f' }),
      makeEdge({ id: 'e4', parentId: 'gpf', childId: 'a1' }),
      makeEdge({ id: 'e5', parentId: 'gpm', childId: 'a1' }),
      makeEdge({ id: 'e6', parentId: 'inter', childId: 'm' }),
      makeEdge({ id: 'e7', parentId: 'a2', childId: 'inter' }),
    ];

    const graph = buildGraph([subject, father, mother, gpFather, gpMother, ancestor1, ancestor2, intermediate], edges);
    const echoes = detectEchoDuplicates(graph, 's');

    expect(echoes.length).toBeGreaterThan(0);
    const echo = echoes[0];
    // At least one entry should have parent names
    const entryWithParents = echo.entries.find(e => e.fatherName !== null);
    expect(entryWithParents).toBeDefined();
  });

  it('skips persons with empty surname or given name', () => {
    const subject = makePerson({ id: 's' });
    const ancestor = makePerson({
      id: 'a',
      name: { full: '', given: '', middle: '', surname: '', maidenName: '', prefix: '', suffix: '', raw: '' },
      birth: { date: makeDate(1800), place: null },
    });

    const edges = [
      makeEdge({ id: 'e1', parentId: 'a', childId: 's' }),
    ];

    const graph = buildGraph([subject, ancestor], edges);
    const echoes = detectEchoDuplicates(graph, 's');

    expect(echoes).toHaveLength(0);
  });
});
