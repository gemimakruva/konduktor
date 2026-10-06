import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => '[]'),
  execFileSync: vi.fn(() => '[]'),
}));

describe('SessionManager command injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stop() uses execFileSync with separate args (no shell interpolation)', async () => {
    const { SessionManager } = await import('../../src/claude/sessions.js');
    const mgr = new SessionManager();
    mgr.stop('; rm -rf / #');

    expect(execFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['stop', '; rm -rf / #']),
      expect.any(Object),
    );
  });

  it('remove() uses execFileSync with separate args (no shell interpolation)', async () => {
    const { SessionManager } = await import('../../src/claude/sessions.js');
    const mgr = new SessionManager();
    mgr.remove('" && echo pwned "');

    expect(execFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['rm', '" && echo pwned "']),
      expect.any(Object),
    );
  });
});
