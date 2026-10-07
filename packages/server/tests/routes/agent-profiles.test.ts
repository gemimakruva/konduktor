import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createApp } from '../../src/index.js';
import { createServer, type Server } from 'node:http';
import { initDb } from '../../src/db/connection.js';

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
});

afterAll(() => server.close());

const url = (path: string) => `http://127.0.0.1:${port}${path}`;

describe('Agent Profiles API', () => {
  it('POST /api/profiles creates a profile', async () => {
    const res = await fetch(url('/api/profiles'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Agent', skills: ['testing'] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Test Agent');
    expect(body.skills).toEqual(['testing']);
    expect(body.id).toBeDefined();
  });

  it('POST /api/profiles rejects without name', async () => {
    const res = await fetch(url('/api/profiles'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills: ['x'] }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/profiles lists all', async () => {
    const res = await fetch(url('/api/profiles'));
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/profiles/:id returns one', async () => {
    const created = await fetch(url('/api/profiles'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'FindMe' }),
    }).then(r => r.json());
    const res = await fetch(url(`/api/profiles/${created.id}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('FindMe');
  });

  it('GET /api/profiles/:id returns 404 for missing', async () => {
    const res = await fetch(url('/api/profiles/99999'));
    expect(res.status).toBe(404);
  });

  it('PUT /api/profiles/:id updates', async () => {
    const created = await fetch(url('/api/profiles'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Old' }),
    }).then(r => r.json());
    const res = await fetch(url(`/api/profiles/${created.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New', model: 'claude-opus-4-6' }),
    });
    const body = await res.json();
    expect(body.name).toBe('New');
    expect(body.model).toBe('claude-opus-4-6');
  });

  it('DELETE /api/profiles/:id removes', async () => {
    const created = await fetch(url('/api/profiles'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Del' }),
    }).then(r => r.json());
    await fetch(url(`/api/profiles/${created.id}`), { method: 'DELETE' });
    const check = await fetch(url(`/api/profiles/${created.id}`));
    expect(check.status).toBe(404);
  });
});
