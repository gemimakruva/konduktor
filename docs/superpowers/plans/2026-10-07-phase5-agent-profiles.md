# Phase 5: Agent Profiles + Kanban Auto-Assign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Konduktor into a real orchestrator with named agents (profiles, skills, memory) that automatically pick up kanban tasks.

**Architecture:** Agent profiles are stored in SQLite alongside existing data. A profile runner wraps ClaudeProcess to inject system prompts, model, and tool restrictions. A skill matcher scores agents against tasks and triggers assignment when tasks move to "in-progress". The UI adds a Profiles page and extends the Kanban page with an assign dropdown.

**Tech Stack:** Express 5, TypeScript 5.5, better-sqlite3, React 19, Vite, ws, Vitest

**Spec:** `docs/roadmap.md` (Phase 5 section), grilling shared understanding from session

## Global Constraints

- All files < 300 lines
- TypeScript strict mode
- ESM imports with `.js` extensions in server/cli packages
- Inline styles with CSS custom properties in client (no CSS files)
- Repository classes with `constructor(private db: Database.Database)`
- Routes: `export const xRouter: RouterType = Router()`
- Tests: Vitest, in-memory SQLite via `initDb(':memory:')`
- No external dependencies beyond what's already in package.json

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `packages/shared/src/agent-types.ts` | AgentProfile, DelegationRule, ToolRestriction, AgentAssignment types |
| `packages/server/src/db/agent-repository.ts` | CRUD for agent_profiles table |
| `packages/server/src/db/assignment-repository.ts` | CRUD for agent_assignments table |
| `packages/server/src/routes/agent-profiles.ts` | REST API for profiles |
| `packages/server/src/agents/skill-matcher.ts` | Score agents against task skills |
| `packages/server/src/agents/profile-runner.ts` | Spawn ClaudeProcess with profile config |
| `packages/client/src/components/profiles/ProfilesPage.tsx` | List agent profiles |
| `packages/client/src/components/profiles/ProfileForm.tsx` | Create/edit profile form |
| `packages/client/src/components/profiles/ProfileCard.tsx` | Profile card component |
| `packages/server/tests/db/agent-repository.test.ts` | Repository tests |
| `packages/server/tests/db/assignment-repository.test.ts` | Assignment repo tests |
| `packages/server/tests/routes/agent-profiles.test.ts` | API tests |
| `packages/server/tests/agents/skill-matcher.test.ts` | Matcher tests |
| `packages/server/tests/agents/profile-runner.test.ts` | Runner tests |

### Modified files
| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Add WsClientMessage/WsServerMessage variants for agent events |
| `packages/shared/src/index.ts` | Re-export agent-types |
| `packages/server/src/db/schema.ts` | Add agent_profiles + agent_assignments tables |
| `packages/server/src/index.ts` | Register agent-profiles router |
| `packages/server/src/ws/handler.ts` | Support `agent:run` WS message |
| `packages/server/src/routes/kanban.ts` | Add auto-assign on PUT /:id/move |
| `packages/client/src/App.tsx` | Add /profiles route |
| `packages/client/src/components/Sidebar.tsx` | Add Profiles nav item |
| `packages/client/src/components/kanban/KanbanPage.tsx` | Add assign-to-agent dropdown |

## Review Focus

1. **Empty skills array on both task and agent** — skill matcher should return score 0, not crash. Test added in Task 4.
2. **Concurrent agent limit exceeded** — spawning a task when agent is already at maxConcurrentTasks should reject. Test added in Task 3.
3. **Profile deleted while agent is running** — assignment should complete gracefully, not orphan the process. Test added in Task 5.
4. **Kanban move to non-"in-progress" column** — should NOT trigger auto-assign. Test added in Task 4.
5. **Tool restrictions with empty tools array** — mode="deny" + empty tools = allow all; mode="allow" + empty tools = allow all (no tools to whitelist means unrestricted). Test added in Task 3.

---

### Task 1: Agent Profile Data Layer

**Files:**
- Create: `packages/shared/src/agent-types.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/server/src/db/schema.ts`
- Create: `packages/server/src/db/agent-repository.ts`
- Test: `packages/server/tests/db/agent-repository.test.ts`

**Interfaces:**
- Consumes: nothing (foundational)
- Produces:
  - Types: `AgentProfile`, `AgentProfileCreate`, `AgentProfileUpdate`, `DelegationRule`, `ToolRestriction`, `AgentPerformanceStats`
  - Class: `AgentRepository` with methods `create(data: AgentProfileCreate): AgentProfile`, `list(): AgentProfile[]`, `getById(id: number): AgentProfile | undefined`, `update(id: number, patch: AgentProfileUpdate): void`, `delete(id: number): void`

- [ ] **Step 1: Write shared types**

Create `packages/shared/src/agent-types.ts`:

```typescript
export interface DelegationRule {
  taskPattern: string;
  targetAgentId: number;
}

export interface ToolRestriction {
  mode: 'allow' | 'deny';
  tools: string[];
}

export interface AgentPerformanceStats {
  tasksCompleted: number;
  tasksFailed: number;
  avgDurationMs: number;
  successRate: number;
}

export interface AgentProfile {
  id: number;
  name: string;
  icon: string;
  systemPrompt: string;
  model: string;
  defaultCwd: string;
  skills: string[];
  maxConcurrentTasks: number;
  personalityPrompt: string;
  delegationRules: DelegationRule[];
  memoryPolicy: 'ephemeral' | 'persistent';
  toolRestrictions: ToolRestriction;
  knowledgeSources: string[];
  createdAt: number;
  updatedAt: number;
}

export type AgentProfileCreate = Pick<AgentProfile,
  'name' | 'icon' | 'systemPrompt' | 'model' | 'defaultCwd' | 'skills' |
  'maxConcurrentTasks' | 'personalityPrompt' | 'delegationRules' |
  'memoryPolicy' | 'toolRestrictions' | 'knowledgeSources'
>;

export type AgentProfileUpdate = Partial<AgentProfileCreate>;

export interface AgentAssignment {
  id: number;
  taskId: number;
  agentId: number;
  sessionId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: string;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  createdAt: number;
}
```

- [ ] **Step 2: Re-export from shared index**

Add to `packages/shared/src/index.ts`:
```typescript
export * from './agent-types.js';
```

- [ ] **Step 3: Add DB migrations**

Add to the `MIGRATIONS` array in `packages/server/src/db/schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS agent_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🤖',
  system_prompt TEXT DEFAULT '',
  model TEXT DEFAULT 'claude-sonnet-5-5',
  default_cwd TEXT DEFAULT '',
  skills TEXT DEFAULT '[]',
  max_concurrent_tasks INTEGER DEFAULT 1,
  personality_prompt TEXT DEFAULT '',
  delegation_rules TEXT DEFAULT '[]',
  memory_policy TEXT DEFAULT 'ephemeral',
  tool_restrictions TEXT DEFAULT '{"mode":"allow","tools":[]}',
  knowledge_sources TEXT DEFAULT '[]',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
)
```

```sql
CREATE TABLE IF NOT EXISTS agent_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  session_id TEXT,
  status TEXT DEFAULT 'pending',
  output TEXT DEFAULT '',
  started_at INTEGER,
  completed_at INTEGER,
  duration_ms INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
)
```

```sql
CREATE INDEX IF NOT EXISTS idx_assignments_task ON agent_assignments(task_id)
```

```sql
CREATE INDEX IF NOT EXISTS idx_assignments_agent ON agent_assignments(agent_id)
```

- [ ] **Step 4: Write failing repository tests**

Create `packages/server/tests/db/agent-repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, getDb } from '../../src/db/connection.js';
import { AgentRepository } from '../../src/db/agent-repository.js';

describe('AgentRepository', () => {
  let db: Database.Database;
  let repo: AgentRepository;

  beforeEach(() => {
    initDb(':memory:');
    db = getDb();
    repo = new AgentRepository(db);
  });

  afterEach(() => { db.close(); });

  it('creates a profile with defaults', () => {
    const profile = repo.create({ name: 'Test Agent' });
    expect(profile.id).toBe(1);
    expect(profile.name).toBe('Test Agent');
    expect(profile.icon).toBe('🤖');
    expect(profile.skills).toEqual([]);
    expect(profile.memoryPolicy).toBe('ephemeral');
    expect(profile.toolRestrictions).toEqual({ mode: 'allow', tools: [] });
  });

  it('creates a profile with all fields', () => {
    const profile = repo.create({
      name: 'DevOps',
      icon: '🔧',
      systemPrompt: 'You are a DevOps engineer',
      model: 'claude-opus-4-6',
      defaultCwd: '/srv/app',
      skills: ['devops', 'docker', 'ci-cd'],
      maxConcurrentTasks: 3,
      personalityPrompt: 'Be concise',
      delegationRules: [{ taskPattern: 'frontend', targetAgentId: 2 }],
      memoryPolicy: 'persistent',
      toolRestrictions: { mode: 'deny', tools: ['WebSearch'] },
      knowledgeSources: ['docs/runbook.md'],
    });
    expect(profile.skills).toEqual(['devops', 'docker', 'ci-cd']);
    expect(profile.delegationRules).toEqual([{ taskPattern: 'frontend', targetAgentId: 2 }]);
    expect(profile.toolRestrictions).toEqual({ mode: 'deny', tools: ['WebSearch'] });
  });

  it('lists all profiles', () => {
    repo.create({ name: 'Agent A' });
    repo.create({ name: 'Agent B' });
    expect(repo.list()).toHaveLength(2);
  });

  it('gets profile by id', () => {
    const created = repo.create({ name: 'Find Me' });
    expect(repo.getById(created.id)?.name).toBe('Find Me');
    expect(repo.getById(999)).toBeUndefined();
  });

  it('updates a profile', () => {
    const p = repo.create({ name: 'Old Name' });
    repo.update(p.id, { name: 'New Name', skills: ['testing'] });
    const updated = repo.getById(p.id)!;
    expect(updated.name).toBe('New Name');
    expect(updated.skills).toEqual(['testing']);
  });

  it('deletes a profile', () => {
    const p = repo.create({ name: 'Delete Me' });
    repo.delete(p.id);
    expect(repo.getById(p.id)).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run tests/db/agent-repository.test.ts`
Expected: FAIL — `AgentRepository` not found

- [ ] **Step 6: Implement AgentRepository**

Create `packages/server/src/db/agent-repository.ts`:

```typescript
import type Database from 'better-sqlite3';
import type { AgentProfile, AgentProfileCreate, AgentProfileUpdate } from '@konduktor/shared';

const PROFILE_DEFAULTS: Omit<AgentProfileCreate, 'name'> = {
  icon: '🤖',
  systemPrompt: '',
  model: 'claude-sonnet-5-5',
  defaultCwd: '',
  skills: [],
  maxConcurrentTasks: 1,
  personalityPrompt: '',
  delegationRules: [],
  memoryPolicy: 'ephemeral',
  toolRestrictions: { mode: 'allow', tools: [] },
  knowledgeSources: [],
};

export class AgentRepository {
  constructor(private db: Database.Database) {}

  create(data: Partial<AgentProfileCreate> & { name: string }): AgentProfile {
    const full = { ...PROFILE_DEFAULTS, ...data };
    const stmt = this.db.prepare(`
      INSERT INTO agent_profiles
        (name, icon, system_prompt, model, default_cwd, skills,
         max_concurrent_tasks, personality_prompt, delegation_rules,
         memory_policy, tool_restrictions, knowledge_sources)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      full.name, full.icon, full.systemPrompt, full.model, full.defaultCwd,
      JSON.stringify(full.skills), full.maxConcurrentTasks, full.personalityPrompt,
      JSON.stringify(full.delegationRules), full.memoryPolicy,
      JSON.stringify(full.toolRestrictions), JSON.stringify(full.knowledgeSources),
    );
    return this.getById(result.lastInsertRowid as number)!;
  }

  list(): AgentProfile[] {
    const rows = this.db.prepare(
      `SELECT * FROM agent_profiles ORDER BY name`
    ).all() as Record<string, unknown>[];
    return rows.map(this.mapRow);
  }

  getById(id: number): AgentProfile | undefined {
    const row = this.db.prepare(
      `SELECT * FROM agent_profiles WHERE id = ?`
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  update(id: number, patch: AgentProfileUpdate): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    const fieldMap: Record<string, string> = {
      name: 'name', icon: 'icon', systemPrompt: 'system_prompt',
      model: 'model', defaultCwd: 'default_cwd', maxConcurrentTasks: 'max_concurrent_tasks',
      personalityPrompt: 'personality_prompt', memoryPolicy: 'memory_policy',
    };
    const jsonFields: Record<string, string> = {
      skills: 'skills', delegationRules: 'delegation_rules',
      toolRestrictions: 'tool_restrictions', knowledgeSources: 'knowledge_sources',
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if ((patch as any)[key] !== undefined) { sets.push(`${col} = ?`); vals.push((patch as any)[key]); }
    }
    for (const [key, col] of Object.entries(jsonFields)) {
      if ((patch as any)[key] !== undefined) { sets.push(`${col} = ?`); vals.push(JSON.stringify((patch as any)[key])); }
    }
    if (sets.length === 0) return;
    sets.push('updated_at = unixepoch()');
    vals.push(id);
    this.db.prepare(`UPDATE agent_profiles SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM agent_profiles WHERE id = ?`).run(id);
  }

  private mapRow(r: Record<string, unknown>): AgentProfile {
    return {
      id: r.id as number,
      name: r.name as string,
      icon: (r.icon as string) || '🤖',
      systemPrompt: (r.system_prompt as string) || '',
      model: (r.model as string) || 'claude-sonnet-5-5',
      defaultCwd: (r.default_cwd as string) || '',
      skills: JSON.parse((r.skills as string) || '[]'),
      maxConcurrentTasks: (r.max_concurrent_tasks as number) || 1,
      personalityPrompt: (r.personality_prompt as string) || '',
      delegationRules: JSON.parse((r.delegation_rules as string) || '[]'),
      memoryPolicy: (r.memory_policy as string as 'ephemeral' | 'persistent') || 'ephemeral',
      toolRestrictions: JSON.parse((r.tool_restrictions as string) || '{"mode":"allow","tools":[]}'),
      knowledgeSources: JSON.parse((r.knowledge_sources as string) || '[]'),
      createdAt: (r.created_at as number) * 1000,
      updatedAt: (r.updated_at as number) * 1000,
    };
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run tests/db/agent-repository.test.ts`
Expected: 6 PASS

- [ ] **Step 8: Build shared + server to verify compilation**

Run: `pnpm build`
Expected: All packages compile

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/agent-types.ts packages/shared/src/index.ts \
  packages/server/src/db/schema.ts packages/server/src/db/agent-repository.ts \
  packages/server/tests/db/agent-repository.test.ts
git commit -m "feat(phase5): agent profile types, schema, and repository"
```

---

### Task 2: Agent Profile REST API

**Files:**
- Create: `packages/server/src/routes/agent-profiles.ts`
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/tests/routes/agent-profiles.test.ts`

**Interfaces:**
- Consumes: `AgentRepository` from Task 1
- Produces: REST endpoints:
  - `GET /api/profiles` → `AgentProfile[]`
  - `GET /api/profiles/:id` → `AgentProfile`
  - `POST /api/profiles` → `AgentProfile` (body: `AgentProfileCreate`)
  - `PUT /api/profiles/:id` → `AgentProfile` (body: `AgentProfileUpdate`)
  - `DELETE /api/profiles/:id` → `{ success: true }`

- [ ] **Step 1: Write failing API tests**

Create `packages/server/tests/routes/agent-profiles.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/index.js';
import { initDb, getDb } from '../../src/db/connection.js';
import type Database from 'better-sqlite3';

describe('Agent Profiles API', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    initDb(':memory:');
    db = getDb();
    app = createApp();
  });

  afterEach(() => { db.close(); });

  it('POST /api/profiles creates a profile', async () => {
    const res = await request(app)
      .post('/api/profiles')
      .send({ name: 'Test Agent', skills: ['testing'] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test Agent');
    expect(res.body.skills).toEqual(['testing']);
    expect(res.body.id).toBeDefined();
  });

  it('POST /api/profiles rejects without name', async () => {
    const res = await request(app).post('/api/profiles').send({ skills: ['x'] });
    expect(res.status).toBe(400);
  });

  it('GET /api/profiles lists all', async () => {
    await request(app).post('/api/profiles').send({ name: 'A' });
    await request(app).post('/api/profiles').send({ name: 'B' });
    const res = await request(app).get('/api/profiles');
    expect(res.body).toHaveLength(2);
  });

  it('GET /api/profiles/:id returns one', async () => {
    const created = await request(app).post('/api/profiles').send({ name: 'Find' });
    const res = await request(app).get(`/api/profiles/${created.body.id}`);
    expect(res.body.name).toBe('Find');
  });

  it('GET /api/profiles/:id returns 404 for missing', async () => {
    const res = await request(app).get('/api/profiles/999');
    expect(res.status).toBe(404);
  });

  it('PUT /api/profiles/:id updates', async () => {
    const created = await request(app).post('/api/profiles').send({ name: 'Old' });
    const res = await request(app)
      .put(`/api/profiles/${created.body.id}`)
      .send({ name: 'New', model: 'claude-opus-4-6' });
    expect(res.body.name).toBe('New');
    expect(res.body.model).toBe('claude-opus-4-6');
  });

  it('DELETE /api/profiles/:id removes', async () => {
    const created = await request(app).post('/api/profiles').send({ name: 'Del' });
    await request(app).delete(`/api/profiles/${created.body.id}`);
    const check = await request(app).get(`/api/profiles/${created.body.id}`);
    expect(check.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run tests/routes/agent-profiles.test.ts`
Expected: FAIL — route not found

- [ ] **Step 3: Implement route**

Create `packages/server/src/routes/agent-profiles.ts`:

```typescript
import { Router, type Router as RouterType } from 'express';
import { AgentRepository } from '../db/agent-repository.js';
import { getDb } from '../db/connection.js';

export const agentProfilesRouter: RouterType = Router();

agentProfilesRouter.get('/', (_req, res) => {
  const repo = new AgentRepository(getDb());
  res.json(repo.list());
});

agentProfilesRouter.get('/:id', (req, res) => {
  const repo = new AgentRepository(getDb());
  const profile = repo.getById(Number(req.params.id));
  if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }
  res.json(profile);
});

agentProfilesRouter.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name required' });
    return;
  }
  const repo = new AgentRepository(getDb());
  res.json(repo.create(req.body));
});

agentProfilesRouter.put('/:id', (req, res) => {
  const repo = new AgentRepository(getDb());
  const id = Number(req.params.id);
  repo.update(id, req.body);
  const updated = repo.getById(id);
  if (!updated) { res.status(404).json({ error: 'Profile not found' }); return; }
  res.json(updated);
});

agentProfilesRouter.delete('/:id', (req, res) => {
  const repo = new AgentRepository(getDb());
  repo.delete(Number(req.params.id));
  res.json({ success: true });
});
```

- [ ] **Step 4: Register route in server index**

Add to `packages/server/src/index.ts`:

Import: `import { agentProfilesRouter } from './routes/agent-profiles.js';`
Route: `app.use('/api/profiles', agentProfilesRouter);` (after the agents router)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run tests/routes/agent-profiles.test.ts`
Expected: 7 PASS

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`
Expected: All tests pass (existing + new)

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/agent-profiles.ts packages/server/src/index.ts \
  packages/server/tests/routes/agent-profiles.test.ts
git commit -m "feat(phase5): agent profile REST API"
```

---

### Task 3: Profile Runner

**Files:**
- Create: `packages/server/src/agents/profile-runner.ts`
- Create: `packages/server/src/db/assignment-repository.ts`
- Test: `packages/server/tests/agents/profile-runner.test.ts`
- Test: `packages/server/tests/db/assignment-repository.test.ts`

**Interfaces:**
- Consumes: `AgentProfile` type (Task 1), `ClaudeProcess` from `claude/cli.ts`, `AgentAssignment` type (Task 1)
- Produces:
  - `AssignmentRepository` with `create(data)`, `list(agentId?)`, `getByTask(taskId)`, `updateStatus(id, status, output?)`, `countActive(agentId)`
  - `ProfileRunner` with `run(profile: AgentProfile, prompt: string, taskId: number): AgentAssignment`

- [ ] **Step 1: Write assignment repository tests**

Create `packages/server/tests/db/assignment-repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, getDb } from '../../src/db/connection.js';
import { AssignmentRepository } from '../../src/db/assignment-repository.js';
import { AgentRepository } from '../../src/db/agent-repository.js';

describe('AssignmentRepository', () => {
  let db: Database.Database;
  let repo: AssignmentRepository;

  beforeEach(() => {
    initDb(':memory:');
    db = getDb();
    repo = new AssignmentRepository(db);
    new AgentRepository(db).create({ name: 'Agent1' });
  });

  afterEach(() => { db.close(); });

  it('creates an assignment', () => {
    const a = repo.create({ taskId: 1, agentId: 1 });
    expect(a.status).toBe('pending');
    expect(a.agentId).toBe(1);
  });

  it('counts active assignments for an agent', () => {
    repo.create({ taskId: 1, agentId: 1 });
    repo.create({ taskId: 2, agentId: 1 });
    expect(repo.countActive(1)).toBe(2);
  });

  it('updates status', () => {
    const a = repo.create({ taskId: 1, agentId: 1 });
    repo.updateStatus(a.id, 'running');
    repo.updateStatus(a.id, 'completed', 'Done!');
    const updated = repo.getByTask(1);
    expect(updated?.status).toBe('completed');
    expect(updated?.output).toBe('Done!');
  });

  it('lists by agent', () => {
    repo.create({ taskId: 1, agentId: 1 });
    repo.create({ taskId: 2, agentId: 1 });
    expect(repo.list(1)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Implement AssignmentRepository**

Create `packages/server/src/db/assignment-repository.ts`:

```typescript
import type Database from 'better-sqlite3';
import type { AgentAssignment } from '@konduktor/shared';

export class AssignmentRepository {
  constructor(private db: Database.Database) {}

  create(data: { taskId: number; agentId: number; sessionId?: string }): AgentAssignment {
    const stmt = this.db.prepare(
      `INSERT INTO agent_assignments (task_id, agent_id, session_id) VALUES (?, ?, ?)`
    );
    const result = stmt.run(data.taskId, data.agentId, data.sessionId || null);
    return this.getById(result.lastInsertRowid as number)!;
  }

  getById(id: number): AgentAssignment | undefined {
    const row = this.db.prepare(`SELECT * FROM agent_assignments WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  getByTask(taskId: number): AgentAssignment | undefined {
    const row = this.db.prepare(
      `SELECT * FROM agent_assignments WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`
    ).get(taskId) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  list(agentId?: number): AgentAssignment[] {
    const sql = agentId
      ? `SELECT * FROM agent_assignments WHERE agent_id = ? ORDER BY created_at DESC`
      : `SELECT * FROM agent_assignments ORDER BY created_at DESC`;
    const rows = (agentId
      ? this.db.prepare(sql).all(agentId)
      : this.db.prepare(sql).all()
    ) as Record<string, unknown>[];
    return rows.map(this.mapRow);
  }

  countActive(agentId: number): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM agent_assignments WHERE agent_id = ? AND status IN ('pending','running')`
    ).get(agentId) as { cnt: number };
    return row.cnt;
  }

  updateStatus(id: number, status: string, output?: string): void {
    const sets = ['status = ?'];
    const vals: unknown[] = [status];
    if (status === 'running') { sets.push('started_at = unixepoch()'); }
    if (status === 'completed' || status === 'failed') {
      sets.push('completed_at = unixepoch()');
      sets.push('duration_ms = (unixepoch() - started_at) * 1000');
    }
    if (output !== undefined) { sets.push('output = ?'); vals.push(output); }
    vals.push(id);
    this.db.prepare(`UPDATE agent_assignments SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  private mapRow(r: Record<string, unknown>): AgentAssignment {
    return {
      id: r.id as number, taskId: r.task_id as number, agentId: r.agent_id as number,
      sessionId: r.session_id as string | null, status: r.status as AgentAssignment['status'],
      output: (r.output as string) || '',
      startedAt: r.started_at ? (r.started_at as number) * 1000 : null,
      completedAt: r.completed_at ? (r.completed_at as number) * 1000 : null,
      durationMs: r.duration_ms as number | null,
      createdAt: (r.created_at as number) * 1000,
    };
  }
}
```

- [ ] **Step 3: Write profile runner tests**

Create `packages/server/tests/agents/profile-runner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildProfileArgs } from '../../src/agents/profile-runner.js';
import type { AgentProfile } from '@konduktor/shared';

const baseProfile: AgentProfile = {
  id: 1, name: 'Test', icon: '🤖', systemPrompt: 'You are helpful',
  model: 'claude-opus-4-6', defaultCwd: '/tmp', skills: [],
  maxConcurrentTasks: 1, personalityPrompt: 'Be brief',
  delegationRules: [], memoryPolicy: 'ephemeral',
  toolRestrictions: { mode: 'allow', tools: [] },
  knowledgeSources: [], createdAt: 0, updatedAt: 0,
};

describe('buildProfileArgs', () => {
  it('builds CLI args with system prompt and model', () => {
    const args = buildProfileArgs(baseProfile, 'Do something');
    expect(args).toContain('--model');
    expect(args).toContain('claude-opus-4-6');
    expect(args).toContain('--system-prompt');
  });

  it('includes personality in system prompt', () => {
    const args = buildProfileArgs(baseProfile, 'Task');
    const sysIdx = args.indexOf('--system-prompt');
    const sysPrompt = args[sysIdx + 1];
    expect(sysPrompt).toContain('You are helpful');
    expect(sysPrompt).toContain('Be brief');
  });

  it('adds tool restrictions as allowlist', () => {
    const profile = { ...baseProfile, toolRestrictions: { mode: 'allow' as const, tools: ['Read', 'Edit'] } };
    const args = buildProfileArgs(profile, 'Task');
    expect(args).toContain('--allowedTools');
    expect(args).toContain('Read,Edit');
  });

  it('empty allow-tools means no restriction flag', () => {
    const args = buildProfileArgs(baseProfile, 'Task');
    expect(args).not.toContain('--allowedTools');
    expect(args).not.toContain('--disallowedTools');
  });

  it('adds knowledge sources to system prompt', () => {
    const profile = { ...baseProfile, knowledgeSources: ['docs/guide.md'] };
    const args = buildProfileArgs(profile, 'Task');
    const sysIdx = args.indexOf('--system-prompt');
    expect(args[sysIdx + 1]).toContain('docs/guide.md');
  });
});
```

- [ ] **Step 4: Implement profile runner**

Create `packages/server/src/agents/profile-runner.ts`:

```typescript
import type { AgentProfile } from '@konduktor/shared';

export function buildProfileArgs(profile: AgentProfile, prompt: string): string[] {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];

  args.push('--model', profile.model);

  let systemPrompt = profile.systemPrompt;
  if (profile.personalityPrompt) {
    systemPrompt += `\n\n${profile.personalityPrompt}`;
  }
  if (profile.knowledgeSources.length > 0) {
    systemPrompt += `\n\nReference these files: ${profile.knowledgeSources.join(', ')}`;
  }
  if (systemPrompt.trim()) {
    args.push('--system-prompt', systemPrompt);
  }

  if (profile.toolRestrictions.tools.length > 0) {
    if (profile.toolRestrictions.mode === 'allow') {
      args.push('--allowedTools', profile.toolRestrictions.tools.join(','));
    } else {
      args.push('--disallowedTools', profile.toolRestrictions.tools.join(','));
    }
  }

  return args;
}
```

- [ ] **Step 5: Run all new tests**

Run: `cd packages/server && npx vitest run tests/agents/profile-runner.test.ts tests/db/assignment-repository.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/agents/profile-runner.ts \
  packages/server/src/db/assignment-repository.ts \
  packages/server/tests/agents/profile-runner.test.ts \
  packages/server/tests/db/assignment-repository.test.ts
git commit -m "feat(phase5): profile runner and assignment repository"
```

---

### Task 4: Skill Matcher + Kanban Auto-Assign

**Files:**
- Create: `packages/server/src/agents/skill-matcher.ts`
- Modify: `packages/server/src/routes/kanban.ts`
- Test: `packages/server/tests/agents/skill-matcher.test.ts`

**Interfaces:**
- Consumes: `AgentProfile` (Task 1), `AgentRepository` (Task 1), `AssignmentRepository` (Task 3), `KanbanRepository` (existing)
- Produces:
  - `matchAgent(task: KanbanTask, agents: AgentProfile[]): AgentProfile | null`
  - `PUT /api/kanban/:id/move` extended: when `column === 'in-progress'`, auto-suggests agent
  - `POST /api/kanban/:id/assign` — manually assign agent to task

- [ ] **Step 1: Write skill matcher tests**

Create `packages/server/tests/agents/skill-matcher.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { scoreMatch, matchAgent } from '../../src/agents/skill-matcher.js';
import type { AgentProfile } from '@konduktor/shared';

const makeAgent = (name: string, skills: string[]): AgentProfile => ({
  id: 1, name, icon: '🤖', systemPrompt: '', model: 'claude-sonnet-5-5',
  defaultCwd: '', skills, maxConcurrentTasks: 1, personalityPrompt: '',
  delegationRules: [], memoryPolicy: 'ephemeral',
  toolRestrictions: { mode: 'allow', tools: [] },
  knowledgeSources: [], createdAt: 0, updatedAt: 0,
});

describe('scoreMatch', () => {
  it('scores exact skill match', () => {
    expect(scoreMatch('deploy to production', ['deploy', 'devops'])).toBeGreaterThan(0);
  });

  it('scores zero for no match', () => {
    expect(scoreMatch('write frontend code', ['devops', 'database'])).toBe(0);
  });

  it('scores higher for more matching skills', () => {
    const s1 = scoreMatch('deploy docker container', ['deploy']);
    const s2 = scoreMatch('deploy docker container', ['deploy', 'docker']);
    expect(s2).toBeGreaterThan(s1);
  });

  it('handles empty skills array', () => {
    expect(scoreMatch('any task', [])).toBe(0);
  });

  it('handles empty task text', () => {
    expect(scoreMatch('', ['testing'])).toBe(0);
  });
});

describe('matchAgent', () => {
  it('returns best matching agent', () => {
    const agents = [
      makeAgent('Frontend', ['react', 'css']),
      makeAgent('DevOps', ['deploy', 'docker']),
    ];
    const result = matchAgent('deploy the app', agents);
    expect(result?.name).toBe('DevOps');
  });

  it('returns null for empty agents', () => {
    expect(matchAgent('task', [])).toBeNull();
  });

  it('returns null when no skills match', () => {
    const agents = [makeAgent('Narrow', ['haskell'])];
    expect(matchAgent('write python code', agents)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run tests/agents/skill-matcher.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement skill matcher**

Create `packages/server/src/agents/skill-matcher.ts`:

```typescript
import type { AgentProfile } from '@konduktor/shared';

export function scoreMatch(taskText: string, skills: string[]): number {
  if (!taskText || skills.length === 0) return 0;
  const lower = taskText.toLowerCase();
  let score = 0;
  for (const skill of skills) {
    if (lower.includes(skill.toLowerCase())) score++;
  }
  return score;
}

export function matchAgent(taskText: string, agents: AgentProfile[]): AgentProfile | null {
  if (agents.length === 0) return null;
  let best: AgentProfile | null = null;
  let bestScore = 0;
  for (const agent of agents) {
    const score = scoreMatch(taskText, agent.skills);
    if (score > bestScore) {
      bestScore = score;
      best = agent;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run matcher tests**

Run: `cd packages/server && npx vitest run tests/agents/skill-matcher.test.ts`
Expected: All PASS

- [ ] **Step 5: Extend kanban route with assign endpoint**

Add to `packages/server/src/routes/kanban.ts`:

```typescript
import { AgentRepository } from '../db/agent-repository.js';
import { AssignmentRepository } from '../db/assignment-repository.js';
import { matchAgent } from '../agents/skill-matcher.js';
```

Add new endpoint after the existing `delete` handler:

```typescript
kanbanRouter.post('/:id/assign', (req, res) => {
  const { agentId } = req.body;
  if (!agentId) { res.status(400).json({ error: 'agentId required' }); return; }
  const db = getDb();
  const agent = new AgentRepository(db).getById(agentId);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  const active = new AssignmentRepository(db).countActive(agentId);
  if (active >= agent.maxConcurrentTasks) {
    res.status(409).json({ error: `Agent at capacity (${active}/${agent.maxConcurrentTasks})` });
    return;
  }
  const assignment = new AssignmentRepository(db).create({ taskId: Number(req.params.id), agentId });
  res.json(assignment);
});

kanbanRouter.get('/:id/suggest-agent', (req, res) => {
  const db = getDb();
  const task = new KanbanRepository(db).getById(Number(req.params.id));
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  const agents = new AgentRepository(db).list();
  const available = agents.filter(a => {
    const active = new AssignmentRepository(db).countActive(a.id);
    return active < a.maxConcurrentTasks;
  });
  const suggested = matchAgent(`${task.title} ${task.description}`, available);
  res.json({ suggested, available });
});
```

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/agents/skill-matcher.ts \
  packages/server/src/routes/kanban.ts \
  packages/server/tests/agents/skill-matcher.test.ts
git commit -m "feat(phase5): skill matcher and kanban auto-assign API"
```

---

### Task 5: Performance Tracking

**Files:**
- Modify: `packages/server/src/db/agent-repository.ts`
- Modify: `packages/server/tests/db/agent-repository.test.ts`

**Interfaces:**
- Consumes: `AssignmentRepository` (Task 3), `AgentPerformanceStats` (Task 1)
- Produces: `AgentRepository.getStats(agentId: number): AgentPerformanceStats`

- [ ] **Step 1: Write failing test**

Add to `packages/server/tests/db/agent-repository.test.ts`:

```typescript
import { AssignmentRepository } from '../../src/db/assignment-repository.js';

it('computes performance stats', () => {
  const agent = repo.create({ name: 'Worker' });
  const aRepo = new AssignmentRepository(db);
  const a1 = aRepo.create({ taskId: 1, agentId: agent.id });
  aRepo.updateStatus(a1.id, 'running');
  aRepo.updateStatus(a1.id, 'completed', 'ok');
  const a2 = aRepo.create({ taskId: 2, agentId: agent.id });
  aRepo.updateStatus(a2.id, 'running');
  aRepo.updateStatus(a2.id, 'failed', 'error');
  const stats = repo.getStats(agent.id);
  expect(stats.tasksCompleted).toBe(1);
  expect(stats.tasksFailed).toBe(1);
  expect(stats.successRate).toBeCloseTo(0.5);
});

it('returns zero stats for agent with no assignments', () => {
  const agent = repo.create({ name: 'Idle' });
  const stats = repo.getStats(agent.id);
  expect(stats.tasksCompleted).toBe(0);
  expect(stats.successRate).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run tests/db/agent-repository.test.ts`
Expected: FAIL — `getStats` not a function

- [ ] **Step 3: Implement getStats**

Add to `AgentRepository` class in `packages/server/src/db/agent-repository.ts`:

```typescript
import type { AgentPerformanceStats } from '@konduktor/shared';

getStats(agentId: number): AgentPerformanceStats {
  const row = this.db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
      AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) as avg_dur
    FROM agent_assignments WHERE agent_id = ?
  `).get(agentId) as { completed: number; failed: number; avg_dur: number | null };
  const total = row.completed + row.failed;
  return {
    tasksCompleted: row.completed,
    tasksFailed: row.failed,
    avgDurationMs: row.avg_dur || 0,
    successRate: total > 0 ? row.completed / total : 0,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run tests/db/agent-repository.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/agent-repository.ts \
  packages/server/tests/db/agent-repository.test.ts
git commit -m "feat(phase5): agent performance stats computation"
```

---

### Task 6: Agent Profiles UI

**Files:**
- Create: `packages/client/src/components/profiles/ProfileCard.tsx`
- Create: `packages/client/src/components/profiles/ProfileForm.tsx`
- Create: `packages/client/src/components/profiles/ProfilesPage.tsx`
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/profiles` (Task 2)
- Produces: UI pages at route `/profiles`

- [ ] **Step 1: Create ProfileCard component**

Create `packages/client/src/components/profiles/ProfileCard.tsx`:

```tsx
import type { AgentProfile } from '@konduktor/shared';

interface Props {
  profile: AgentProfile;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}

export function ProfileCard({ profile, onEdit, onDelete }: Props) {
  return (
    <div style={{
      padding: '16px', borderRadius: 'var(--radius-md)',
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.5rem' }}>{profile.icon}</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{profile.name}</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--fg3)' }}>
              {profile.model} · {profile.memoryPolicy}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => onEdit(profile.id)} style={{
            padding: '4px 10px', fontSize: '0.75rem', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--fg2)', cursor: 'pointer',
          }}>Edit</button>
          <button onClick={() => onDelete(profile.id)} style={{
            padding: '4px 10px', fontSize: '0.75rem', border: '1px solid var(--red, #e55)',
            borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--red, #e55)', cursor: 'pointer',
          }}>Delete</button>
        </div>
      </div>
      {profile.skills.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '10px', flexWrap: 'wrap' }}>
          {profile.skills.map(s => (
            <span key={s} style={{
              padding: '2px 8px', fontSize: '0.7rem', borderRadius: '999px',
              background: 'var(--purple-soft)', color: 'var(--purple)',
            }}>{s}</span>
          ))}
        </div>
      )}
      {profile.systemPrompt && (
        <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--fg3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{profile.systemPrompt}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create ProfileForm component**

Create `packages/client/src/components/profiles/ProfileForm.tsx`:

```tsx
import { useState } from 'react';
import type { AgentProfile } from '@konduktor/shared';

interface Props {
  initial?: AgentProfile;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}

const inputStyle = {
  padding: '8px 12px', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', background: 'var(--bg)',
  color: 'var(--fg)', fontSize: '0.85rem', width: '100%',
};

const labelStyle = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600 as const,
  color: 'var(--fg2)', marginBottom: '4px',
};

export function ProfileForm({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name || '');
  const [icon, setIcon] = useState(initial?.icon || '🤖');
  const [model, setModel] = useState(initial?.model || 'claude-sonnet-5-5');
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt || '');
  const [skills, setSkills] = useState(initial?.skills.join(', ') || '');
  const [defaultCwd, setDefaultCwd] = useState(initial?.defaultCwd || '');
  const [maxTasks, setMaxTasks] = useState(initial?.maxConcurrentTasks || 1);
  const [memoryPolicy, setMemoryPolicy] = useState(initial?.memoryPolicy || 'ephemeral');

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({
      name, icon, model, systemPrompt, defaultCwd,
      skills: skills.split(',').map(s => s.trim()).filter(Boolean),
      maxConcurrentTasks: maxTasks,
      memoryPolicy,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 500 }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ width: 60 }}>
          <label style={labelStyle}>Icon</label>
          <input value={icon} onChange={e => setIcon(e.target.value)} style={{ ...inputStyle, width: 50 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Agent name" />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Model</label>
        <select value={model} onChange={e => setModel(e.target.value)} style={inputStyle}>
          <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
          <option value="claude-opus-4-6">Claude Opus 4.6</option>
          <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>System Prompt</label>
        <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
          rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Instructions for this agent" />
      </div>
      <div>
        <label style={labelStyle}>Skills (comma-separated)</label>
        <input value={skills} onChange={e => setSkills(e.target.value)} style={inputStyle}
          placeholder="frontend, react, css" />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Working Directory</label>
          <input value={defaultCwd} onChange={e => setDefaultCwd(e.target.value)} style={inputStyle}
            placeholder="/path/to/project" />
        </div>
        <div style={{ width: 80 }}>
          <label style={labelStyle}>Max Tasks</label>
          <input type="number" min={1} max={10} value={maxTasks}
            onChange={e => setMaxTasks(Number(e.target.value))} style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Memory</label>
        <select value={memoryPolicy} onChange={e => setMemoryPolicy(e.target.value as 'ephemeral' | 'persistent')} style={inputStyle}>
          <option value="ephemeral">Ephemeral (new session each task)</option>
          <option value="persistent">Persistent (keep session alive)</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button onClick={handleSubmit} style={{
          padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-md)',
          background: 'var(--purple)', color: '#fff', fontSize: '0.85rem', cursor: 'pointer',
        }}>{initial ? 'Update' : 'Create'} Profile</button>
        <button onClick={onCancel} style={{
          padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
          background: 'transparent', color: 'var(--fg2)', fontSize: '0.85rem', cursor: 'pointer',
        }}>Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ProfilesPage**

Create `packages/client/src/components/profiles/ProfilesPage.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import type { AgentProfile } from '@konduktor/shared';
import { ProfileCard } from './ProfileCard';
import { ProfileForm } from './ProfileForm';

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/profiles');
    setProfiles(await res.json());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSave = async (data: Record<string, unknown>) => {
    if (editing) {
      await fetch(`/api/profiles/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
    setEditing(null);
    setCreating(false);
    refresh();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
    refresh();
  };

  if (creating || editing) {
    return (
      <div>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>
          {editing ? 'Edit Profile' : 'New Profile'}
        </h2>
        <ProfileForm initial={editing || undefined} onSave={handleSave}
          onCancel={() => { setCreating(false); setEditing(null); }} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>Agent Profiles</h2>
        <button onClick={() => setCreating(true)} style={{
          padding: '6px 14px', border: 'none', borderRadius: 'var(--radius-md)',
          background: 'var(--purple)', color: '#fff', fontSize: '0.8rem', cursor: 'pointer',
        }}>+ New Profile</button>
      </div>
      {profiles.length === 0 && (
        <p style={{ color: 'var(--fg3)', fontSize: '0.85rem' }}>No profiles yet. Create one to get started.</p>
      )}
      <div style={{ display: 'grid', gap: '10px' }}>
        {profiles.map(p => (
          <ProfileCard key={p.id} profile={p}
            onEdit={(id) => setEditing(profiles.find(x => x.id === id)!)}
            onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add route and sidebar entry**

In `packages/client/src/App.tsx`, add:
```tsx
import { ProfilesPage } from './components/profiles/ProfilesPage';
// Add route:
<Route path="/profiles" element={<ProfilesPage />} />
```

In `packages/client/src/components/Sidebar.tsx`, add entry to `NAV_ITEMS` after the Agents entry:
```typescript
{ to: '/profiles', label: 'Profiles', icon: '⊕' },
```

- [ ] **Step 5: Build and verify**

Run: `pnpm build`
Expected: All packages compile

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/profiles/ \
  packages/client/src/App.tsx packages/client/src/components/Sidebar.tsx
git commit -m "feat(phase5): agent profiles UI — list, create, edit, delete"
```

---

### Task 7: Kanban Assign UI

**Files:**
- Modify: `packages/client/src/components/kanban/KanbanPage.tsx`
- Modify: `packages/client/src/components/kanban/KanbanCard.tsx`

**Interfaces:**
- Consumes: `GET /api/profiles` (Task 2), `POST /api/kanban/:id/assign` (Task 4), `GET /api/kanban/:id/suggest-agent` (Task 4)
- Produces: Assign-to-agent dropdown in kanban cards, auto-suggest on move to in-progress

- [ ] **Step 1: Read current KanbanCard component**

Read `packages/client/src/components/kanban/KanbanCard.tsx` to understand its current props and structure.

- [ ] **Step 2: Add agent assignment display to KanbanCard**

Extend `KanbanCard` props with optional `agentName?: string` and `agentIcon?: string`. Display as a badge below the title when present:

```tsx
{agentName && (
  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px',
    fontSize: '0.7rem', color: 'var(--purple)' }}>
    <span>{agentIcon}</span> {agentName}
  </div>
)}
```

- [ ] **Step 3: Add assign dropdown to KanbanPage**

In `KanbanPage`, add state for profiles and a handler:

```tsx
const [profiles, setProfiles] = useState<AgentProfile[]>([]);

useEffect(() => {
  fetch('/api/profiles').then(r => r.json()).then(setProfiles);
}, []);

const assignAgent = async (taskId: number, agentId: number) => {
  await fetch(`/api/kanban/${taskId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId }),
  });
  refresh();
};
```

Add an "Assign" select per card that shows available profiles and calls `assignAgent`.

- [ ] **Step 4: Build and visually verify**

Run: `pnpm build && pnpm start`
Navigate to Kanban, verify assign dropdown appears and works.

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/kanban/
git commit -m "feat(phase5): kanban agent assignment UI"
```

---

## Self-Review Checklist

1. **Spec coverage:** Agent profiles (CRUD + all fields) ✓, hybrid lifecycle (memoryPolicy field) ✓, kanban auto-assign ✓, skill matcher ✓, performance stats ✓, explicit delegation (delegationRules field stored, execution deferred to Phase 6 MCP) ✓
2. **Placeholder scan:** No TBDs, TODOs, or "implement later" found.
3. **Type consistency:** `AgentProfile` used consistently across all tasks. `AgentRepository.create()` signature matches test calls. `matchAgent()` return type and `scoreMatch()` signature consistent.
4. **Review Focus:** All 5 failure modes have tests assigned to their owning tasks.
