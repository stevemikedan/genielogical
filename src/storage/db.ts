/**
 * IndexedDB schema and database access via `idb`.
 *
 * Stores: trees, persons, edges, sources, flags, crossTreeLinks.
 * Person/Edge/Source/Flag records are wrapped with `treeId` at the storage boundary
 * — the in-memory types remain unchanged.
 */

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import type { TreeMetadata } from '@/types/tree.ts';
import type { CrossTreeLink } from '@/types/cross-tree-link.ts';

// ── Storage record types (Person/Edge/Source/Flag + treeId) ────────

export type PersonRecord = Person & { treeId: string };
export type EdgeRecord = Edge & { treeId: string };
export type SourceRecord = Source & { treeId: string };
export type FlagRecord = Flag & { treeId: string };

// ── IndexedDB schema ───────────────────────────────────────────────

interface GenieLogicalDB extends DBSchema {
  trees: {
    key: string;
    value: TreeMetadata;
  };
  persons: {
    key: string;           // person.id (unique across trees via UUID prefix)
    value: PersonRecord;
    indexes: { 'by-tree': string };
  };
  edges: {
    key: string;
    value: EdgeRecord;
    indexes: { 'by-tree': string };
  };
  sources: {
    key: string;
    value: SourceRecord;
    indexes: { 'by-tree': string };
  };
  flags: {
    key: string;
    value: FlagRecord;
    indexes: { 'by-tree': string };
  };
  crossTreeLinks: {
    key: string;
    value: CrossTreeLink;
  };
}

const DB_NAME = 'genielogical';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GenieLogicalDB>> | null = null;

/**
 * Get or open the singleton database connection.
 */
export function getDb(): Promise<IDBPDatabase<GenieLogicalDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GenieLogicalDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Trees store
        if (!db.objectStoreNames.contains('trees')) {
          db.createObjectStore('trees', { keyPath: 'id' });
        }

        // Persons store with treeId index
        if (!db.objectStoreNames.contains('persons')) {
          const personStore = db.createObjectStore('persons', { keyPath: 'id' });
          personStore.createIndex('by-tree', 'treeId');
        }

        // Edges store with treeId index
        if (!db.objectStoreNames.contains('edges')) {
          const edgeStore = db.createObjectStore('edges', { keyPath: 'id' });
          edgeStore.createIndex('by-tree', 'treeId');
        }

        // Sources store with treeId index
        if (!db.objectStoreNames.contains('sources')) {
          const sourceStore = db.createObjectStore('sources', { keyPath: 'id' });
          sourceStore.createIndex('by-tree', 'treeId');
        }

        // Flags store with treeId index
        if (!db.objectStoreNames.contains('flags')) {
          const flagStore = db.createObjectStore('flags', { keyPath: 'id' });
          flagStore.createIndex('by-tree', 'treeId');
        }

        // Cross-tree links store
        if (!db.objectStoreNames.contains('crossTreeLinks')) {
          db.createObjectStore('crossTreeLinks', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Close and reset the database connection (useful for testing).
 */
export async function closeDb(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
}
