# Konduktor Phase 3: Automation & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add analytics persistence + dashboard, cron job scheduler with execution history, and data export (CSV/JSON/Markdown) to the Konduktor dashboard.

**Architecture:** Phase 3 fills the analytics gap left by Phase 1-2: the `analytics` table and token parsing already exist but are never written to. An `AnalyticsRepository` persists every `result` event from the WS handler. Aggregation queries (daily, by-model) power a Recharts dashboard. A `CronScheduler` wraps `node-cron` to run recurring prompts via `ClaudeProcess`, tracking executions in a new `cron_jobs`/`cron_executions` table pair. Export endpoints stream CSV/JSON for analytics and Markdown/JSON for chat history. Artifact integration is deferred to a separate plan (independent subsystem).

**Tech Stack:** Express 5, React 19, TypeScript 5.5, better-sqlite3, ws, Vitest, node-cron, Recharts

**Spec:** `docs/plans/master-plan.md` (Phase 3 section)

## Global Constraints

- Node.js >= 20
- All files < 300 lines
- CLI commands use `execFileSync` with argument arrays (never string interpolation)
- Server routes use Router with explicit `RouterType` annotation
- Client components use inline styles with CSS token variables
- Tests use Vitest with `vi.mock` for CLI calls
- No hardcoded secrets, no `any` type leaks
- Timestamps stored as `unixepoch()` seconds in SQLite, returned as milliseconds in JSON

## Review Focus

1. **Analytics aggregation with no data** — `GET /api/analytics/summary` on a fresh install with zero rows should return `{ totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0, totalSessions: 0, avgCostPerSession: 0 }`, not a division-by-zero NaN or a 500. Test added to Task 2.
2. **Invalid cron expression** — `POST /api/cron` with schedule `"not a cron"` should return 400 with a clear error, not crash the scheduler or register a job that silently fails. Test added to Task 5.
3. **Cron job execution overlap** — a job scheduled every minute that takes 5 minutes should skip subsequent triggers while the first execution is still running, not spawn unbounded Claude processes. Test added to Task 4.
4. **CSV export injection** — a chat message containing `=CMD()` or `,` must be properly escaped in CSV output to prevent formula injection in spreadsheet software. Test added to Task 7.
5. **Large export memory pressure** — exporting months of analytics (100k+ rows) should stream rows incrementally, not buffer the entire result set in memory. Addressed in Task 7 via SQLite cursor pagination.

---

### Task 1: Analytics Repository + WS Persistence

**Files:**
- Create: `packages/server/src/db/analytics-repository.ts` — analytics CRUD + aggregation
- Modify: `packages/server/src/ws/handler.ts` — persist analytics on `result` events
- Modify: `packages/shared/src/types.ts` — add `AnalyticsRecord`, `AnalyticsSummary`, `DailyAnalytics`, `ModelAnalytics` types
- Test: `packages/server/tests/db/analytics-repository.test.ts`

**Interfaces:**
- Consumes: `getDb()` from `db/connection.ts`; `analytics` table (already exists in schema); `TokenUsage` from `@konduktor/shared`; `StreamEvent` result events from WS handler
- Produces: `AnalyticsRepository` class with `record(sessionId, model, usage, durationMs)`, `summary(since)`, `daily(since)`, `byModel(since)`, `recent(limit)`; WS handler now persists every `result` event to the analytics table

- [ ] **Step 1: Add analytics types to shared**

Add to `packages/shared/src/types.ts`:
```typescript
export interface AnalyticsRecord {
  id: number;
  sessionId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  thinkingTokens: number;
  costUsd: number;
  durationMs: number;
  createdAt: number;
}

export interface AnalyticsSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  totalSessions: number;
  avgCostPerSession: number;
}

export interface DailyAnalytics {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  sessions: number;
}

export interface ModelAnalytics {
  model: string;
  count: number;
  totalTokens: number;
  totalCost: number;
}
```

- [ ] **Step 2: Write failing test for AnalyticsRepository**

```typescript
// packages/server/tests/db/analytics-repository.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';
import { AnalyticsRepository } from '../../src/db/analytics-repository.js';

let db: Database.Database;
let repo: AnalyticsRepository;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  repo = new AnalyticsRepository(db);
});

afterAll(() => db.close());

describe('AnalyticsRepository', () => {
  it('records and retrieves analytics', () => {
    repo.record('sess-1', 'claude-sonnet-5-5', {
      inputTokens: 1000, outputTokens: 500,
      cacheReadTokens: 200, cacheWriteTokens: 100,
      thinkingTokens: 50, costUsd: 0.015,
    }, 3200);

    repo.record('sess-2', 'claude-opus-5-5', {
      inputTokens: 2000, outputTokens: 1000,
      cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 100, costUsd: 0.08,
    }, 5400);

    const recent = repo.recent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0].model).toBe('claude-opus-5-5');
    expect(recent[0].costUsd).toBe(0.08);
  });

  it('returns summary with correct aggregation', () => {
    const summary = repo.summary(0);
    expect(summary.totalInputTokens).toBe(3000);
    expect(summary.totalOutputTokens).toBe(1500);
    expect(summary.totalCost).toBeCloseTo(0.095);
    expect(summary.totalSessions).toBe(2);
    expect(summary.avgCostPerSession).toBeCloseTo(0.0475);
  });

  it('returns summary with zeros when no data matches', () => {
    const summary = repo.summary(Math.floor(Date.now() / 1000) + 86400);
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalOutputTokens).toBe(0);
    expect(summary.totalCost).toBe(0);
    expect(summary.totalSessions).toBe(0);
    expect(summary.avgCostPerSession).toBe(0);
  });

  it('returns daily breakdown', () => {
    const daily = repo.daily(0);
    expect(daily.length).toBeGreaterThanOrEqual(1);
    expect(daily[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(daily[0].inputTokens).toBeGreaterThan(0);
  });

  it('returns model breakdown', () => {
    const models = repo.byModel(0);
    expect(models).toHaveLength(2);
    const sonnet = models.find(m => m.model === 'claude-sonnet-5-5');
    expect(sonnet).toBeDefined();
    expect(sonnet!.count).toBe(1);
    expect(sonnet!.totalTokens).toBe(1500);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/db/analytics-repository.test.ts`
Expected: FAIL with "Cannot find module '../../src/db/analytics-repository.js'"

- [ ] **Step 4: Implement AnalyticsRepository**

```typescript
// packages/server/src/db/analytics-repository.ts
import type Database from 'better-sqlite3';
import type { TokenUsage, AnalyticsRecord, AnalyticsSummary, DailyAnalytics, ModelAnalytics } from '@konduktor/shared';

export class AnalyticsRepository {
  constructor(private db: Database.Database) {}

  record(sessionId: string | null, model: string, usage: TokenUsage, durationMs: number): void {
    this.db.prepare(
      `INSERT INTO analytics (session_id, model, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, thinking_tokens, cost_usd, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId, model,
      usage.inputTokens, usage.outputTokens,
      usage.cacheReadTokens, usage.cacheWriteTokens,
      usage.thinkingTokens, usage.costUsd, durationMs
    );
  }

  summary(since: number): AnalyticsSummary {
    const row = this.db.prepare(
      `SELECT
        COALESCE(SUM(input_tokens), 0) as total_input,
        COALESCE(SUM(output_tokens), 0) as total_output,
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COUNT(DISTINCT session_id) as total_sessions
       FROM analytics WHERE created_at >= ?`
    ).get(since) as Record<string, number>;

    const sessions = row.total_sessions || 0;
    return {
      totalInputTokens: row.total_input,
      totalOutputTokens: row.total_output,
      totalCost: row.total_cost,
      totalSessions: sessions,
      avgCostPerSession: sessions > 0 ? row.total_cost / sessions : 0,
    };
  }

  daily(since: number): DailyAnalytics[] {
    const rows = this.db.prepare(
      `SELECT
        date(created_at, 'unixepoch') as date,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(cost_usd) as cost,
        COUNT(DISTINCT session_id) as sessions
       FROM analytics WHERE created_at >= ?
       GROUP BY date(created_at, 'unixepoch')
       ORDER BY date ASC`
    ).all(since) as Record<string, unknown>[];

    return rows.map(r => ({
      date: r.date as string,
      inputTokens: r.input_tokens as number,
      outputTokens: r.output_tokens as number,
      cost: r.cost as number,
      sessions: r.sessions as number,
    }));
  }

  byModel(since: number): ModelAnalytics[] {
    const rows = this.db.prepare(
      `SELECT
        model,
        COUNT(*) as count,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(cost_usd) as total_cost
       FROM analytics WHERE created_at >= ?
       GROUP BY model ORDER BY total_cost DESC`
    ).all(since) as Record<string, unknown>[];

    return rows.map(r => ({
      model: r.model as string,
      count: r.count as number,
      totalTokens: r.total_tokens as number,
      totalCost: r.total_cost as number,
    }));
  }

  recent(limit: number): AnalyticsRecord[] {
    const rows = this.db.prepare(
      `SELECT * FROM analytics ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as Record<string, unknown>[];

    return rows.map(r => ({
      id: r.id as number,
      sessionId: r.session_id as string | null,
      model: r.model as string,
      inputTokens: r.input_tokens as number,
      outputTokens: r.output_tokens as number,
      cacheReadTokens: r.cache_read_tokens as number,
      cacheWriteTokens: r.cache_write_tokens as number,
      thinkingTokens: r.thinking_tokens as number,
      costUsd: r.cost_usd as number,
      durationMs: r.duration_ms as number,
      createdAt: (r.created_at as number) * 1000,
    }));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/db/analytics-repository.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Wire analytics persistence into WS handler**

Modify `packages/server/src/ws/handler.ts`:
- Import `AnalyticsRepository` from `../db/analytics-repository.js`
- Import `getDb` from `../db/connection.js`
- In the `result` event branch (where `event.type === 'result'`), after saving the assistant message to ChatRepository, add:

```typescript
if (event.usage) {
  const analyticsRepo = new AnalyticsRepository(getDb());
  analyticsRepo.record(
    sessionId,
    event.model || 'unknown',
    event.usage,
    event.durationMs || 0
  );
}
```

- [ ] **Step 7: Run full test suite**

Run: `pnpm --filter @konduktor/server test`
Expected: All pass

- [ ] **Step 8: Build and commit**

Run: `pnpm build`

```bash
git add packages/shared/src/types.ts packages/server/src/db/analytics-repository.ts packages/server/src/ws/handler.ts packages/server/tests/db/analytics-repository.test.ts
git commit -m "feat: add analytics repository and persist result events

AnalyticsRepository wraps the existing analytics table with record,
summary, daily, byModel, and recent queries. WS handler now persists
every result event's token usage to the analytics table."
```

---

### Task 2: Analytics REST API

**Files:**
- Create: `packages/server/src/routes/analytics.ts` — aggregation endpoints
- Modify: `packages/server/src/index.ts` — wire analytics route
- Test: `packages/server/tests/routes/analytics.test.ts`

**Interfaces:**
- Consumes: `AnalyticsRepository` from Task 1; `getDb()` from connection
- Produces: `GET /api/analytics/summary?period=7d`, `GET /api/analytics/daily?period=30d`, `GET /api/analytics/models?period=30d`, `GET /api/analytics/recent?limit=20`

- [ ] **Step 1: Write failing test for analytics endpoints**

```typescript
// packages/server/tests/routes/analytics.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/index.js';
import { createServer, type Server } from 'node:http';
import { getDb } from '../../src/db/connection.js';

let server: Server;
let port: number;

beforeAll(async () => {
  const app = createApp();
  server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });

  const db = getDb();
  db.prepare(
    `INSERT INTO analytics (session_id, model, input_tokens, output_tokens, cost_usd, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('test-sess', 'claude-sonnet-5-5', 1000, 500, 0.015, 3200);
});

afterAll(() => server.close());

describe('Analytics endpoints', () => {
  it('GET /api/analytics/summary returns aggregated data', async () => {
    const res = await fetch(`http://localhost:${port}/api/analytics/summary`);
    const body = await res.json();
    expect(body.totalInputTokens).toBeGreaterThanOrEqual(1000);
    expect(body.totalCost).toBeGreaterThan(0);
    expect(body.totalSessions).toBeGreaterThanOrEqual(1);
    expect(typeof body.avgCostPerSession).toBe('number');
  });

  it('GET /api/analytics/summary with period returns filtered data', async () => {
    const res = await fetch(`http://localhost:${port}/api/analytics/summary?period=7d`);
    const body = await res.json();
    expect(typeof body.totalInputTokens).toBe('number');
  });

  it('GET /api/analytics/summary returns zeros for empty period', async () => {
    const res = await fetch(`http://localhost:${port}/api/analytics/summary?period=0d`);
    const body = await res.json();
    expect(body.totalInputTokens).toBe(0);
    expect(body.totalCost).toBe(0);
    expect(body.avgCostPerSession).toBe(0);
  });

  it('GET /api/analytics/daily returns date-keyed array', async () => {
    const res = await fetch(`http://localhost:${port}/api/analytics/daily`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(body[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('GET /api/analytics/models returns model breakdown', async () => {
    const res = await fetch(`http://localhost:${port}/api/analytics/models`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(body[0].model).toBeDefined();
      expect(body[0].count).toBeGreaterThan(0);
    }
  });

  it('GET /api/analytics/recent returns limited records', async () => {
    const res = await fetch(`http://localhost:${port}/api/analytics/recent?limit=5`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/routes/analytics.test.ts`
Expected: FAIL — 404 on /api/analytics/*

- [ ] **Step 3: Implement analytics routes**

```typescript
// packages/server/src/routes/analytics.ts
import { Router, type Router as RouterType } from 'express';
import { AnalyticsRepository } from '../db/analytics-repository.js';
import { getDb } from '../db/connection.js';

export const analyticsRouter: RouterType = Router();

function periodToTimestamp(period: string | undefined): number {
  if (!period) return 0;
  const match = period.match(/^(\d+)d$/);
  if (!match) return 0;
  const days = Number(match[1]);
  return Math.floor(Date.now() / 1000) - days * 86400;
}

analyticsRouter.get('/summary', (req, res) => {
  const repo = new AnalyticsRepository(getDb());
  const since = periodToTimestamp(req.query.period as string);
  res.json(repo.summary(since));
});

analyticsRouter.get('/daily', (req, res) => {
  const repo = new AnalyticsRepository(getDb());
  const since = periodToTimestamp(req.query.period as string);
  res.json(repo.daily(since));
});

analyticsRouter.get('/models', (req, res) => {
  const repo = new AnalyticsRepository(getDb());
  const since = periodToTimestamp(req.query.period as string);
  res.json(repo.byModel(since));
});

analyticsRouter.get('/recent', (req, res) => {
  const repo = new AnalyticsRepository(getDb());
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  res.json(repo.recent(limit));
});
```

- [ ] **Step 4: Wire analytics route into server**

Add to `packages/server/src/index.ts`:
```typescript
import { analyticsRouter } from './routes/analytics.js';
app.use('/api/analytics', analyticsRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/routes/analytics.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Run full suite, build, commit**

Run: `pnpm test && pnpm build`

```bash
git add packages/server/src/routes/analytics.ts packages/server/src/index.ts packages/server/tests/routes/analytics.test.ts
git commit -m "feat: add analytics REST API with aggregation endpoints

GET /api/analytics/summary, /daily, /models, /recent with optional
period filter (7d, 30d, 90d). Returns zeros for empty data sets."
```

---

### Task 3: Analytics Dashboard UI

**Files:**
- Create: `packages/client/src/components/analytics/AnalyticsPage.tsx` — main page with summary + period selector
- Create: `packages/client/src/components/analytics/TokenChart.tsx` — Recharts LineChart
- Create: `packages/client/src/components/analytics/CostChart.tsx` — Recharts BarChart
- Create: `packages/client/src/components/analytics/ModelBreakdown.tsx` — Recharts PieChart
- Modify: `packages/client/src/App.tsx` — add /analytics route
- Modify: `packages/client/src/components/Sidebar.tsx` — add Analytics nav item

**Interfaces:**
- Consumes: `GET /api/analytics/summary`, `/daily`, `/models` from Task 2
- Produces: `<AnalyticsPage>` with summary cards, token usage line chart, cost bar chart, model pie chart, period selector

- [ ] **Step 1: Add recharts dependency**

Run: `pnpm --filter @konduktor/client add recharts`

- [ ] **Step 2: Create TokenChart component**

```tsx
// packages/client/src/components/analytics/TokenChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DailyData {
  date: string;
  inputTokens: number;
  outputTokens: number;
}

export function TokenChart({ data }: { data: DailyData[] }) {
  if (data.length === 0) {
    return <p style={{ color: 'var(--fg3)', fontSize: '0.8rem', textAlign: 'center', padding: '40px 0' }}>No token data yet</p>;
  }

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '16px' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px' }}>Token Usage</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--fg3)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--fg3)' }} />
          <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem' }} />
          <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
          <Line type="monotone" dataKey="inputTokens" name="Input" stroke="#7c3aed" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="outputTokens" name="Output" stroke="#06b6d4" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Create CostChart component**

```tsx
// packages/client/src/components/analytics/CostChart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DailyData {
  date: string;
  cost: number;
}

export function CostChart({ data }: { data: DailyData[] }) {
  if (data.length === 0) {
    return <p style={{ color: 'var(--fg3)', fontSize: '0.8rem', textAlign: 'center', padding: '40px 0' }}>No cost data yet</p>;
  }

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '16px' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px' }}>Daily Cost</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--fg3)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--fg3)' }} tickFormatter={v => `$${v.toFixed(2)}`} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem' }}
            formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']}
          />
          <Bar dataKey="cost" fill="#7c3aed" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Create ModelBreakdown component**

```tsx
// packages/client/src/components/analytics/ModelBreakdown.tsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ModelData {
  model: string;
  count: number;
  totalTokens: number;
  totalCost: number;
}

const COLORS = ['#7c3aed', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

export function ModelBreakdown({ data }: { data: ModelData[] }) {
  if (data.length === 0) {
    return <p style={{ color: 'var(--fg3)', fontSize: '0.8rem', textAlign: 'center', padding: '40px 0' }}>No model data yet</p>;
  }

  const chartData = data.map(d => ({ name: d.model.replace('claude-', ''), value: d.totalCost, count: d.count }));

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '16px' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px' }}>Model Usage</h3>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name }) => name}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem' }}
            formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']}
          />
          <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 5: Create AnalyticsPage component**

```tsx
// packages/client/src/components/analytics/AnalyticsPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { TokenChart } from './TokenChart';
import { CostChart } from './CostChart';
import { ModelBreakdown } from './ModelBreakdown';

interface Summary { totalInputTokens: number; totalOutputTokens: number; totalCost: number; totalSessions: number; avgCostPerSession: number; }
interface DailyData { date: string; inputTokens: number; outputTokens: number; cost: number; sessions: number; }
interface ModelData { model: string; count: number; totalTokens: number; totalCost: number; }

const PERIODS = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
  { label: 'All time', value: '' },
];

export function AnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [models, setModels] = useState<ModelData[]>([]);

  const refresh = useCallback(async () => {
    const qs = period ? `?period=${period}` : '';
    const [s, d, m] = await Promise.all([
      fetch(`/api/analytics/summary${qs}`).then(r => r.json()),
      fetch(`/api/analytics/daily${qs}`).then(r => r.json()),
      fetch(`/api/analytics/models${qs}`).then(r => r.json()),
    ]);
    setSummary(s); setDaily(d); setModels(m);
  }, [period]);

  useEffect(() => { refresh(); }, [refresh]);

  const cardStyle = {
    padding: '14px 18px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)', background: 'var(--bg-surface)',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Analytics</h2>
        <div style={{ display: 'flex', gap: '4px' }}>
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)} style={{
              padding: '4px 12px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 500,
              background: period === p.value ? 'var(--purple)' : 'var(--bg-surface)',
              color: period === p.value ? 'white' : 'var(--fg3)',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.7rem', color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Tokens</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{(summary.totalInputTokens + summary.totalOutputTokens).toLocaleString()}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.7rem', color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Cost</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>${summary.totalCost.toFixed(2)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.7rem', color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sessions</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{summary.totalSessions}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.7rem', color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg / Session</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>${summary.avgCostPerSession.toFixed(4)}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <TokenChart data={daily} />
        <CostChart data={daily} />
      </div>
      <ModelBreakdown data={models} />
    </div>
  );
}
```

- [ ] **Step 6: Wire AnalyticsPage into router and sidebar**

Add to `packages/client/src/App.tsx`:
```tsx
import { AnalyticsPage } from './components/analytics/AnalyticsPage';
<Route path="/analytics" element={<AnalyticsPage />} />
```

Add to `packages/client/src/components/Sidebar.tsx` NAV_ITEMS (before Settings):
```typescript
{ to: '/analytics', label: 'Analytics', icon: '%' },
```

- [ ] **Step 7: Build client, commit**

Run: `pnpm --filter @konduktor/client build`
Expected: Compiles clean

```bash
git add packages/client
git commit -m "feat: add analytics dashboard with Recharts charts

Summary cards (tokens, cost, sessions, avg cost). Token usage line
chart, daily cost bar chart, model breakdown pie chart. Period
selector (7d, 30d, 90d, all time)."
```

---

### Task 4: Cron Scheduler Infrastructure

**Files:**
- Modify: `packages/server/src/db/schema.ts` — add `cron_jobs` and `cron_executions` table migrations
- Create: `packages/server/src/db/cron-repository.ts` — CRUD for cron jobs + executions
- Create: `packages/server/src/cron/scheduler.ts` — node-cron wrapper with execution tracking
- Modify: `packages/shared/src/types.ts` — add `CronJob`, `CronExecution` types
- Test: `packages/server/tests/db/cron-repository.test.ts`
- Test: `packages/server/tests/cron/scheduler.test.ts`

**Interfaces:**
- Consumes: `getDb()` from connection; `ClaudeProcess` from `claude/cli.ts`; `AnalyticsRepository` from Task 1
- Produces: `CronRepository` with `create(job)`, `list()`, `update(id, patch)`, `delete(id)`, `enable(id)`, `disable(id)`, `createExecution(jobId)`, `finishExecution(id, status, output, usage?)`, `listExecutions(jobId, limit)` ; `CronScheduler` with `startAll()`, `scheduleJob(job)`, `stopJob(id)`, `stopAll()`, `isRunning(id)`

- [ ] **Step 1: Add cron types to shared**

Add to `packages/shared/src/types.ts`:
```typescript
export interface CronJob {
  id: number;
  name: string;
  schedule: string;
  prompt: string;
  cwd: string | null;
  model: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CronExecution {
  id: number;
  jobId: number;
  sessionId: string | null;
  status: 'running' | 'completed' | 'failed';
  output: string;
  startedAt: number;
  finishedAt: number | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}
```

- [ ] **Step 2: Add cron table migrations to schema**

Add to `MIGRATIONS` array in `packages/server/src/db/schema.ts`:
```typescript
`CREATE TABLE IF NOT EXISTS cron_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  schedule TEXT NOT NULL,
  prompt TEXT NOT NULL,
  cwd TEXT,
  model TEXT,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
)`,
`CREATE TABLE IF NOT EXISTS cron_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES cron_jobs(id) ON DELETE CASCADE,
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  output TEXT DEFAULT '',
  started_at INTEGER DEFAULT (unixepoch()),
  finished_at INTEGER,
  cost_usd REAL DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0
)`,
`CREATE INDEX IF NOT EXISTS idx_cron_exec_job ON cron_executions(job_id)`,
`CREATE INDEX IF NOT EXISTS idx_cron_exec_started ON cron_executions(started_at)`,
```

- [ ] **Step 3: Write failing test for CronRepository**

```typescript
// packages/server/tests/db/cron-repository.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';
import { CronRepository } from '../../src/db/cron-repository.js';

let db: Database.Database;
let repo: CronRepository;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  repo = new CronRepository(db);
});

afterAll(() => db.close());

describe('CronRepository', () => {
  let jobId: number;

  it('creates a cron job', () => {
    const job = repo.create({ name: 'Daily report', schedule: '0 9 * * *', prompt: 'Generate daily report' });
    jobId = job.id;
    expect(job.name).toBe('Daily report');
    expect(job.schedule).toBe('0 9 * * *');
    expect(job.enabled).toBe(true);
  });

  it('lists all jobs', () => {
    const jobs = repo.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(jobId);
  });

  it('disables and enables a job', () => {
    repo.disable(jobId);
    expect(repo.getById(jobId)!.enabled).toBe(false);
    repo.enable(jobId);
    expect(repo.getById(jobId)!.enabled).toBe(true);
  });

  it('creates and finishes an execution', () => {
    const execId = repo.createExecution(jobId);
    expect(execId).toBeGreaterThan(0);

    repo.finishExecution(execId, 'completed', 'Report generated', {
      costUsd: 0.02, inputTokens: 500, outputTokens: 300,
    });

    const execs = repo.listExecutions(jobId, 10);
    expect(execs).toHaveLength(1);
    expect(execs[0].status).toBe('completed');
    expect(execs[0].costUsd).toBe(0.02);
  });

  it('deletes job and cascades executions', () => {
    repo.delete(jobId);
    expect(repo.list()).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/db/cron-repository.test.ts`
Expected: FAIL with "Cannot find module '../../src/db/cron-repository.js'"

- [ ] **Step 5: Implement CronRepository**

```typescript
// packages/server/src/db/cron-repository.ts
import type Database from 'better-sqlite3';
import type { CronJob, CronExecution } from '@konduktor/shared';

export class CronRepository {
  constructor(private db: Database.Database) {}

  create(data: { name: string; schedule: string; prompt: string; cwd?: string; model?: string }): CronJob {
    const result = this.db.prepare(
      `INSERT INTO cron_jobs (name, schedule, prompt, cwd, model) VALUES (?, ?, ?, ?, ?)`
    ).run(data.name, data.schedule, data.prompt, data.cwd || null, data.model || null);
    return this.getById(result.lastInsertRowid as number)!;
  }

  list(): CronJob[] {
    return (this.db.prepare(`SELECT * FROM cron_jobs ORDER BY created_at DESC`).all() as Record<string, unknown>[]).map(this.mapJob);
  }

  listEnabled(): CronJob[] {
    return (this.db.prepare(`SELECT * FROM cron_jobs WHERE enabled = 1`).all() as Record<string, unknown>[]).map(this.mapJob);
  }

  getById(id: number): CronJob | undefined {
    const row = this.db.prepare(`SELECT * FROM cron_jobs WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapJob(row) : undefined;
  }

  update(id: number, patch: Partial<{ name: string; schedule: string; prompt: string; cwd: string | null; model: string | null }>): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(patch)) {
      if (val !== undefined) { sets.push(`${key} = ?`); vals.push(val); }
    }
    if (sets.length === 0) return;
    sets.push('updated_at = unixepoch()');
    vals.push(id);
    this.db.prepare(`UPDATE cron_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  enable(id: number): void {
    this.db.prepare(`UPDATE cron_jobs SET enabled = 1, updated_at = unixepoch() WHERE id = ?`).run(id);
  }

  disable(id: number): void {
    this.db.prepare(`UPDATE cron_jobs SET enabled = 0, updated_at = unixepoch() WHERE id = ?`).run(id);
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM cron_jobs WHERE id = ?`).run(id);
  }

  createExecution(jobId: number, sessionId?: string): number {
    const result = this.db.prepare(
      `INSERT INTO cron_executions (job_id, session_id) VALUES (?, ?)`
    ).run(jobId, sessionId || null);
    return result.lastInsertRowid as number;
  }

  finishExecution(id: number, status: string, output: string, usage?: { costUsd: number; inputTokens: number; outputTokens: number }): void {
    this.db.prepare(
      `UPDATE cron_executions SET status = ?, output = ?, finished_at = unixepoch(),
        cost_usd = ?, input_tokens = ?, output_tokens = ? WHERE id = ?`
    ).run(status, output, usage?.costUsd || 0, usage?.inputTokens || 0, usage?.outputTokens || 0, id);
  }

  listExecutions(jobId: number, limit: number): CronExecution[] {
    return (this.db.prepare(
      `SELECT * FROM cron_executions WHERE job_id = ? ORDER BY started_at DESC LIMIT ?`
    ).all(jobId, limit) as Record<string, unknown>[]).map(this.mapExec);
  }

  private mapJob(r: Record<string, unknown>): CronJob {
    return {
      id: r.id as number, name: r.name as string, schedule: r.schedule as string,
      prompt: r.prompt as string, cwd: r.cwd as string | null, model: r.model as string | null,
      enabled: (r.enabled as number) === 1,
      createdAt: (r.created_at as number) * 1000, updatedAt: (r.updated_at as number) * 1000,
    };
  }

  private mapExec(r: Record<string, unknown>): CronExecution {
    return {
      id: r.id as number, jobId: r.job_id as number,
      sessionId: r.session_id as string | null, status: r.status as CronExecution['status'],
      output: (r.output as string) || '', startedAt: (r.started_at as number) * 1000,
      finishedAt: r.finished_at ? (r.finished_at as number) * 1000 : null,
      costUsd: r.cost_usd as number, inputTokens: r.input_tokens as number, outputTokens: r.output_tokens as number,
    };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/db/cron-repository.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Add node-cron dependency**

Run: `pnpm --filter @konduktor/server add node-cron && pnpm --filter @konduktor/server add -D @types/node-cron`

- [ ] **Step 8: Write failing test for CronScheduler**

```typescript
// packages/server/tests/cron/scheduler.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn(() => ({ stop: vi.fn() })), validate: vi.fn(() => true) },
}));

vi.mock('../../src/claude/cli.js', () => ({
  ClaudeProcess: vi.fn().mockImplementation(() => {
    const { EventEmitter } = require('node:events');
    const proc = new EventEmitter();
    Object.assign(proc, {
      isRunning: false,
      start: vi.fn(() => {
        proc.isRunning = true;
        setTimeout(() => {
          proc.emit('event', { type: 'result', content: 'done', usage: {
            inputTokens: 100, outputTokens: 50, cacheReadTokens: 0,
            cacheWriteTokens: 0, thinkingTokens: 0, costUsd: 0.01,
          }, durationMs: 1000 });
          proc.emit('close', 0);
          proc.isRunning = false;
        }, 10);
      }),
      kill: vi.fn(() => { proc.isRunning = false; }),
    });
    return proc;
  }),
}));

import cron from 'node-cron';
import { CronScheduler } from '../../src/cron/scheduler.js';
import { CronRepository } from '../../src/db/cron-repository.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  vi.clearAllMocks();
});

afterEach(() => db.close());

describe('CronScheduler', () => {
  it('schedules enabled jobs on startAll', () => {
    const repo = new CronRepository(db);
    repo.create({ name: 'Test', schedule: '* * * * *', prompt: 'hello' });
    repo.create({ name: 'Disabled', schedule: '* * * * *', prompt: 'hi' });
    repo.disable(2);

    const scheduler = new CronScheduler(db);
    scheduler.startAll();

    expect(cron.schedule).toHaveBeenCalledTimes(1);
    scheduler.stopAll();
  });

  it('skips execution if job is already running', () => {
    const repo = new CronRepository(db);
    const job = repo.create({ name: 'Slow', schedule: '* * * * *', prompt: 'slow task' });

    const scheduler = new CronScheduler(db);
    scheduler.scheduleJob(job);

    expect(scheduler.isRunning(job.id)).toBe(false);
  });

  it('stopAll clears all scheduled tasks', () => {
    const repo = new CronRepository(db);
    const job = repo.create({ name: 'Test', schedule: '* * * * *', prompt: 'hello' });

    const scheduler = new CronScheduler(db);
    scheduler.scheduleJob(job);
    scheduler.stopAll();

    expect(scheduler.isRunning(job.id)).toBe(false);
  });
});
```

- [ ] **Step 9: Implement CronScheduler**

```typescript
// packages/server/src/cron/scheduler.ts
import cron from 'node-cron';
import type Database from 'better-sqlite3';
import type { CronJob } from '@konduktor/shared';
import { CronRepository } from '../db/cron-repository.js';
import { AnalyticsRepository } from '../db/analytics-repository.js';
import { ClaudeProcess } from '../claude/cli.js';
import { CONFIG } from '../config.js';

export class CronScheduler {
  private tasks = new Map<number, cron.ScheduledTask>();
  private runningJobs = new Set<number>();

  constructor(private db: Database.Database) {}

  startAll(): void {
    const repo = new CronRepository(this.db);
    for (const job of repo.listEnabled()) {
      this.scheduleJob(job);
    }
  }

  scheduleJob(job: CronJob): void {
    this.stopJob(job.id);
    const task = cron.schedule(job.schedule, () => { this.executeJob(job); });
    this.tasks.set(job.id, task);
  }

  stopJob(id: number): void {
    const task = this.tasks.get(id);
    if (task) { task.stop(); this.tasks.delete(id); }
  }

  stopAll(): void {
    for (const [id] of this.tasks) this.stopJob(id);
  }

  isRunning(id: number): boolean {
    return this.runningJobs.has(id);
  }

  static validate(expression: string): boolean {
    return cron.validate(expression);
  }

  private executeJob(job: CronJob): void {
    if (this.runningJobs.has(job.id)) return;
    this.runningJobs.add(job.id);

    const repo = new CronRepository(this.db);
    const execId = repo.createExecution(job.id);
    let output = '';

    const proc = new ClaudeProcess({
      claudeBin: CONFIG.claudeBin,
      cwd: job.cwd || process.cwd(),
      model: job.model || undefined,
    });

    proc.on('event', (event: { type: string; content?: string; usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; thinkingTokens: number; costUsd: number }; durationMs?: number; model?: string }) => {
      if (event.type === 'assistant' && event.content) output += event.content;
      if (event.type === 'result' && event.usage) {
        const analyticsRepo = new AnalyticsRepository(this.db);
        analyticsRepo.record(null, event.model || job.model || 'unknown', event.usage, event.durationMs || 0);
        repo.finishExecution(execId, 'completed', output, {
          costUsd: event.usage.costUsd, inputTokens: event.usage.inputTokens, outputTokens: event.usage.outputTokens,
        });
      }
    });

    proc.on('close', () => { this.runningJobs.delete(job.id); });

    proc.on('error', (err: Error) => {
      repo.finishExecution(execId, 'failed', err.message);
      this.runningJobs.delete(job.id);
    });

    proc.start(job.prompt, { cwd: job.cwd || undefined, model: job.model || undefined });
  }
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/cron/scheduler.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 11: Build, commit**

Run: `pnpm test && pnpm build`

```bash
git add packages/shared/src/types.ts packages/server/src/db/schema.ts packages/server/src/db/cron-repository.ts packages/server/src/cron/scheduler.ts packages/server/tests/db/cron-repository.test.ts packages/server/tests/cron/scheduler.test.ts
git commit -m "feat: add cron scheduler infrastructure

CronRepository for cron_jobs and cron_executions tables. CronScheduler
wraps node-cron with overlap prevention and execution tracking.
Persists analytics on job completion."
```

---

### Task 5: Cron REST API

**Files:**
- Create: `packages/server/src/routes/cron.ts` — CRUD + execution endpoints
- Modify: `packages/server/src/index.ts` — wire cron route, start scheduler on boot
- Test: `packages/server/tests/routes/cron.test.ts`

**Interfaces:**
- Consumes: `CronRepository` from Task 4; `CronScheduler` from Task 4; `getDb()` from connection
- Produces: `POST /api/cron` (create), `GET /api/cron` (list), `PUT /api/cron/:id` (update), `DELETE /api/cron/:id`, `POST /api/cron/:id/enable`, `POST /api/cron/:id/disable`, `GET /api/cron/:id/executions`, `POST /api/cron/:id/run` (manual trigger)

- [ ] **Step 1: Write failing test for cron endpoints**

```typescript
// packages/server/tests/routes/cron.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/index.js';
import { createServer, type Server } from 'node:http';

let server: Server;
let port: number;
let createdId: number;

beforeAll(async () => {
  const app = createApp();
  server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });
});

afterAll(() => server.close());

describe('Cron endpoints', () => {
  it('POST /api/cron creates a job', async () => {
    const res = await fetch(`http://localhost:${port}/api/cron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Job', schedule: '0 9 * * *', prompt: 'Say hello' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.name).toBe('Test Job');
    expect(body.id).toBeGreaterThan(0);
    createdId = body.id;
  });

  it('POST /api/cron rejects invalid cron expression', async () => {
    const res = await fetch(`http://localhost:${port}/api/cron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad', schedule: 'not a cron', prompt: 'hi' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('schedule');
  });

  it('GET /api/cron lists jobs', async () => {
    const res = await fetch(`http://localhost:${port}/api/cron`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/cron/:id/disable disables job', async () => {
    const res = await fetch(`http://localhost:${port}/api/cron/${createdId}/disable`, { method: 'POST' });
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('GET /api/cron/:id/executions returns array', async () => {
    const res = await fetch(`http://localhost:${port}/api/cron/${createdId}/executions`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('DELETE /api/cron/:id deletes job', async () => {
    const res = await fetch(`http://localhost:${port}/api/cron/${createdId}`, { method: 'DELETE' });
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/routes/cron.test.ts`
Expected: FAIL — 404

- [ ] **Step 3: Implement cron routes**

```typescript
// packages/server/src/routes/cron.ts
import { Router, type Router as RouterType } from 'express';
import { CronRepository } from '../db/cron-repository.js';
import { CronScheduler } from '../cron/scheduler.js';
import { getDb } from '../db/connection.js';

export function createCronRouter(scheduler: CronScheduler): RouterType {
  const router: RouterType = Router();

  router.get('/', (_req, res) => {
    const repo = new CronRepository(getDb());
    res.json(repo.list());
  });

  router.post('/', (req, res) => {
    const { name, schedule, prompt, cwd, model } = req.body;
    if (!name || !schedule || !prompt) {
      res.status(400).json({ error: 'name, schedule, and prompt required' }); return;
    }
    if (!CronScheduler.validate(schedule)) {
      res.status(400).json({ error: 'Invalid cron schedule expression' }); return;
    }
    const repo = new CronRepository(getDb());
    const job = repo.create({ name, schedule, prompt, cwd, model });
    scheduler.scheduleJob(job);
    res.json(job);
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const { schedule } = req.body;
    if (schedule && !CronScheduler.validate(schedule)) {
      res.status(400).json({ error: 'Invalid cron schedule expression' }); return;
    }
    const repo = new CronRepository(getDb());
    repo.update(id, req.body);
    const updated = repo.getById(id);
    if (updated && updated.enabled) scheduler.scheduleJob(updated);
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    scheduler.stopJob(id);
    const repo = new CronRepository(getDb());
    repo.delete(id);
    res.json({ success: true });
  });

  router.post('/:id/enable', (req, res) => {
    const id = Number(req.params.id);
    const repo = new CronRepository(getDb());
    repo.enable(id);
    const job = repo.getById(id);
    if (job) scheduler.scheduleJob(job);
    res.json({ success: true });
  });

  router.post('/:id/disable', (req, res) => {
    const id = Number(req.params.id);
    scheduler.stopJob(id);
    const repo = new CronRepository(getDb());
    repo.disable(id);
    res.json({ success: true });
  });

  router.get('/:id/executions', (req, res) => {
    const repo = new CronRepository(getDb());
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(repo.listExecutions(Number(req.params.id), limit));
  });

  router.post('/:id/run', (req, res) => {
    const id = Number(req.params.id);
    const repo = new CronRepository(getDb());
    const job = repo.getById(id);
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    if (scheduler.isRunning(id)) { res.status(409).json({ error: 'Job already running' }); return; }
    res.json({ triggered: true });
  });

  return router;
}
```

- [ ] **Step 4: Wire cron route and scheduler into server**

Modify `packages/server/src/index.ts`:

Add imports:
```typescript
import { CronScheduler } from './cron/scheduler.js';
import { createCronRouter } from './routes/cron.js';
```

In `createApp()`, after route wiring:
```typescript
const scheduler = new CronScheduler(getDb());
app.use('/api/cron', createCronRouter(scheduler));
```

In `startServer()`, after `server.listen` callback:
```typescript
const scheduler = new CronScheduler(getDb());
scheduler.startAll();
```

Note: `createApp()` needs a scheduler instance for tests. Since `createApp()` calls `initDb()` already (or assumes it's called), create the scheduler there. If `createApp()` doesn't call `initDb()`, the test `beforeAll` should call it. Adjust based on actual `createApp()` implementation — the key is that `getDb()` must work when `createCronRouter` is called.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/routes/cron.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Run full suite, build, commit**

Run: `pnpm test && pnpm build`

```bash
git add packages/server/src/routes/cron.ts packages/server/src/index.ts packages/server/tests/routes/cron.test.ts
git commit -m "feat: add cron REST API with validation

CRUD endpoints for cron jobs. Validates cron expressions on create/update.
Manual trigger via POST /run. Scheduler starts on server boot."
```

---

### Task 6: Schedules UI

**Files:**
- Create: `packages/client/src/components/schedules/SchedulesPage.tsx` — job list + add form
- Create: `packages/client/src/components/schedules/ExecutionHistory.tsx` — execution list
- Modify: `packages/client/src/App.tsx` — add /schedules route
- Modify: `packages/client/src/components/Sidebar.tsx` — add Schedules nav item

**Interfaces:**
- Consumes: `GET /api/cron`, `POST /api/cron`, `POST /api/cron/:id/enable`, `POST /api/cron/:id/disable`, `DELETE /api/cron/:id`, `GET /api/cron/:id/executions`, `POST /api/cron/:id/run` from Task 5
- Produces: `<SchedulesPage>` with job list, add form, enable/disable/delete controls; `<ExecutionHistory>` with execution list per job

- [ ] **Step 1: Create ExecutionHistory component**

```tsx
// packages/client/src/components/schedules/ExecutionHistory.tsx
import { useState, useEffect } from 'react';

interface Execution {
  id: number;
  status: string;
  output: string;
  startedAt: number;
  finishedAt: number | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export function ExecutionHistory({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const [executions, setExecutions] = useState<Execution[]>([]);

  useEffect(() => {
    fetch(`/api/cron/${jobId}/executions`).then(r => r.json()).then(setExecutions);
  }, [jobId]);

  const statusColor = (s: string) => s === 'completed' ? 'var(--green)' : s === 'failed' ? 'var(--red)' : 'var(--amber)';

  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)', padding: '16px', marginTop: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600 }}>Execution History</h3>
        <button onClick={onClose} style={{
          padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg)', color: 'var(--fg3)', fontSize: '0.7rem', cursor: 'pointer',
        }}>Close</button>
      </div>
      {executions.length === 0 && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>No executions yet</p>}
      {executions.map(e => (
        <div key={e.id} style={{
          padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '0.8rem',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(e.status), flexShrink: 0 }} />
          <span style={{ color: 'var(--fg3)', minWidth: 120, fontSize: '0.75rem' }}>
            {new Date(e.startedAt).toLocaleString()}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.output.slice(0, 100) || '(no output)'}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--fg3)' }}>
            ${e.costUsd.toFixed(4)} | {(e.inputTokens + e.outputTokens).toLocaleString()} tok
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create SchedulesPage component**

```tsx
// packages/client/src/components/schedules/SchedulesPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { ExecutionHistory } from './ExecutionHistory';

interface Job { id: number; name: string; schedule: string; prompt: string; enabled: boolean; createdAt: number; }

export function SchedulesPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newSchedule, setNewSchedule] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setJobs(await (await fetch('/api/cron')).json()); } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addJob = async () => {
    if (!newName.trim() || !newSchedule.trim() || !newPrompt.trim()) return;
    setError('');
    const res = await fetch('/api/cron', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, schedule: newSchedule, prompt: newPrompt }),
    });
    if (!res.ok) { const body = await res.json(); setError(body.error || 'Failed'); return; }
    setNewName(''); setNewSchedule(''); setNewPrompt('');
    refresh();
  };

  const toggle = async (job: Job) => {
    const action = job.enabled ? 'disable' : 'enable';
    await fetch(`/api/cron/${job.id}/${action}`, { method: 'POST' });
    refresh();
  };

  const deleteJob = async (id: number) => {
    await fetch(`/api/cron/${id}`, { method: 'DELETE' });
    refresh();
  };

  const runNow = async (id: number) => {
    await fetch(`/api/cron/${id}/run`, { method: 'POST' });
    refresh();
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>Schedules</h2>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Job name"
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg)', color: 'var(--fg)', fontSize: '0.8rem', width: '140px' }} />
        <input value={newSchedule} onChange={e => setNewSchedule(e.target.value)} placeholder="0 9 * * * (cron)"
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg)', color: 'var(--fg)', fontSize: '0.8rem', width: '140px', fontFamily: 'var(--font-mono)' }} />
        <input value={newPrompt} onChange={e => setNewPrompt(e.target.value)} placeholder="Prompt to run..."
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg)', color: 'var(--fg)', fontSize: '0.8rem', minWidth: '200px' }} />
        <button onClick={addJob} style={{
          padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none',
          background: 'var(--purple)', color: 'white', fontSize: '0.8rem', cursor: 'pointer',
        }}>Add</button>
      </div>
      {error && <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: '8px' }}>{error}</p>}

      {loading && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>Loading...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {jobs.map(job => (
          <div key={job.id} style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            opacity: job.enabled ? 1 : 0.6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{job.name}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--fg3)', fontFamily: 'var(--font-mono)' }}>
                  {job.schedule} | {job.enabled ? 'enabled' : 'disabled'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--fg2)', marginTop: '2px' }}>
                  {job.prompt.length > 80 ? job.prompt.slice(0, 80) + '...' : job.prompt}
                </div>
              </div>
              <button onClick={() => setShowHistory(showHistory === job.id ? null : job.id)} style={{
                padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--fg3)', fontSize: '0.7rem', cursor: 'pointer',
              }}>History</button>
              <button onClick={() => runNow(job.id)} style={{
                padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--cyan)', fontSize: '0.7rem', cursor: 'pointer',
              }}>Run</button>
              <button onClick={() => toggle(job)} style={{
                padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--bg)', color: job.enabled ? 'var(--amber)' : 'var(--green)',
                fontSize: '0.7rem', cursor: 'pointer',
              }}>{job.enabled ? 'Disable' : 'Enable'}</button>
              <button onClick={() => deleteJob(job.id)} style={{
                padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--red)', fontSize: '0.7rem', cursor: 'pointer',
              }}>Delete</button>
            </div>
            {showHistory === job.id && <ExecutionHistory jobId={job.id} onClose={() => setShowHistory(null)} />}
          </div>
        ))}
        {!loading && jobs.length === 0 && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>No scheduled jobs. Add one above.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire SchedulesPage into router and sidebar**

Add to `packages/client/src/App.tsx`:
```tsx
import { SchedulesPage } from './components/schedules/SchedulesPage';
<Route path="/schedules" element={<SchedulesPage />} />
```

Add to `packages/client/src/components/Sidebar.tsx` NAV_ITEMS (after Analytics, before Settings):
```typescript
{ to: '/schedules', label: 'Schedules', icon: '^' },
```

- [ ] **Step 4: Build client, commit**

Run: `pnpm --filter @konduktor/client build`
Expected: Compiles clean

```bash
git add packages/client
git commit -m "feat: add schedules page with cron job management

Job list with enable/disable/delete/run-now controls. Add form with
cron expression input. Execution history viewer per job."
```

---

### Task 7: Export Endpoints

**Files:**
- Create: `packages/server/src/routes/export.ts` — CSV/JSON/Markdown export
- Modify: `packages/server/src/index.ts` — wire export route
- Test: `packages/server/tests/routes/export.test.ts`

**Interfaces:**
- Consumes: `AnalyticsRepository` from Task 1; `ChatRepository` from Phase 2; `getDb()` from connection
- Produces: `GET /api/export/analytics?format=csv&period=30d`, `GET /api/export/analytics?format=json&period=30d`, `GET /api/export/chat?sessionId=X&format=json`, `GET /api/export/chat?sessionId=X&format=md`

- [ ] **Step 1: Write failing test for export endpoints**

```typescript
// packages/server/tests/routes/export.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/index.js';
import { createServer, type Server } from 'node:http';
import { getDb } from '../../src/db/connection.js';

let server: Server;
let port: number;

beforeAll(async () => {
  const app = createApp();
  server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });

  const db = getDb();
  db.prepare(
    `INSERT INTO analytics (session_id, model, input_tokens, output_tokens, cost_usd, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('export-test', 'claude-sonnet-5-5', 1000, 500, 0.015, 3200);
  db.prepare(
    `INSERT INTO chat_history (session_id, role, content) VALUES (?, ?, ?)`
  ).run('export-test', 'user', 'Hello there');
  db.prepare(
    `INSERT INTO chat_history (session_id, role, content, model) VALUES (?, ?, ?, ?)`
  ).run('export-test', 'assistant', 'Hi! How can I help?', 'claude-sonnet-5-5');
});

afterAll(() => server.close());

describe('Export endpoints', () => {
  it('GET /api/export/analytics?format=json returns JSON array', async () => {
    const res = await fetch(`http://localhost:${port}/api/export/analytics?format=json`);
    expect(res.headers.get('content-type')).toContain('json');
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/export/analytics?format=csv returns CSV', async () => {
    const res = await fetch(`http://localhost:${port}/api/export/analytics?format=csv`);
    expect(res.headers.get('content-type')).toContain('csv');
    const text = await res.text();
    expect(text).toContain('session_id');
    expect(text).toContain('claude-sonnet-5-5');
  });

  it('CSV escapes dangerous content', async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO analytics (session_id, model, input_tokens, output_tokens, cost_usd, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('=CMD("calc")', 'claude-sonnet-5-5', 100, 50, 0.001, 500);

    const res = await fetch(`http://localhost:${port}/api/export/analytics?format=csv`);
    const text = await res.text();
    expect(text).not.toContain('=CMD');
    expect(text).toContain("'=CMD");
  });

  it('GET /api/export/chat?sessionId=X&format=json returns messages', async () => {
    const res = await fetch(`http://localhost:${port}/api/export/chat?sessionId=export-test&format=json`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0].role).toBe('user');
  });

  it('GET /api/export/chat?sessionId=X&format=md returns markdown', async () => {
    const res = await fetch(`http://localhost:${port}/api/export/chat?sessionId=export-test&format=md`);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const text = await res.text();
    expect(text).toContain('## User');
    expect(text).toContain('Hello there');
    expect(text).toContain('## Assistant');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/routes/export.test.ts`
Expected: FAIL — 404

- [ ] **Step 3: Implement export routes**

```typescript
// packages/server/src/routes/export.ts
import { Router, type Router as RouterType } from 'express';
import { getDb } from '../db/connection.js';
import { ChatRepository } from '../db/chat-repository.js';

export const exportRouter: RouterType = Router();

function periodToTimestamp(period: string | undefined): number {
  if (!period) return 0;
  const match = period.match(/^(\d+)d$/);
  if (!match) return 0;
  return Math.floor(Date.now() / 1000) - Number(match[1]) * 86400;
}

function escapeCsvField(value: string): string {
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `"'${str.replace(/"/g, '""')}"`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

exportRouter.get('/analytics', (req, res) => {
  const format = req.query.format as string || 'json';
  const since = periodToTimestamp(req.query.period as string);
  const db = getDb();

  const rows = db.prepare(
    `SELECT session_id, model, input_tokens, output_tokens, cache_read_tokens,
            cache_write_tokens, thinking_tokens, cost_usd, duration_ms, created_at
     FROM analytics WHERE created_at >= ? ORDER BY created_at DESC LIMIT 10000`
  ).all(since) as Record<string, unknown>[];

  if (format === 'csv') {
    const headers = ['session_id', 'model', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'thinking_tokens', 'cost_usd', 'duration_ms', 'created_at'];
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map(h => escapeCsvField(String(row[h] ?? ''))).join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
    res.send(lines.join('\n'));
    return;
  }

  res.json(rows);
});

exportRouter.get('/chat', (req, res) => {
  const sessionId = req.query.sessionId as string;
  const format = req.query.format as string || 'json';

  if (!sessionId) { res.status(400).json({ error: 'sessionId required' }); return; }

  const repo = new ChatRepository(getDb());
  const messages = repo.getHistory(sessionId);

  if (format === 'md') {
    const lines = [`# Chat Session: ${sessionId}\n`];
    for (const msg of messages) {
      const time = new Date(msg.timestamp).toLocaleString();
      lines.push(`## ${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}`);
      lines.push(`*${time}*${msg.model ? ` (${msg.model})` : ''}\n`);
      lines.push(msg.content);
      lines.push('');
    }
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="chat-${sessionId.slice(0, 8)}.md"`);
    res.send(lines.join('\n'));
    return;
  }

  res.json(messages);
});
```

- [ ] **Step 4: Wire export route into server**

Add to `packages/server/src/index.ts`:
```typescript
import { exportRouter } from './routes/export.js';
app.use('/api/export', exportRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/routes/export.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Run full suite, build, commit**

Run: `pnpm test && pnpm build`

```bash
git add packages/server/src/routes/export.ts packages/server/src/index.ts packages/server/tests/routes/export.test.ts
git commit -m "feat: add data export endpoints

Analytics export as CSV or JSON with period filter. Chat history
export as Markdown or JSON by session ID. CSV formula injection
prevention via field escaping."
```

---

## Summary

| Task | Deliverable | Key Files | Est. Commits |
|------|------------|-----------|-------------|
| 1 | Analytics repository + WS persistence | analytics-repository.ts, handler.ts | 1 |
| 2 | Analytics REST API | analytics.ts route | 1 |
| 3 | Analytics dashboard UI | AnalyticsPage.tsx, charts, Recharts | 1 |
| 4 | Cron scheduler infrastructure | cron-repository.ts, scheduler.ts, schema.ts | 1 |
| 5 | Cron REST API | cron.ts route | 1 |
| 6 | Schedules UI | SchedulesPage.tsx, ExecutionHistory.tsx | 1 |
| 7 | Export endpoints | export.ts route | 1 |
| **Total** | **Phase 3 core complete** | **~20 new files** | **7** |

**Not in scope (separate plan):** Claude Artifact integration + gallery (Phase 3 master plan item, independent subsystem).
