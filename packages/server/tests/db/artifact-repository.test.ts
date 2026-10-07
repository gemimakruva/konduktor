import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';
import { ArtifactRepository } from '../../src/db/artifact-repository.js';

let db: Database.Database;
let repo: ArtifactRepository;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  repo = new ArtifactRepository(db);
});

afterAll(() => db.close());

describe('ArtifactRepository', () => {
  let artifactId: number;

  it('creates an artifact', () => {
    const a = repo.create({
      sessionId: 'sess-1',
      url: 'https://claude.ai/code/artifact/abc123',
      title: 'Dashboard',
      description: 'A metrics dashboard',
      icon: 'chart',
      artifactType: 'html',
    });
    artifactId = a.id;
    expect(a.title).toBe('Dashboard');
    expect(a.url).toBe('https://claude.ai/code/artifact/abc123');
    expect(a.tags).toEqual([]);
    expect(a.pinned).toBe(false);
  });

  it('creates artifact with missing optional fields', () => {
    const a = repo.create({
      sessionId: null,
      url: null,
      title: '',
      description: '',
      icon: '',
      artifactType: '',
    });
    expect(a.title).toBe('Untitled');
    expect(a.url).toBeNull();
    repo.delete(a.id);
  });

  it('lists artifacts with pinned first', () => {
    const a2 = repo.create({
      sessionId: 'sess-2',
      url: 'https://claude.ai/code/artifact/def456',
      title: 'Pinned One',
      description: '',
      icon: 'star',
      artifactType: 'html',
    });
    repo.update(a2.id, { pinned: true });
    const list = repo.list();
    expect(list[0].pinned).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('updates tags and pinned', () => {
    repo.update(artifactId, { tags: ['dashboard', 'v2'], pinned: true });
    const a = repo.getById(artifactId)!;
    expect(a.tags).toEqual(['dashboard', 'v2']);
    expect(a.pinned).toBe(true);
  });

  it('filters by tag', () => {
    const list = repo.list({ tag: 'dashboard' });
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(artifactId);
  });

  it('handles concurrent artifacts from same session', () => {
    const a1 = repo.create({
      sessionId: 'sess-multi',
      url: 'https://claude.ai/code/artifact/aaa',
      title: 'First',
      description: '',
      icon: 'code',
      artifactType: 'html',
    });
    const a2 = repo.create({
      sessionId: 'sess-multi',
      url: 'https://claude.ai/code/artifact/bbb',
      title: 'Second',
      description: '',
      icon: 'code',
      artifactType: 'html',
    });
    expect(a1.id).not.toBe(a2.id);
    expect(
      repo.list().filter((a) => a.sessionId === 'sess-multi').length,
    ).toBe(2);
    repo.delete(a1.id);
    repo.delete(a2.id);
  });

  it('deletes artifact without affecting other tables', () => {
    repo.delete(artifactId);
    expect(repo.getById(artifactId)).toBeUndefined();
  });
});
