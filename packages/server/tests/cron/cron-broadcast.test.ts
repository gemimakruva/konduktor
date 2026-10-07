import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';
import { CronScheduler } from '../../src/cron/scheduler.js';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
});

afterAll(() => db.close());

describe('CronScheduler broadcast', () => {
  it('accepts an onComplete callback', () => {
    const scheduler = new CronScheduler(db);
    const received: unknown[] = [];
    scheduler.onComplete((msg) => received.push(msg));
    expect(received).toHaveLength(0);
  });

  it('does not throw when no callback is set', () => {
    const scheduler = new CronScheduler(db);
    expect(() => scheduler.stopAll()).not.toThrow();
  });
});
