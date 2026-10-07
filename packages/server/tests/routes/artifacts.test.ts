import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, getDb } from '../../src/db/connection.js';
import { createApp } from '../../src/index.js';
import { createServer, type Server } from 'node:http';

let server: Server;
let port: number;
let createdId: number;

beforeAll(async () => {
  initDb(':memory:');
  const app = createApp();
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });

  getDb()
    .prepare(
      `INSERT INTO artifacts (session_id, url, title, description, icon, artifact_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'sess-1',
      'https://claude.ai/code/artifact/abc',
      'Test Artifact',
      'A test',
      'code',
      'html',
    );
});

afterAll(() => server.close());

describe('Artifact endpoints', () => {
  it('GET /api/artifacts lists artifacts', async () => {
    const res = await fetch(`http://localhost:${port}/api/artifacts`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].title).toBe('Test Artifact');
    createdId = body[0].id;
  });

  it('GET /api/artifacts/:id returns single artifact', async () => {
    const res = await fetch(
      `http://localhost:${port}/api/artifacts/${createdId}`,
    );
    const body = await res.json();
    expect(body.title).toBe('Test Artifact');
    expect(body.url).toBe('https://claude.ai/code/artifact/abc');
  });

  it('GET /api/artifacts/:id returns 404 for missing', async () => {
    const res = await fetch(
      `http://localhost:${port}/api/artifacts/99999`,
    );
    expect(res.status).toBe(404);
  });

  it('PUT /api/artifacts/:id updates tags and pinned', async () => {
    const res = await fetch(
      `http://localhost:${port}/api/artifacts/${createdId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['test', 'v1'], pinned: true }),
      },
    );
    const body = await res.json();
    expect(body.tags).toEqual(['test', 'v1']);
    expect(body.pinned).toBe(true);
  });

  it('PUT /api/artifacts/:id rejects non-array tags', async () => {
    const res = await fetch(
      `http://localhost:${port}/api/artifacts/${createdId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: 'not-an-array' }),
      },
    );
    expect(res.status).toBe(400);
  });

  it('PUT /api/artifacts/:id rejects non-string tag elements', async () => {
    const res = await fetch(
      `http://localhost:${port}/api/artifacts/${createdId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['valid', 123, null] }),
      },
    );
    expect(res.status).toBe(400);
  });

  it('GET /api/artifacts?tag=test filters by tag', async () => {
    const res = await fetch(
      `http://localhost:${port}/api/artifacts?tag=test`,
    );
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].tags).toContain('test');
  });

  it('DELETE /api/artifacts/:id removes artifact', async () => {
    const res = await fetch(
      `http://localhost:${port}/api/artifacts/${createdId}`,
      { method: 'DELETE' },
    );
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
