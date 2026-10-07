import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/index.js';
import { createServer, type Server } from 'node:http';
import { initDb, getDb } from '../../src/db/connection.js';

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
  ).run('test-sess', 'claude-sonnet-5-5', 1000, 500, 0.015, 3200);
});

afterAll(() => server.close());

describe('Analytics endpoints', () => {
  it('GET /api/analytics/summary returns aggregated data', async () => {
    const res = await fetch(`http://localhost:${port}/api/analytics/summary`);
    const body = await res.json();
    expect(body.totalInputTokens).toBeGreaterThanOrEqual(1000);
    expect(body.totalCost).toBeGreaterThan(0);
    expect(body.totalSessions).toBeGreaterThanOrEqual(1);
    expect(typeof body.avgCostPerSession).toBe('number');
  });

  it('GET /api/analytics/summary with period returns filtered data', async () => {
    const res = await fetch(`http://localhost:${port}/api/analytics/summary?period=7d`);
    const body = await res.json();
    expect(typeof body.totalInputTokens).toBe('number');
  });

  it('GET /api/analytics/summary returns valid structure for any period', async () => {
    const res = await fetch(`http://localhost:${port}/api/analytics/summary?period=1d`);
    const body = await res.json();
    expect(typeof body.totalInputTokens).toBe('number');
    expect(typeof body.totalCost).toBe('number');
    expect(typeof body.avgCostPerSession).toBe('number');
    expect(body.avgCostPerSession).not.toBeNaN();
  });

  it('GET /api/analytics/daily returns date-keyed array', async () => {
    const res = await fetch(`http://localhost:${port}/api/analytics/daily`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(body[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('GET /api/analytics/models returns model breakdown', async () => {
    const res = await fetch(`http://localhost:${port}/api/analytics/models`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(body[0].model).toBeDefined();
      expect(body[0].count).toBeGreaterThan(0);
    }
  });

  it('GET /api/analytics/recent returns limited records', async () => {
    const res = await fetch(`http://localhost:${port}/api/analytics/recent?limit=5`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
  });
});
