import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SecretMeta } from '@konduktor/shared';
import { loadOrCreateMasterKey, deriveKey, encrypt, decrypt } from './crypto.js';

interface StoredSecret {
  name: string;
  scope: string;
  encrypted: string;
  iv: string;
  tag: string;
  createdAt: number;
}

const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export class SecretsManager {
  private secretsPath: string;
  private keyfilePath: string;

  constructor(secretsPath: string, keyfilePath: string) {
    this.secretsPath = secretsPath;
    this.keyfilePath = keyfilePath;
  }

  store(name: string, value: string, scope: string): SecretMeta {
    if (!NAME_PATTERN.test(name)) {
      throw new Error(`Invalid secret name: must match ${NAME_PATTERN}`);
    }
    const key = this.getEncryptionKey();
    const ev = encrypt(value, key);
    const secrets = this.load();
    const idx = secrets.findIndex(s => s.name === name);
    const entry: StoredSecret = {
      name, scope, encrypted: ev.encrypted, iv: ev.iv, tag: ev.tag,
      createdAt: idx >= 0 ? secrets[idx].createdAt : Date.now(),
    };
    if (idx >= 0) { secrets[idx] = entry; } else { secrets.push(entry); }
    this.save(secrets);
    return { name, scope, createdAt: entry.createdAt };
  }

  list(): SecretMeta[] {
    return this.load().map(s => ({ name: s.name, scope: s.scope, createdAt: s.createdAt }));
  }

  get(name: string): string | undefined {
    const secrets = this.load();
    const entry = secrets.find(s => s.name === name);
    if (!entry) return undefined;
    try {
      const key = this.getEncryptionKey();
      return decrypt({ encrypted: entry.encrypted, iv: entry.iv, tag: entry.tag }, key);
    } catch {
      return undefined;
    }
  }

  delete(name: string): boolean {
    const secrets = this.load();
    const idx = secrets.findIndex(s => s.name === name);
    if (idx < 0) return false;
    secrets.splice(idx, 1);
    this.save(secrets);
    return true;
  }

  getForScope(agentId?: number): Record<string, string> {
    const secrets = this.load();
    let key: Buffer;
    try {
      key = this.getEncryptionKey();
    } catch {
      return {};
    }
    const result: Record<string, string> = {};
    for (const s of secrets) {
      const matches = s.scope === 'global' || (agentId !== undefined && s.scope === `agent:${agentId}`);
      if (matches) {
        try {
          result[s.name] = decrypt({ encrypted: s.encrypted, iv: s.iv, tag: s.tag }, key);
        } catch { /* skip undecryptable entry */ }
      }
    }
    return result;
  }

  private getEncryptionKey(): Buffer {
    return deriveKey(loadOrCreateMasterKey(this.keyfilePath), 'secrets-encryption');
  }

  private load(): StoredSecret[] {
    try {
      return JSON.parse(readFileSync(this.secretsPath, 'utf-8'));
    } catch {
      return [];
    }
  }

  private save(secrets: StoredSecret[]): void {
    const dir = dirname(this.secretsPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.secretsPath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    chmodSync(this.secretsPath, 0o600);
  }
}
