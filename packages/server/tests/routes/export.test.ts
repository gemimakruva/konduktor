import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, getDb } from '../../src/db/connection.js';
import { createApp } from '../../src/index.js';
import { createServer, type Server } from 'node:http';

let server: Server;
let port: number;

beforeAll(async () => {
  initDb(':memory:');
  const app = createApp();
  server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });

  const db = getDb();
  db.prepare(
    `INSERT INTO analytics (session_id, model, input_tokens, output_tokens, cost_usd, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('export-test', 'claude-sonnet-5-5', 1000, 500, 0.015, 3200);
  db.prepare(
    `INSERT INTO chat_history (session_id, role, content) VALUES (?, ?, ?)`
  ).run('export-test', 'user', 'Hello there');
  db.prepare(
    `INSERT INTO chat_history (session_id, role, content, model) VALUES (?, ?, ?, ?)`
  ).run('export-test', 'assistant', 'Hi! How can I help?', 'claude-sonnet-5-5');
});

afterAll(() => server.close());

describe('Export endpoints', () => {
  it('GET /api/export/analytics?format=json returns JSON array', async () => {
    const res = await fetch(`http://localhost:${port}/api/export/analytics?format=json`);
    expect(res.headers.get('content-type')).toContain('json');
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/export/analytics?format=csv returns CSV', async () => {
    const res = await fetch(`http://localhost:${port}/api/export/analytics?format=csv`);
    expect(res.headers.get('content-type')).toContain('csv');
    const text = await res.text();
    expect(text).toContain('session_id');
    expect(text).toContain('claude-sonnet-5-5');
  });

  it('CSV escapes dangerous content', async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO analytics (session_id, model, input_tokens, output_tokens, cost_usd, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('=CMD("calc")', 'claude-sonnet-5-5', 100, 50, 0.001, 500);

    const res = await fetch(`http://localhost:${port}/api/export/analytics?format=csv`);
    const text = await res.text();
    expect(text).toContain("'=CMD");
    expect(text).not.toMatch(/(?<!')=CMD/);
  });

  it('GET /api/export/chat?sessionId=X&format=json returns messages', async () => {
    const res = await fetch(`http://localhost:${port}/api/export/chat?sessionId=export-test&format=json`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0].role).toBe('user');
  });

  it('GET /api/export/chat?sessionId=X&format=md returns markdown', async () => {
    const res = await fetch(`http://localhost:${port}/api/export/chat?sessionId=export-test&format=md`);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const text = await res.text();
    expect(text).toContain('## User');
    expect(text).toContain('Hello there');
    expect(text).toContain('## Assistant');
  });
});
