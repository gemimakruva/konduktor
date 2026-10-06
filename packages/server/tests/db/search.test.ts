import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  db.exec(`INSERT INTO chat_history (session_id, role, content) VALUES
    ('s1', 'user', 'How do I deploy to production?'),
    ('s1', 'assistant', 'You can deploy using git push to the production branch'),
    ('s2', 'user', 'Fix the authentication bug'),
    ('s2', 'assistant', 'The bug was in the JWT validation middleware')`);
});

afterAll(() => db.close());

describe('FTS5 search', () => {
  it('finds messages matching query', () => {
    const rows = db.prepare(
      `SELECT session_id, role, content FROM chat_history_fts WHERE chat_history_fts MATCH ? ORDER BY rank`
    ).all('deploy');
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('returns highlighted snippets', () => {
    const rows = db.prepare(
      `SELECT session_id, highlight(chat_history_fts, 2, '<b>', '</b>') as hl
       FROM chat_history_fts WHERE chat_history_fts MATCH ?`
    ).all('authentication');
    expect(rows.length).toBe(1);
    expect((rows[0] as any).hl).toContain('<b>');
  });

  it('handles special FTS5 characters gracefully', () => {
    const sanitize = (raw: string) => raw.replace(/['"*(){}[\]^~\\]/g, ' ').trim().split(/\s+/).filter(Boolean).join(' ');
    const sanitized = sanitize('"unclosed quote');
    const rows = db.prepare(
      `SELECT * FROM chat_history_fts WHERE chat_history_fts MATCH ?`
    ).all(sanitized);
    expect(Array.isArray(rows)).toBe(true);
  });
});
