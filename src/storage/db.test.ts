import { describe, it, expect, afterEach } from 'vitest';
import { getDb, closeDb } from './db.ts';

afterEach(async () => {
  await closeDb();
  // Clear the database between tests
  indexedDB.deleteDatabase('genielogical');
});

describe('getDb', () => {
  it('opens a database connection', async () => {
    const db = await getDb();
    expect(db).toBeDefined();
    expect(db.name).toBe('genielogical');
  });

  it('returns the same connection on subsequent calls', async () => {
    const db1 = await getDb();
    const db2 = await getDb();
    expect(db1).toBe(db2);
  });

  it('creates 6 object stores', async () => {
    const db = await getDb();
    const storeNames = Array.from(db.objectStoreNames);
    expect(storeNames).toContain('trees');
    expect(storeNames).toContain('persons');
    expect(storeNames).toContain('edges');
    expect(storeNames).toContain('sources');
    expect(storeNames).toContain('flags');
    expect(storeNames).toContain('crossTreeLinks');
    expect(storeNames).toContain('geocache');
    expect(storeNames).toHaveLength(7);
  });

  it('creates by-tree index on persons store', async () => {
    const db = await getDb();
    const tx = db.transaction('persons', 'readonly');
    const indexNames = Array.from(tx.objectStore('persons').indexNames);
    expect(indexNames).toContain('by-tree');
  });

  it('creates by-tree index on edges store', async () => {
    const db = await getDb();
    const tx = db.transaction('edges', 'readonly');
    const indexNames = Array.from(tx.objectStore('edges').indexNames);
    expect(indexNames).toContain('by-tree');
  });

  it('creates by-tree index on sources store', async () => {
    const db = await getDb();
    const tx = db.transaction('sources', 'readonly');
    const indexNames = Array.from(tx.objectStore('sources').indexNames);
    expect(indexNames).toContain('by-tree');
  });

  it('creates by-tree index on flags store', async () => {
    const db = await getDb();
    const tx = db.transaction('flags', 'readonly');
    const indexNames = Array.from(tx.objectStore('flags').indexNames);
    expect(indexNames).toContain('by-tree');
  });
});

describe('closeDb', () => {
  it('closes the connection and allows reopening', async () => {
    const db1 = await getDb();
    await closeDb();
    const db2 = await getDb();
    // After close + reopen, it should be a new connection object
    expect(db2).not.toBe(db1);
  });

  it('does not throw if called when no connection exists', async () => {
    await expect(closeDb()).resolves.toBeUndefined();
  });
});
