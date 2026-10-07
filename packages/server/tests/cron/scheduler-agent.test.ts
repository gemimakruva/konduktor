import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, getDb } from '../../src/db/connection.js';
import { CronRepository } from '../../src/db/cron-repository.js';
import { AgentRepository } from '../../src/db/agent-repository.js';

describe('Cron-Agent Integration', () => {
  let db: Database.Database;

  beforeEach(() => {
    initDb(':memory:');
    db = getDb();
  });

  afterEach(() => db.close());

  it('creates a cron job with agentId', () => {
    const agentRepo = new AgentRepository(db);
    const agent = agentRepo.create({ name: 'Cron Agent' });
    const cronRepo = new CronRepository(db);
    const job = cronRepo.create({
      name: 'Test Job', schedule: '* * * * *', prompt: 'do stuff', agentId: agent.id,
    });
    expect(job.agentId).toBe(agent.id);
  });

  it('creates a cron job without agentId', () => {
    const cronRepo = new CronRepository(db);
    const job = cronRepo.create({
      name: 'Plain Job', schedule: '* * * * *', prompt: 'do stuff',
    });
    expect(job.agentId).toBeNull();
  });

  it('updates agentId on existing job', () => {
    const agentRepo = new AgentRepository(db);
    const agent = agentRepo.create({ name: 'Updater' });
    const cronRepo = new CronRepository(db);
    const job = cronRepo.create({ name: 'Job', schedule: '* * * * *', prompt: 'x' });
    cronRepo.update(job.id, { agentId: agent.id });
    const updated = cronRepo.getById(job.id);
    expect(updated?.agentId).toBe(agent.id);
  });

  it('falls back when agent profile is deleted', () => {
    const agentRepo = new AgentRepository(db);
    const agent = agentRepo.create({ name: 'Doomed' });
    const cronRepo = new CronRepository(db);
    const job = cronRepo.create({
      name: 'Linked', schedule: '* * * * *', prompt: 'work', agentId: agent.id,
    });
    agentRepo.delete(agent.id);
    const reloaded = cronRepo.getById(job.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.agentId).toBe(agent.id);
    const profile = agentRepo.getById(reloaded!.agentId!);
    expect(profile).toBeUndefined();
  });
});
