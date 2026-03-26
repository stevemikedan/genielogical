/**
 * Tree repository — CRUD for tree workspaces in IndexedDB.
 *
 * Reads/writes at the storage boundary, wrapping Person/Edge/Source/Flag
 * with treeId for persistence and stripping it on load.
 */

import { getDb } from './db.ts';
import type { PersonRecord, EdgeRecord, SourceRecord, FlagRecord } from './db.ts';
import type { TreeMetadata } from '@/types/tree.ts';
import type { CrossTreeLink } from '@/types/cross-tree-link.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import { TreeGraph } from '@/graph/tree-graph.ts';
import { generateTreeId } from '@/utils/id-generator.ts';

// ── Tree CRUD ──────────────────────────────────────────────────────

export async function listTrees(): Promise<TreeMetadata[]> {
  const db = await getDb();
  const trees = await db.getAll('trees');
  // Sort by lastOpenedAt descending (most recent first)
  return trees.sort((a, b) => {
    const aTime = a.lastOpenedAt instanceof Date ? a.lastOpenedAt.getTime() : 0;
    const bTime = b.lastOpenedAt instanceof Date ? b.lastOpenedAt.getTime() : 0;
    return bTime - aTime;
  });
}

export async function getTree(treeId: string): Promise<TreeMetadata | undefined> {
  const db = await getDb();
  return db.get('trees', treeId);
}

export async function createTree(
  name: string,
  opts?: { description?: string; gedcomFileName?: string | null },
): Promise<TreeMetadata> {
  const db = await getDb();
  const now = new Date();
  const metadata: TreeMetadata = {
    id: generateTreeId(),
    name,
    description: opts?.description ?? '',
    gedcomFileName: opts?.gedcomFileName ?? null,
    personCount: 0,
    edgeCount: 0,
    generationCount: 0,
    createdAt: now,
    lastModifiedAt: now,
    lastOpenedAt: now,
  };
  await db.put('trees', metadata);
  return metadata;
}

export async function updateTreeMetadata(
  treeId: string,
  updates: Partial<Pick<TreeMetadata, 'name' | 'description' | 'personCount' | 'edgeCount' | 'generationCount' | 'lastModifiedAt' | 'lastOpenedAt'>>,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get('trees', treeId);
  if (!existing) return;
  await db.put('trees', { ...existing, ...updates });
}

export async function deleteTree(treeId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['trees', 'persons', 'edges', 'sources', 'flags'],
    'readwrite',
  );

  // Delete all records belonging to this tree
  const personKeys = await tx.objectStore('persons').index('by-tree').getAllKeys(treeId);
  for (const key of personKeys) {
    await tx.objectStore('persons').delete(key);
  }

  const edgeKeys = await tx.objectStore('edges').index('by-tree').getAllKeys(treeId);
  for (const key of edgeKeys) {
    await tx.objectStore('edges').delete(key);
  }

  const sourceKeys = await tx.objectStore('sources').index('by-tree').getAllKeys(treeId);
  for (const key of sourceKeys) {
    await tx.objectStore('sources').delete(key);
  }

  const flagKeys = await tx.objectStore('flags').index('by-tree').getAllKeys(treeId);
  for (const key of flagKeys) {
    await tx.objectStore('flags').delete(key);
  }

  // Delete the tree metadata itself
  await tx.objectStore('trees').delete(treeId);

  await tx.done;
}

// ── Load tree into in-memory graph ─────────────────────────────────

export interface LoadedTreeData {
  graph: TreeGraph;
  flags: Flag[];
}

export async function loadTreeGraph(treeId: string): Promise<LoadedTreeData> {
  const db = await getDb();

  // Load all records for this tree
  const personRecords = await db.getAllFromIndex('persons', 'by-tree', treeId);
  const edgeRecords = await db.getAllFromIndex('edges', 'by-tree', treeId);
  const sourceRecords = await db.getAllFromIndex('sources', 'by-tree', treeId);
  const flagRecords = await db.getAllFromIndex('flags', 'by-tree', treeId);

  // Strip treeId and build graph
  const graph = new TreeGraph();

  for (const rec of personRecords) {
    const { treeId: _t, ...person } = rec;
    graph.persons.set(person.id, person as Person);
  }

  for (const rec of edgeRecords) {
    const { treeId: _t, ...edge } = rec;
    graph.edges.set(edge.id, edge as Edge);
  }

  for (const rec of sourceRecords) {
    const { treeId: _t, ...source } = rec;
    graph.sources.set(source.id, source as Source);
  }

  graph.rebuildIndices();

  // Strip treeId from flags
  const flags: Flag[] = flagRecords.map(rec => {
    const { treeId: _t, ...flag } = rec;
    return flag as Flag;
  });

  // Update lastOpenedAt
  await updateTreeMetadata(treeId, { lastOpenedAt: new Date() });

  return { graph, flags };
}

// ── Save tree from in-memory graph ─────────────────────────────────

export async function saveTreeGraph(
  treeId: string,
  graph: TreeGraph,
  flags: Flag[],
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['persons', 'edges', 'sources', 'flags', 'trees'],
    'readwrite',
  );

  // Clear existing records for this tree, then write current state.
  // This is a bulk-write approach — simple and correct for <10K person graphs.

  // Clear existing persons
  const existingPersonKeys = await tx.objectStore('persons').index('by-tree').getAllKeys(treeId);
  for (const key of existingPersonKeys) {
    await tx.objectStore('persons').delete(key);
  }
  // Write current persons
  for (const person of graph.persons.values()) {
    const record: PersonRecord = { ...person, treeId };
    await tx.objectStore('persons').put(record);
  }

  // Clear existing edges
  const existingEdgeKeys = await tx.objectStore('edges').index('by-tree').getAllKeys(treeId);
  for (const key of existingEdgeKeys) {
    await tx.objectStore('edges').delete(key);
  }
  // Write current edges
  for (const edge of graph.edges.values()) {
    const record: EdgeRecord = { ...edge, treeId };
    await tx.objectStore('edges').put(record);
  }

  // Clear existing sources
  const existingSourceKeys = await tx.objectStore('sources').index('by-tree').getAllKeys(treeId);
  for (const key of existingSourceKeys) {
    await tx.objectStore('sources').delete(key);
  }
  // Write current sources
  for (const source of graph.sources.values()) {
    const record: SourceRecord = { ...source, treeId };
    await tx.objectStore('sources').put(record);
  }

  // Clear existing flags
  const existingFlagKeys = await tx.objectStore('flags').index('by-tree').getAllKeys(treeId);
  for (const key of existingFlagKeys) {
    await tx.objectStore('flags').delete(key);
  }
  // Write current flags
  for (const flag of flags) {
    const record: FlagRecord = { ...flag, treeId };
    await tx.objectStore('flags').put(record);
  }

  // Update tree metadata counts
  const tree = await tx.objectStore('trees').get(treeId);
  if (tree) {
    tree.personCount = graph.persons.size;
    tree.edgeCount = graph.edges.size;
    tree.generationCount = graph.getGenerationDepth();
    tree.lastModifiedAt = new Date();
    await tx.objectStore('trees').put(tree);
  }

  await tx.done;
}

// ── Cross-tree links ───────────────────────────────────────────────

export async function listCrossTreeLinks(): Promise<CrossTreeLink[]> {
  const db = await getDb();
  return db.getAll('crossTreeLinks');
}

export async function saveCrossTreeLink(link: CrossTreeLink): Promise<void> {
  const db = await getDb();
  await db.put('crossTreeLinks', link);
}

export async function deleteCrossTreeLink(linkId: string): Promise<void> {
  const db = await getDb();
  await db.delete('crossTreeLinks', linkId);
}

export async function getCrossTreeLinksForTree(treeId: string): Promise<CrossTreeLink[]> {
  const allLinks = await listCrossTreeLinks();
  return allLinks.filter(l => l.treeIdA === treeId || l.treeIdB === treeId);
}
