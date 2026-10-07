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

  await fetch(`http://localhost:${port}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lanAccess: true, pinCode: '1234' }),
  });
});

afterAll(async () => {
  await fetch(`http://localhost:${port}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Pin-Code': '1234' },
    body: JSON.stringify({ lanAccess: false, pinCode: '' }),
  });
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe('PIN code authentication', () => {
  it('allows localhost requests without PIN', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);
  });

  it('rejects LAN requests without PIN header', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'X-Forwarded-For': '192.168.1.100' },
    });
    expect(res.status).toBe(401);
  });

  it('allows LAN requests with correct PIN', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'X-Forwarded-For': '192.168.1.100', 'X-Pin-Code': '1234' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects LAN requests with wrong PIN', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'X-Forwarded-For': '192.168.1.100', 'X-Pin-Code': '9999' },
    });
    expect(res.status).toBe(401);
  });
});
