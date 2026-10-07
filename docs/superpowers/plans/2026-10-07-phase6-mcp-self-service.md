# Phase 6: Chat Auto-Configuration (MCP Self-Service) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users describe what they want in natural language, and Konduktor configures itself — cron jobs, agents, secrets, integrations — via MCP tools exposed to Claude Code.

**Architecture:** A thin stdio MCP server process (`konduktor mcp-serve`) proxies tool calls to the running Konduktor HTTP server. 8 MCP tools cover cron, secrets, agents, kanban, and MCP management. Secrets are AES-256-GCM encrypted per-value with a HKDF-derived key from a random master key. Cron jobs gain optional agent profile assignment.

**Tech Stack:** Express 5, TypeScript 5.5, better-sqlite3, @modelcontextprotocol/sdk, commander, Node.js crypto (built-in), React 19, Vite, Vitest

**Spec:** `docs/roadmap.md` (Phase 6 section), grilling shared understanding (24 decisions)

## Global Constraints

- All files < 300 lines
- TypeScript strict mode
- No secrets in source — credentials at `~/.konduktor/secrets.json`
- Repository pattern for DB, `RouterType` for routes
- Inline styles with CSS custom properties for client
- Express 5 path-to-regexp v8 (`{*path}` catch-all)
- Secret names: `^[A-Z][A-Z0-9_]*$`
- File permissions: `0600` on `.keyfile` and `secrets.json`

## File Structure

```
packages/shared/src/
  types.ts                    (modify: add SecretMeta, agentId to CronJob)
  constants.ts                (modify: add PATHS.secretsFile, PATHS.keyFile)

packages/server/src/
  secrets/
    crypto.ts                 (create: HKDF key derivation + AES-256-GCM)
    secrets-manager.ts        (create: CRUD on secrets.json, scoped lookup)
  routes/
    secrets.ts                (create: GET /, POST /, DELETE /:name)
  db/
    schema.ts                 (modify: migration for agent_id on cron_jobs)
    cron-repository.ts        (modify: agentId in create/update/mapJob)
  cron/
    scheduler.ts              (modify: use profile args + inject secrets)
  claude/
    cli.ts                    (modify: accept env option in start())
  index.ts                    (modify: mount secrets router)

packages/server/tests/
  secrets/
    crypto.test.ts            (create)
    secrets-manager.test.ts   (create)
  routes/
    secrets.test.ts           (create)
  cron/
    scheduler-agent.test.ts   (create)

packages/cli/
  package.json                (modify: add commander, @modelcontextprotocol/sdk)
  src/
    index.ts                  (modify: rewrite with commander)
    commands/
      mcp-serve.ts            (create: stdio MCP server)
      setup-mcp.ts            (create: register with claude mcp add)
    mcp/
      tools.ts                (create: 8 tool definitions + handlers)

packages/client/src/components/settings/
  SecretsSection.tsx          (create: secrets table + add/revoke UI)
  SettingsPage.tsx            (modify: import + render SecretsSection)
```

## Review Focus

1. **Duplicate secret name:** `store_secret` with an existing name should upsert (overwrite), not crash or create a duplicate. → Test added to Task 2 (secrets-manager.test.ts: `overwrites existing secret with same name`).
2. **Keyfile deleted after secrets stored:** All decrypt operations fail. SecretsManager must not crash — it should return an empty list or throw a clear error. → Test added to Task 2 (secrets-manager.test.ts: `returns empty list when keyfile is missing`).
3. **MCP proxy when server is unreachable:** `fetch` to localhost:4170 throws ECONNREFUSED. The proxy must return a structured MCP error, not crash. → Test added to Task 7 (manual verification in step).
4. **Cron job with deleted agent profile:** `agent_id` references a profile that no longer exists. Scheduler must fall back to bare prompt execution. → Test added to Task 5 (scheduler-agent.test.ts: `falls back when agent profile is deleted`).
5. **Secret scope references nonexistent agent:** `store_secret` with `scope: "agent:999"` should succeed — scope is a filter key, not a FK. → Test added to Task 2 (secrets-manager.test.ts: `stores secret with arbitrary agent scope`).

---

### Task 1: Secrets Crypto Module + Shared Types

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/constants.ts`
- Create: `packages/server/src/secrets/crypto.ts`
- Create: `packages/server/tests/secrets/crypto.test.ts`

**Interfaces:**
- Consumes: Node.js built-in `crypto` module
- Produces:
  - `SecretMeta` type (used by Tasks 2, 3, 7, 8)
  - `CronJob.agentId` field (used by Tasks 4, 5)
  - `generateMasterKey(): Buffer` (used by Task 2)
  - `deriveKey(masterKey: Buffer, purpose: string): Buffer` (used by Task 2)
  - `encrypt(value: string, key: Buffer): EncryptedValue` (used by Task 2)
  - `decrypt(data: EncryptedValue, key: Buffer): string` (used by Task 2)
  - `loadOrCreateMasterKey(keyfilePath: string): Buffer` (used by Task 2)

- [ ] **Step 1: Add SecretMeta type and CronJob.agentId to shared types**

In `packages/shared/src/types.ts`, add after the `CronExecution` interface:

```typescript
export interface SecretMeta {
  name: string;
  scope: string;
  createdAt: number;
}
```

And modify the `CronJob` interface — add `agentId: number | null;` after `model`:

```typescript
export interface CronJob {
  id: number;
  name: string;
  schedule: string;
  prompt: string;
  cwd: string | null;
  model: string | null;
  agentId: number | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Add secrets paths to shared constants**

In `packages/shared/src/constants.ts`, add to the `PATHS` object:

```typescript
export const PATHS = {
  configDir: '.konduktor',
  settingsFile: 'settings.json',
  dbFile: 'konduktor.db',
  secretsFile: 'secrets.json',
  keyFile: '.keyfile',
} as const;
```

- [ ] **Step 3: Write the failing crypto tests**

Create `packages/server/tests/secrets/crypto.test.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run tests/secrets/crypto.test.ts`
Expected: FAIL — module `../../src/secrets/crypto.js` not found

- [ ] **Step 5: Implement the crypto module**

Create `packages/server/src/secrets/crypto.ts`:

```typescript
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run tests/secrets/crypto.test.ts`
Expected: PASS — all 5 tests

- [ ] **Step 7: Run full suite**

Run: `pnpm test`
Expected: All pass (type changes to CronJob may cause failures in cron tests — fix in Task 4)

Note: The `CronJob.agentId` field addition may cause TypeScript errors in `cron-repository.ts` (`mapJob` doesn't return `agentId`). This is expected — Task 4 fixes it. If the full suite fails here due to type errors, add `agentId: null` to `mapJob` in `cron-repository.ts` as a minimal fix to unblock.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/constants.ts \
  packages/server/src/secrets/crypto.ts packages/server/tests/secrets/crypto.test.ts
git commit -m "feat(phase6): secrets crypto module + shared types"
```

---

### Task 2: Secrets Manager

**Files:**
- Create: `packages/server/src/secrets/secrets-manager.ts`
- Create: `packages/server/tests/secrets/secrets-manager.test.ts`

**Interfaces:**
- Consumes: `generateMasterKey`, `deriveKey`, `encrypt`, `decrypt`, `loadOrCreateMasterKey` from `../secrets/crypto.js`; `EncryptedValue` type; `SecretMeta` from `@konduktor/shared`
- Produces:
  - `SecretsManager` class with `store(name, value, scope): SecretMeta`, `list(): SecretMeta[]`, `get(name): string | undefined`, `delete(name): boolean`, `getForScope(agentId?: number): Record<string, string>` (used by Tasks 3, 5, 7)

- [ ] **Step 1: Write the failing tests**

Create `packages/server/tests/secrets/secrets-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
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

  it('returns empty list when keyfile is missing', () => {
    mgr.store('KEY', 'val', 'global');
    rmSync(join(tempDir, '.keyfile'));
    const freshMgr = new SecretsManager(
      join(tempDir, 'secrets.json'),
      join(tempDir, '.keyfile-gone'),
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
      const { statSync } = await import('node:fs');
      const secretsStat = statSync(join(tempDir, 'secrets.json'));
      expect(secretsStat.mode & 0o777).toBe(0o600);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run tests/secrets/secrets-manager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the SecretsManager**

Create `packages/server/src/secrets/secrets-manager.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SecretMeta } from '@konduktor/shared';
import { loadOrCreateMasterKey, deriveKey, encrypt, decrypt, type EncryptedValue } from './crypto.js';

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
    const key = this.getEncryptionKey();
    return decrypt({ encrypted: entry.encrypted, iv: entry.iv, tag: entry.tag }, key);
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
    const key = this.getEncryptionKey();
    const result: Record<string, string> = {};
    for (const s of secrets) {
      const matches = s.scope === 'global' || (agentId !== undefined && s.scope === `agent:${agentId}`);
      if (matches) {
        result[s.name] = decrypt({ encrypted: s.encrypted, iv: s.iv, tag: s.tag }, key);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run tests/secrets/secrets-manager.test.ts`
Expected: PASS — all 9 tests

- [ ] **Step 5: Run full suite**

Run: `pnpm test`
Expected: All pass (or type error on CronJob.agentId — see Task 1 Step 7 note)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/secrets/secrets-manager.ts packages/server/tests/secrets/secrets-manager.test.ts
git commit -m "feat(phase6): secrets manager — CRUD, scoped lookup, file encryption"
```

---

### Task 3: Secrets REST API

**Files:**
- Create: `packages/server/src/routes/secrets.ts`
- Modify: `packages/server/src/index.ts:22,47` (add import + mount)
- Create: `packages/server/tests/routes/secrets.test.ts`

**Interfaces:**
- Consumes: `SecretsManager` class from `../secrets/secrets-manager.js`; `CONFIG` from `../config.js`; `PATHS` from `@konduktor/shared`
- Produces:
  - `GET /api/secrets` → `SecretMeta[]` (used by Tasks 7, 8)
  - `POST /api/secrets` → `SecretMeta` (used by Tasks 7, 8)
  - `DELETE /api/secrets/:name` → `{ success: boolean }` (used by Tasks 7, 8)
  - `secretsRouter` export (used by server index.ts)

- [ ] **Step 1: Write the failing route tests**

Create `packages/server/tests/routes/secrets.test.ts`:

```typescript
import { describe, it, expect, afterAll, beforeAll, afterEach } from 'vitest';
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run tests/routes/secrets.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the secrets router**

Create `packages/server/src/routes/secrets.ts`:

```typescript
import { Router, type Router as RouterType } from 'express';
import type { SecretsManager } from '../secrets/secrets-manager.js';

export function createSecretsRouter(secrets: SecretsManager): RouterType {
  const router: RouterType = Router();

  router.get('/', (_req, res) => {
    res.json(secrets.list());
  });

  router.post('/', (req, res) => {
    const { name, value, scope } = req.body;
    if (!name || typeof name !== 'string' || !value || typeof value !== 'string') {
      res.status(400).json({ error: 'name and value required' });
      return;
    }
    try {
      const meta = secrets.store(name, value, scope || 'global');
      res.json(meta);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/:name', (req, res) => {
    const deleted = secrets.delete(req.params.name);
    if (!deleted) { res.status(404).json({ error: 'Secret not found' }); return; }
    res.json({ success: true });
  });

  return router;
}
```

- [ ] **Step 4: Mount the secrets router in the server**

In `packages/server/src/index.ts`, add import:

```typescript
import { createSecretsRouter } from './routes/secrets.js';
import { SecretsManager } from './secrets/secrets-manager.js';
```

In `createApp`, add parameter and route. Change the signature to accept an options object:

```typescript
export function createApp(opts?: { scheduler?: CronScheduler; secrets?: SecretsManager }): Express {
```

And add the route after the profiles router:

```typescript
if (opts?.secrets) {
  app.use('/api/secrets', createSecretsRouter(opts.secrets));
}
```

Update `startServer()` to create and pass the SecretsManager:

```typescript
export function startServer() {
  initDb(CONFIG.dbPath);
  const scheduler = new CronScheduler(getDb());
  scheduler.startAll();
  const secrets = new SecretsManager(
    join(CONFIG.configDir, PATHS.secretsFile),
    join(CONFIG.configDir, PATHS.keyFile),
  );

  const app = createApp({ scheduler, secrets });
```

Add the `join` import from `node:path` (already imported) and `PATHS` import from `@konduktor/shared`.

**Important:** The existing `createApp(scheduler)` calls in tests pass a `CronScheduler` directly. Update them to use the new signature: `createApp({ scheduler })` or just `createApp()` for tests that don't need the scheduler. The route test at `tests/routes/agent-profiles.test.ts` calls `createApp()` with no args — this still works since `opts` is optional.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run tests/routes/secrets.test.ts`
Expected: PASS — all 6 tests

- [ ] **Step 6: Run full suite**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/secrets.ts packages/server/tests/routes/secrets.test.ts \
  packages/server/src/index.ts
git commit -m "feat(phase6): secrets REST API — store, list, delete with encryption"
```

---

### Task 4: Cron-Agent Integration

**Files:**
- Modify: `packages/server/src/db/schema.ts` (add migration)
- Modify: `packages/server/src/db/cron-repository.ts:7-10,27-29,75-81` (agentId in create/update/mapJob)
- Modify: `packages/server/src/routes/cron.ts:15` (accept agentId in POST/PUT)
- Create: `packages/server/tests/cron/scheduler-agent.test.ts`

**Interfaces:**
- Consumes: `CronJob` type (now with `agentId: number | null`), `AgentRepository` from `../db/agent-repository.js`, `buildProfileArgs` from `../agents/profile-runner.js`
- Produces:
  - `cron_jobs.agent_id` column (used by Task 5)
  - `CronRepository.create()` accepts `agentId` (used by Task 7)
  - Updated `mapJob` returns `agentId` (used everywhere CronJob is read)

- [ ] **Step 1: Write the failing test for cron-agent linking**

Create `packages/server/tests/cron/scheduler-agent.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, getDb } from '../../src/db/connection.js';
import { CronRepository } from '../../src/db/cron-repository.js';
import { AgentRepository } from '../../src/db/agent-repository.js';

describe('Cron-Agent Integration', () => {
  let db: Database.Database;

  beforeEach(() => {
    initDb(':memory:');
    db = getDb();
  });

  afterEach(() => db.close());

  it('creates a cron job with agentId', () => {
    const agentRepo = new AgentRepository(db);
    const agent = agentRepo.create({ name: 'Cron Agent' });
    const cronRepo = new CronRepository(db);
    const job = cronRepo.create({
      name: 'Test Job', schedule: '* * * * *', prompt: 'do stuff', agentId: agent.id,
    });
    expect(job.agentId).toBe(agent.id);
  });

  it('creates a cron job without agentId', () => {
    const cronRepo = new CronRepository(db);
    const job = cronRepo.create({
      name: 'Plain Job', schedule: '* * * * *', prompt: 'do stuff',
    });
    expect(job.agentId).toBeNull();
  });

  it('updates agentId on existing job', () => {
    const agentRepo = new AgentRepository(db);
    const agent = agentRepo.create({ name: 'Updater' });
    const cronRepo = new CronRepository(db);
    const job = cronRepo.create({ name: 'Job', schedule: '* * * * *', prompt: 'x' });
    cronRepo.update(job.id, { agentId: agent.id });
    const updated = cronRepo.getById(job.id);
    expect(updated?.agentId).toBe(agent.id);
  });

  it('falls back when agent profile is deleted', () => {
    const agentRepo = new AgentRepository(db);
    const agent = agentRepo.create({ name: 'Doomed' });
    const cronRepo = new CronRepository(db);
    const job = cronRepo.create({
      name: 'Linked', schedule: '* * * * *', prompt: 'work', agentId: agent.id,
    });
    agentRepo.delete(agent.id);
    const profile = agentRepo.getById(job.agentId!);
    expect(profile).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run tests/cron/scheduler-agent.test.ts`
Expected: FAIL — `agentId` not accepted by `create()`, or column doesn't exist

- [ ] **Step 3: Add migration to schema**

In `packages/server/src/db/schema.ts`, add to the MIGRATIONS array:

```typescript
`ALTER TABLE cron_jobs ADD COLUMN agent_id INTEGER`,
```

- [ ] **Step 4: Update CronRepository**

In `packages/server/src/db/cron-repository.ts`:

Update `create` method signature and SQL:

```typescript
create(data: { name: string; schedule: string; prompt: string; cwd?: string; model?: string; agentId?: number }): CronJob {
  const result = this.db.prepare(
    `INSERT INTO cron_jobs (name, schedule, prompt, cwd, model, agent_id) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(data.name, data.schedule, data.prompt, data.cwd || null, data.model || null, data.agentId || null);
  return this.getById(result.lastInsertRowid as number)!;
}
```

Add `agent_id` to `ALLOWED_UPDATE_COLS`:

```typescript
private static ALLOWED_UPDATE_COLS = new Set(['name', 'schedule', 'prompt', 'cwd', 'model', 'agent_id']);
```

Add handling in `update` for `agentId` → `agent_id` mapping. Before the loop over `ALLOWED_UPDATE_COLS`, add:

```typescript
update(id: number, patch: Partial<{ name: string; schedule: string; prompt: string; cwd: string | null; model: string | null; agentId: number | null }>): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const mapped: Record<string, unknown> = { ...patch };
  if ('agentId' in patch) {
    mapped.agent_id = patch.agentId;
    delete mapped.agentId;
  }
  for (const [key, val] of Object.entries(mapped)) {
    if (val !== undefined && CronRepository.ALLOWED_UPDATE_COLS.has(key)) {
      sets.push(`${key} = ?`); vals.push(val);
    }
  }
  if (sets.length === 0) return;
  sets.push('updated_at = unixepoch()');
  vals.push(id);
  this.db.prepare(`UPDATE cron_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}
```

Update `mapJob` — add `agentId`:

```typescript
private mapJob(r: Record<string, unknown>): CronJob {
  return {
    id: r.id as number, name: r.name as string, schedule: r.schedule as string,
    prompt: r.prompt as string, cwd: r.cwd as string | null, model: r.model as string | null,
    agentId: (r.agent_id as number) || null,
    enabled: (r.enabled as number) === 1,
    createdAt: (r.created_at as number) * 1000, updatedAt: (r.updated_at as number) * 1000,
  };
}
```

- [ ] **Step 5: Update cron routes to accept agentId**

In `packages/server/src/routes/cron.ts`, update the POST handler:

```typescript
router.post('/', (req, res) => {
  const { name, schedule, prompt, cwd, model, agentId } = req.body;
  if (!name || !schedule || !prompt) {
    res.status(400).json({ error: 'name, schedule, and prompt required' }); return;
  }
  if (!CronScheduler.validate(schedule)) {
    res.status(400).json({ error: 'Invalid cron schedule expression' }); return;
  }
  const repo = new CronRepository(getDb());
  const job = repo.create({ name, schedule, prompt, cwd, model, agentId });
  scheduler.scheduleJob(job);
  res.json(job);
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run tests/cron/scheduler-agent.test.ts`
Expected: PASS — all 4 tests

- [ ] **Step 7: Run full suite**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/db/schema.ts packages/server/src/db/cron-repository.ts \
  packages/server/src/routes/cron.ts packages/server/tests/cron/scheduler-agent.test.ts
git commit -m "feat(phase6): cron-agent integration — link cron jobs to agent profiles"
```

---

### Task 5: Secrets Injection + Scheduler Profile Args

**Files:**
- Modify: `packages/server/src/claude/cli.ts:96,101-104` (add `env` option)
- Modify: `packages/server/src/cron/scheduler.ts:1-7,17-19,67-103` (inject secrets + profile args)
- Modify: `packages/server/src/index.ts` (pass secrets to scheduler)

**Interfaces:**
- Consumes: `SecretsManager.getForScope(agentId?)` from Task 2; `AgentRepository.getById(id)` from Phase 5; `buildProfileArgs(profile, prompt)` from Phase 5; `ClaudeProcess.start(prompt, opts)` — extended with `env`
- Produces:
  - `ClaudeProcess.start()` accepts `opts.env?: Record<string, string>` (general-purpose, used by scheduler and future WS handler)
  - `CronScheduler` constructor accepts `SecretsManager` (used by server startup)

- [ ] **Step 1: Add env option to ClaudeProcess.start()**

In `packages/server/src/claude/cli.ts`, modify the `start` method signature:

```typescript
start(prompt: string, opts: { cwd?: string; model?: string; resume?: string; env?: Record<string, string> }): void {
```

And update the `spawn` call:

```typescript
this.child = spawn(CONFIG.claudeBin, args, {
  cwd: opts.cwd || process.cwd(),
  env: { ...process.env, ...opts.env },
  stdio: ['pipe', 'pipe', 'pipe'],
});
```

- [ ] **Step 2: Update CronScheduler to accept SecretsManager and use profile args**

In `packages/server/src/cron/scheduler.ts`:

Add imports:

```typescript
import { AgentRepository } from '../db/agent-repository.js';
import { buildProfileArgs } from '../agents/profile-runner.js';
import type { SecretsManager } from '../secrets/secrets-manager.js';
```

Update constructor:

```typescript
private secrets?: SecretsManager;

constructor(db: Database.Database, secrets?: SecretsManager) {
  this.db = db;
  this.repo = new CronRepository(db);
  this.secrets = secrets;
}
```

Update `executeJob` to use profile args and inject secrets:

```typescript
private executeJob(job: CronJob): void {
  if (this.runningJobs.has(job.id)) return;
  this.runningJobs.add(job.id);

  const sessionId = `cron-${job.id}-${Date.now()}`;
  const execId = this.repo.createExecution(job.id, sessionId);
  const proc = new ClaudeProcess(sessionId);
  let output = '';

  // Build args from agent profile if linked
  let profile = job.agentId ? new AgentRepository(this.db).getById(job.agentId) : undefined;
  const startOpts: { cwd?: string; model?: string; env?: Record<string, string> } = {};

  if (profile) {
    startOpts.cwd = job.cwd || profile.defaultCwd || undefined;
    startOpts.model = job.model || profile.model;
  } else {
    startOpts.cwd = job.cwd || undefined;
    startOpts.model = job.model || undefined;
  }

  // Inject secrets
  if (this.secrets) {
    startOpts.env = this.secrets.getForScope(job.agentId || undefined);
  }

  proc.on('event', (event: { type: string; result?: string; usage?: Record<string, number>; durationMs?: number; model?: string }) => {
    if (event.type === 'result') {
      output = event.result || '';
      if (event.usage) {
        try {
          new AnalyticsRepository(this.db).record(
            sessionId, event.model || job.model || 'unknown',
            event.usage as never, event.durationMs || 0,
          );
        } catch { /* non-fatal */ }
      }
    }
  });

  proc.on('close', (code: number) => {
    const status = code === 0 ? 'completed' : 'failed';
    this.repo.finishExecution(execId, status, output);
    this.completionCallback?.({ jobName: job.name, status, executionId: execId });
    this.runningJobs.delete(job.id);
  });

  proc.on('error', () => {
    this.repo.finishExecution(execId, 'failed', output || 'Process error');
    this.completionCallback?.({ jobName: job.name, status: 'failed', executionId: execId });
    this.runningJobs.delete(job.id);
  });

  if (profile) {
    const args = buildProfileArgs(profile, job.prompt);
    // ClaudeProcess.start uses -p flag internally, but buildProfileArgs already includes it
    // Use the raw args approach — need to extend ClaudeProcess or call start with the profile prompt
    proc.start(job.prompt, startOpts);
  } else {
    proc.start(job.prompt, startOpts);
  }
}
```

Note: `buildProfileArgs` returns full CLI args including `-p prompt`. But `ClaudeProcess.start()` also adds `-p prompt`. To avoid duplication, the simplest approach is to pass the profile's system prompt, model, and cwd through `startOpts` rather than using `buildProfileArgs` for the full args array. The system prompt needs to be added to `ClaudeProcess.start` opts. However, this is getting complex. A simpler approach: just pass `model`, `cwd`, and `env` through opts, and let the `start()` method handle the rest. The system prompt from the profile can be a future enhancement (Phase 5 already handles it for WS-spawned agents). For cron jobs, the `prompt` field is the main instruction.

Simplified `executeJob` (drop buildProfileArgs, just use profile for model/cwd defaults):

```typescript
private executeJob(job: CronJob): void {
  if (this.runningJobs.has(job.id)) return;
  this.runningJobs.add(job.id);

  const sessionId = `cron-${job.id}-${Date.now()}`;
  const execId = this.repo.createExecution(job.id, sessionId);
  const proc = new ClaudeProcess(sessionId);
  let output = '';

  const profile = job.agentId ? new AgentRepository(this.db).getById(job.agentId) : undefined;
  const env = this.secrets?.getForScope(job.agentId || undefined);

  proc.on('event', (event: { type: string; result?: string; usage?: Record<string, number>; durationMs?: number; model?: string }) => {
    if (event.type === 'result') {
      output = event.result || '';
      if (event.usage) {
        try {
          new AnalyticsRepository(this.db).record(
            sessionId, event.model || job.model || 'unknown',
            event.usage as never, event.durationMs || 0,
          );
        } catch { /* non-fatal */ }
      }
    }
  });

  proc.on('close', (code: number) => {
    const status = code === 0 ? 'completed' : 'failed';
    this.repo.finishExecution(execId, status, output);
    this.completionCallback?.({ jobName: job.name, status, executionId: execId });
    this.runningJobs.delete(job.id);
  });

  proc.on('error', () => {
    this.repo.finishExecution(execId, 'failed', output || 'Process error');
    this.completionCallback?.({ jobName: job.name, status: 'failed', executionId: execId });
    this.runningJobs.delete(job.id);
  });

  proc.start(job.prompt, {
    cwd: job.cwd || profile?.defaultCwd || undefined,
    model: job.model || profile?.model || undefined,
    env,
  });
}
```

- [ ] **Step 3: Update startServer() to pass secrets to scheduler**

In `packages/server/src/index.ts`, update `startServer()`:

```typescript
const secrets = new SecretsManager(
  join(CONFIG.configDir, PATHS.secretsFile),
  join(CONFIG.configDir, PATHS.keyFile),
);
const scheduler = new CronScheduler(getDb(), secrets);
```

(The SecretsManager import and creation was already added in Task 3. Here just pass it to the scheduler.)

- [ ] **Step 4: Run full suite**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/claude/cli.ts packages/server/src/cron/scheduler.ts \
  packages/server/src/index.ts
git commit -m "feat(phase6): secrets injection — env vars into cron/agent processes"
```

---

### Task 6: CLI Commander Migration + setup-mcp

**Files:**
- Modify: `packages/cli/package.json` (add commander dependency)
- Modify: `packages/cli/src/index.ts` (rewrite with commander)
- Create: `packages/cli/src/commands/setup-mcp.ts`

**Interfaces:**
- Consumes: Existing commands (`start`, `stop`, `status`, `open`); `claude mcp list`, `claude mcp add` CLI commands
- Produces:
  - `konduktor setup-mcp` command (standalone, used by users)
  - `konduktor mcp-serve` command placeholder (wired up in Task 7)
  - Commander-based CLI with `--help` and `--version`

- [ ] **Step 1: Add commander dependency**

Run: `cd packages/cli && pnpm add commander`

- [ ] **Step 2: Rewrite CLI entry point with commander**

Rewrite `packages/cli/src/index.ts`:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { start } from './commands/start.js';
import { stop } from './commands/stop.js';
import { status } from './commands/status.js';
import { open } from './commands/open.js';
import { setupMcp } from './commands/setup-mcp.js';

const program = new Command();

program
  .name('konduktor')
  .description('Open-source orchestrator for Claude Code')
  .version('0.1.0');

program.command('start')
  .description('Start the Konduktor server')
  .option('-o, --open', 'Open in browser after starting')
  .action(start);

program.command('stop')
  .description('Stop the running server')
  .action(stop);

program.command('status')
  .description('Show server status')
  .action(status);

program.command('open')
  .description('Open Konduktor in browser')
  .action(open);

program.command('setup-mcp')
  .description('Register Konduktor as an MCP server for Claude Code')
  .action(setupMcp);

program.command('mcp-serve')
  .description('Run as MCP server (stdio transport, used by Claude Code)')
  .action(async () => {
    const { mcpServe } = await import('./commands/mcp-serve.js');
    await mcpServe();
  });

program.parse();
```

Note: The `start` command currently reads `process.argv` for `--open` flag. With commander, the flag is passed via `options`. Update `start.ts` to accept commander options:

In `packages/cli/src/commands/start.ts`, change the function signature:

```typescript
export async function start(opts: { open?: boolean } = {}) {
  const shouldOpen = opts.open || false;
```

Remove the line: `const shouldOpen = process.argv.includes('--open') || process.argv.includes('-o');`

- [ ] **Step 3: Create setup-mcp command**

Create `packages/cli/src/commands/setup-mcp.ts`:

```typescript
import { execSync } from 'node:child_process';

export async function setupMcp() {
  try {
    const existing = execSync('claude mcp list', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    if (existing.includes('konduktor')) {
      console.log('Konduktor MCP server already registered with Claude Code.');
      return;
    }
  } catch {
    console.error('Claude Code CLI not found. Install it first: npm install -g @anthropic-ai/claude-code');
    process.exit(1);
  }

  try {
    execSync('claude mcp add konduktor -- konduktor mcp-serve', {
      encoding: 'utf-8',
      stdio: 'inherit',
    });
    console.log('Konduktor registered as MCP server for Claude Code.');
    console.log('Claude Code will now have access to Konduktor tools.');
  } catch (err) {
    console.error('Failed to register MCP server:', (err as Error).message);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Build and verify CLI**

Run: `cd packages/cli && pnpm build`
Expected: Compiles without errors

Run: `node packages/cli/dist/index.js --help`
Expected: Shows commander help with all 6 commands

Run: `node packages/cli/dist/index.js start --help`
Expected: Shows `-o, --open` option

- [ ] **Step 5: Commit**

```bash
git add packages/cli/package.json packages/cli/src/index.ts \
  packages/cli/src/commands/start.ts packages/cli/src/commands/setup-mcp.ts
git commit -m "feat(phase6): CLI commander migration + setup-mcp command"
```

---

### Task 7: MCP Server + Tool Definitions

**Files:**
- Modify: `packages/cli/package.json` (add @modelcontextprotocol/sdk)
- Create: `packages/cli/src/mcp/tools.ts`
- Create: `packages/cli/src/commands/mcp-serve.ts`

**Interfaces:**
- Consumes: All Konduktor REST API endpoints via `fetch('http://localhost:4170/api/...')`:
  - `POST /api/cron` (Task 4), `GET /api/cron` (existing)
  - `POST /api/secrets`, `GET /api/secrets`, `DELETE /api/secrets/:name` (Task 3)
  - `POST /api/profiles` (Phase 5)
  - `POST /api/kanban` (Phase 2)
  - `POST /api/capabilities/mcp/add`, `DELETE /api/capabilities/mcp/:name` (Phase 4)
- Produces:
  - MCP server with 8 tools, registered via `konduktor mcp-serve` command
  - Tools: `create_cron`, `list_crons`, `store_secret`, `list_secrets`, `delete_secret`, `create_agent`, `kanban_create`, `manage_mcp`

- [ ] **Step 1: Add MCP SDK dependency**

Run: `cd packages/cli && pnpm add @modelcontextprotocol/sdk`

- [ ] **Step 2: Create MCP tool definitions**

Create `packages/cli/src/mcp/tools.ts`:

```typescript
const BASE = 'http://127.0.0.1:4170';

async function callApi(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export const TOOLS: McpTool[] = [
  {
    name: 'create_cron',
    description: 'Create a scheduled cron job. Returns the created job.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Job display name' },
        schedule: { type: 'string', description: 'Cron expression (e.g. "0 7 * * *" for daily at 7 AM)' },
        prompt: { type: 'string', description: 'The prompt for Claude to execute on each run' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        model: { type: 'string', description: 'Claude model to use (optional)' },
        agentId: { type: 'number', description: 'Agent profile ID to run as (optional)' },
      },
      required: ['name', 'schedule', 'prompt'],
    },
    handler: (args) => callApi('/api/cron', 'POST', args),
  },
  {
    name: 'list_crons',
    description: 'List all scheduled cron jobs.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => callApi('/api/cron'),
  },
  {
    name: 'store_secret',
    description: 'Store an encrypted secret (API key, credential). Name must be uppercase with underscores (e.g. META_ADS_API_KEY). Injected as env var into agent/cron processes.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Env-var-safe name, e.g. META_ADS_API_KEY', pattern: '^[A-Z][A-Z0-9_]*$' },
        value: { type: 'string', description: 'The secret value to encrypt and store' },
        scope: { type: 'string', description: '"global" (default) or "agent:<id>" for agent-specific', default: 'global' },
      },
      required: ['name', 'value'],
    },
    handler: (args) => callApi('/api/secrets', 'POST', args),
  },
  {
    name: 'list_secrets',
    description: 'List stored secrets (names and scopes only, no values).',
    inputSchema: { type: 'object', properties: {} },
    handler: () => callApi('/api/secrets'),
  },
  {
    name: 'delete_secret',
    description: 'Delete a stored secret by name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the secret to delete' },
      },
      required: ['name'],
    },
    handler: (args) => callApi(`/api/secrets/${args.name}`, 'DELETE'),
  },
  {
    name: 'create_agent',
    description: 'Create a new agent profile with skills, model, and configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent display name' },
        icon: { type: 'string', description: 'Emoji icon (default: 🤖)' },
        systemPrompt: { type: 'string', description: 'System prompt for the agent' },
        model: { type: 'string', description: 'Claude model (default: claude-sonnet-5-5)' },
        skills: { type: 'array', items: { type: 'string' }, description: 'Skill tags for task matching' },
        defaultCwd: { type: 'string', description: 'Default working directory' },
        maxConcurrentTasks: { type: 'number', description: 'Max parallel tasks (default: 1)' },
        memoryPolicy: { type: 'string', enum: ['ephemeral', 'persistent'], description: 'Memory policy (default: ephemeral)' },
      },
      required: ['name'],
    },
    handler: (args) => callApi('/api/profiles', 'POST', args),
  },
  {
    name: 'kanban_create',
    description: 'Create a kanban task.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        column: { type: 'string', description: 'Column: backlog, in-progress, review, done (default: backlog)' },
        description: { type: 'string', description: 'Task description (optional)' },
      },
      required: ['title'],
    },
    handler: (args) => callApi('/api/kanban', 'POST', args),
  },
  {
    name: 'manage_mcp',
    description: 'Add or remove MCP servers from Claude Code configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'remove'], description: '"add" or "remove"' },
        name: { type: 'string', description: 'MCP server name' },
        command: { type: 'string', description: 'Server command (required for add)' },
        args: { type: 'array', items: { type: 'string' }, description: 'Server command arguments (for add)' },
      },
      required: ['action', 'name'],
    },
    handler: async (args) => {
      if (args.action === 'add') {
        return callApi('/api/capabilities/mcp/add', 'POST', {
          name: args.name, command: args.command, args: args.args || [],
        });
      }
      return callApi(`/api/capabilities/mcp/${args.name}`, 'DELETE');
    },
  },
];
```

- [ ] **Step 3: Create MCP server entry point**

Create `packages/cli/src/commands/mcp-serve.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from '../mcp/tools.js';

export async function mcpServe() {
  const server = new Server(
    { name: 'konduktor', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) {
      return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true };
    }
    try {
      const result = await tool.handler((args || {}) as Record<string, unknown>);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof TypeError && err.message.includes('fetch')
        ? 'Konduktor server is not running. Start it with: konduktor start'
        : (err as Error).message;
      return { content: [{ type: 'text' as const, text: message }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 4: Build and verify**

Run: `pnpm build`
Expected: All packages compile

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' | node packages/cli/dist/index.js mcp-serve`
Expected: JSON-RPC response with server info (may need to send via stdin pipe)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/package.json packages/cli/src/mcp/tools.ts \
  packages/cli/src/commands/mcp-serve.ts
git commit -m "feat(phase6): MCP server — 8 tools via stdio proxy to Konduktor API"
```

---

### Task 8: Secrets UI in Settings

**Files:**
- Create: `packages/client/src/components/settings/SecretsSection.tsx`
- Modify: `packages/client/src/components/settings/SettingsPage.tsx` (import + render)

**Interfaces:**
- Consumes: `GET /api/secrets` (Task 3), `POST /api/secrets` (Task 3), `DELETE /api/secrets/:name` (Task 3)
- Produces: Secrets management section in the Settings page UI

- [ ] **Step 1: Create the SecretsSection component**

Create `packages/client/src/components/settings/SecretsSection.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';

interface SecretMeta {
  name: string;
  scope: string;
  createdAt: number;
}

export function SecretsSection() {
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [scope, setScope] = useState('global');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const res = await fetch('/api/secrets');
    if (res.ok) setSecrets(await res.json());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addSecret = async () => {
    setError('');
    if (!name || !value) { setError('Name and value required'); return; }
    const res = await fetch('/api/secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, value, scope }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error || 'Failed to store secret');
      return;
    }
    setName(''); setValue(''); setScope('global');
    refresh();
  };

  const revoke = async (secretName: string) => {
    await fetch(`/api/secrets/${secretName}`, { method: 'DELETE' });
    refresh();
  };

  const inputStyle = {
    padding: '6px 10px', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', background: 'var(--bg)',
    color: 'var(--fg)', fontSize: '0.8rem',
  };

  return (
    <section style={{ marginBottom: '24px' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--fg2)' }}>
        Secrets
      </label>
      <p style={{ fontSize: '0.75rem', color: 'var(--fg3)', marginBottom: '12px' }}>
        Encrypted credentials injected as environment variables into agent and cron processes.
      </p>

      {secrets.length > 0 && (
        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', marginBottom: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--fg3)', fontWeight: 500 }}>Name</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--fg3)', fontWeight: 500 }}>Scope</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--fg3)', fontWeight: 500 }}>Added</th>
              <th style={{ width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {secrets.map(s => (
              <tr key={s.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)' }}>{s.name}</td>
                <td style={{ padding: '6px 8px', color: 'var(--fg3)' }}>{s.scope}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--fg3)' }}>
                  {new Date(s.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  <button onClick={() => revoke(s.name)} style={{
                    padding: '2px 8px', border: '1px solid var(--border)', borderRadius: '3px',
                    background: 'transparent', color: 'var(--red)', fontSize: '0.7rem', cursor: 'pointer',
                  }}>Revoke</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input placeholder="NAME" value={name} onChange={e => setName(e.target.value.toUpperCase())}
          style={{ ...inputStyle, width: '140px', fontFamily: 'var(--font-mono)' }} />
        <input placeholder="Value" type="password" value={value} onChange={e => setValue(e.target.value)}
          style={{ ...inputStyle, width: '180px' }} />
        <select value={scope} onChange={e => setScope(e.target.value)} style={{ ...inputStyle, width: '100px' }}>
          <option value="global">Global</option>
        </select>
        <button onClick={addSecret} style={{
          padding: '6px 12px', border: 'none', borderRadius: 'var(--radius-sm)',
          background: 'var(--purple)', color: 'white', fontSize: '0.8rem', cursor: 'pointer',
        }}>Add</button>
      </div>
      {error && <p style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: '4px' }}>{error}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Import and render in SettingsPage**

In `packages/client/src/components/settings/SettingsPage.tsx`, add import:

```typescript
import { SecretsSection } from './SecretsSection';
```

Add the `<SecretsSection />` component after the desktop notifications section, before the `{saved && ...}` line:

```tsx
      <SecretsSection />

      {saved && <p style={{ ...
```

- [ ] **Step 3: Build and verify**

Run: `pnpm build`
Expected: All packages compile

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/settings/SecretsSection.tsx \
  packages/client/src/components/settings/SettingsPage.tsx
git commit -m "feat(phase6): secrets management UI in Settings — add, list, revoke"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- MCP server (stdio proxy, 8 tools) ✓ — Tasks 7
- Secrets management (encrypt, store, inject) ✓ — Tasks 1, 2, 3, 5
- Secrets UI ✓ — Task 8
- Auto-registration CLI ✓ — Task 6
- Cron-agent integration ✓ — Tasks 4, 5
- Rule-based delegation — explicitly deferred per grilling Q4

**2. Placeholder scan:** No TBDs, TODOs, or "implement later" found.

**3. Type consistency:**
- `SecretMeta` in shared types → used by SecretsManager, routes, client
- `CronJob.agentId` in shared types → used by CronRepository, scheduler, routes
- `SecretsManager` constructor signature consistent across Tasks 2, 3, 5
- `ClaudeProcess.start()` env option added in Task 5, consumed by scheduler
- `createApp()` signature change in Task 3 → all callers updated

**4. Review Focus:** All 5 failure modes have tests:
1. Duplicate secret name → Task 2 test `overwrites existing secret with same name`
2. Keyfile deleted → Task 2 test `returns empty list when keyfile is missing`
3. MCP proxy unreachable → Task 7 catch block with clear error message
4. Cron with deleted agent → Task 4 test `falls back when agent profile is deleted`
5. Nonexistent agent scope → Task 2 test `stores secret with arbitrary agent scope`
