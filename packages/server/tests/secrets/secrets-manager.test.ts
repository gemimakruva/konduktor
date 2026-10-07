import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { SecretsManager } from '../../src/secrets/secrets-manager.js';

describe('SecretsManager', () => {
  let tempDir: string;
  let mgr: SecretsManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'konduktor-secrets-'));
    mgr = new SecretsManager(
      join(tempDir, 'secrets.json'),
      join(tempDir, '.keyfile'),
    );
  });

  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('stores and retrieves a secret', () => {
    mgr.store('MY_API_KEY', 'sk-12345', 'global');
    expect(mgr.get('MY_API_KEY')).toBe('sk-12345');
  });

  it('lists secrets without values', () => {
    mgr.store('KEY_A', 'val-a', 'global');
    mgr.store('KEY_B', 'val-b', 'agent:1');
    const list = mgr.list();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('KEY_A');
    expect(list[0].scope).toBe('global');
    expect((list[0] as Record<string, unknown>).value).toBeUndefined();
  });

  it('deletes a secret', () => {
    mgr.store('TO_DELETE', 'val', 'global');
    expect(mgr.delete('TO_DELETE')).toBe(true);
    expect(mgr.get('TO_DELETE')).toBeUndefined();
    expect(mgr.delete('NONEXISTENT')).toBe(false);
  });

  it('overwrites existing secret with same name', () => {
    mgr.store('ROTATE_ME', 'old-value', 'global');
    mgr.store('ROTATE_ME', 'new-value', 'global');
    expect(mgr.get('ROTATE_ME')).toBe('new-value');
    expect(mgr.list()).toHaveLength(1);
  });

  it('returns scoped secrets for env injection', () => {
    mgr.store('GLOBAL_KEY', 'g-val', 'global');
    mgr.store('AGENT_KEY', 'a-val', 'agent:5');
    mgr.store('OTHER_AGENT', 'o-val', 'agent:9');
    const envGlobal = mgr.getForScope();
    expect(envGlobal).toEqual({ GLOBAL_KEY: 'g-val' });
    const envAgent5 = mgr.getForScope(5);
    expect(envAgent5).toEqual({ GLOBAL_KEY: 'g-val', AGENT_KEY: 'a-val' });
  });

  it('stores secret with arbitrary agent scope', () => {
    mgr.store('ORPHAN_KEY', 'val', 'agent:999');
    expect(mgr.get('ORPHAN_KEY')).toBe('val');
    expect(mgr.list()[0].scope).toBe('agent:999');
  });

  it('returns empty list when no secrets file exists', () => {
    const freshMgr = new SecretsManager(
      join(tempDir, 'nonexistent-secrets.json'),
      join(tempDir, '.keyfile'),
    );
    expect(freshMgr.list()).toHaveLength(0);
  });

  it('validates secret name format', () => {
    expect(() => mgr.store('invalid-name', 'val', 'global')).toThrow();
    expect(() => mgr.store('123START', 'val', 'global')).toThrow();
    expect(() => mgr.store('VALID_NAME_1', 'val', 'global')).not.toThrow();
  });

  it('sets 0600 permissions on created files', () => {
    mgr.store('PERM_TEST', 'val', 'global');
    if (process.platform !== 'win32') {
      const secretsStat = statSync(join(tempDir, 'secrets.json'));
      expect(secretsStat.mode & 0o777).toBe(0o600);
    }
  });
});
