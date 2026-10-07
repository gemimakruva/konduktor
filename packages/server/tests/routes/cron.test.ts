import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, getDb } from '../../src/db/connection.js';
import { CronScheduler } from '../../src/cron/scheduler.js';
import { createApp } from '../../src/index.js';
import { createServer, type Server } from 'node:http';

let server: Server;
let port: number;
let createdId: number;

beforeAll(async () => {
  initDb(':memory:');
  const scheduler = new CronScheduler(getDb());
  const app = createApp({ scheduler });
  server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });
});

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

describe('Cron endpoints', () => {
  it('POST /api/cron creates a job', async () => {
    const res = await fetch(`http://localhost:${port}/api/cron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Job', schedule: '0 9 * * *', prompt: 'Say hello' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.name).toBe('Test Job');
    expect(body.id).toBeGreaterThan(0);
    createdId = body.id;
  });

  it('POST /api/cron rejects invalid cron expression', async () => {
    const res = await fetch(`http://localhost:${port}/api/cron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad', schedule: 'not a cron', prompt: 'hi' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('schedule');
  });

  it('GET /api/cron lists jobs', async () => {
    const res = await fetch(`http://localhost:${port}/api/cron`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/cron/:id/disable disables job', async () => {
    const res = await fetch(`http://localhost:${port}/api/cron/${createdId}/disable`, { method: 'POST' });
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('GET /api/cron/:id/executions returns array', async () => {
    const res = await fetch(`http://localhost:${port}/api/cron/${createdId}/executions`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('PUT /api/cron/:id rejects non-numeric agentId', async () => {
    const create = await fetch(`http://localhost:${port}/api/cron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'AgentId Test', schedule: '0 9 * * *', prompt: 'test' }),
    });
    const job = await create.json();
    const res = await fetch(`http://localhost:${port}/api/cron/${job.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'not-a-number' }),
    });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/cron/:id deletes job', async () => {
    const res = await fetch(`http://localhost:${port}/api/cron/${createdId}`, { method: 'DELETE' });
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
