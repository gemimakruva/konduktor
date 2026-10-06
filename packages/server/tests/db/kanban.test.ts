import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';
import { KanbanRepository } from '../../src/db/kanban-repository.js';

let db: Database.Database;
let repo: KanbanRepository;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  repo = new KanbanRepository(db);
});

afterAll(() => db.close());

describe('KanbanRepository', () => {
  it('creates and lists tasks', () => {
    repo.create({ title: 'Build feature', column: 'backlog' });
    repo.create({ title: 'Fix bug', column: 'in-progress', sessionId: 'sess-1' });
    const tasks = repo.list();
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('Build feature');
  });

  it('moves task to different column', () => {
    const tasks = repo.list();
    repo.moveToColumn(tasks[0].id, 'in-progress');
    const updated = repo.list();
    expect(updated.find(t => t.id === tasks[0].id)!.column).toBe('in-progress');
  });

  it('deletes task without affecting linked session', () => {
    const tasks = repo.list();
    const withSession = tasks.find(t => t.sessionId === 'sess-1')!;
    repo.delete(withSession.id);
    const remaining = repo.list();
    expect(remaining.find(t => t.id === withSession.id)).toBeUndefined();
  });

  it('updates task fields', () => {
    const tasks = repo.list();
    repo.update(tasks[0].id, { title: 'Updated title', description: 'some desc' });
    const updated = repo.list();
    expect(updated[0].title).toBe('Updated title');
    expect(updated[0].description).toBe('some desc');
  });
});
