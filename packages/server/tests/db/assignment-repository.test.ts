import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, getDb } from '../../src/db/connection.js';
import { AssignmentRepository } from '../../src/db/assignment-repository.js';
import { AgentRepository } from '../../src/db/agent-repository.js';

describe('AssignmentRepository', () => {
  let db: Database.Database;
  let repo: AssignmentRepository;

  beforeEach(() => {
    initDb(':memory:');
    db = getDb();
    repo = new AssignmentRepository(db);
    new AgentRepository(db).create({ name: 'Agent1' });
  });

  afterEach(() => { db.close(); });

  it('creates an assignment', () => {
    const a = repo.create({ taskId: 1, agentId: 1 });
    expect(a.status).toBe('pending');
    expect(a.agentId).toBe(1);
  });

  it('counts active assignments for an agent', () => {
    repo.create({ taskId: 1, agentId: 1 });
    repo.create({ taskId: 2, agentId: 1 });
    expect(repo.countActive(1)).toBe(2);
  });

  it('updates status', () => {
    const a = repo.create({ taskId: 1, agentId: 1 });
    repo.updateStatus(a.id, 'running');
    repo.updateStatus(a.id, 'completed', 'Done!');
    const updated = repo.getByTask(1);
    expect(updated?.status).toBe('completed');
    expect(updated?.output).toBe('Done!');
  });

  it('lists by agent', () => {
    repo.create({ taskId: 1, agentId: 1 });
    repo.create({ taskId: 2, agentId: 1 });
    expect(repo.list(1)).toHaveLength(2);
  });
});
