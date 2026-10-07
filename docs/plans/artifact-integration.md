# Artifact Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect official Claude Code artifacts from chat stream events, catalog metadata in SQLite, and provide a gallery UI with card grid, modal preview, tag/pin management, and toast notifications.

**Architecture:** The WS handler detects `tool_use` content blocks where `name === 'Artifact'`, extracts metadata (title, icon, description, URL), and persists to an `artifacts` SQLite table via `ArtifactRepository`. A REST API serves CRUD operations. The React client renders a card-grid gallery with modal detail view, tag/pin management, and iframe preview (with graceful fallback). A WebSocket `artifact:saved` event triggers toast notifications in the chat UI.

**Tech Stack:** Express 5, TypeScript 5.5, better-sqlite3, React 19, Vite, ws

**Spec:** Grilling shared understanding from conversation (no separate file — decisions inline below)

## Global Constraints

- TypeScript strict mode across all packages
- All files < 300 lines (Makruva standard)
- No secrets in source — config via `~/.konduktor/`
- Design tokens: deep purple (#7c3aed) + cyan (#06b6d4)
- Inline styles with CSS custom properties (existing client pattern)
- Repository classes for DB access (existing server pattern)
- `RouterType = Router()` pattern for routes (existing server pattern)
- Timestamps stored as `unixepoch()` seconds in SQLite, returned as milliseconds to client

## Review Focus

1. **Artifact tool_use with missing fields** — if Claude emits a tool_use with `name === 'Artifact'` but `input` lacks `title` or `url`, the handler should create the record with sensible defaults (empty title, null URL) rather than crash. Test added to Task 1.
2. **Concurrent artifact events from same session** — two artifacts published in rapid succession should each get their own record, not overwrite each other. Test added to Task 1.
3. **Tag input with special characters** — commas, quotes, or empty strings in tags should be handled (stored as JSON array, validated on write). Test added to Task 2.
4. **iframe CSP blocking** — claude.ai may set X-Frame-Options:DENY, so the preview must degrade gracefully to a link. Handled in Task 4 UI code with `onError` fallback.
5. **DELETE cascade** — deleting an artifact should not cascade to session data. Test added to Task 2.

---

### Task 1: Artifact Types, Schema, Repository, and Stream Detection

**Files:**
- Modify: `packages/shared/src/types.ts` — add `Artifact` interface and `WsServerMessage` union member
- Modify: `packages/server/src/db/schema.ts` — add `artifacts` table migration
- Create: `packages/server/src/db/artifact-repository.ts` — CRUD for artifacts
- Modify: `packages/server/src/ws/handler.ts` — detect artifact tool_use events, persist, emit WS event
- Test: `packages/server/tests/db/artifact-repository.test.ts`
- Test: `packages/server/tests/ws/artifact-detection.test.ts`

**Interfaces:**
- Consumes: `getDb()` from connection; `ContentBlock` from shared types; `WsServerMessage` union
- Produces: `Artifact` type; `ArtifactRepository` with `create(data)`, `list(opts?)`, `getById(id)`, `update(id, patch)`, `delete(id)`; `artifact:saved` WS event

- [ ] **Step 1: Add Artifact type to shared**

Add to `packages/shared/src/types.ts`:

```typescript
export interface Artifact {
  id: number;
  sessionId: string | null;
  url: string | null;
  title: string;
  description: string;
  icon: string;
  artifactType: string;
  tags: string[];
  pinned: boolean;
  createdAt: number;
}
```

Add to the `WsServerMessage` union:

```typescript
| { type: 'artifact:saved'; artifact: Artifact }
```

- [ ] **Step 2: Add artifacts table migration to schema**

Add to `MIGRATIONS` array in `packages/server/src/db/schema.ts`:

```typescript
`CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  url TEXT,
  title TEXT NOT NULL DEFAULT 'Untitled',
  description TEXT DEFAULT '',
  icon TEXT DEFAULT 'code',
  artifact_type TEXT DEFAULT 'html',
  tags TEXT DEFAULT '[]',
  pinned INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
)`,
`CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id)`,
`CREATE INDEX IF NOT EXISTS idx_artifacts_pinned ON artifacts(pinned, created_at)`,
```

- [ ] **Step 3: Write failing test for ArtifactRepository**

```typescript
// packages/server/tests/db/artifact-repository.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';
import { ArtifactRepository } from '../../src/db/artifact-repository.js';

let db: Database.Database;
let repo: ArtifactRepository;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  repo = new ArtifactRepository(db);
});

afterAll(() => db.close());

describe('ArtifactRepository', () => {
  let artifactId: number;

  it('creates an artifact', () => {
    const a = repo.create({
      sessionId: 'sess-1', url: 'https://claude.ai/code/artifact/abc123',
      title: 'Dashboard', description: 'A metrics dashboard',
      icon: 'chart', artifactType: 'html',
    });
    artifactId = a.id;
    expect(a.title).toBe('Dashboard');
    expect(a.url).toBe('https://claude.ai/code/artifact/abc123');
    expect(a.tags).toEqual([]);
    expect(a.pinned).toBe(false);
  });

  it('creates artifact with missing optional fields', () => {
    const a = repo.create({ sessionId: null, url: null, title: '', description: '', icon: '', artifactType: '' });
    expect(a.title).toBe('Untitled');
    expect(a.url).toBeNull();
    repo.delete(a.id);
  });

  it('lists artifacts with pinned first', () => {
    const a2 = repo.create({ sessionId: 'sess-2', url: 'https://claude.ai/code/artifact/def456', title: 'Pinned One', description: '', icon: 'star', artifactType: 'html' });
    repo.update(a2.id, { pinned: true });
    const list = repo.list();
    expect(list[0].pinned).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('updates tags and pinned', () => {
    repo.update(artifactId, { tags: ['dashboard', 'v2'], pinned: true });
    const a = repo.getById(artifactId)!;
    expect(a.tags).toEqual(['dashboard', 'v2']);
    expect(a.pinned).toBe(true);
  });

  it('filters by tag', () => {
    const list = repo.list({ tag: 'dashboard' });
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(artifactId);
  });

  it('handles concurrent artifacts from same session', () => {
    const a1 = repo.create({ sessionId: 'sess-multi', url: 'https://claude.ai/code/artifact/aaa', title: 'First', description: '', icon: 'code', artifactType: 'html' });
    const a2 = repo.create({ sessionId: 'sess-multi', url: 'https://claude.ai/code/artifact/bbb', title: 'Second', description: '', icon: 'code', artifactType: 'html' });
    expect(a1.id).not.toBe(a2.id);
    expect(repo.list().filter(a => a.sessionId === 'sess-multi').length).toBe(2);
    repo.delete(a1.id);
    repo.delete(a2.id);
  });

  it('deletes artifact without affecting other tables', () => {
    repo.delete(artifactId);
    expect(repo.getById(artifactId)).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/db/artifact-repository.test.ts`
Expected: FAIL with "Cannot find module '../../src/db/artifact-repository.js'"

- [ ] **Step 5: Implement ArtifactRepository**

```typescript
// packages/server/src/db/artifact-repository.ts
import type Database from 'better-sqlite3';
import type { Artifact } from '@konduktor/shared';

export class ArtifactRepository {
  constructor(private db: Database.Database) {}

  create(data: { sessionId: string | null; url: string | null; title: string; description: string; icon: string; artifactType: string }): Artifact {
    const title = data.title || 'Untitled';
    const result = this.db.prepare(
      `INSERT INTO artifacts (session_id, url, title, description, icon, artifact_type)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(data.sessionId, data.url, title, data.description || '', data.icon || 'code', data.artifactType || 'html');
    return this.getById(result.lastInsertRowid as number)!;
  }

  list(opts?: { tag?: string }): Artifact[] {
    let sql = `SELECT * FROM artifacts`;
    const params: unknown[] = [];
    if (opts?.tag) {
      sql += ` WHERE tags LIKE ?`;
      params.push(`%"${opts.tag}"%`);
    }
    sql += ` ORDER BY pinned DESC, created_at DESC`;
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(this.mapRow);
  }

  getById(id: number): Artifact | undefined {
    const row = this.db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  update(id: number, patch: Partial<{ title: string; description: string; tags: string[]; pinned: boolean; url: string }>): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    const ALLOWED = new Set(['title', 'description', 'url']);
    for (const [key, val] of Object.entries(patch)) {
      if (key === 'tags') { sets.push('tags = ?'); vals.push(JSON.stringify(val)); }
      else if (key === 'pinned') { sets.push('pinned = ?'); vals.push(val ? 1 : 0); }
      else if (ALLOWED.has(key) && val !== undefined) { sets.push(`${key} = ?`); vals.push(val); }
    }
    if (sets.length === 0) return;
    vals.push(id);
    this.db.prepare(`UPDATE artifacts SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM artifacts WHERE id = ?`).run(id);
  }

  private mapRow(r: Record<string, unknown>): Artifact {
    let tags: string[] = [];
    try { tags = JSON.parse((r.tags as string) || '[]'); } catch { /* default empty */ }
    return {
      id: r.id as number, sessionId: r.session_id as string | null,
      url: r.url as string | null, title: r.title as string,
      description: (r.description as string) || '', icon: (r.icon as string) || 'code',
      artifactType: r.artifact_type as string, tags, pinned: (r.pinned as number) === 1,
      createdAt: (r.created_at as number) * 1000,
    };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/db/artifact-repository.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: Write failing test for artifact stream detection**

```typescript
// packages/server/tests/ws/artifact-detection.test.ts
import { describe, it, expect } from 'vitest';
import { extractArtifactFromEvent } from '../../src/ws/artifact-detector.js';

describe('extractArtifactFromEvent', () => {
  it('extracts artifact from tool_use content block', () => {
    const event = {
      type: 'assistant' as const,
      content: [{
        type: 'tool_use' as const,
        name: 'Artifact',
        input: {
          file_path: '/tmp/dashboard.html',
          title: 'Dashboard',
          icon: 'chart',
          description: 'A metrics dashboard',
        },
      }],
    };
    const result = extractArtifactFromEvent(event);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Dashboard');
    expect(result[0].icon).toBe('chart');
  });

  it('returns empty array for non-artifact events', () => {
    const event = { type: 'assistant' as const, content: [{ type: 'text' as const, text: 'hello' }] };
    expect(extractArtifactFromEvent(event)).toHaveLength(0);
  });

  it('returns empty array for result events', () => {
    const event = { type: 'result' as const, result: 'done' };
    expect(extractArtifactFromEvent(event)).toHaveLength(0);
  });

  it('handles missing input fields gracefully', () => {
    const event = {
      type: 'assistant' as const,
      content: [{ type: 'tool_use' as const, name: 'Artifact', input: {} }],
    };
    const result = extractArtifactFromEvent(event);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Untitled');
    expect(result[0].icon).toBe('code');
  });

  it('extracts multiple artifacts from one event', () => {
    const event = {
      type: 'assistant' as const,
      content: [
        { type: 'tool_use' as const, name: 'Artifact', input: { title: 'First' } },
        { type: 'text' as const, text: 'between' },
        { type: 'tool_use' as const, name: 'Artifact', input: { title: 'Second' } },
      ],
    };
    const result = extractArtifactFromEvent(event);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('First');
    expect(result[1].title).toBe('Second');
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/ws/artifact-detection.test.ts`
Expected: FAIL with "Cannot find module '../../src/ws/artifact-detector.js'"

- [ ] **Step 9: Implement artifact-detector**

```typescript
// packages/server/src/ws/artifact-detector.ts
import type { StreamEvent } from '@konduktor/shared';

export interface ArtifactInput {
  title: string;
  description: string;
  icon: string;
  artifactType: string;
  url: string | null;
  filePath: string | null;
}

export function extractArtifactFromEvent(event: StreamEvent): ArtifactInput[] {
  if (event.type !== 'assistant' || !event.content) return [];

  const artifacts: ArtifactInput[] = [];
  for (const block of event.content) {
    if (block.type === 'tool_use' && block.name === 'Artifact' && block.input) {
      artifacts.push({
        title: (block.input.title as string) || 'Untitled',
        description: (block.input.description as string) || '',
        icon: (block.input.icon as string) || 'code',
        artifactType: 'html',
        url: (block.input.url as string) || null,
        filePath: (block.input.file_path as string) || null,
      });
    }
  }
  return artifacts;
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/ws/artifact-detection.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 11: Wire artifact detection into WS handler**

Modify `packages/server/src/ws/handler.ts`. Add import:

```typescript
import { ArtifactRepository } from '../db/artifact-repository.js';
import { extractArtifactFromEvent } from './artifact-detector.js';
```

After the existing `buffer.push(event)` and `send()` call inside `proc.on('event')`, add:

```typescript
const artifactInputs = extractArtifactFromEvent(event);
for (const input of artifactInputs) {
  try {
    const artifact = new ArtifactRepository(getDb()).create({
      sessionId, url: input.url, title: input.title,
      description: input.description, icon: input.icon,
      artifactType: input.artifactType,
    });
    send(ws, { type: 'artifact:saved', artifact });
  } catch { /* artifact save failure is non-fatal */ }
}
```

- [ ] **Step 12: Run full suite, build, commit**

Run: `pnpm test && pnpm build`

```bash
git add packages/shared/src/types.ts packages/server/src/db/schema.ts \
  packages/server/src/db/artifact-repository.ts packages/server/src/ws/artifact-detector.ts \
  packages/server/src/ws/handler.ts packages/server/tests/db/artifact-repository.test.ts \
  packages/server/tests/ws/artifact-detection.test.ts
git commit -m "feat: add artifact detection, repository, and stream integration

Detect Artifact tool_use events in WS stream, persist metadata to
SQLite via ArtifactRepository. Emit artifact:saved WS event to client.
Tags stored as JSON array, pinned-first sorting."
```

---

### Task 2: Artifact REST API

**Files:**
- Create: `packages/server/src/routes/artifacts.ts` — CRUD endpoints
- Modify: `packages/server/src/index.ts` — wire artifacts route
- Test: `packages/server/tests/routes/artifacts.test.ts`

**Interfaces:**
- Consumes: `ArtifactRepository` from Task 1; `getDb()` from connection
- Produces: `GET /api/artifacts` (list, optional `?tag=X`), `GET /api/artifacts/:id`, `PUT /api/artifacts/:id` (update tags/pinned/title), `DELETE /api/artifacts/:id`

- [ ] **Step 1: Write failing test for artifact endpoints**

```typescript
// packages/server/tests/routes/artifacts.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, getDb } from '../../src/db/connection.js';
import { createApp } from '../../src/index.js';
import { createServer, type Server } from 'node:http';

let server: Server;
let port: number;
let createdId: number;

beforeAll(async () => {
  initDb(':memory:');
  const app = createApp();
  server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });

  getDb().prepare(
    `INSERT INTO artifacts (session_id, url, title, description, icon, artifact_type)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('sess-1', 'https://claude.ai/code/artifact/abc', 'Test Artifact', 'A test', 'code', 'html');
});

afterAll(() => server.close());

describe('Artifact endpoints', () => {
  it('GET /api/artifacts lists artifacts', async () => {
    const res = await fetch(`http://localhost:${port}/api/artifacts`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].title).toBe('Test Artifact');
    createdId = body[0].id;
  });

  it('GET /api/artifacts/:id returns single artifact', async () => {
    const res = await fetch(`http://localhost:${port}/api/artifacts/${createdId}`);
    const body = await res.json();
    expect(body.title).toBe('Test Artifact');
    expect(body.url).toBe('https://claude.ai/code/artifact/abc');
  });

  it('GET /api/artifacts/:id returns 404 for missing', async () => {
    const res = await fetch(`http://localhost:${port}/api/artifacts/99999`);
    expect(res.status).toBe(404);
  });

  it('PUT /api/artifacts/:id updates tags and pinned', async () => {
    const res = await fetch(`http://localhost:${port}/api/artifacts/${createdId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['test', 'v1'], pinned: true }),
    });
    const body = await res.json();
    expect(body.tags).toEqual(['test', 'v1']);
    expect(body.pinned).toBe(true);
  });

  it('PUT /api/artifacts/:id rejects non-array tags', async () => {
    const res = await fetch(`http://localhost:${port}/api/artifacts/${createdId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: 'not-an-array' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/artifacts?tag=test filters by tag', async () => {
    const res = await fetch(`http://localhost:${port}/api/artifacts?tag=test`);
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].tags).toContain('test');
  });

  it('DELETE /api/artifacts/:id removes artifact', async () => {
    const res = await fetch(`http://localhost:${port}/api/artifacts/${createdId}`, { method: 'DELETE' });
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/routes/artifacts.test.ts`
Expected: FAIL — 404

- [ ] **Step 3: Implement artifact routes**

```typescript
// packages/server/src/routes/artifacts.ts
import { Router, type Router as RouterType } from 'express';
import { ArtifactRepository } from '../db/artifact-repository.js';
import { getDb } from '../db/connection.js';

export const artifactsRouter: RouterType = Router();

artifactsRouter.get('/', (req, res) => {
  const repo = new ArtifactRepository(getDb());
  const tag = req.query.tag as string | undefined;
  res.json(repo.list(tag ? { tag } : undefined));
});

artifactsRouter.get('/:id', (req, res) => {
  const repo = new ArtifactRepository(getDb());
  const artifact = repo.getById(Number(req.params.id));
  if (!artifact) { res.status(404).json({ error: 'Artifact not found' }); return; }
  res.json(artifact);
});

artifactsRouter.put('/:id', (req, res) => {
  const { tags, pinned, title, description } = req.body;
  if (tags !== undefined && !Array.isArray(tags)) {
    res.status(400).json({ error: 'tags must be an array' }); return;
  }
  const repo = new ArtifactRepository(getDb());
  repo.update(Number(req.params.id), { tags, pinned, title, description });
  const updated = repo.getById(Number(req.params.id));
  res.json(updated);
});

artifactsRouter.delete('/:id', (req, res) => {
  const repo = new ArtifactRepository(getDb());
  repo.delete(Number(req.params.id));
  res.json({ success: true });
});
```

- [ ] **Step 4: Wire artifacts route into server**

Add to `packages/server/src/index.ts`:

```typescript
import { artifactsRouter } from './routes/artifacts.js';
```

Add after the analytics route line:

```typescript
app.use('/api/artifacts', artifactsRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/routes/artifacts.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Run full suite, build, commit**

Run: `pnpm test && pnpm build`

```bash
git add packages/server/src/routes/artifacts.ts packages/server/src/index.ts \
  packages/server/tests/routes/artifacts.test.ts
git commit -m "feat: add artifact REST API with tag filtering

CRUD endpoints for artifacts at /api/artifacts. Tag filtering via
query param. Input validation for tags array type."
```

---

### Task 3: Artifact Gallery UI — Card Grid and Sidebar

**Files:**
- Create: `packages/client/src/components/artifacts/ArtifactCard.tsx` — single card component
- Create: `packages/client/src/components/artifacts/ArtifactsPage.tsx` — gallery page with grid + tag filter
- Modify: `packages/client/src/App.tsx` — add /artifacts route
- Modify: `packages/client/src/components/Sidebar.tsx` — add Artifacts nav item

**Interfaces:**
- Consumes: `GET /api/artifacts`, `PUT /api/artifacts/:id`, `DELETE /api/artifacts/:id` from Task 2
- Produces: `<ArtifactsPage>` with card grid, tag filter, pin toggle, delete; `<ArtifactCard>` with icon, title, description, date, tags

- [ ] **Step 1: Create ArtifactCard component**

```tsx
// packages/client/src/components/artifacts/ArtifactCard.tsx
interface ArtifactCardProps {
  artifact: {
    id: number; title: string; description: string; icon: string;
    url: string | null; tags: string[]; pinned: boolean; createdAt: number;
  };
  onPin: (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void;
  onClick: (id: number) => void;
}

export function ArtifactCard({ artifact, onPin, onDelete, onClick }: ArtifactCardProps) {
  return (
    <div onClick={() => onClick(artifact.id)} style={{
      padding: '14px', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)', background: 'var(--bg-surface)',
      cursor: 'pointer', position: 'relative',
      transition: 'border-color 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '1.25rem' }}>{artifact.icon || 'code'}</span>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {artifact.title}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--fg3)' }}>
            {new Date(artifact.createdAt).toLocaleDateString()}
          </div>
        </div>
        <button onClick={e => { e.stopPropagation(); onPin(artifact.id, !artifact.pinned); }} style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem',
          color: artifact.pinned ? 'var(--purple)' : 'var(--fg3)',
        }}>{artifact.pinned ? '★' : '☆'}</button>
      </div>
      {artifact.description && (
        <p style={{ fontSize: '0.75rem', color: 'var(--fg2)', margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {artifact.description}
        </p>
      )}
      {artifact.tags.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {artifact.tags.map(t => (
            <span key={t} style={{
              fontSize: '0.65rem', padding: '2px 6px', borderRadius: 'var(--radius-sm)',
              background: 'var(--purple-soft)', color: 'var(--purple)',
            }}>{t}</span>
          ))}
        </div>
      )}
      <button onClick={e => { e.stopPropagation(); onDelete(artifact.id); }} style={{
        position: 'absolute', top: 8, right: 8, background: 'none', border: 'none',
        cursor: 'pointer', fontSize: '0.7rem', color: 'var(--fg3)',
      }}>✕</button>
    </div>
  );
}
```

- [ ] **Step 2: Create ArtifactsPage component**

```tsx
// packages/client/src/components/artifacts/ArtifactsPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { ArtifactCard } from './ArtifactCard';

interface Artifact {
  id: number; sessionId: string | null; url: string | null; title: string;
  description: string; icon: string; artifactType: string;
  tags: string[]; pinned: boolean; createdAt: number;
}

export function ArtifactsPage() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagFilter, setTagFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const qs = tagFilter ? `?tag=${encodeURIComponent(tagFilter)}` : '';
    try { setArtifacts(await (await fetch(`/api/artifacts${qs}`)).json()); } catch { /* ignore */ }
    setLoading(false);
  }, [tagFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const allTags = [...new Set(artifacts.flatMap(a => a.tags))];

  const handlePin = async (id: number, pinned: boolean) => {
    await fetch(`/api/artifacts/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    });
    refresh();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/artifacts/${id}`, { method: 'DELETE' });
    refresh();
  };

  const selected = artifacts.find(a => a.id === selectedId);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Artifacts</h2>
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => setTagFilter('')} style={{
              padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
              fontSize: '0.7rem', background: !tagFilter ? 'var(--purple)' : 'var(--bg-surface)',
              color: !tagFilter ? 'white' : 'var(--fg3)',
            }}>All</button>
            {allTags.map(t => (
              <button key={t} onClick={() => setTagFilter(t)} style={{
                padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                fontSize: '0.7rem', background: tagFilter === t ? 'var(--purple)' : 'var(--bg-surface)',
                color: tagFilter === t ? 'white' : 'var(--fg3)',
              }}>{t}</button>
            ))}
          </div>
        )}
      </div>

      {loading && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>Loading...</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
        {artifacts.map(a => (
          <ArtifactCard key={a.id} artifact={a}
            onPin={handlePin} onDelete={handleDelete} onClick={setSelectedId} />
        ))}
      </div>

      {!loading && artifacts.length === 0 && (
        <p style={{ color: 'var(--fg3)', fontSize: '0.8rem', textAlign: 'center', padding: '40px 0' }}>
          No artifacts yet. Artifacts created during chat sessions will appear here.
        </p>
      )}

      {selected && (
        <ArtifactModal artifact={selected} onClose={() => setSelectedId(null)}
          onPin={handlePin} onDelete={handleDelete} onUpdate={refresh} />
      )}
    </div>
  );
}

function ArtifactModal({ artifact, onClose, onPin, onDelete, onUpdate }: {
  artifact: Artifact; onClose: () => void;
  onPin: (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void; onUpdate: () => void;
}) {
  const [tagInput, setTagInput] = useState('');
  const [iframeError, setIframeError] = useState(false);

  const addTag = async () => {
    if (!tagInput.trim()) return;
    const newTags = [...artifact.tags, tagInput.trim()];
    await fetch(`/api/artifacts/${artifact.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    });
    setTagInput('');
    onUpdate();
  };

  const removeTag = async (tag: string) => {
    const newTags = artifact.tags.filter(t => t !== tag);
    await fetch(`/api/artifacts/${artifact.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    });
    onUpdate();
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
        width: '80vw', maxWidth: 900, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.25rem' }}>{artifact.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{artifact.title}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--fg3)' }}>{artifact.description}</div>
          </div>
          <button onClick={() => onPin(artifact.id, !artifact.pinned)} style={{
            padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg)', cursor: 'pointer', fontSize: '0.7rem',
            color: artifact.pinned ? 'var(--purple)' : 'var(--fg3)',
          }}>{artifact.pinned ? '★ Pinned' : '☆ Pin'}</button>
          {artifact.url && (
            <a href={artifact.url} target="_blank" rel="noopener noreferrer" style={{
              padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)', fontSize: '0.7rem', color: 'var(--cyan)', textDecoration: 'none',
            }}>Open in Claude</a>
          )}
          <button onClick={() => { onDelete(artifact.id); onClose(); }} style={{
            padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg)', color: 'var(--red)', fontSize: '0.7rem', cursor: 'pointer',
          }}>Delete</button>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--fg3)',
          }}>✕</button>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', minHeight: 300 }}>
          {artifact.url && !iframeError ? (
            <iframe src={artifact.url} onError={() => setIframeError(true)}
              style={{ width: '100%', height: '100%', border: 'none' }}
              sandbox="allow-scripts allow-same-origin" title={artifact.title} />
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--fg3)', fontSize: '0.85rem' }}>
              {artifact.url ? (
                <><p>Preview unavailable.</p><a href={artifact.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan)' }}>Open in Claude</a></>
              ) : (
                <p>No URL available for this artifact.</p>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {artifact.tags.map(t => (
            <span key={t} style={{
              fontSize: '0.7rem', padding: '2px 8px', borderRadius: 'var(--radius-sm)',
              background: 'var(--purple-soft)', color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: '4px',
            }}>{t}<button onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.65rem', color: 'var(--purple)' }}>✕</button></span>
          ))}
          <input value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Add tag..."
            style={{ fontSize: '0.7rem', padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', color: 'var(--fg)', width: 80 }} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire ArtifactsPage into router and sidebar**

Add to `packages/client/src/App.tsx`:

```tsx
import { ArtifactsPage } from './components/artifacts/ArtifactsPage';
```

Add route after analytics:

```tsx
<Route path="/artifacts" element={<ArtifactsPage />} />
```

Add to `packages/client/src/components/Sidebar.tsx` NAV_ITEMS after Schedules, before Settings:

```typescript
{ to: '/artifacts', label: 'Artifacts', icon: '◆' },
```

- [ ] **Step 4: Build client, verify**

Run: `pnpm --filter @konduktor/client build`
Expected: Compiles clean

- [ ] **Step 5: Run full suite, commit**

Run: `pnpm test && pnpm build`

```bash
git add packages/client/src/components/artifacts/ArtifactCard.tsx \
  packages/client/src/components/artifacts/ArtifactsPage.tsx \
  packages/client/src/App.tsx packages/client/src/components/Sidebar.tsx
git commit -m "feat: add artifact gallery with card grid and modal preview

Card grid with icon, title, description, date, tag pills. Modal with
iframe preview (graceful fallback), tag management, pin/delete.
Tag filter in gallery header."
```

---

### Task 4: Artifact Toast Notification in Chat

**Files:**
- Create: `packages/client/src/components/chat/ArtifactToast.tsx` — toast notification component
- Modify: `packages/client/src/components/chat/ChatPanel.tsx` — listen for `artifact:saved` WS events, show toast

**Interfaces:**
- Consumes: `artifact:saved` WsServerMessage from Task 1; existing WebSocket connection in ChatPanel
- Produces: Toast notification in chat UI when artifact is detected

- [ ] **Step 1: Create ArtifactToast component**

```tsx
// packages/client/src/components/chat/ArtifactToast.tsx
import { useState, useEffect } from 'react';

interface ToastData {
  id: number;
  title: string;
  icon: string;
  url: string | null;
}

export function ArtifactToast({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 200,
      padding: '12px 16px', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)', background: 'var(--bg-surface)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: '10px',
      animation: 'slideIn 0.3s ease-out',
    }}>
      <span style={{ fontSize: '1.2rem' }}>{toast.icon || 'code'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--fg3)' }}>Artifact saved</div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{toast.title}</div>
      </div>
      {toast.url && (
        <a href="/artifacts" style={{
          fontSize: '0.7rem', color: 'var(--cyan)', textDecoration: 'none',
        }}>View</a>
      )}
      <button onClick={onDismiss} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg3)', fontSize: '0.8rem',
      }}>✕</button>
    </div>
  );
}
```

- [ ] **Step 2: Wire toast into ChatPanel**

Read `packages/client/src/components/chat/ChatPanel.tsx` to find the WebSocket message handler. Add handling for `artifact:saved` messages:

In the WS `onmessage` handler, add a case:

```typescript
if (msg.type === 'artifact:saved') {
  setArtifactToast({ id: msg.artifact.id, title: msg.artifact.title, icon: msg.artifact.icon, url: msg.artifact.url });
}
```

Add state and render the toast:

```typescript
const [artifactToast, setArtifactToast] = useState<{ id: number; title: string; icon: string; url: string | null } | null>(null);
```

At the bottom of the JSX return:

```tsx
{artifactToast && <ArtifactToast toast={artifactToast} onDismiss={() => setArtifactToast(null)} />}
```

- [ ] **Step 3: Build, run full suite, commit**

Run: `pnpm test && pnpm build`

```bash
git add packages/client/src/components/chat/ArtifactToast.tsx \
  packages/client/src/components/chat/ChatPanel.tsx
git commit -m "feat: add artifact toast notification in chat

Shows toast when an artifact is detected during a chat session.
Auto-dismisses after 8 seconds. Links to artifacts gallery."
```

---

## Summary

| Task | Deliverable | Key Files | Tests |
|------|------------|-----------|-------|
| 1 | Artifact types, schema, repository, stream detection | types.ts, schema.ts, artifact-repository.ts, artifact-detector.ts, handler.ts | 12 |
| 2 | Artifact REST API | artifacts.ts route, index.ts | 7 |
| 3 | Gallery UI (card grid + modal) | ArtifactCard.tsx, ArtifactsPage.tsx, App.tsx, Sidebar.tsx | build |
| 4 | Chat toast notification | ArtifactToast.tsx, ChatPanel.tsx | build |
| **Total** | **Artifact Integration complete** | **~10 files** | **19 + build** |
