import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createApp } from '../src/index.js';
import { createServer, type Server } from 'node:http';

let server: Server;
let port: number;

beforeAll(async () => {
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

describe('API integration', () => {
  it('GET /api/health returns ok', async () => {
    const res = await fetch(`http://localhost:${port}/api/health`);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /api/sessions returns array', async () => {
    const res = await fetch(`http://localhost:${port}/api/sessions`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/settings returns defaults', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings`);
    const body = await res.json();
    expect(body.theme).toBeDefined();
    expect(body.port).toBeDefined();
  });

  it('PUT /api/settings persists changes', async () => {
    const before = await fetch(`http://localhost:${port}/api/settings`);
    const original = await before.json();

    await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'dark' }),
    });
    const res = await fetch(`http://localhost:${port}/api/settings`);
    const body = await res.json();
    expect(body.theme).toBe('dark');

    await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(original),
    });
  });
});
