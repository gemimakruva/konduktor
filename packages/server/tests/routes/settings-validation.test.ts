import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createApp } from '../../src/index.js';
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

describe('Settings validation', () => {
  it('rejects maxConcurrentSessions beyond LIMITS', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxConcurrentSessions: 999 }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid theme value', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'malicious' }),
    });
    expect(res.status).toBe(400);
  });

  it('strips unknown keys', async () => {
    const before = await fetch(`http://localhost:${port}/api/settings`);
    const original = await before.json();

    await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...original, injectedKey: 'evil' }),
    });
    const res = await fetch(`http://localhost:${port}/api/settings`);
    const body = await res.json();
    expect(body.injectedKey).toBeUndefined();

    await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(original),
    });
  });
});
