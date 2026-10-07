import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  generateMasterKey, deriveKey, encrypt, decrypt, loadOrCreateMasterKey,
} from '../../src/secrets/crypto.js';

describe('secrets crypto', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates a 32-byte master key', () => {
    const key = generateMasterKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('derives deterministic keys from master key + purpose', () => {
    const master = generateMasterKey();
    const k1 = deriveKey(master, 'encryption');
    const k2 = deriveKey(master, 'encryption');
    const k3 = deriveKey(master, 'other');
    expect(k1.equals(k2)).toBe(true);
    expect(k1.equals(k3)).toBe(false);
  });

  it('encrypts and decrypts a value', () => {
    const key = deriveKey(generateMasterKey(), 'encryption');
    const original = 'sk-my-api-key-12345';
    const encrypted = encrypt(original, key);
    expect(encrypted.encrypted).not.toBe(original);
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(original);
  });

  it('decrypt fails with wrong key', () => {
    const key1 = deriveKey(generateMasterKey(), 'encryption');
    const key2 = deriveKey(generateMasterKey(), 'encryption');
    const encrypted = encrypt('secret', key1);
    expect(() => decrypt(encrypted, key2)).toThrow();
  });

  it('loads or creates master key from file', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'konduktor-test-'));
    const keyPath = join(tempDir, '.keyfile');
    const key1 = loadOrCreateMasterKey(keyPath);
    expect(key1.length).toBe(32);
    const key2 = loadOrCreateMasterKey(keyPath);
    expect(key1.equals(key2)).toBe(true);
  });
});
