import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import express from 'express';
import { createSecretsRouter } from '../../src/routes/secrets.js';
import { SecretsManager } from '../../src/secrets/secrets-manager.js';

let server: Server;
let port: number;
let tempDir: string;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'konduktor-secrets-route-'));
  const mgr = new SecretsManager(
    join(tempDir, 'secrets.json'),
    join(tempDir, '.keyfile'),
  );
  const app = express();
  app.use(express.json());
  app.use('/api/secrets', createSecretsRouter(mgr));
  server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
  rmSync(tempDir, { recursive: true, force: true });
});

const url = (path: string) => `http://127.0.0.1:${port}${path}`;

describe('Secrets API', () => {
  it('POST /api/secrets stores a secret', async () => {
    const res = await fetch(url('/api/secrets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'TEST_KEY', value: 'test-value', scope: 'global' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('TEST_KEY');
    expect(body.scope).toBe('global');
    expect(body.value).toBeUndefined();
  });

  it('POST /api/secrets rejects invalid name', async () => {
    const res = await fetch(url('/api/secrets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad-name', value: 'val', scope: 'global' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/secrets rejects missing fields', async () => {
    const res = await fetch(url('/api/secrets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'NO_VALUE' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/secrets lists secrets without values', async () => {
    const res = await fetch(url('/api/secrets'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0]).not.toHaveProperty('value');
    expect(body[0]).not.toHaveProperty('encrypted');
  });

  it('DELETE /api/secrets/:name removes a secret', async () => {
    await fetch(url('/api/secrets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'DEL_ME', value: 'val', scope: 'global' }),
    });
    const res = await fetch(url('/api/secrets/DEL_ME'), { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('DELETE /api/secrets/:name returns 404 for nonexistent', async () => {
    const res = await fetch(url('/api/secrets/NONEXISTENT'), { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
