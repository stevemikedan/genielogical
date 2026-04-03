import { describe, it, expect } from 'vitest';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import { runFlagEngine } from './flag-engine.ts';

// ── Test helpers ─────────────────────────────────────────────────────

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

function makeDate(year: number) {
  return { date: new Date(year, 0, 1), endDate: null, qualifier: 'exact' as const, raw: String(year), year };
}

function buildGraph(persons: Person[], edges: Edge[], sources: Source[] = []): TreeGraph {
  const graph = new TreeGraph();
  for (const p of persons) graph.persons.set(p.id, p);
  for (const s of sources) graph.sources.set(s.id, s);
  for (const e of edges) {
    graph.edges.set(e.id, e);
    // Build indices manually
    const pEdges = graph.parentEdges.get(e.childId) ?? [];
    pEdges.push(e);
    graph.parentEdges.set(e.childId, pEdges);
    const cEdges = graph.childEdges.get(e.parentId) ?? [];
    cEdges.push(e);
    graph.childEdges.set(e.parentId, cEdges);
  }
  return graph;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Flag Engine', () => {
  describe('Chronological checks', () => {
    it('flags death before birth', () => {
      const person = makePerson({
        id: 'p1',
        name: { full: 'John Doe', given: 'John', middle: '', surname: 'Doe', maidenName: '', prefix: '', suffix: '', raw: 'John /Doe/' },
        birth: { date: makeDate(1900), place: null },
        death: { date: makeDate(1850), place: null },
      });
      const graph = buildGraph([person], []);
      const flags = runFlagEngine(graph);
      const match = flags.find(f => f.ruleId === 'CHRONO_DEATH_BEFORE_BIRTH');
      expect(match).toBeDefined();
      expect(match!.severity).toBe('critical');
      expect(match!.affectedPersonIds).toContain('p1');
    });

    it('flags extreme lifespan', () => {
      const person = makePerson({
        id: 'p1',
        birth: { date: makeDate(1700), place: null },
        death: { date: makeDate(1900), place: null },
      });
      const graph = buildGraph([person], []);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'CHRONO_LIFESPAN_EXTREME')).toBe(true);
    });

    it('flags child born before parent', () => {
      const parent = makePerson({
        id: 'parent',
        birth: { date: makeDate(1900), place: null },
      });
      const child = makePerson({
        id: 'child',
        birth: { date: makeDate(1895), place: null },
      });
      const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child' });
      const graph = buildGraph([parent, child], [edge]);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'CHRONO_BIRTH_BEFORE_PARENT')).toBe(true);
    });

    it('flags child born within 13 years of parent', () => {
      const parent = makePerson({
        id: 'parent',
        birth: { date: makeDate(1890), place: null },
      });
      const child = makePerson({
        id: 'child',
        birth: { date: makeDate(1900), place: null },
      });
      const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child' });
      const graph = buildGraph([parent, child], [edge]);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'CHRONO_BIRTH_BEFORE_PARENT')).toBe(true);
    });

    it('flags child born >1 year after father death', () => {
      const father = makePerson({
        id: 'father',
        sex: 'M',
        birth: { date: makeDate(1860), place: null },
        death: { date: makeDate(1890), place: null },
      });
      const child = makePerson({
        id: 'child',
        birth: { date: makeDate(1895), place: null },
      });
      const edge = makeEdge({ id: 'e1', parentId: 'father', childId: 'child' });
      const graph = buildGraph([father, child], [edge]);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'CHRONO_BIRTH_AFTER_FATHER_DEATH')).toBe(true);
    });

    it('flags child born after mother death', () => {
      const mother = makePerson({
        id: 'mother',
        sex: 'F',
        birth: { date: makeDate(1860), place: null },
        death: { date: makeDate(1890), place: null },
      });
      const child = makePerson({
        id: 'child',
        birth: { date: makeDate(1891), place: null },
      });
      const edge = makeEdge({ id: 'e1', parentId: 'mother', childId: 'child' });
      const graph = buildGraph([mother, child], [edge]);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'CHRONO_BIRTH_AFTER_MOTHER_DEATH')).toBe(true);
    });

    it('flags century gap between parent and child', () => {
      const parent = makePerson({
        id: 'parent',
        name: { full: 'Alpin mac Eochaid', given: 'Alpin', middle: '', surname: 'mac Eochaid', maidenName: '', prefix: '', suffix: '', raw: 'Alpin /mac Eochaid/' },
        birth: { date: makeDate(1500), place: null }, // wrong — should be ~810
      });
      const child = makePerson({
        id: 'child',
        birth: { date: makeDate(840), place: null },
      });
      const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child' });
      const graph = buildGraph([parent, child], [edge]);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'CHRONO_CENTURY_GAP')).toBe(true);
    });

    it('flags sibling span >50 years', () => {
      const mother = makePerson({ id: 'mother', sex: 'F' });
      const child1 = makePerson({ id: 'c1', birth: { date: makeDate(1800), place: null } });
      const child2 = makePerson({ id: 'c2', birth: { date: makeDate(1860), place: null } });
      const e1 = makeEdge({ id: 'e1', parentId: 'mother', childId: 'c1' });
      const e2 = makeEdge({ id: 'e2', parentId: 'mother', childId: 'c2' });
      const graph = buildGraph([mother, child1, child2], [e1, e2]);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'CHRONO_SIBLING_SPAN')).toBe(true);
    });

    it('flags marriage before age 12', () => {
      const person = makePerson({
        id: 'p1',
        birth: { date: makeDate(1900), place: null },
        events: [{ type: 'marriage', date: makeDate(1908), place: null, notes: '', sourceIds: [] }],
      });
      const graph = buildGraph([person], []);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'CHRONO_MARRIAGE_IMPOSSIBLE')).toBe(true);
    });
  });

  describe('Prestige inflation', () => {
    it('flags title in name', () => {
      const person = makePerson({
        id: 'p1',
        name: { full: 'King James III', given: 'James', middle: '', surname: 'Stuart', maidenName: '', prefix: '', suffix: '', raw: 'King James /Stuart/' },
      });
      const graph = buildGraph([person], []);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'PRESTIGE_TITLE_IN_NAME')).toBe(true);
    });

    it('flags unsourced medieval royal', () => {
      const person = makePerson({
        id: 'p1',
        name: { full: 'King of Norway', given: 'King', middle: '', surname: 'Norway', maidenName: '', prefix: '', suffix: '', raw: 'King /of Norway/' },
        birth: { date: makeDate(1200), place: null },
        sourceIds: [],
      });
      const graph = buildGraph([person], []);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'PRESTIGE_MEDIEVAL_ROYAL_UNSOURCED')).toBe(true);
    });

    it('does not flag title if person has sources and is post-1500', () => {
      const person = makePerson({
        id: 'p1',
        name: { full: 'Sir Walter Scott', given: 'Walter', middle: '', surname: 'Scott', maidenName: '', prefix: '', suffix: '', raw: 'Sir Walter /Scott/' },
        birth: { date: makeDate(1771), place: null },
        sourceIds: ['s1'],
      });
      const graph = buildGraph([person], []);
      const flags = runFlagEngine(graph);
      // Should flag PRESTIGE_TITLE_IN_NAME but NOT PRESTIGE_MEDIEVAL_ROYAL_UNSOURCED
      expect(flags.some(f => f.ruleId === 'PRESTIGE_TITLE_IN_NAME')).toBe(true);
      expect(flags.some(f => f.ruleId === 'PRESTIGE_MEDIEVAL_ROYAL_UNSOURCED')).toBe(false);
    });
  });

  describe('Duplicate suspects', () => {
    it('flags duplicate name + date match', () => {
      const a = makePerson({
        id: 'a',
        name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
        birth: { date: makeDate(1800), place: null },
      });
      const b = makePerson({
        id: 'b',
        name: { full: 'John Smith', given: 'Johnny', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'Johnny /Smith/' },
        birth: { date: makeDate(1805), place: null },
      });
      const graph = buildGraph([a, b], []);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'DUP_NAME_DATE_MATCH')).toBe(true);
    });

    it('does not flag people with different surnames', () => {
      const a = makePerson({
        id: 'a',
        name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John /Smith/' },
        birth: { date: makeDate(1800), place: null },
      });
      const b = makePerson({
        id: 'b',
        name: { full: 'John Jones', given: 'John', middle: '', surname: 'Jones', maidenName: '', prefix: '', suffix: '', raw: 'John /Jones/' },
        birth: { date: makeDate(1800), place: null },
      });
      const graph = buildGraph([a, b], []);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'DUP_NAME_DATE_MATCH')).toBe(false);
    });
  });

  describe('Source deserts', () => {
    it('flags 5+ consecutive unsourced ancestors', () => {
      // Build a chain: leaf -> p1 -> p2 -> p3 -> p4 -> p5 (all unsourced)
      const persons = Array.from({ length: 6 }, (_, i) =>
        makePerson({
          id: `p${i}`,
          name: { full: `Person ${i}`, given: `Person`, middle: '', surname: `${i}`, maidenName: '', prefix: '', suffix: '', raw: `Person /${i}/` },
        })
      );
      const edges = Array.from({ length: 5 }, (_, i) =>
        makeEdge({ id: `e${i}`, parentId: `p${i + 1}`, childId: `p${i}` })
      );
      const graph = buildGraph(persons, edges);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'SOURCE_DESERT')).toBe(true);
    });
  });

  describe('Structural checks', () => {
    it('flags orphan person', () => {
      const person = makePerson({ id: 'orphan' });
      const graph = buildGraph([person], []);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'STRUCT_ORPHAN')).toBe(true);
    });

    it('does not flag orphan if person has family connections', () => {
      const parent = makePerson({ id: 'parent' });
      const child = makePerson({ id: 'child' });
      const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child' });
      const graph = buildGraph([parent, child], [edge]);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'STRUCT_ORPHAN')).toBe(false);
    });

    it('flags missing gender on parent', () => {
      const parent = makePerson({ id: 'parent', sex: 'U' });
      const child = makePerson({ id: 'child' });
      const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child' });
      const graph = buildGraph([parent, child], [edge]);
      const flags = runFlagEngine(graph);
      expect(flags.some(f => f.ruleId === 'STRUCT_MISSING_GENDER')).toBe(true);
    });
  });

  describe('Clean data', () => {
    it('produces no critical flags for well-formed data', () => {
      const parent = makePerson({
        id: 'parent',
        name: { full: 'James Stewart', given: 'James', middle: '', surname: 'Stewart', maidenName: '', prefix: '', suffix: '', raw: 'James /Stewart/' },
        sex: 'M',
        birth: { date: makeDate(1770), place: null },
        death: { date: makeDate(1840), place: null },
        sourceIds: ['s1'],
      });
      const child = makePerson({
        id: 'child',
        name: { full: 'Mary Stewart', given: 'Mary', middle: '', surname: 'Stewart', maidenName: '', prefix: '', suffix: '', raw: 'Mary /Stewart/' },
        sex: 'F',
        birth: { date: makeDate(1800), place: null },
        death: { date: makeDate(1870), place: null },
        sourceIds: ['s2'],
      });
      const edge = makeEdge({ id: 'e1', parentId: 'parent', childId: 'child' });
      const graph = buildGraph([parent, child], [edge]);
      const flags = runFlagEngine(graph);
      const criticals = flags.filter(f => f.severity === 'critical');
      expect(criticals).toHaveLength(0);
    });
  });
});
