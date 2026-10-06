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

describe('System info', () => {
  it('GET /api/system returns system info', async () => {
    const res = await fetch(`http://localhost:${port}/api/system`);
    const body = await res.json();
    expect(body.node).toBeDefined();
    expect(body.platform).toBeDefined();
    expect(body.memory).toBeDefined();
    expect(body.memory.totalMb).toBeGreaterThan(0);
  });
});
