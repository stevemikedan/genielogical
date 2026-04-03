import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePersonDetail } from './use-person-detail.ts';
import { makePerson, makeEdge, makeSource, makeFlag, makeGraph } from '@/test/test-utils.ts';
import type { Conjecture } from '@/types/conjecture.ts';

describe('usePersonDetail', () => {
  it('returns null fields when personId is null', () => {
    const graph = makeGraph();
    const { result } = renderHook(() => usePersonDetail(null, graph, [], new Map()));
    expect(result.current).toBeNull();
  });

  it('returns null when person not found in graph', () => {
    const graph = makeGraph([makePerson({ id: 'p1' })]);
    const { result } = renderHook(() => usePersonDetail('missing', graph, [], new Map()));
    expect(result.current).toBeNull();
  });

  it('returns person data when found', () => {
    const graph = makeGraph([makePerson({ id: 'p1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } })]);
    const { result } = renderHook(() => usePersonDetail('p1', graph, [], new Map()));
    expect(result.current).not.toBeNull();
    expect(result.current!.person.name.full).toBe('John Smith');
  });

  it('returns parents with their edges', () => {
    const father = makePerson({ id: 'father', sex: 'M' });
    const mother = makePerson({ id: 'mother', sex: 'F' });
    const child = makePerson({ id: 'child' });
    const graph = makeGraph(
      [father, mother, child],
      [
        makeEdge({ id: 'e1', parentId: 'father', childId: 'child' }),
        makeEdge({ id: 'e2', parentId: 'mother', childId: 'child' }),
      ],
    );
    const { result } = renderHook(() => usePersonDetail('child', graph, [], new Map()));
    expect(result.current!.parents).toHaveLength(2);
  });

  it('returns children', () => {
    const parent = makePerson({ id: 'parent' });
    const c1 = makePerson({ id: 'c1' });
    const c2 = makePerson({ id: 'c2' });
    const graph = makeGraph(
      [parent, c1, c2],
      [
        makeEdge({ id: 'e1', parentId: 'parent', childId: 'c1' }),
        makeEdge({ id: 'e2', parentId: 'parent', childId: 'c2' }),
      ],
    );
    const { result } = renderHook(() => usePersonDetail('parent', graph, [], new Map()));
    expect(result.current!.children).toHaveLength(2);
  });

  it('returns sources resolved from person sourceIds', () => {
    const person = makePerson({ id: 'p1' });
    person.sourceIds = ['s1', 's2'];
    const src1 = makeSource({ id: 's1', title: 'Census 1850' });
    const src2 = makeSource({ id: 's2', title: 'Birth Record' });
    const graph = makeGraph([person], [], [src1, src2]);
    const { result } = renderHook(() => usePersonDetail('p1', graph, [], new Map()));
    expect(result.current!.sources).toHaveLength(2);
    expect(result.current!.sources.map(s => s.title)).toContain('Census 1850');
  });

  it('returns flags filtered to this person', () => {
    const graph = makeGraph([makePerson({ id: 'p1' }), makePerson({ id: 'p2' })]);
    const flags = [
      makeFlag({ id: 'f1', affectedPersonIds: ['p1'] }),
      makeFlag({ id: 'f2', affectedPersonIds: ['p2'] }),
      makeFlag({ id: 'f3', affectedPersonIds: ['p1', 'p2'] }),
    ];
    const { result } = renderHook(() => usePersonDetail('p1', graph, flags, new Map()));
    expect(result.current!.flags).toHaveLength(2);
    expect(result.current!.flags.map(f => f.id)).toContain('f1');
    expect(result.current!.flags.map(f => f.id)).toContain('f3');
  });

  it('returns conjectures from person conjectureIds', () => {
    const person = makePerson({ id: 'p1' });
    person.conjectureIds = ['c1'];
    const graph = makeGraph([person]);
    const conj: Conjecture = {
      id: 'c1', personId: 'p1', hypothesis: 'Test', confidencePercent: 50,
      supportingEvidence: '', contradictingEvidence: '', sourceIds: [],
      status: 'open', createdAt: new Date(), updatedAt: new Date(),
    };
    const conjectures = new Map([['c1', conj]]);
    const { result } = renderHook(() => usePersonDetail('p1', graph, [], conjectures));
    expect(result.current!.conjectures).toHaveLength(1);
  });

  it('returns siblings (children of same parents)', () => {
    const father = makePerson({ id: 'father' });
    const child1 = makePerson({ id: 'child1' });
    const child2 = makePerson({ id: 'child2' });
    const graph = makeGraph(
      [father, child1, child2],
      [
        makeEdge({ id: 'e1', parentId: 'father', childId: 'child1' }),
        makeEdge({ id: 'e2', parentId: 'father', childId: 'child2' }),
      ],
    );
    const { result } = renderHook(() => usePersonDetail('child1', graph, [], new Map()));
    expect(result.current!.siblings).toHaveLength(1);
    expect(result.current!.siblings[0].id).toBe('child2');
  });

  it('returns empty arrays when person has no relations', () => {
    const graph = makeGraph([makePerson({ id: 'lone' })]);
    const { result } = renderHook(() => usePersonDetail('lone', graph, [], new Map()));
    expect(result.current!.parents).toHaveLength(0);
    expect(result.current!.children).toHaveLength(0);
    expect(result.current!.siblings).toHaveLength(0);
    expect(result.current!.sources).toHaveLength(0);
    expect(result.current!.flags).toHaveLength(0);
  });
});
