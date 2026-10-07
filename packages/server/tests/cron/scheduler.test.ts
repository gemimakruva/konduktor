import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => ({ stop: vi.fn() })),
    validate: vi.fn(() => true),
  },
}));

vi.mock('../../src/claude/cli.js', () => {
  const { EventEmitter } = require('node:events');
  return {
    ClaudeProcess: vi.fn().mockImplementation(() => {
      const proc = new EventEmitter();
      Object.assign(proc, {
        isRunning: false,
        start: vi.fn(() => {
          proc.isRunning = true;
          setTimeout(() => {
            proc.emit('event', { type: 'result', content: 'done', usage: {
              inputTokens: 100, outputTokens: 50, cacheReadTokens: 0,
              cacheWriteTokens: 0, thinkingTokens: 0, costUsd: 0.01,
            }, durationMs: 1000 });
            proc.emit('close', 0);
            proc.isRunning = false;
          }, 10);
        }),
        kill: vi.fn(() => { proc.isRunning = false; }),
      });
      return proc;
    }),
  };
});

import cron from 'node-cron';
import { CronScheduler } from '../../src/cron/scheduler.js';
import { CronRepository } from '../../src/db/cron-repository.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  vi.clearAllMocks();
});

afterEach(() => db.close());

describe('CronScheduler', () => {
  it('schedules enabled jobs on startAll', () => {
    const repo = new CronRepository(db);
    repo.create({ name: 'Test', schedule: '* * * * *', prompt: 'hello' });
    const job2 = repo.create({ name: 'Disabled', schedule: '* * * * *', prompt: 'hi' });
    repo.disable(job2.id);

    const scheduler = new CronScheduler(db);
    scheduler.startAll();

    expect(cron.schedule).toHaveBeenCalledTimes(1);
    scheduler.stopAll();
  });

  it('tracks running state via isRunning', () => {
    const repo = new CronRepository(db);
    const job = repo.create({ name: 'Slow', schedule: '* * * * *', prompt: 'slow task' });

    const scheduler = new CronScheduler(db);
    scheduler.scheduleJob(job);

    expect(scheduler.isRunning(job.id)).toBe(false);
    scheduler.stopAll();
  });

  it('stopAll clears all scheduled tasks', () => {
    const repo = new CronRepository(db);
    const job = repo.create({ name: 'Test', schedule: '* * * * *', prompt: 'hello' });

    const scheduler = new CronScheduler(db);
    scheduler.scheduleJob(job);
    scheduler.stopAll();

    expect(scheduler.isRunning(job.id)).toBe(false);
  });

  it('runNow triggers job execution', () => {
    vi.useFakeTimers();
    const repo = new CronRepository(db);
    const job = repo.create({ name: 'Manual', schedule: '0 9 * * *', prompt: 'run now' });

    const scheduler = new CronScheduler(db);
    const result = scheduler.runNow(job);
    expect(result).toBe(true);
    vi.runAllTimers();
    vi.useRealTimers();
    scheduler.stopAll();
  });

  it('validates cron expressions', () => {
    expect(CronScheduler.validate('* * * * *')).toBe(true);
  });
});
