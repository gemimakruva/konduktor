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

describe('Logs endpoint', () => {
  it('GET /api/logs returns array', async () => {
    const res = await fetch(`http://localhost:${port}/api/logs`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
