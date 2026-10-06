import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/claude/sessions.js', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    list: vi.fn().mockReturnValue([
      { pid: 1, cwd: '/tmp', kind: 'interactive', startedAt: 1000, sessionId: 'abc', name: 'test', status: 'busy' }
    ]),
    stop: vi.fn().mockReturnValue(true),
    remove: vi.fn().mockReturnValue(true),
  })),
}));

vi.mock('../../src/claude/detect.js', () => ({
  detectClaude: vi.fn().mockReturnValue({ installed: true, version: '1.0.0', authenticated: true }),
}));

import { createApp } from '../../src/index.js';

describe('API routes', () => {
  const app = createApp();

  it('GET /api/health returns ok', async () => {
    const server = app.listen(0);
    const addr = server.address() as { port: number };
    const res = await fetch(`http://localhost:${addr.port}/api/health`);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.version).toBe('0.1.0');
    server.close();
  });

  it('GET /api/sessions returns array', async () => {
    const server = app.listen(0);
    const addr = server.address() as { port: number };
    const res = await fetch(`http://localhost:${addr.port}/api/sessions`);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].sessionId).toBe('abc');
    server.close();
  });

  it('GET /api/settings returns valid settings', async () => {
    const server = app.listen(0);
    const addr = server.address() as { port: number };
    const res = await fetch(`http://localhost:${addr.port}/api/settings`);
    const data = await res.json();
    expect(data.port).toBe(4170);
    expect(['light', 'dark', 'system']).toContain(data.theme);
    expect(data.maxConcurrentSessions).toBeGreaterThanOrEqual(1);
    server.close();
  });
});
