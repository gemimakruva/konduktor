import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, getDb } from '../../src/db/connection.js';
import { AgentRepository } from '../../src/db/agent-repository.js';
import { AssignmentRepository } from '../../src/db/assignment-repository.js';

describe('AgentRepository', () => {
  let db: Database.Database;
  let repo: AgentRepository;

  beforeEach(() => {
    initDb(':memory:');
    db = getDb();
    repo = new AgentRepository(db);
  });

  afterEach(() => { db.close(); });

  it('creates a profile with defaults', () => {
    const profile = repo.create({ name: 'Test Agent' });
    expect(profile.id).toBe(1);
    expect(profile.name).toBe('Test Agent');
    expect(profile.icon).toBe('🤖');
    expect(profile.skills).toEqual([]);
    expect(profile.memoryPolicy).toBe('ephemeral');
    expect(profile.toolRestrictions).toEqual({ mode: 'allow', tools: [] });
  });

  it('creates a profile with all fields', () => {
    const profile = repo.create({
      name: 'DevOps',
      icon: '🔧',
      systemPrompt: 'You are a DevOps engineer',
      model: 'claude-opus-4-6',
      defaultCwd: '/srv/app',
      skills: ['devops', 'docker', 'ci-cd'],
      maxConcurrentTasks: 3,
      personalityPrompt: 'Be concise',
      delegationRules: [{ taskPattern: 'frontend', targetAgentId: 2 }],
      memoryPolicy: 'persistent',
      toolRestrictions: { mode: 'deny', tools: ['WebSearch'] },
      knowledgeSources: ['docs/runbook.md'],
    });
    expect(profile.skills).toEqual(['devops', 'docker', 'ci-cd']);
    expect(profile.delegationRules).toEqual([{ taskPattern: 'frontend', targetAgentId: 2 }]);
    expect(profile.toolRestrictions).toEqual({ mode: 'deny', tools: ['WebSearch'] });
  });

  it('lists all profiles', () => {
    repo.create({ name: 'Agent A' });
    repo.create({ name: 'Agent B' });
    expect(repo.list()).toHaveLength(2);
  });

  it('gets profile by id', () => {
    const created = repo.create({ name: 'Find Me' });
    expect(repo.getById(created.id)?.name).toBe('Find Me');
    expect(repo.getById(999)).toBeUndefined();
  });

  it('updates a profile', () => {
    const p = repo.create({ name: 'Old Name' });
    repo.update(p.id, { name: 'New Name', skills: ['testing'] });
    const updated = repo.getById(p.id)!;
    expect(updated.name).toBe('New Name');
    expect(updated.skills).toEqual(['testing']);
  });

  it('deletes a profile', () => {
    const p = repo.create({ name: 'Delete Me' });
    repo.delete(p.id);
    expect(repo.getById(p.id)).toBeUndefined();
  });

  it('computes performance stats', () => {
    const agent = repo.create({ name: 'Worker' });
    const aRepo = new AssignmentRepository(db);
    const a1 = aRepo.create({ taskId: 1, agentId: agent.id });
    aRepo.updateStatus(a1.id, 'running');
    aRepo.updateStatus(a1.id, 'completed', 'ok');
    const a2 = aRepo.create({ taskId: 2, agentId: agent.id });
    aRepo.updateStatus(a2.id, 'running');
    aRepo.updateStatus(a2.id, 'failed', 'error');
    const stats = repo.getStats(agent.id);
    expect(stats.tasksCompleted).toBe(1);
    expect(stats.tasksFailed).toBe(1);
    expect(stats.successRate).toBeCloseTo(0.5);
  });

  it('returns zero stats for agent with no assignments', () => {
    const agent = repo.create({ name: 'Idle' });
    const stats = repo.getStats(agent.id);
    expect(stats.tasksCompleted).toBe(0);
    expect(stats.successRate).toBe(0);
  });
});
