import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

export interface EncryptedValue {
  encrypted: string;
  iv: string;
  tag: string;
}

export function generateMasterKey(): Buffer {
  return randomBytes(32);
}

export function deriveKey(masterKey: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha512', masterKey, '', purpose, 32));
}

export function encrypt(value: string, key: Buffer): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decrypt(data: EncryptedValue, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
  return decipher.update(data.encrypted, 'base64', 'utf8') + decipher.final('utf8');
}

export function loadOrCreateMasterKey(keyfilePath: string): Buffer {
  if (existsSync(keyfilePath)) {
    return readFileSync(keyfilePath);
  }
  const dir = dirname(keyfilePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const key = generateMasterKey();
  writeFileSync(keyfilePath, key, { mode: 0o600 });
  chmodSync(keyfilePath, 0o600);
  return key;
}
