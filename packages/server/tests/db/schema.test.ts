import { describe, it, expect, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'node:fs';
import { initDb } from '../../src/db/connection.js';

const TEST_DB = '/tmp/konduktor-test.db';

afterEach(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync(TEST_DB + '-wal')) unlinkSync(TEST_DB + '-wal');
  if (existsSync(TEST_DB + '-shm')) unlinkSync(TEST_DB + '-shm');
});

describe('database', () => {
  it('creates tables on first init', () => {
    const db = initDb(TEST_DB);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('chat_history');
    expect(names).toContain('analytics');
    expect(names).toContain('capabilities');
    db.close();
  });

  it('is idempotent on second init', () => {
    const db1 = initDb(TEST_DB);
    db1.close();
    const db2 = initDb(TEST_DB);
    expect(() => db2.prepare("SELECT 1 FROM chat_history LIMIT 1").get()).not.toThrow();
    db2.close();
  });
});
