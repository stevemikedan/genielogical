import { describe, it, expect, beforeEach } from 'vitest';
import { TreeGraph } from './tree-graph.ts';
import { findPath } from './path-finder.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { ParseResult } from '@/types/parse-result.ts';

// ── Test helpers ─────────────────────────────────────────────────────

function makePerson(id: string, name: string): Person {
  return {
    id,
    name: {
      full: name,
      given: name.split(' ')[0],
      middle: '',
      surname: name.split(' ').slice(1).join(' '),
      maidenName: '',
      prefix: '',
      suffix: '',
      raw: name,
    },
    alternateNames: [],
    sex: 'U',
    birth: { date: null, place: null },
    death: { date: null, place: null },
    burial: null,
    events: [],
    notes: '',
    customTags: [],
    confidenceTier: 4,
    confidenceReason: 'test',
    status: 'tentative',
    sourceIds: [],
    flagIds: [],
    researchStepIds: [],
    conjectureIds: [],
    gedcomXref: null,
    familyIdAsSpouse: [],
    familyIdAsChild: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEdge(
  id: string,
  parentId: string,
  childId: string,
): Edge {
  return {
    id,
    parentId,
    childId,
    relationshipType: 'biological',
    legitimacy: 'legitimate',
    marriage: null,
    confidenceTier: 4,
    confidenceReason: 'test',
    parallelGroupId: null,
    isPrimary: true,
    pathLabel: null,
    sourceIds: [],
    flagIds: [],
    familyGedcomXref: null,
    createdAt: new Date(),
  };
}

function makeParseResult(
  persons: Person[],
  edges: Edge[],
): ParseResult {
  const personMap = new Map<string, Person>();
  for (const p of persons) personMap.set(p.id, p);

  return {
    persons: personMap,
    edges,
    sources: new Map(),
    families: [],
    stats: {
      individualCount: persons.length,
      familyCount: 0,
      sourceCount: 0,
      edgeCount: edges.length,
      generationCount: 0,
      parseTimeMs: 0,
      gedcomVersion: null,
      charset: null,
      software: null,
      warningCount: 0,
      errorCount: 0,
    },
    errors: [],
    warnings: [],
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('findPath', () => {
  let graph: TreeGraph;

  beforeEach(() => {
    graph = new TreeGraph();
  });

  it('should find a path from grandparent to grandchild (2 segments)', () => {
    const gp = makePerson('gp', 'Grandparent');
    const p = makePerson('p', 'Parent');
    const c = makePerson('c', 'Child');

    graph.loadFromParseResult(
      makeParseResult(
        [gp, p, c],
        [makeEdge('e1', 'gp', 'p'), makeEdge('e2', 'p', 'c')],
      ),
    );

    const path = findPath(graph, 'gp', 'c');
    expect(path).not.toBeNull();
    expect(path).toHaveLength(2);

    // First segment: gp -> p (child direction, going downward)
    expect(path![0].fromPersonId).toBe('gp');
    expect(path![0].toPersonId).toBe('p');
    expect(path![0].direction).toBe('child');

    // Second segment: p -> c (child direction)
    expect(path![1].fromPersonId).toBe('p');
    expect(path![1].toPersonId).toBe('c');
    expect(path![1].direction).toBe('child');
  });

  it('should find a path from grandchild to grandparent (parent direction)', () => {
    const gp = makePerson('gp', 'Grandparent');
    const p = makePerson('p', 'Parent');
    const c = makePerson('c', 'Child');

    graph.loadFromParseResult(
      makeParseResult(
        [gp, p, c],
        [makeEdge('e1', 'gp', 'p'), makeEdge('e2', 'p', 'c')],
      ),
    );

    const path = findPath(graph, 'c', 'gp');
    expect(path).not.toBeNull();
    expect(path).toHaveLength(2);

    // Should traverse upward: c -> p -> gp
    expect(path![0].fromPersonId).toBe('c');
    expect(path![0].toPersonId).toBe('p');
    expect(path![0].direction).toBe('parent');

    expect(path![1].fromPersonId).toBe('p');
    expect(path![1].toPersonId).toBe('gp');
    expect(path![1].direction).toBe('parent');
  });

  it('should return null for disconnected persons', () => {
    const a = makePerson('a', 'Person A');
    const b = makePerson('b', 'Person B');

    graph.loadFromParseResult(makeParseResult([a, b], []));

    const path = findPath(graph, 'a', 'b');
    expect(path).toBeNull();
  });

  it('should return empty array for path to self', () => {
    const a = makePerson('a', 'Person A');
    graph.loadFromParseResult(makeParseResult([a], []));

    const path = findPath(graph, 'a', 'a');
    expect(path).toEqual([]);
  });

  it('should return null when fromId does not exist', () => {
    const a = makePerson('a', 'Person A');
    graph.loadFromParseResult(makeParseResult([a], []));

    expect(findPath(graph, 'nonexistent', 'a')).toBeNull();
  });

  it('should return null when toId does not exist', () => {
    const a = makePerson('a', 'Person A');
    graph.loadFromParseResult(makeParseResult([a], []));

    expect(findPath(graph, 'a', 'nonexistent')).toBeNull();
  });

  it('should find a path through spouse links', () => {
    // father --child--> kid <--child-- mother
    // path from father to mother goes: father -> kid (child) -> mother (???)
    // Actually: father and mother are spouses because they share kid.
    // So the path should be: father -> mother (spouse), 1 segment.
    const father = makePerson('f', 'Father');
    const mother = makePerson('m', 'Mother');
    const kid = makePerson('k', 'Kid');

    graph.loadFromParseResult(
      makeParseResult(
        [father, mother, kid],
        [makeEdge('e1', 'f', 'k'), makeEdge('e2', 'm', 'k')],
      ),
    );

    const path = findPath(graph, 'f', 'm');
    expect(path).not.toBeNull();
    // Could be 1 segment (spouse) or 2 (through child), either is valid.
    // The BFS should find the shortest, which is 1 via spouse.
    expect(path!.length).toBeLessThanOrEqual(2);

    // Verify it's a valid path: starts at f, ends at m.
    expect(path![0].fromPersonId).toBe('f');
    expect(path![path!.length - 1].toPersonId).toBe('m');
  });

  it('should find shortest path in a larger graph', () => {
    // Build: A -> B -> C -> D -> E (linear chain)
    const persons = ['A', 'B', 'C', 'D', 'E'].map((id) =>
      makePerson(id, `Person ${id}`),
    );
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'B', 'C'),
      makeEdge('e3', 'C', 'D'),
      makeEdge('e4', 'D', 'E'),
    ];

    graph.loadFromParseResult(makeParseResult(persons, edges));

    const path = findPath(graph, 'A', 'E');
    expect(path).not.toBeNull();
    expect(path).toHaveLength(4);
  });

  it('should handle a diamond-shaped family (two parents share a child)', () => {
    const father = makePerson('f', 'Father');
    const mother = makePerson('m', 'Mother');
    const child1 = makePerson('c1', 'Child1');
    const child2 = makePerson('c2', 'Child2');

    graph.loadFromParseResult(
      makeParseResult(
        [father, mother, child1, child2],
        [
          makeEdge('e1', 'f', 'c1'),
          makeEdge('e2', 'm', 'c1'),
          makeEdge('e3', 'f', 'c2'),
          makeEdge('e4', 'm', 'c2'),
        ],
      ),
    );

    // Path from child1 to child2: siblings share parents.
    const path = findPath(graph, 'c1', 'c2');
    expect(path).not.toBeNull();
    // Could go c1 -> f -> c2 (2 segments) or c1 -> m -> c2 (2 segments)
    expect(path!.length).toBe(2);
  });
});
