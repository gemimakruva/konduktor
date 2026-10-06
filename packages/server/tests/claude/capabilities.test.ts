import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { CapabilitiesManager } from '../../src/claude/capabilities.js';

describe('CapabilitiesManager', () => {
  let mgr: CapabilitiesManager;

  beforeEach(() => {
    mgr = new CapabilitiesManager();
    vi.clearAllMocks();
  });

  it('listPlugins parses JSON output', () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(JSON.stringify([
      { id: 'test-plugin@marketplace', version: '1.0.0', scope: 'user', enabled: true },
    ])));
    const plugins = mgr.listPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe('test-plugin@marketplace');
  });

  it('installPlugin calls CLI with correct args', () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(''));
    mgr.installPlugin('test-plugin@marketplace');
    expect(execFileSync).toHaveBeenCalledWith(
      expect.any(String),
      ['plugin', 'install', 'test-plugin@marketplace'],
      expect.objectContaining({ timeout: 120_000 }),
    );
  });

  it('addMcp calls CLI with correct args', () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(''));
    mgr.addMcp('my-server', 'npx', ['-y', 'my-mcp-server']);
    expect(execFileSync).toHaveBeenCalledWith(
      expect.any(String),
      ['mcp', 'add', 'my-server', '--', 'npx', '-y', 'my-mcp-server'],
      expect.any(Object),
    );
  });

  it('removeMcp calls CLI with correct args', () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(''));
    mgr.removeMcp('my-server');
    expect(execFileSync).toHaveBeenCalledWith(
      expect.any(String),
      ['mcp', 'remove', 'my-server'],
      expect.any(Object),
    );
  });

  it('handles CLI timeout gracefully', () => {
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error('ETIMEDOUT'); });
    expect(() => mgr.listPlugins()).not.toThrow();
  });
});
