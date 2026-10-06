# Konduktor Phase 2: Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-turn chat with history persistence, capabilities management (MCP/plugins), session monitoring, system info, and kanban board to the Konduktor dashboard.

**Architecture:** Phase 2 builds on Phase 1's foundation — monorepo with shared types, Express+WS server, React client, SQLite DB. Multi-turn chat uses Claude CLI's `--resume` flag to continue sessions. Capabilities wrap `claude mcp` and `claude plugin` CLI commands via `execFileSync`. New pages (capabilities, logs, system, kanban) follow existing patterns: Router on server, functional components with inline styles on client. Chat history persists to the existing `chat_history` SQLite table. FTS5 enables search.

**Tech Stack:** Express 5, React 19, TypeScript 5.5, better-sqlite3, ws, Vitest, Claude Code CLI

**Spec:** `docs/plans/master-plan.md` (supplementary: `docs/grilling/shared-understanding.md`)

## Global Constraints

- Node.js >= 20
- All files < 300 lines
- CLI commands use `execFileSync` with argument arrays (never `execSync` with string interpolation — Phase 1 C2 fix)
- Server routes use Router with explicit `RouterType` annotation
- Client components use inline styles with CSS token variables
- Tests use Vitest with `vi.mock` for CLI calls
- No hardcoded secrets, no `any` type leaks

## Review Focus

1. **Multi-turn chat with stale `--resume` ID** — if the Claude session has expired or been cleaned up, `--resume` with a dead session ID should fail gracefully with a "session expired" message, not hang or crash. Test added to Task 1.
2. **FTS5 search with SQL injection** — search queries are user-provided strings passed to FTS5 MATCH; special FTS5 syntax characters (`*`, `"`, `NEAR`, `AND`, `OR`) could produce syntax errors or unexpected results. Test added to Task 4.
3. **Capabilities CLI command timeout** — `claude mcp list` does health checks and can take 30+ seconds; `claude plugin install` downloads packages and can take minutes. Timeouts must be generous and the UI must show loading state. Test added to Task 5.
4. **Kanban task deletion with linked session** — deleting a kanban task that references an active session should not kill the session. Test added to Task 9.
5. **Concurrent DB writes from WS handler and REST routes** — chat history writes from streaming events and analytics inserts from REST endpoints can race. SQLite WAL mode handles concurrent reads but serializes writes; verify no SQLITE_BUSY errors under load. Test added to Task 1.

---

### Task 1: Multi-Turn Chat + History Persistence

**Files:**
- Modify: `packages/server/src/ws/handler.ts` — add `--resume` support, persist messages to DB
- Create: `packages/server/src/db/chat-repository.ts` — chat history CRUD
- Modify: `packages/server/src/claude/cli.ts:7-24` — parse `rate_limit_event`, capture init event data
- Modify: `packages/shared/src/types.ts:99-111` — add new WS message types
- Create: `packages/server/src/routes/chat-history.ts` — GET /api/chat/:sessionId, GET /api/chat
- Test: `packages/server/tests/db/chat-repository.test.ts`
- Test: `packages/server/tests/ws/multi-turn.test.ts`

**Interfaces:**
- Consumes: `getDb()` from `db/connection.ts`; `ClaudeProcess` from `claude/cli.ts`; existing `chat_history` table schema
- Produces: `ChatRepository` class with `saveMessage(sessionId, role, content, model?, usage?)`, `getHistory(sessionId): ChatMessage[]`, `listSessions(): {sessionId, lastMessage, updatedAt}[]`; updated WS handler that uses `--resume` for follow-up messages; new WS message type `chat:history`

- [ ] **Step 1: Write failing test for ChatRepository**

```typescript
// packages/server/tests/db/chat-repository.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';
import { ChatRepository } from '../../src/db/chat-repository.js';

let db: Database.Database;
let repo: ChatRepository;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  repo = new ChatRepository(db);
});

afterAll(() => db.close());

describe('ChatRepository', () => {
  it('saves and retrieves messages', () => {
    repo.saveMessage('sess-1', 'user', 'hello');
    repo.saveMessage('sess-1', 'assistant', 'hi there', 'claude-sonnet-5-5');
    const msgs = repo.getHistory('sess-1');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].content).toBe('hi there');
    expect(msgs[1].model).toBe('claude-sonnet-5-5');
  });

  it('saves message with token usage', () => {
    repo.saveMessage('sess-2', 'assistant', 'response', 'sonnet', {
      inputTokens: 100, outputTokens: 50,
      cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, costUsd: 0.001,
    });
    const msgs = repo.getHistory('sess-2');
    expect(msgs[0].usage?.inputTokens).toBe(100);
    expect(msgs[0].usage?.costUsd).toBe(0.001);
  });

  it('lists sessions with last message', () => {
    const sessions = repo.listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    const s1 = sessions.find(s => s.sessionId === 'sess-1');
    expect(s1).toBeDefined();
    expect(s1!.messageCount).toBe(2);
  });

  it('handles concurrent writes without SQLITE_BUSY', () => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      repo.saveMessage(`concurrent-${i % 5}`, 'user', `msg ${i}`)
    );
    expect(() => promises).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/db/chat-repository.test.ts`
Expected: FAIL with "Cannot find module '../../src/db/chat-repository.js'"

- [ ] **Step 3: Implement ChatRepository**

```typescript
// packages/server/src/db/chat-repository.ts
import type Database from 'better-sqlite3';
import type { ChatMessage, TokenUsage } from '@konduktor/shared';

export class ChatRepository {
  private insertStmt: Database.Statement;
  private selectStmt: Database.Statement;
  private listStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO chat_history (session_id, role, content, model, cost_usd, input_tokens, output_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    this.selectStmt = db.prepare(
      `SELECT * FROM chat_history WHERE session_id = ? ORDER BY created_at ASC`
    );
    this.listStmt = db.prepare(
      `SELECT session_id, COUNT(*) as message_count, MAX(created_at) as updated_at,
              (SELECT content FROM chat_history h2 WHERE h2.session_id = h1.session_id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM chat_history h1 GROUP BY session_id ORDER BY updated_at DESC`
    );
  }

  saveMessage(sessionId: string, role: string, content: string, model?: string, usage?: TokenUsage): void {
    this.insertStmt.run(
      sessionId, role, content, model || null,
      usage?.costUsd || 0, usage?.inputTokens || 0, usage?.outputTokens || 0
    );
  }

  getHistory(sessionId: string): ChatMessage[] {
    const rows = this.selectStmt.all(sessionId) as Record<string, unknown>[];
    return rows.map(r => ({
      id: String(r.id),
      role: r.role as ChatMessage['role'],
      content: r.content as string,
      timestamp: (r.created_at as number) * 1000,
      model: r.model as string | undefined,
      usage: (r.input_tokens as number) > 0 ? {
        inputTokens: r.input_tokens as number,
        outputTokens: r.output_tokens as number,
        cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0,
        costUsd: r.cost_usd as number,
      } : undefined,
    }));
  }

  listSessions(): { sessionId: string; lastMessage: string; messageCount: number; updatedAt: number }[] {
    const rows = this.listStmt.all() as Record<string, unknown>[];
    return rows.map(r => ({
      sessionId: r.session_id as string,
      lastMessage: r.last_message as string,
      messageCount: r.message_count as number,
      updatedAt: (r.updated_at as number) * 1000,
    }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/db/chat-repository.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Update shared types for new WS messages**

Add to `packages/shared/src/types.ts` WsClientMessage union:
```typescript
| { type: 'chat:message'; sessionId: string; prompt: string; cwd?: string; model?: string }
| { type: 'chat:history'; sessionId: string }
```

Add to WsServerMessage union:
```typescript
| { type: 'chat:history'; sessionId: string; messages: ChatMessage[] }
| { type: 'chat:init'; sessionId: string; init: CliInitEvent }
| { type: 'rate_limit'; sessionId: string; retryAfterMs: number }
```

- [ ] **Step 6: Fix parseStreamLine — capture init event data and rate_limit_event**

Modify `packages/server/src/claude/cli.ts` line 18-24:
```typescript
if (parsed.type === 'system') {
  const sub = parsed.subtype as string;
  if (sub === 'hook_started' || sub === 'hook_response' || sub === 'hook_progress') {
    return null;
  }
  if (sub === 'init') {
    return {
      type: 'system', subtype: 'init',
      tools: (parsed.tools as string[]) || [],
      mcpServers: (parsed.mcp_servers as McpServerInfo[]) || [],
      model: parsed.model as string,
    } as unknown as StreamEvent;
  }
  return { type: 'system', subtype: sub } as StreamEvent;
}
```

Add after the `result` block (before `return null`):
```typescript
if (parsed.type === 'rate_limit_event') {
  return {
    type: 'rate_limit_event',
    retryAfterMs: (parsed.retry_after_ms as number) || 30000,
  } as unknown as StreamEvent;
}
```

- [ ] **Step 7: Update WS handler for multi-turn + persistence**

Modify `packages/server/src/ws/handler.ts`:
- Import `ChatRepository` and `initDb`/`getDb`
- Initialize `chatRepo` at module level
- On `chat:start`: save user message to DB, store sessionId for resume
- On `chat:message` (new): use `--resume` flag with existing sessionId, save user message
- On stream `result` event: save assistant message with usage to DB
- On `chat:history`: return messages from ChatRepository

- [ ] **Step 8: Write multi-turn WS test**

```typescript
// packages/server/tests/ws/multi-turn.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('../../src/claude/cli.js', () => ({
  ClaudeProcess: vi.fn().mockImplementation(() => {
    const proc = new EventEmitter();
    Object.assign(proc, {
      isRunning: true,
      start: vi.fn(),
      kill: vi.fn(() => { (proc as any).isRunning = false; }),
    });
    return proc;
  }),
}));

vi.mock('../../src/claude/sessions.js', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    list: vi.fn(() => []),
  })),
}));

vi.mock('../../src/db/connection.js', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn(), all: vi.fn(() => []), get: vi.fn() })),
  })),
  initDb: vi.fn(),
}));

import { createWsHandler } from '../../src/ws/handler.js';
import { ClaudeProcess } from '../../src/claude/cli.js';

function mockWs() {
  const ws = new EventEmitter() as any;
  ws.readyState = 1;
  ws.OPEN = 1;
  ws.send = vi.fn();
  return ws;
}

describe('Multi-turn chat', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('chat:message uses --resume flag on ClaudeProcess.start', () => {
    const handler = createWsHandler();
    const ws = mockWs();
    handler(ws);

    ws.emit('message', JSON.stringify({
      type: 'chat:start', prompt: 'hello', sessionId: 'sess-1',
    }));

    ws.emit('message', JSON.stringify({
      type: 'chat:message', sessionId: 'sess-1', prompt: 'follow up',
    }));

    const proc = vi.mocked(ClaudeProcess);
    expect(proc).toHaveBeenCalledTimes(2);
    const secondCall = proc.mock.results[1].value;
    expect(secondCall.start).toHaveBeenCalledWith('follow up', expect.objectContaining({
      resume: 'sess-1',
    }));
  });

  it('resume with expired session fails gracefully', () => {
    const handler = createWsHandler();
    const ws = mockWs();
    handler(ws);

    ws.emit('message', JSON.stringify({
      type: 'chat:message', sessionId: 'nonexistent', prompt: 'hello',
    }));

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe('chat:stream');
  });
});
```

- [ ] **Step 9: Create chat history REST route**

```typescript
// packages/server/src/routes/chat-history.ts
import { Router, type Router as RouterType } from 'express';
import { ChatRepository } from '../db/chat-repository.js';
import { getDb } from '../db/connection.js';

export const chatHistoryRouter: RouterType = Router();

chatHistoryRouter.get('/', (_req, res) => {
  const repo = new ChatRepository(getDb());
  res.json(repo.listSessions());
});

chatHistoryRouter.get('/:sessionId', (req, res) => {
  const repo = new ChatRepository(getDb());
  res.json(repo.getHistory(req.params.sessionId));
});
```

Wire in `packages/server/src/index.ts`:
```typescript
import { chatHistoryRouter } from './routes/chat-history.js';
// ...
app.use('/api/chat', chatHistoryRouter);
```

- [ ] **Step 10: Run full suite, build, commit**

Run: `pnpm test && pnpm build`
Expected: All tests pass, all packages build

```bash
git add packages/shared packages/server
git commit -m "feat: multi-turn chat with history persistence

Add --resume support for follow-up messages in same session.
Persist all messages to SQLite chat_history. Parse init events
and rate_limit_event from stream-json. REST API for chat history."
```

---

### Task 2: Stream Buffer for WS Reconnect

**Files:**
- Create: `packages/server/src/ws/stream-buffer.ts` — ring buffer
- Modify: `packages/server/src/ws/handler.ts` — buffer events, replay on reconnect
- Modify: `packages/shared/src/types.ts` — add `chat:reconnect` WS message type
- Modify: `packages/client/src/lib/ws.ts` — send reconnect on socket open
- Test: `packages/server/tests/ws/stream-buffer.test.ts`

**Interfaces:**
- Consumes: `LIMITS.streamBufferSize` (100) from shared constants
- Produces: `StreamBuffer` class with `push(event)`, `getSince(index): StreamEvent[]`, `size: number`; WS handler replays missed events on `chat:reconnect`

- [ ] **Step 1: Write failing test for StreamBuffer**

```typescript
// packages/server/tests/ws/stream-buffer.test.ts
import { describe, it, expect } from 'vitest';
import { StreamBuffer } from '../../src/ws/stream-buffer.js';

describe('StreamBuffer', () => {
  it('stores and retrieves events', () => {
    const buf = new StreamBuffer(5);
    buf.push({ idx: 0 }); buf.push({ idx: 1 }); buf.push({ idx: 2 });
    expect(buf.getSince(0)).toHaveLength(3);
    expect(buf.getSince(1)).toHaveLength(2);
  });

  it('wraps around when full (ring buffer)', () => {
    const buf = new StreamBuffer(3);
    buf.push({ idx: 0 }); buf.push({ idx: 1 }); buf.push({ idx: 2 });
    buf.push({ idx: 3 }); // overwrites idx:0
    const events = buf.getAll();
    expect(events).toHaveLength(3);
    expect(events[0].idx).toBe(1);
    expect(events[2].idx).toBe(3);
  });

  it('getSince returns empty for future index', () => {
    const buf = new StreamBuffer(10);
    buf.push({ idx: 0 });
    expect(buf.getSince(999)).toHaveLength(0);
  });

  it('tracks global index across wraps', () => {
    const buf = new StreamBuffer(2);
    buf.push({ a: 1 }); buf.push({ a: 2 }); buf.push({ a: 3 });
    expect(buf.currentIndex).toBe(3);
    expect(buf.getSince(1)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/ws/stream-buffer.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement StreamBuffer**

```typescript
// packages/server/src/ws/stream-buffer.ts
export class StreamBuffer<T = unknown> {
  private buffer: (T | undefined)[];
  private head = 0;
  private globalIndex = 0;
  private count = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(event: T): number {
    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    return this.globalIndex++;
  }

  getSince(fromIndex: number): T[] {
    if (fromIndex >= this.globalIndex) return [];
    const available = Math.min(this.count, this.globalIndex - fromIndex);
    const start = (this.head - available + this.capacity) % this.capacity;
    const result: T[] = [];
    for (let i = 0; i < available; i++) {
      result.push(this.buffer[(start + i) % this.capacity]!);
    }
    return result;
  }

  getAll(): T[] {
    return this.getSince(this.globalIndex - this.count);
  }

  get currentIndex(): number {
    return this.globalIndex;
  }

  get size(): number {
    return this.count;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/ws/stream-buffer.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add chat:reconnect WS message types**

Add to `WsClientMessage` in `packages/shared/src/types.ts`:
```typescript
| { type: 'chat:reconnect'; sessionId: string; lastEventIndex: number }
```

Add to `WsServerMessage`:
```typescript
| { type: 'chat:replay'; sessionId: string; events: StreamEvent[]; currentIndex: number }
```

- [ ] **Step 6: Integrate StreamBuffer into WS handler**

In `packages/server/src/ws/handler.ts`:
- Import `StreamBuffer`; create per-session buffer map: `const sessionBuffers = new Map<string, StreamBuffer<StreamEvent>>()`
- On stream event: `const idx = buffer.push(event); send(ws, { type: 'chat:stream', sessionId, event, eventIndex: idx })`
- On `chat:reconnect`: `const events = buffer.getSince(msg.lastEventIndex); send(ws, { type: 'chat:replay', ... })`

- [ ] **Step 7: Update client WsClient to send reconnect**

In `packages/client/src/lib/ws.ts`, add `lastEventIndex` tracking per session. On socket reopen, send `chat:reconnect` if there was an active session.

- [ ] **Step 8: Run full suite, commit**

Run: `pnpm test && pnpm build`
Expected: All pass

```bash
git add packages/shared packages/server packages/client
git commit -m "feat: add stream buffer for WS reconnection replay

Ring buffer (capacity 100) stores events per session. Client sends
chat:reconnect on WS reopen; server replays missed events."
```

---

### Task 3: Multi-Tab Chat

**Files:**
- Create: `packages/client/src/hooks/useChatTabs.ts` — tab state management
- Create: `packages/client/src/components/chat/TabBar.tsx` — tab bar UI
- Modify: `packages/client/src/components/chat/ChatPanel.tsx` — integrate tabs
- Modify: `packages/client/src/hooks/useChat.ts` — accept sessionId param
- Modify: `packages/client/src/components/Sidebar.tsx` — add new nav items

**Interfaces:**
- Consumes: `useChat` hook; `ChatMessage` type; `WsServerMessage` for history
- Produces: `useChatTabs` hook with `tabs`, `activeTab`, `addTab()`, `removeTab(id)`, `switchTab(id)`; `<TabBar>` component

- [ ] **Step 1: Create useChatTabs hook**

```typescript
// packages/client/src/hooks/useChatTabs.ts
import { useState, useCallback } from 'react';

export interface ChatTab {
  id: string;
  label: string;
  sessionId: string | null;
  createdAt: number;
}

export function useChatTabs() {
  const [tabs, setTabs] = useState<ChatTab[]>([
    { id: crypto.randomUUID(), label: 'Chat 1', sessionId: null, createdAt: Date.now() },
  ]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);

  const addTab = useCallback(() => {
    const tab: ChatTab = {
      id: crypto.randomUUID(),
      label: `Chat ${tabs.length + 1}`,
      sessionId: null,
      createdAt: Date.now(),
    };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
  }, [tabs.length]);

  const removeTab = useCallback((id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        const fresh: ChatTab = { id: crypto.randomUUID(), label: 'Chat 1', sessionId: null, createdAt: Date.now() };
        setActiveTabId(fresh.id);
        return [fresh];
      }
      if (id === activeTabId) setActiveTabId(next[next.length - 1].id);
      return next;
    });
  }, [activeTabId]);

  const switchTab = useCallback((id: string) => setActiveTabId(id), []);

  const updateTabSession = useCallback((tabId: string, sessionId: string) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, sessionId } : t
    ));
  }, []);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  return { tabs, activeTab, activeTabId, addTab, removeTab, switchTab, updateTabSession };
}
```

- [ ] **Step 2: Create TabBar component**

```tsx
// packages/client/src/components/chat/TabBar.tsx
import type { ChatTab } from '../../hooks/useChatTabs';

interface Props {
  tabs: ChatTab[];
  activeTabId: string;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function TabBar({ tabs, activeTabId, onSwitch, onClose, onNew }: Props) {
  return (
    <div style={{
      display: 'flex', gap: '2px', padding: '4px 0',
      borderBottom: '1px solid var(--border)',
      overflowX: 'auto', minHeight: '36px',
    }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onSwitch(tab.id)} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '4px 12px', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
          border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
          background: tab.id === activeTabId ? 'var(--bg-surface)' : 'transparent',
          color: tab.id === activeTabId ? 'var(--fg)' : 'var(--fg3)',
          borderBottom: tab.id === activeTabId ? '2px solid var(--purple)' : '2px solid transparent',
        }}>
          {tab.label}
          {tabs.length > 1 && (
            <span onClick={e => { e.stopPropagation(); onClose(tab.id); }} style={{
              fontSize: '0.7rem', color: 'var(--fg3)', cursor: 'pointer',
              padding: '0 2px', borderRadius: '2px',
            }}>x</span>
          )}
        </button>
      ))}
      <button onClick={onNew} style={{
        padding: '4px 10px', border: 'none', background: 'transparent',
        color: 'var(--fg3)', cursor: 'pointer', fontSize: '0.9rem',
      }}>+</button>
    </div>
  );
}
```

- [ ] **Step 3: Update useChat to accept sessionId parameter**

Modify `packages/client/src/hooks/useChat.ts`:
- Change signature: `useChat(tabSessionId: string | null)`
- On `chat:start`, capture returned sessionId: `send({ type: 'chat:start', prompt, sessionId: tabSessionId || undefined })`
- On `chat:message` (follow-up): `send({ type: 'chat:message', sessionId: tabSessionId!, prompt })`

- [ ] **Step 4: Integrate TabBar into ChatPanel**

Modify `packages/client/src/components/chat/ChatPanel.tsx`:
- Import `useChatTabs` and `TabBar`
- Render `TabBar` above the chat content
- Pass `activeTab.sessionId` to `useChat`

- [ ] **Step 5: Update Sidebar with new nav items for Phase 2 pages**

Modify `packages/client/src/components/Sidebar.tsx` NAV_ITEMS:
```typescript
const NAV_ITEMS = [
  { to: '/', label: 'Chat', icon: '>' },
  { to: '/sessions', label: 'Sessions', icon: '#' },
  { to: '/capabilities', label: 'Capabilities', icon: '@' },
  { to: '/logs', label: 'Logs', icon: '~' },
  { to: '/system', label: 'System', icon: '?' },
  { to: '/kanban', label: 'Kanban', icon: '=' },
  { to: '/settings', label: 'Settings', icon: '*' },
];
```

- [ ] **Step 6: Build client, commit**

Run: `pnpm --filter @konduktor/client build`
Expected: Compiles clean

```bash
git add packages/client
git commit -m "feat: add multi-tab chat with session switching

Tab bar with add/close/switch. Each tab maintains its own session.
Sidebar updated with Phase 2 navigation items."
```

---

### Task 4: Chat History Search (FTS5)

**Files:**
- Modify: `packages/server/src/db/schema.ts` — add FTS5 virtual table + triggers
- Create: `packages/server/src/routes/search.ts` — GET /api/search?q=
- Modify: `packages/server/src/index.ts` — wire search route
- Create: `packages/client/src/components/chat/SearchBar.tsx` — search input + results
- Test: `packages/server/tests/db/search.test.ts`

**Interfaces:**
- Consumes: `chat_history` table; `getDb()` from connection
- Produces: FTS5 virtual table `chat_history_fts`; `GET /api/search?q=<query>` returns `{sessionId, content, role, highlight, createdAt}[]`

- [ ] **Step 1: Write failing test for FTS5 search**

```typescript
// packages/server/tests/db/search.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  db.exec(`INSERT INTO chat_history (session_id, role, content) VALUES
    ('s1', 'user', 'How do I deploy to production?'),
    ('s1', 'assistant', 'You can deploy using git push to the production branch'),
    ('s2', 'user', 'Fix the authentication bug'),
    ('s2', 'assistant', 'The bug was in the JWT validation middleware')`);
});

afterAll(() => db.close());

describe('FTS5 search', () => {
  it('finds messages matching query', () => {
    const rows = db.prepare(
      `SELECT session_id, role, content FROM chat_history_fts WHERE chat_history_fts MATCH ? ORDER BY rank`
    ).all('deploy');
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('returns highlighted snippets', () => {
    const rows = db.prepare(
      `SELECT session_id, highlight(chat_history_fts, 2, '<b>', '</b>') as hl
       FROM chat_history_fts WHERE chat_history_fts MATCH ?`
    ).all('authentication');
    expect(rows.length).toBe(1);
    expect((rows[0] as any).hl).toContain('<b>');
  });

  it('handles special FTS5 characters gracefully', () => {
    expect(() => {
      db.prepare(
        `SELECT * FROM chat_history_fts WHERE chat_history_fts MATCH ?`
      ).all('"unclosed quote');
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/db/search.test.ts`
Expected: FAIL — "no such table: chat_history_fts"

- [ ] **Step 3: Add FTS5 migration and search sanitizer**

Add to `MIGRATIONS` array in `packages/server/src/db/schema.ts`:
```typescript
`CREATE VIRTUAL TABLE IF NOT EXISTS chat_history_fts USING fts5(
  session_id, role, content,
  content='chat_history', content_rowid='id'
)`,
`CREATE TRIGGER IF NOT EXISTS chat_history_ai AFTER INSERT ON chat_history BEGIN
  INSERT INTO chat_history_fts(rowid, session_id, role, content)
  VALUES (new.id, new.session_id, new.role, new.content);
END`,
`CREATE TRIGGER IF NOT EXISTS chat_history_ad AFTER DELETE ON chat_history BEGIN
  INSERT INTO chat_history_fts(chat_history_fts, rowid, session_id, role, content)
  VALUES ('delete', old.id, old.session_id, old.role, old.content);
END`,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/db/search.test.ts`
Expected: PASS (3 tests). Note: the "special characters" test may need the search route to sanitize input — see next step.

- [ ] **Step 5: Create search route with FTS5 input sanitization**

```typescript
// packages/server/src/routes/search.ts
import { Router, type Router as RouterType } from 'express';
import { getDb } from '../db/connection.js';

export const searchRouter: RouterType = Router();

function sanitizeFtsQuery(raw: string): string {
  return raw.replace(/['"*(){}[\]^~\\]/g, ' ').trim().split(/\s+/).filter(Boolean).join(' ');
}

searchRouter.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) { res.json([]); return; }

  const sanitized = sanitizeFtsQuery(q);
  if (!sanitized) { res.json([]); return; }

  const db = getDb();
  const rows = db.prepare(
    `SELECT session_id, role, content,
            highlight(chat_history_fts, 2, '<mark>', '</mark>') as highlight,
            rank
     FROM chat_history_fts
     WHERE chat_history_fts MATCH ?
     ORDER BY rank
     LIMIT 50`
  ).all(sanitized);
  res.json(rows);
});
```

Wire in `packages/server/src/index.ts`:
```typescript
import { searchRouter } from './routes/search.js';
app.use('/api/search', searchRouter);
```

- [ ] **Step 6: Create SearchBar client component**

```tsx
// packages/client/src/components/chat/SearchBar.tsx
import { useState, useCallback } from 'react';

interface SearchResult {
  session_id: string;
  role: string;
  content: string;
  highlight: string;
}

export function SearchBar({ onSelectSession }: { onSelectSession: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    setResults(await res.json());
    setOpen(true);
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query} onChange={e => search(e.target.value)}
        placeholder="Search chat history..."
        style={{
          width: '100%', padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          color: 'var(--fg)', fontSize: '0.8rem',
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', maxHeight: 300, overflowY: 'auto',
          zIndex: 10, marginTop: 4,
        }}>
          {results.map((r, i) => (
            <div key={i} onClick={() => { onSelectSession(r.session_id); setOpen(false); }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem',
                borderBottom: '1px solid var(--border)',
              }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--fg3)', textTransform: 'uppercase' }}>{r.role}</span>
              <div dangerouslySetInnerHTML={{ __html: r.highlight }} style={{ lineHeight: 1.4 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Run full suite, build, commit**

Run: `pnpm test && pnpm build`
Expected: All pass

```bash
git add packages/shared packages/server packages/client
git commit -m "feat: add FTS5 chat history search

SQLite FTS5 virtual table with auto-sync triggers. Search endpoint
sanitizes FTS5 special characters. SearchBar with highlighted results."
```

---

### Task 5: Capabilities Management (Server)

**Files:**
- Create: `packages/server/src/claude/capabilities.ts` — wraps `claude mcp` and `claude plugin` CLI
- Create: `packages/server/src/routes/capabilities.ts` — REST routes
- Modify: `packages/server/src/index.ts` — wire capabilities route
- Test: `packages/server/tests/claude/capabilities.test.ts`

**Interfaces:**
- Consumes: `CONFIG.claudeBin` from config; `execFileSync` for CLI calls; `getDb()` for capabilities table
- Produces: `CapabilitiesManager` class with `listMcp()`, `addMcp(name, command, args)`, `removeMcp(name)`, `listPlugins()`, `installPlugin(id)`, `uninstallPlugin(id)`, `enablePlugin(id)`, `disablePlugin(id)`; REST routes under `/api/capabilities`

- [ ] **Step 1: Write failing test for CapabilitiesManager**

```typescript
// packages/server/tests/claude/capabilities.test.ts
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
      { id: 'test-plugin@marketplace', version: '1.0.0', scope: 'user', enabled: true }
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/claude/capabilities.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement CapabilitiesManager**

```typescript
// packages/server/src/claude/capabilities.ts
import { execFileSync } from 'node:child_process';
import { CONFIG } from '../config.js';

interface PluginListItem {
  id: string;
  version: string;
  scope: string;
  enabled: boolean;
  installPath?: string;
}

interface McpListItem {
  name: string;
  status: 'connected' | 'failed' | 'pending';
  error?: string;
}

export class CapabilitiesManager {
  listPlugins(): PluginListItem[] {
    try {
      const output = execFileSync(CONFIG.claudeBin, ['plugin', 'list', '--json'], {
        encoding: 'utf-8', timeout: 30_000,
      });
      return JSON.parse(output);
    } catch {
      return [];
    }
  }

  installPlugin(id: string): { success: boolean; error?: string } {
    try {
      execFileSync(CONFIG.claudeBin, ['plugin', 'install', id], {
        encoding: 'utf-8', timeout: 120_000,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  uninstallPlugin(id: string): { success: boolean; error?: string } {
    try {
      execFileSync(CONFIG.claudeBin, ['plugin', 'uninstall', id], {
        encoding: 'utf-8', timeout: 30_000,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  enablePlugin(id: string): { success: boolean; error?: string } {
    try {
      execFileSync(CONFIG.claudeBin, ['plugin', 'enable', id], {
        encoding: 'utf-8', timeout: 10_000,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  disablePlugin(id: string): { success: boolean; error?: string } {
    try {
      execFileSync(CONFIG.claudeBin, ['plugin', 'disable', id], {
        encoding: 'utf-8', timeout: 10_000,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  listMcp(): McpListItem[] {
    try {
      const output = execFileSync(CONFIG.claudeBin, ['mcp', 'list'], {
        encoding: 'utf-8', timeout: 60_000,
      });
      return this.parseMcpList(output);
    } catch {
      return [];
    }
  }

  private parseMcpList(output: string): McpListItem[] {
    const items: McpListItem[] = [];
    for (const line of output.split('\n')) {
      const match = line.match(/^(.+?):\s*.+\s*-\s*(✔ Connected|✘ Failed.*)$/);
      if (!match) continue;
      const name = match[1].trim();
      const statusRaw = match[2];
      items.push({
        name,
        status: statusRaw.startsWith('✔') ? 'connected' : 'failed',
        error: statusRaw.startsWith('✘') ? statusRaw.replace('✘ Failed', '').replace(/^[\s—-]+/, '').trim() : undefined,
      });
    }
    return items;
  }

  addMcp(name: string, command: string, args: string[]): { success: boolean; error?: string } {
    try {
      execFileSync(CONFIG.claudeBin, ['mcp', 'add', name, '--', command, ...args], {
        encoding: 'utf-8', timeout: 30_000,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  removeMcp(name: string): { success: boolean; error?: string } {
    try {
      execFileSync(CONFIG.claudeBin, ['mcp', 'remove', name], {
        encoding: 'utf-8', timeout: 10_000,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/claude/capabilities.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Create capabilities REST routes**

```typescript
// packages/server/src/routes/capabilities.ts
import { Router, type Router as RouterType } from 'express';
import { CapabilitiesManager } from '../claude/capabilities.js';

export const capabilitiesRouter: RouterType = Router();
const mgr = new CapabilitiesManager();

capabilitiesRouter.get('/plugins', (_req, res) => {
  res.json(mgr.listPlugins());
});

capabilitiesRouter.post('/plugins/install', (req, res) => {
  const { id } = req.body;
  if (!id || typeof id !== 'string') { res.status(400).json({ error: 'id required' }); return; }
  res.json(mgr.installPlugin(id));
});

capabilitiesRouter.post('/plugins/:id/uninstall', (req, res) => {
  res.json(mgr.uninstallPlugin(req.params.id));
});

capabilitiesRouter.post('/plugins/:id/enable', (req, res) => {
  res.json(mgr.enablePlugin(req.params.id));
});

capabilitiesRouter.post('/plugins/:id/disable', (req, res) => {
  res.json(mgr.disablePlugin(req.params.id));
});

capabilitiesRouter.get('/mcp', (_req, res) => {
  res.json(mgr.listMcp());
});

capabilitiesRouter.post('/mcp/add', (req, res) => {
  const { name, command, args } = req.body;
  if (!name || !command) { res.status(400).json({ error: 'name and command required' }); return; }
  res.json(mgr.addMcp(name, command, args || []));
});

capabilitiesRouter.delete('/mcp/:name', (req, res) => {
  res.json(mgr.removeMcp(req.params.name));
});
```

Wire in `packages/server/src/index.ts`:
```typescript
import { capabilitiesRouter } from './routes/capabilities.js';
app.use('/api/capabilities', capabilitiesRouter);
```

- [ ] **Step 6: Run full suite, build, commit**

Run: `pnpm test && pnpm build`
Expected: All pass

```bash
git add packages/server
git commit -m "feat: add capabilities management server routes

CapabilitiesManager wraps claude mcp and claude plugin CLI.
REST API for list/add/remove MCP, list/install/uninstall/enable/disable plugins."
```

---

### Task 6: Capabilities Management (UI)

**Files:**
- Create: `packages/client/src/components/capabilities/CapabilitiesPage.tsx` — tabbed MCP + Plugins view
- Create: `packages/client/src/components/capabilities/McpTab.tsx` — MCP server list + add form
- Create: `packages/client/src/components/capabilities/PluginsTab.tsx` — plugin list + actions
- Modify: `packages/client/src/App.tsx` — add /capabilities route

**Interfaces:**
- Consumes: `GET /api/capabilities/plugins`, `GET /api/capabilities/mcp`, POST routes from Task 5
- Produces: `<CapabilitiesPage>` component with MCP and Plugins tabs

- [ ] **Step 1: Create McpTab component**

```tsx
// packages/client/src/components/capabilities/McpTab.tsx
import { useState, useEffect, useCallback } from 'react';

interface McpServer { name: string; status: string; error?: string; }

export function McpTab() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newCommand, setNewCommand] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/capabilities/mcp');
      setServers(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addServer = async () => {
    if (!newName.trim() || !newCommand.trim()) return;
    const parts = newCommand.trim().split(/\s+/);
    await fetch('/api/capabilities/mcp/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, command: parts[0], args: parts.slice(1) }),
    });
    setNewName(''); setNewCommand('');
    refresh();
  };

  const removeServer = async (name: string) => {
    await fetch(`/api/capabilities/mcp/${encodeURIComponent(name)}`, { method: 'DELETE' });
    refresh();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input value={newName} onChange={e => setNewName(e.target.value)}
          placeholder="Server name" style={{
            padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', background: 'var(--bg)',
            color: 'var(--fg)', fontSize: '0.8rem', width: '140px',
          }} />
        <input value={newCommand} onChange={e => setNewCommand(e.target.value)}
          placeholder="npx -y @example/mcp-server" style={{
            flex: 1, padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', background: 'var(--bg)',
            color: 'var(--fg)', fontSize: '0.8rem',
          }} />
        <button onClick={addServer} style={{
          padding: '8px 16px', borderRadius: 'var(--radius-md)',
          border: 'none', background: 'var(--purple)',
          color: 'white', fontSize: '0.8rem', cursor: 'pointer',
        }}>Add</button>
      </div>
      {loading && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>Loading MCP servers...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {servers.map(s => (
          <div key={s.name} style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: s.status === 'connected' ? 'var(--green)' : 'var(--red)',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.name}</div>
              {s.error && <div style={{ fontSize: '0.7rem', color: 'var(--red)' }}>{s.error}</div>}
            </div>
            <button onClick={() => removeServer(s.name)} style={{
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--red)', fontSize: '0.7rem', cursor: 'pointer',
            }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create PluginsTab component**

```tsx
// packages/client/src/components/capabilities/PluginsTab.tsx
import { useState, useEffect, useCallback } from 'react';

interface Plugin { id: string; version: string; scope: string; enabled: boolean; }

export function PluginsTab() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [installId, setInstallId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/capabilities/plugins');
      setPlugins(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const install = async () => {
    if (!installId.trim()) return;
    await fetch('/api/capabilities/plugins/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: installId }),
    });
    setInstallId('');
    refresh();
  };

  const toggle = async (p: Plugin) => {
    const action = p.enabled ? 'disable' : 'enable';
    await fetch(`/api/capabilities/plugins/${encodeURIComponent(p.id)}/${action}`, { method: 'POST' });
    refresh();
  };

  const uninstall = async (id: string) => {
    await fetch(`/api/capabilities/plugins/${encodeURIComponent(id)}/uninstall`, { method: 'POST' });
    refresh();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input value={installId} onChange={e => setInstallId(e.target.value)}
          placeholder="plugin-name@marketplace" style={{
            flex: 1, padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', background: 'var(--bg)',
            color: 'var(--fg)', fontSize: '0.8rem',
          }} />
        <button onClick={install} style={{
          padding: '8px 16px', borderRadius: 'var(--radius-md)',
          border: 'none', background: 'var(--purple)',
          color: 'white', fontSize: '0.8rem', cursor: 'pointer',
        }}>Install</button>
      </div>
      {loading && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>Loading plugins...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {plugins.map(p => (
          <div key={p.id} style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.id}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--fg3)' }}>
                v{p.version} | {p.scope} | {p.enabled ? 'enabled' : 'disabled'}
              </div>
            </div>
            <button onClick={() => toggle(p)} style={{
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: p.enabled ? 'var(--amber)' : 'var(--green)',
              fontSize: '0.7rem', cursor: 'pointer',
            }}>{p.enabled ? 'Disable' : 'Enable'}</button>
            <button onClick={() => uninstall(p.id)} style={{
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--red)', fontSize: '0.7rem', cursor: 'pointer',
            }}>Uninstall</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create CapabilitiesPage with tabs**

```tsx
// packages/client/src/components/capabilities/CapabilitiesPage.tsx
import { useState } from 'react';
import { McpTab } from './McpTab';
import { PluginsTab } from './PluginsTab';

const TABS = ['MCP Servers', 'Plugins'] as const;

export function CapabilitiesPage() {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('MCP Servers');

  return (
    <div>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>Capabilities</h2>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '6px 14px', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
            border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
            background: activeTab === tab ? 'var(--bg-surface)' : 'transparent',
            color: activeTab === tab ? 'var(--fg)' : 'var(--fg3)',
            borderBottom: activeTab === tab ? '2px solid var(--purple)' : '2px solid transparent',
          }}>{tab}</button>
        ))}
      </div>
      {activeTab === 'MCP Servers' && <McpTab />}
      {activeTab === 'Plugins' && <PluginsTab />}
    </div>
  );
}
```

- [ ] **Step 4: Wire to router**

In `packages/client/src/App.tsx`, import and add route:
```tsx
import { CapabilitiesPage } from './components/capabilities/CapabilitiesPage';
<Route path="/capabilities" element={<CapabilitiesPage />} />
```

- [ ] **Step 5: Build client, commit**

Run: `pnpm --filter @konduktor/client build`
Expected: Compiles clean

```bash
git add packages/client
git commit -m "feat: add capabilities management UI

MCP servers tab with add/remove and status indicator.
Plugins tab with install/uninstall/enable/disable controls."
```

---

### Task 7: System Info Page

**Files:**
- Create: `packages/server/src/routes/system.ts` — GET /api/system
- Create: `packages/client/src/components/system/SystemPage.tsx`
- Modify: `packages/server/src/index.ts` — wire system route
- Modify: `packages/client/src/App.tsx` — add /system route
- Test: `packages/server/tests/routes/system.test.ts`

**Interfaces:**
- Consumes: `detectClaude()` from server detect; Node.js `os` module; `process.version`
- Produces: `GET /api/system` returns `{ node, os, platform, arch, uptime, memory, claude, cpus }`; `<SystemPage>` component

- [ ] **Step 1: Write failing test for system endpoint**

```typescript
// packages/server/tests/routes/system.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createApp } from '../../src/index.js';
import { createServer, type Server } from 'node:http';

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
});

afterAll(() => server.close());

describe('System info', () => {
  it('GET /api/system returns system info', async () => {
    const res = await fetch(`http://localhost:${port}/api/system`);
    const body = await res.json();
    expect(body.node).toBeDefined();
    expect(body.platform).toBeDefined();
    expect(body.memory).toBeDefined();
    expect(body.memory.totalMb).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/routes/system.test.ts`
Expected: FAIL — 404 or route not found

- [ ] **Step 3: Implement system route**

```typescript
// packages/server/src/routes/system.ts
import { Router, type Router as RouterType } from 'express';
import { cpus, totalmem, freemem, platform, arch, uptime, hostname, type } from 'node:os';
import { detectClaude } from '../claude/detect.js';

export const systemRouter: RouterType = Router();

systemRouter.get('/', (_req, res) => {
  const mem = { totalMb: Math.round(totalmem() / 1048576), freeMb: Math.round(freemem() / 1048576) };
  res.json({
    node: process.version,
    platform: platform(),
    arch: arch(),
    hostname: hostname(),
    osType: type(),
    uptime: Math.round(uptime()),
    cpus: cpus().length,
    memory: mem,
    claude: detectClaude(),
    konduktor: { version: '0.1.0', pid: process.pid, uptimeSeconds: Math.round(process.uptime()) },
  });
});
```

Wire in `packages/server/src/index.ts`:
```typescript
import { systemRouter } from './routes/system.js';
app.use('/api/system', systemRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/routes/system.test.ts`
Expected: PASS

- [ ] **Step 5: Create SystemPage component**

```tsx
// packages/client/src/components/system/SystemPage.tsx
import { useState, useEffect } from 'react';

interface SystemInfo {
  node: string; platform: string; arch: string; hostname: string;
  osType: string; uptime: number; cpus: number;
  memory: { totalMb: number; freeMb: number };
  claude: { installed: boolean; version?: string; authenticated: boolean };
  konduktor: { version: string; pid: number; uptimeSeconds: number };
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

export function SystemPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    fetch('/api/system').then(r => r.json()).then(setInfo);
    const interval = setInterval(() => {
      fetch('/api/system').then(r => r.json()).then(setInfo);
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (!info) return <p style={{ color: 'var(--fg3)' }}>Loading...</p>;

  const rows: [string, string][] = [
    ['Node.js', info.node],
    ['Platform', `${info.osType} ${info.platform} ${info.arch}`],
    ['Hostname', info.hostname],
    ['CPUs', String(info.cpus)],
    ['Memory', `${info.memory.freeMb} MB free / ${info.memory.totalMb} MB`],
    ['OS Uptime', fmtUptime(info.uptime)],
    ['Claude CLI', info.claude.installed ? `${info.claude.version} (${info.claude.authenticated ? 'authenticated' : 'not authenticated'})` : 'Not installed'],
    ['Konduktor', `v${info.konduktor.version} (pid ${info.konduktor.pid}, up ${fmtUptime(info.konduktor.uptimeSeconds)})`],
  ];

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>System</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{
            display: 'flex', padding: '10px 14px',
            background: 'var(--bg-surface)', fontSize: '0.85rem',
          }}>
            <span style={{ width: 140, flexShrink: 0, fontWeight: 600, color: 'var(--fg2)' }}>{label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Wire in `packages/client/src/App.tsx`:
```tsx
import { SystemPage } from './components/system/SystemPage';
<Route path="/system" element={<SystemPage />} />
```

- [ ] **Step 6: Build, commit**

Run: `pnpm test && pnpm build`
Expected: All pass

```bash
git add packages/server packages/client
git commit -m "feat: add system info page

Shows Node.js, OS, CPU, memory, Claude CLI status, Konduktor version.
Auto-refreshes every 10 seconds."
```

---

### Task 8: Logs Page

**Files:**
- Create: `packages/server/src/routes/logs.ts` — GET /api/logs
- Create: `packages/client/src/components/logs/LogsPage.tsx`
- Modify: `packages/server/src/index.ts` — wire logs route
- Modify: `packages/client/src/App.tsx` — add /logs route
- Test: `packages/server/tests/routes/logs.test.ts`

**Interfaces:**
- Consumes: `claude logs <id>` CLI command; `getDb()` for chat_history
- Produces: `GET /api/logs?sessionId=<id>` returns recent log lines; `<LogsPage>` component

- [ ] **Step 1: Write failing test for logs endpoint**

```typescript
// packages/server/tests/routes/logs.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createApp } from '../../src/index.js';
import { createServer, type Server } from 'node:http';

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
});

afterAll(() => server.close());

describe('Logs endpoint', () => {
  it('GET /api/logs returns array', async () => {
    const res = await fetch(`http://localhost:${port}/api/logs`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/routes/logs.test.ts`
Expected: FAIL — 404

- [ ] **Step 3: Implement logs route**

```typescript
// packages/server/src/routes/logs.ts
import { Router, type Router as RouterType } from 'express';
import { execFileSync } from 'node:child_process';
import { CONFIG } from '../config.js';
import { getDb } from '../db/connection.js';

export const logsRouter: RouterType = Router();

logsRouter.get('/', (req, res) => {
  const sessionId = req.query.sessionId as string | undefined;

  if (sessionId) {
    try {
      const output = execFileSync(CONFIG.claudeBin, ['logs', sessionId], {
        encoding: 'utf-8', timeout: 10_000,
      });
      res.json(output.split('\n').filter(Boolean).map(line => ({
        timestamp: Date.now(), content: line,
      })));
      return;
    } catch {
      res.json([]);
      return;
    }
  }

  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT session_id, role, content, created_at FROM chat_history
       ORDER BY created_at DESC LIMIT 100`
    ).all();
    res.json(rows);
  } catch {
    res.json([]);
  }
});
```

Wire in `packages/server/src/index.ts`:
```typescript
import { logsRouter } from './routes/logs.js';
app.use('/api/logs', logsRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/routes/logs.test.ts`
Expected: PASS

- [ ] **Step 5: Create LogsPage component**

```tsx
// packages/client/src/components/logs/LogsPage.tsx
import { useState, useEffect, useCallback } from 'react';

interface LogEntry {
  session_id?: string;
  role?: string;
  content: string;
  created_at?: number;
  timestamp?: number;
}

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionFilter, setSessionFilter] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const url = sessionFilter ? `/api/logs?sessionId=${encodeURIComponent(sessionFilter)}` : '/api/logs';
    try {
      const res = await fetch(url);
      setLogs(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [sessionFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Logs</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input value={sessionFilter} onChange={e => setSessionFilter(e.target.value)}
            placeholder="Filter by session ID..." style={{
              padding: '6px 10px', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', background: 'var(--bg)',
              color: 'var(--fg)', fontSize: '0.8rem', width: '200px',
            }} />
          <button onClick={refresh} style={{
            padding: '6px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            cursor: 'pointer', fontSize: '0.8rem', color: 'var(--fg2)',
          }}>Refresh</button>
        </div>
      </div>
      {loading && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>Loading...</p>}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)', maxHeight: 'calc(100vh - 160px)',
        overflowY: 'auto', padding: '8px',
      }}>
        {logs.map((entry, i) => (
          <div key={i} style={{
            padding: '2px 0', borderBottom: '1px solid var(--border)',
            display: 'flex', gap: '8px',
          }}>
            {entry.session_id && <span style={{ color: 'var(--purple)', minWidth: 60 }}>{entry.session_id.slice(0, 8)}</span>}
            {entry.role && <span style={{ color: 'var(--cyan)', minWidth: 50, textTransform: 'uppercase' }}>{entry.role}</span>}
            <span style={{ color: 'var(--fg)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{entry.content}</span>
          </div>
        ))}
        {!loading && logs.length === 0 && <p style={{ color: 'var(--fg3)' }}>No logs</p>}
      </div>
    </div>
  );
}
```

Wire in `packages/client/src/App.tsx`:
```tsx
import { LogsPage } from './components/logs/LogsPage';
<Route path="/logs" element={<LogsPage />} />
```

- [ ] **Step 6: Build, commit**

Run: `pnpm test && pnpm build`
Expected: All pass

```bash
git add packages/server packages/client
git commit -m "feat: add logs page with session filtering

Shows recent chat history from DB. Session ID filter fetches
live logs from claude logs CLI command."
```

---

### Task 9: Kanban Board

**Files:**
- Modify: `packages/server/src/db/schema.ts` — add `kanban_tasks` table migration
- Create: `packages/server/src/db/kanban-repository.ts` — CRUD for kanban tasks
- Create: `packages/server/src/routes/kanban.ts` — REST routes
- Create: `packages/client/src/components/kanban/KanbanPage.tsx` — board with columns
- Create: `packages/client/src/components/kanban/KanbanCard.tsx` — task card
- Modify: `packages/server/src/index.ts` — wire kanban route
- Modify: `packages/client/src/App.tsx` — add /kanban route
- Test: `packages/server/tests/db/kanban.test.ts`

**Interfaces:**
- Consumes: `getDb()` from connection
- Produces: `KanbanRepository` with `create(task)`, `update(id, patch)`, `delete(id)`, `list()`, `moveToColumn(id, column)`; REST API under `/api/kanban`; `<KanbanPage>` component

- [ ] **Step 1: Write failing test for KanbanRepository**

```typescript
// packages/server/tests/db/kanban.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';
import { KanbanRepository } from '../../src/db/kanban-repository.js';

let db: Database.Database;
let repo: KanbanRepository;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  repo = new KanbanRepository(db);
});

afterAll(() => db.close());

describe('KanbanRepository', () => {
  it('creates and lists tasks', () => {
    repo.create({ title: 'Build feature', column: 'backlog' });
    repo.create({ title: 'Fix bug', column: 'in-progress', sessionId: 'sess-1' });
    const tasks = repo.list();
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('Build feature');
  });

  it('moves task to different column', () => {
    const tasks = repo.list();
    repo.moveToColumn(tasks[0].id, 'in-progress');
    const updated = repo.list();
    expect(updated.find(t => t.id === tasks[0].id)!.column).toBe('in-progress');
  });

  it('deletes task without affecting linked session', () => {
    const tasks = repo.list();
    const withSession = tasks.find(t => t.sessionId === 'sess-1')!;
    repo.delete(withSession.id);
    const remaining = repo.list();
    expect(remaining.find(t => t.id === withSession.id)).toBeUndefined();
  });

  it('updates task fields', () => {
    const tasks = repo.list();
    repo.update(tasks[0].id, { title: 'Updated title', description: 'some desc' });
    const updated = repo.list();
    expect(updated[0].title).toBe('Updated title');
    expect(updated[0].description).toBe('some desc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/db/kanban.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Add kanban_tasks migration**

Add to `MIGRATIONS` array in `packages/server/src/db/schema.ts`:
```typescript
`CREATE TABLE IF NOT EXISTS kanban_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  column_name TEXT NOT NULL DEFAULT 'backlog',
  session_id TEXT,
  position INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
)`,
`CREATE INDEX IF NOT EXISTS idx_kanban_column ON kanban_tasks(column_name)`,
```

- [ ] **Step 4: Implement KanbanRepository**

```typescript
// packages/server/src/db/kanban-repository.ts
import type Database from 'better-sqlite3';

export interface KanbanTask {
  id: number;
  title: string;
  description: string;
  column: string;
  sessionId: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export class KanbanRepository {
  constructor(private db: Database.Database) {}

  create(data: { title: string; column?: string; description?: string; sessionId?: string }): KanbanTask {
    const stmt = this.db.prepare(
      `INSERT INTO kanban_tasks (title, description, column_name, session_id) VALUES (?, ?, ?, ?)`
    );
    const result = stmt.run(data.title, data.description || '', data.column || 'backlog', data.sessionId || null);
    return this.getById(result.lastInsertRowid as number)!;
  }

  list(): KanbanTask[] {
    const rows = this.db.prepare(
      `SELECT * FROM kanban_tasks ORDER BY column_name, position, created_at`
    ).all() as Record<string, unknown>[];
    return rows.map(this.mapRow);
  }

  getById(id: number): KanbanTask | undefined {
    const row = this.db.prepare(`SELECT * FROM kanban_tasks WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  update(id: number, patch: Partial<{ title: string; description: string; sessionId: string | null }>): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (patch.title !== undefined) { sets.push('title = ?'); vals.push(patch.title); }
    if (patch.description !== undefined) { sets.push('description = ?'); vals.push(patch.description); }
    if (patch.sessionId !== undefined) { sets.push('session_id = ?'); vals.push(patch.sessionId); }
    sets.push('updated_at = unixepoch()');
    vals.push(id);
    this.db.prepare(`UPDATE kanban_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  moveToColumn(id: number, column: string): void {
    this.db.prepare(`UPDATE kanban_tasks SET column_name = ?, updated_at = unixepoch() WHERE id = ?`).run(column, id);
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM kanban_tasks WHERE id = ?`).run(id);
  }

  private mapRow(r: Record<string, unknown>): KanbanTask {
    return {
      id: r.id as number, title: r.title as string, description: (r.description as string) || '',
      column: r.column_name as string, sessionId: r.session_id as string | null,
      position: r.position as number,
      createdAt: (r.created_at as number) * 1000, updatedAt: (r.updated_at as number) * 1000,
    };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/db/kanban.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Create kanban REST routes**

```typescript
// packages/server/src/routes/kanban.ts
import { Router, type Router as RouterType } from 'express';
import { KanbanRepository } from '../db/kanban-repository.js';
import { getDb } from '../db/connection.js';

export const kanbanRouter: RouterType = Router();

kanbanRouter.get('/', (_req, res) => {
  const repo = new KanbanRepository(getDb());
  res.json(repo.list());
});

kanbanRouter.post('/', (req, res) => {
  const { title, column, description, sessionId } = req.body;
  if (!title || typeof title !== 'string') { res.status(400).json({ error: 'title required' }); return; }
  const repo = new KanbanRepository(getDb());
  res.json(repo.create({ title, column, description, sessionId }));
});

kanbanRouter.put('/:id', (req, res) => {
  const repo = new KanbanRepository(getDb());
  repo.update(Number(req.params.id), req.body);
  const updated = repo.getById(Number(req.params.id));
  res.json(updated);
});

kanbanRouter.put('/:id/move', (req, res) => {
  const { column } = req.body;
  if (!column) { res.status(400).json({ error: 'column required' }); return; }
  const repo = new KanbanRepository(getDb());
  repo.moveToColumn(Number(req.params.id), column);
  res.json({ success: true });
});

kanbanRouter.delete('/:id', (req, res) => {
  const repo = new KanbanRepository(getDb());
  repo.delete(Number(req.params.id));
  res.json({ success: true });
});
```

Wire in `packages/server/src/index.ts`:
```typescript
import { kanbanRouter } from './routes/kanban.js';
app.use('/api/kanban', kanbanRouter);
```

- [ ] **Step 7: Create KanbanCard component**

```tsx
// packages/client/src/components/kanban/KanbanCard.tsx
interface Props {
  task: { id: number; title: string; description: string; sessionId: string | null };
  onMove: (id: number, column: string) => void;
  onDelete: (id: number) => void;
  columns: string[];
  currentColumn: string;
}

export function KanbanCard({ task, onMove, onDelete, columns, currentColumn }: Props) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)', background: 'var(--bg)',
      marginBottom: '6px',
    }}>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>{task.title}</div>
      {task.description && <div style={{ fontSize: '0.75rem', color: 'var(--fg3)', marginBottom: '6px' }}>{task.description}</div>}
      {task.sessionId && <div style={{ fontSize: '0.7rem', color: 'var(--cyan)' }}>Session: {task.sessionId.slice(0, 8)}</div>}
      <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
        {columns.filter(c => c !== currentColumn).map(col => (
          <button key={col} onClick={() => onMove(task.id, col)} style={{
            padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)',
            background: 'var(--bg-surface)', color: 'var(--fg3)',
            fontSize: '0.65rem', cursor: 'pointer',
          }}>{col}</button>
        ))}
        <button onClick={() => onDelete(task.id)} style={{
          padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)',
          background: 'var(--bg-surface)', color: 'var(--red)',
          fontSize: '0.65rem', cursor: 'pointer', marginLeft: 'auto',
        }}>x</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create KanbanPage component**

```tsx
// packages/client/src/components/kanban/KanbanPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { KanbanCard } from './KanbanCard';

interface Task { id: number; title: string; description: string; column: string; sessionId: string | null; }

const COLUMNS = ['backlog', 'in-progress', 'review', 'done'];
const COLUMN_COLORS: Record<string, string> = {
  backlog: 'var(--fg3)', 'in-progress': 'var(--purple)', review: 'var(--amber)', done: 'var(--green)',
};

export function KanbanPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');

  const refresh = useCallback(async () => {
    const res = await fetch('/api/kanban');
    setTasks(await res.json());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addTask = async () => {
    if (!newTitle.trim()) return;
    await fetch('/api/kanban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, column: 'backlog' }),
    });
    setNewTitle('');
    refresh();
  };

  const moveTask = async (id: number, column: string) => {
    await fetch(`/api/kanban/${id}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column }),
    });
    refresh();
  };

  const deleteTask = async (id: number) => {
    await fetch(`/api/kanban/${id}`, { method: 'DELETE' });
    refresh();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Kanban</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="New task..." style={{
              padding: '6px 10px', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', background: 'var(--bg)',
              color: 'var(--fg)', fontSize: '0.8rem', width: '200px',
            }} />
          <button onClick={addTask} style={{
            padding: '6px 12px', borderRadius: 'var(--radius-sm)',
            border: 'none', background: 'var(--purple)',
            color: 'white', fontSize: '0.8rem', cursor: 'pointer',
          }}>Add</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`, gap: '12px', minHeight: 400 }}>
        {COLUMNS.map(col => (
          <div key={col} style={{
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)', padding: '10px',
          }}>
            <h3 style={{
              fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.05em', color: COLUMN_COLORS[col],
              marginBottom: '10px',
            }}>{col} ({tasks.filter(t => t.column === col).length})</h3>
            {tasks.filter(t => t.column === col).map(task => (
              <KanbanCard key={task.id} task={task} onMove={moveTask} onDelete={deleteTask}
                columns={COLUMNS} currentColumn={col} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Wire in `packages/client/src/App.tsx`:
```tsx
import { KanbanPage } from './components/kanban/KanbanPage';
<Route path="/kanban" element={<KanbanPage />} />
```

- [ ] **Step 9: Run full suite, build, commit**

Run: `pnpm test && pnpm build`
Expected: All pass

```bash
git add packages/shared packages/server packages/client
git commit -m "feat: add kanban board with columns and task management

Four columns (backlog, in-progress, review, done). Tasks persisted
in SQLite. Move between columns, link to sessions, create/delete."
```

---

### Task 10: Subagent Watch + detectClaude Dedup

**Files:**
- Create: `packages/shared/src/detect-claude.ts` — deduplicated detectClaude
- Modify: `packages/server/src/claude/detect.ts` — re-export from shared
- Modify: `packages/cli/src/commands/detect.ts` — re-export from shared
- Create: `packages/server/src/routes/agents.ts` — GET /api/agents (live agent tree)
- Create: `packages/client/src/components/agents/AgentWatch.tsx` — tree view
- Modify: `packages/server/src/index.ts` — wire agents route
- Modify: `packages/client/src/App.tsx` — add /agents route (nested under sessions)
- Test: `packages/server/tests/routes/agents.test.ts`

**Interfaces:**
- Consumes: `claude agents --json` CLI command; `execFileSync` pattern
- Produces: `GET /api/agents` returns `Session[]` from `claude agents --json --all`; `<AgentWatch>` tree view component; `detectClaude()` now lives in `@konduktor/shared`

- [ ] **Step 1: Write failing test for agents endpoint**

```typescript
// packages/server/tests/routes/agents.test.ts
import { describe, it, expect, vi, afterAll, beforeAll } from 'vitest';
import { createApp } from '../../src/index.js';
import { createServer, type Server } from 'node:http';

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
});

afterAll(() => server.close());

describe('Agents endpoint', () => {
  it('GET /api/agents returns array', async () => {
    const res = await fetch(`http://localhost:${port}/api/agents`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/routes/agents.test.ts`
Expected: FAIL — 404

- [ ] **Step 3: Deduplicate detectClaude to shared**

```typescript
// packages/shared/src/detect-claude.ts
import { execFileSync } from 'node:child_process';
import type { ClaudeCodeInfo } from './types.js';

export function detectClaude(claudeBin = 'claude'): ClaudeCodeInfo {
  try {
    const version = execFileSync(claudeBin, ['--version'], {
      encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const path = execFileSync('which', [claudeBin], {
      encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    let authenticated = false;
    try {
      const authCheck = execFileSync(claudeBin, ['auth', 'status'], {
        encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      });
      authenticated = authCheck.includes('authenticated') || authCheck.includes('logged in');
    } catch {
      authenticated = false;
    }

    return { installed: true, version, path, authenticated };
  } catch {
    return { installed: false, authenticated: false };
  }
}
```

Update `packages/shared/src/index.ts`:
```typescript
export * from './types.js';
export * from './constants.js';
export { detectClaude } from './detect-claude.js';
```

Update `packages/server/src/claude/detect.ts`:
```typescript
import { detectClaude as _detectClaude } from '@konduktor/shared';
import { CONFIG } from '../config.js';
export function detectClaude() { return _detectClaude(CONFIG.claudeBin); }
```

Update `packages/cli/src/commands/detect.ts`:
```typescript
export { detectClaude } from '@konduktor/shared';
```

- [ ] **Step 4: Create agents route**

```typescript
// packages/server/src/routes/agents.ts
import { Router, type Router as RouterType } from 'express';
import { execFileSync } from 'node:child_process';
import { CONFIG } from '../config.js';

export const agentsRouter: RouterType = Router();

agentsRouter.get('/', (req, res) => {
  const includeAll = req.query.all === 'true';
  try {
    const args = includeAll ? ['agents', '--json', '--all'] : ['agents', '--json'];
    const output = execFileSync(CONFIG.claudeBin, args, {
      encoding: 'utf-8', timeout: 10_000,
    });
    res.json(JSON.parse(output));
  } catch {
    res.json([]);
  }
});
```

Wire in `packages/server/src/index.ts`:
```typescript
import { agentsRouter } from './routes/agents.js';
app.use('/api/agents', agentsRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/routes/agents.test.ts`
Expected: PASS

- [ ] **Step 6: Create AgentWatch component**

```tsx
// packages/client/src/components/agents/AgentWatch.tsx
import { useState, useEffect, useCallback } from 'react';

interface Agent {
  pid: number; cwd: string; kind: string; startedAt: number;
  sessionId: string; name: string; status: string;
}

export function AgentWatch() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents?all=${showAll}`);
      setAgents(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [showAll]);

  useEffect(() => { refresh(); const iv = setInterval(refresh, 5000); return () => clearInterval(iv); }, [refresh]);

  const statusColor = (s: string) => s === 'busy' ? 'var(--green)' : s === 'idle' ? 'var(--amber)' : 'var(--fg3)';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Agent Watch</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          Show completed
        </label>
      </div>
      {loading && agents.length === 0 && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>Loading...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {agents.map(a => (
          <div key={a.sessionId} style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(a.status), flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.name}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--fg3)' }}>
                {a.kind} | pid {a.pid} | {a.cwd}
              </div>
            </div>
            <span style={{
              padding: '2px 8px', borderRadius: 'var(--radius-sm)',
              background: a.status === 'busy' ? 'var(--green-soft, rgba(34,197,94,0.1))' : 'var(--bg-raised)',
              fontSize: '0.7rem', fontWeight: 600, color: statusColor(a.status),
            }}>{a.status}</span>
          </div>
        ))}
        {!loading && agents.length === 0 && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>No active agents</p>}
      </div>
    </div>
  );
}
```

Wire in `packages/client/src/App.tsx`:
```tsx
import { AgentWatch } from './components/agents/AgentWatch';
<Route path="/agents" element={<AgentWatch />} />
```

Update Sidebar to add Agents nav item:
```typescript
{ to: '/agents', label: 'Agents', icon: '&' },
```

- [ ] **Step 7: Run full suite, build, commit**

Run: `pnpm test && pnpm build`
Expected: All pass

```bash
git add packages/shared packages/server packages/cli packages/client
git commit -m "feat: add agent watch and deduplicate detectClaude

Live agent tree view with auto-refresh (5s). detectClaude moved
to @konduktor/shared, re-exported by server and cli packages.
REST endpoint wraps claude agents --json."
```

---

## Summary

| Task | Deliverable | Key Files | Est. Commits |
|------|------------|-----------|-------------|
| 1 | Multi-turn chat + history persistence | chat-repository.ts, handler.ts, chat-history.ts | 1 |
| 2 | Stream buffer for WS reconnect | stream-buffer.ts, handler.ts, ws.ts | 1 |
| 3 | Multi-tab chat | useChatTabs.ts, TabBar.tsx, ChatPanel.tsx | 1 |
| 4 | Chat history search (FTS5) | schema.ts, search.ts, SearchBar.tsx | 1 |
| 5 | Capabilities management (server) | capabilities.ts, capabilities routes | 1 |
| 6 | Capabilities management (UI) | McpTab.tsx, PluginsTab.tsx, CapabilitiesPage.tsx | 1 |
| 7 | System info page | system.ts, SystemPage.tsx | 1 |
| 8 | Logs page | logs.ts, LogsPage.tsx | 1 |
| 9 | Kanban board | kanban-repository.ts, kanban routes, KanbanPage.tsx | 1 |
| 10 | Subagent watch + detectClaude dedup | detect-claude.ts, agents.ts, AgentWatch.tsx | 1 |
| **Total** | **Phase 2 complete** | **~30 new files** | **10** |
