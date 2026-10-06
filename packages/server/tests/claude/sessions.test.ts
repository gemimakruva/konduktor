import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { SessionManager } from '../../src/claude/sessions.js';

describe('SessionManager', () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    vi.clearAllMocks();
  });

  it('parses agent list JSON', () => {
    const mockOutput = JSON.stringify([
      { pid: 123, cwd: '/tmp', kind: 'interactive', startedAt: 1000, sessionId: 'abc', name: 'test', status: 'busy' }
    ]);
    vi.mocked(execSync).mockReturnValue(Buffer.from(mockOutput));
    const sessions = mgr.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('test');
    expect(sessions[0].status).toBe('busy');
  });

  it('returns empty array when CLI returns empty', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('[]'));
    expect(mgr.list()).toEqual([]);
  });

  it('returns empty array when CLI errors', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('CLI not found'); });
    expect(mgr.list()).toEqual([]);
  });
});
