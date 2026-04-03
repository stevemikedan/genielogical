import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb } from './db.ts';
import {
  listTrees,
  getTree,
  createTree,
  updateTreeMetadata,
  deleteTree,
  loadTreeGraph,
  saveTreeGraph,
  listCrossTreeLinks,
  saveCrossTreeLink,
  deleteCrossTreeLink,
  getCrossTreeLinksForTree,
} from './tree-repository.ts';
import { makePerson, makeEdge, makeSource, makeFlag, makeGraph } from '@/test/test-utils.ts';
import type { CrossTreeLink } from '@/types/cross-tree-link.ts';

beforeEach(() => {
  // Each test starts with a fresh database
  indexedDB.deleteDatabase('genielogical');
});

afterEach(async () => {
  await closeDb();
});

// ── Tree CRUD ────────────────────────────────────────────────────────

describe('createTree', () => {
  it('creates a tree with generated id and timestamps', async () => {
    const tree = await createTree('My Family');
    expect(tree.id).toMatch(/^tree-/);
    expect(tree.name).toBe('My Family');
    expect(tree.createdAt).toBeInstanceOf(Date);
    expect(tree.personCount).toBe(0);
  });

  it('stores the tree in IndexedDB', async () => {
    const tree = await createTree('Stored Tree');
    const loaded = await getTree(tree.id);
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('Stored Tree');
  });

  it('accepts optional description and gedcomFileName', async () => {
    const tree = await createTree('Test', { description: 'desc', gedcomFileName: 'file.ged' });
    expect(tree.description).toBe('desc');
    expect(tree.gedcomFileName).toBe('file.ged');
  });
});

describe('listTrees', () => {
  it('returns empty array when no trees exist', async () => {
    const trees = await listTrees();
    expect(trees).toEqual([]);
  });

  it('returns trees sorted by lastOpenedAt descending', async () => {
    const t1 = await createTree('Old Tree');
    // Make t1 older
    await updateTreeMetadata(t1.id, { lastOpenedAt: new Date('2020-01-01') });
    const t2 = await createTree('New Tree');

    const trees = await listTrees();
    expect(trees).toHaveLength(2);
    expect(trees[0].id).toBe(t2.id);
    expect(trees[1].id).toBe(t1.id);
  });
});

describe('getTree', () => {
  it('returns undefined for nonexistent tree', async () => {
    const result = await getTree('nonexistent');
    expect(result).toBeUndefined();
  });
});

describe('updateTreeMetadata', () => {
  it('updates partial metadata fields', async () => {
    const tree = await createTree('Original');
    await updateTreeMetadata(tree.id, { name: 'Updated', personCount: 42 });
    const loaded = await getTree(tree.id);
    expect(loaded!.name).toBe('Updated');
    expect(loaded!.personCount).toBe(42);
  });

  it('does nothing for nonexistent tree', async () => {
    await expect(updateTreeMetadata('missing', { name: 'X' })).resolves.toBeUndefined();
  });
});

describe('deleteTree', () => {
  it('removes tree metadata', async () => {
    const tree = await createTree('To Delete');
    await deleteTree(tree.id);
    const result = await getTree(tree.id);
    expect(result).toBeUndefined();
  });

  it('removes all associated records (persons, edges, sources, flags)', async () => {
    const tree = await createTree('Full Tree');
    const graph = makeGraph(
      [makePerson({ id: 'p1' }), makePerson({ id: 'p2' })],
      [makeEdge({ id: 'e1', parentId: 'p1', childId: 'p2' })],
      [makeSource({ id: 's1' })],
    );
    const flags = [makeFlag({ id: 'f1' })];
    await saveTreeGraph(tree.id, graph, flags);

    // Verify records exist
    let loaded = await loadTreeGraph(tree.id);
    expect(loaded.graph.persons.size).toBe(2);

    // Delete and verify gone
    await deleteTree(tree.id);
    loaded = await loadTreeGraph(tree.id);
    expect(loaded.graph.persons.size).toBe(0);
    expect(loaded.graph.edges.size).toBe(0);
  });
});

// ── Save and Load Graph ──────────────────────────────────────────────

describe('saveTreeGraph + loadTreeGraph', () => {
  it('round-trips persons', async () => {
    const tree = await createTree('Person Test');
    const graph = makeGraph([
      makePerson({ id: 'p1', name: { full: 'John Smith', given: 'John', middle: '', surname: 'Smith', maidenName: '', prefix: '', suffix: '', raw: 'John Smith' } }),
    ]);
    await saveTreeGraph(tree.id, graph, []);

    const loaded = await loadTreeGraph(tree.id);
    expect(loaded.graph.persons.size).toBe(1);
    const person = loaded.graph.persons.get('p1');
    expect(person?.name.full).toBe('John Smith');
    // treeId should be stripped
    expect((person as unknown as Record<string, unknown>)['treeId']).toBeUndefined();
  });

  it('round-trips edges', async () => {
    const tree = await createTree('Edge Test');
    const graph = makeGraph(
      [makePerson({ id: 'p1' }), makePerson({ id: 'p2' })],
      [makeEdge({ id: 'e1', parentId: 'p1', childId: 'p2', relationshipType: 'adoptive' })],
    );
    await saveTreeGraph(tree.id, graph, []);

    const loaded = await loadTreeGraph(tree.id);
    expect(loaded.graph.edges.size).toBe(1);
    expect(loaded.graph.edges.get('e1')?.relationshipType).toBe('adoptive');
  });

  it('round-trips sources', async () => {
    const tree = await createTree('Source Test');
    const graph = makeGraph(
      [],
      [],
      [makeSource({ id: 's1', title: 'Census 1850', sourceClass: 'primary' })],
    );
    await saveTreeGraph(tree.id, graph, []);

    const loaded = await loadTreeGraph(tree.id);
    expect(loaded.graph.sources.size).toBe(1);
    expect(loaded.graph.sources.get('s1')?.title).toBe('Census 1850');
  });

  it('round-trips flags', async () => {
    const tree = await createTree('Flag Test');
    const graph = makeGraph();
    const flags = [makeFlag({ id: 'f1', title: 'Date error', severity: 'critical' })];
    await saveTreeGraph(tree.id, graph, flags);

    const loaded = await loadTreeGraph(tree.id);
    expect(loaded.flags).toHaveLength(1);
    expect(loaded.flags[0].title).toBe('Date error');
    expect(loaded.flags[0].severity).toBe('critical');
  });

  it('updates tree metadata counts on save', async () => {
    const tree = await createTree('Count Test');
    const graph = makeGraph(
      [makePerson({ id: 'p1' }), makePerson({ id: 'p2' }), makePerson({ id: 'p3' })],
      [makeEdge({ id: 'e1', parentId: 'p1', childId: 'p2' }), makeEdge({ id: 'e2', parentId: 'p1', childId: 'p3' })],
    );
    await saveTreeGraph(tree.id, graph, []);

    const meta = await getTree(tree.id);
    expect(meta!.personCount).toBe(3);
    expect(meta!.edgeCount).toBe(2);
  });

  it('replaces previous data on re-save', async () => {
    const tree = await createTree('Replace Test');
    const graph1 = makeGraph([makePerson({ id: 'p1' }), makePerson({ id: 'p2' })]);
    await saveTreeGraph(tree.id, graph1, []);

    // Save with fewer persons
    const graph2 = makeGraph([makePerson({ id: 'p3' })]);
    await saveTreeGraph(tree.id, graph2, []);

    const loaded = await loadTreeGraph(tree.id);
    expect(loaded.graph.persons.size).toBe(1);
    expect(loaded.graph.persons.has('p1')).toBe(false);
    expect(loaded.graph.persons.has('p3')).toBe(true);
  });

  it('handles empty tree', async () => {
    const tree = await createTree('Empty Test');
    const graph = makeGraph();
    await saveTreeGraph(tree.id, graph, []);

    const loaded = await loadTreeGraph(tree.id);
    expect(loaded.graph.persons.size).toBe(0);
    expect(loaded.graph.edges.size).toBe(0);
    expect(loaded.flags).toHaveLength(0);
  });

  it('loads from missing tree (returns empty graph)', async () => {
    const loaded = await loadTreeGraph('nonexistent-id');
    expect(loaded.graph.persons.size).toBe(0);
    expect(loaded.flags).toHaveLength(0);
  });

  it('rebuilds graph indices on load', async () => {
    const tree = await createTree('Index Test');
    const graph = makeGraph(
      [makePerson({ id: 'p1' }), makePerson({ id: 'p2' })],
      [makeEdge({ id: 'e1', parentId: 'p1', childId: 'p2' })],
    );
    await saveTreeGraph(tree.id, graph, []);

    const loaded = await loadTreeGraph(tree.id);
    // Test that indices work (getParents uses the child→parents index)
    expect(loaded.graph.getParents('p2')).toHaveLength(1);
    expect(loaded.graph.getChildren('p1')).toHaveLength(1);
  });
});

// ── Isolation between trees ──────────────────────────────────────────

describe('tree isolation', () => {
  it('keeps data separate between two trees', async () => {
    const treeA = await createTree('Tree A');
    const treeB = await createTree('Tree B');

    const graphA = makeGraph([makePerson({ id: 'pa1' })]);
    const graphB = makeGraph([makePerson({ id: 'pb1' }), makePerson({ id: 'pb2' })]);

    await saveTreeGraph(treeA.id, graphA, []);
    await saveTreeGraph(treeB.id, graphB, []);

    const loadedA = await loadTreeGraph(treeA.id);
    const loadedB = await loadTreeGraph(treeB.id);
    expect(loadedA.graph.persons.size).toBe(1);
    expect(loadedB.graph.persons.size).toBe(2);
  });
});

// ── Cross-tree links ─────────────────────────────────────────────────

describe('cross-tree links', () => {
  function makeLink(id: string): CrossTreeLink {
    return {
      id,
      personIdA: 'pa1',
      treeIdA: 'tA',
      personIdB: 'pb1',
      treeIdB: 'tB',
      confidence: 'probable',
      notes: '',
      createdAt: new Date(),
    };
  }

  it('saves and lists cross-tree links', async () => {
    await saveCrossTreeLink(makeLink('xtl-1'));
    const links = await listCrossTreeLinks();
    expect(links).toHaveLength(1);
    expect(links[0].id).toBe('xtl-1');
  });

  it('deletes a cross-tree link', async () => {
    await saveCrossTreeLink(makeLink('xtl-1'));
    await deleteCrossTreeLink('xtl-1');
    const links = await listCrossTreeLinks();
    expect(links).toHaveLength(0);
  });

  it('filters links by tree id', async () => {
    const link1 = makeLink('xtl-1');
    link1.treeIdA = 'tree-A';
    link1.treeIdB = 'tree-B';
    const link2 = makeLink('xtl-2');
    link2.treeIdA = 'tree-C';
    link2.treeIdB = 'tree-D';

    await saveCrossTreeLink(link1);
    await saveCrossTreeLink(link2);

    const linksForA = await getCrossTreeLinksForTree('tree-A');
    expect(linksForA).toHaveLength(1);
    expect(linksForA[0].id).toBe('xtl-1');

    const linksForB = await getCrossTreeLinksForTree('tree-B');
    expect(linksForB).toHaveLength(1);

    const linksForX = await getCrossTreeLinksForTree('tree-X');
    expect(linksForX).toHaveLength(0);
  });
});
