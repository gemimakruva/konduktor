import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';
import { CronRepository } from '../../src/db/cron-repository.js';

let db: Database.Database;
let repo: CronRepository;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  repo = new CronRepository(db);
});

afterAll(() => db.close());

describe('CronRepository', () => {
  let jobId: number;

  it('creates a cron job', () => {
    const job = repo.create({ name: 'Daily report', schedule: '0 9 * * *', prompt: 'Generate daily report' });
    jobId = job.id;
    expect(job.name).toBe('Daily report');
    expect(job.schedule).toBe('0 9 * * *');
    expect(job.enabled).toBe(true);
  });

  it('lists all jobs', () => {
    const jobs = repo.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(jobId);
  });

  it('disables and enables a job', () => {
    repo.disable(jobId);
    expect(repo.getById(jobId)!.enabled).toBe(false);
    repo.enable(jobId);
    expect(repo.getById(jobId)!.enabled).toBe(true);
  });

  it('creates and finishes an execution', () => {
    const execId = repo.createExecution(jobId);
    expect(execId).toBeGreaterThan(0);

    repo.finishExecution(execId, 'completed', 'Report generated', {
      costUsd: 0.02, inputTokens: 500, outputTokens: 300,
    });

    const execs = repo.listExecutions(jobId, 10);
    expect(execs).toHaveLength(1);
    expect(execs[0].status).toBe('completed');
    expect(execs[0].costUsd).toBe(0.02);
  });

  it('deletes job and cascades executions', () => {
    repo.delete(jobId);
    expect(repo.list()).toHaveLength(0);
  });
});
