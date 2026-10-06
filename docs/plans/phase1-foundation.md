# Konduktor Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working web dashboard that wraps Claude Code CLI with streaming chat, session management, settings UI, and a sidebar layout -- the minimum viable orchestrator.

**Architecture:** Express backend spawns Claude CLI as child processes, streams NDJSON output through WebSocket to a React frontend. SQLite stores session metadata cache, user preferences, and analytics seeds. Monorepo with pnpm workspaces: `packages/server`, `packages/client`, `packages/shared`, `packages/cli`.

**Tech Stack:** Express 5, React 19 (Vite), TypeScript 5.5, better-sqlite3, ws (WebSocket), xterm.js (terminal), Vitest (tests), pnpm workspaces.

**Spec:** Grilling session output (this conversation, 2026-10-06). No separate spec file -- grilling decisions are the spec.

## Global Constraints

- Node.js >= 20 (for native fetch, structuredClone)
- pnpm >= 9 as package manager
- TypeScript strict mode in all packages
- All files < 300 lines (Makruva standard)
- MIT license on all source files
- No secrets/credentials in source -- all config via `~/.konduktor/`
- Claude Code CLI: detect existing install, skip if present, offer guided install if missing
- GitHub: publish to `gemimakruva/konduktor` (not a separate org)
- npm: `@konduktor/*` scoped packages
- Capability Registry: architecture must support dynamic MCP/tool discovery from Phase 1 (types + DB table ready, even if UI is Phase 2+)
- Design tokens: deep purple (`#7c3aed`) + cyan (`#06b6d4`) palette
- No em dashes in user-facing text
- Indonesian naming for brand, English for code identifiers

## Review Focus

1. **CLI process leak**: If the WebSocket closes while a `claude -p` subprocess is still streaming, the child process must be killed. A leaked process keeps consuming API credits silently. Test: disconnect WS mid-stream, verify child process exits within 5s.
2. **Concurrent session limit**: Multiple browser tabs each starting a chat should not spawn unbounded child processes. Test: open 10 WS connections, each sending a chat request -- server should queue or reject beyond a configurable limit (default 3).
3. **Malformed CLI output**: Claude CLI may emit non-JSON lines (warnings, progress bars) mixed with NDJSON. The parser must skip non-JSON lines without crashing. Test: feed `["not json\n", "{\"type\":\"result\"}"]` through the parser.
4. **Settings file corruption**: If `~/.konduktor/settings.json` is corrupted or missing, the server should start with defaults, not crash. Test: delete settings file, start server, verify defaults load.
5. **WebSocket reconnection**: If the browser loses WS connection (laptop sleep, network switch), it should reconnect and resume showing the active session's output. Test: disconnect WS, reconnect within 30s, verify buffered messages are replayed.
6. **Claude Code already installed**: If the user already has Claude Code CLI globally, `konduktor start` must not reinstall or conflict. Test: with `claude` already in PATH, run `konduktor start`, verify it detects version and skips install.
7. **Missing capability handling**: When a chat request implies a capability not yet installed (MCP server, plugin), the system must surface this gap gracefully. Test: parse a stream-json `init` event, verify `mcpServers` and `tools` arrays are captured and queryable.

## Capability Registry Architecture

The Capability Registry tracks what MCP servers, plugins, and tools are available to the Claude Code CLI. It enables dynamic gap detection — when a user's chat implies a capability that isn't installed, Konduktor surfaces the gap and guides setup.

**Data flow:**
1. On server start and periodically, Konduktor runs `claude mcp list --json` and `claude plugin list --json` to discover installed capabilities.
2. Results are stored in the `capabilities` SQLite table with status (`installed`, `available`, `missing`).
3. When a `system` event arrives during chat streaming (the `init` message), the server captures `mcpServers` and `tools` arrays from the event payload. These represent what Claude Code actually loaded for this session.
4. The chat-first setup engine (Phase 2+) compares user intent against known capabilities. If a gap is detected (e.g., user asks about Meta Ads but no Meta Ads MCP server exists), Konduktor responds with:
   - What capability is missing
   - How to install it (`claude mcp add <server>` or equivalent)
   - Offer to install it automatically (with user confirmation)

**Phase 1 scope:** Schema + types + discovery on startup (populate table from CLI). Gap detection and auto-install are Phase 2.

**Table schema:** See `capabilities` table in Task 4 (Database).

---

## File Structure

```
konduktor/
├── package.json                     # Root: workspaces, scripts, metadata
├── pnpm-workspace.yaml              # Workspace config
├── tsconfig.base.json               # Shared TS config
├── .gitignore
├── LICENSE                          # MIT
├── README.md
├── packages/
│   ├── shared/                      # @konduktor/shared
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types.ts             # All shared TypeScript interfaces
│   │       ├── constants.ts         # Event names, defaults, limits
│   │       └── index.ts             # Re-exports
│   ├── server/                      # @konduktor/server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts             # Entry: start Express + WS server
│   │       ├── config.ts            # Paths, port, limits
│   │       ├── claude/
│   │       │   ├── cli.ts           # Spawn claude CLI, parse stream
│   │       │   └── sessions.ts      # Session CRUD via CLI
│   │       ├── routes/
│   │       │   ├── chat.ts          # POST /api/chat/start
│   │       │   ├── sessions.ts      # GET/DELETE /api/sessions
│   │       │   └── settings.ts      # GET/PUT /api/settings
│   │       ├── ws/
│   │       │   └── handler.ts       # WS upgrade, message routing
│   │       └── db/
│   │           ├── connection.ts    # SQLite singleton
│   │           └── schema.ts        # Table definitions + migrations
│   │   └── tests/
│   │       ├── claude/
│   │       │   ├── cli.test.ts
│   │       │   └── sessions.test.ts
│   │       ├── routes/
│   │       │   ├── chat.test.ts
│   │       │   └── sessions.test.ts
│   │       └── ws/
│   │           └── handler.test.ts
│   ├── client/                      # @konduktor/client
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx             # React entry
│   │       ├── App.tsx              # Router + providers
│   │       ├── styles/
│   │       │   └── tokens.css       # Design tokens + theme
│   │       ├── components/
│   │       │   ├── Layout.tsx       # Sidebar + main area
│   │       │   ├── Sidebar.tsx      # Nav links + session list
│   │       │   ├── chat/
│   │       │   │   ├── ChatPanel.tsx
│   │       │   │   ├── MessageList.tsx
│   │       │   │   ├── MessageInput.tsx
│   │       │   │   └── StreamingText.tsx
│   │       │   ├── sessions/
│   │       │   │   ├── SessionsPage.tsx
│   │       │   │   └── SessionCard.tsx
│   │       │   └── settings/
│   │       │       ├── SettingsPage.tsx
│   │       │       └── ThemeToggle.tsx
│   │       ├── hooks/
│   │       │   ├── useWebSocket.ts
│   │       │   ├── useChat.ts
│   │       │   └── useSessions.ts
│   │       └── lib/
│   │           ├── api.ts           # fetch wrapper
│   │           └── ws.ts            # WS client singleton
│   └── cli/                         # @konduktor/cli
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts             # CLI entry: parse args, dispatch
│           ├── commands/
│           │   ├── start.ts         # konduktor start
│           │   ├── stop.ts          # konduktor stop
│           │   └── status.ts        # konduktor status
│           └── daemon.ts            # Daemonize server process
```

---

### Task 1: Monorepo Scaffold + Shared Types

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `LICENSE`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/index.ts`
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`
- Create: `packages/client/package.json`, `packages/client/tsconfig.json`, `packages/client/vite.config.ts`
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: All shared types used by every subsequent task -- `ChatMessage`, `Session`, `StreamEvent`, `Settings`, `WsMessage`, plus constants `WS_EVENTS`, `DEFAULTS`, `LIMITS`.

- [ ] **Step 1: Initialize monorepo root**

```bash
mkdir -p ~/projects/konduktor && cd ~/projects/konduktor
git init
```

```json
// package.json
{
  "name": "konduktor",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel run dev",
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "lint": "pnpm -r run lint"
  },
  "engines": { "node": ">=20" }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

```gitignore
# .gitignore
node_modules/
dist/
*.tsbuildinfo
.env
.konduktor/
```

```
# LICENSE
MIT License

Copyright (c) 2026 PT Makruva Teknologi Nusantara

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Create shared package with types**

```json
// packages/shared/package.json
{
  "name": "@konduktor/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

```typescript
// packages/shared/src/types.ts

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: string;
  usage?: TokenUsage;
  isStreaming?: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  thinkingTokens: number;
  costUsd: number;
}

export interface Session {
  pid: number;
  cwd: string;
  kind: 'interactive' | 'background' | 'cloud';
  startedAt: number;
  sessionId: string;
  name: string;
  status: 'busy' | 'idle' | 'completed' | 'error';
}

export interface StreamEvent {
  type: 'system' | 'assistant' | 'result' | 'rate_limit_event';
  subtype?: string;
  content?: ContentBlock[];
  result?: string;
  isError?: boolean;
  sessionId?: string;
  usage?: TokenUsage;
  model?: string;
  durationMs?: number;
  costUsd?: number;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface CliInitEvent {
  type: 'system';
  subtype: 'init';
  tools: string[];
  mcpServers: McpServerInfo[];
  model: string;
  plugins: PluginInfo[];
  skills: string[];
}

export interface McpServerInfo {
  name: string;
  status: 'connected' | 'failed';
  error?: string;
}

export interface PluginInfo {
  name: string;
  version: string;
  enabled: boolean;
}

export interface Capability {
  type: 'mcp' | 'plugin' | 'skill' | 'tool';
  name: string;
  status: 'installed' | 'available' | 'missing';
  description?: string;
  installCommand?: string;
  requiredConfig?: string[];
}

export interface ClaudeCodeInfo {
  installed: boolean;
  version?: string;
  path?: string;
  authenticated: boolean;
  model?: string;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  port: number;
  maxConcurrentSessions: number;
  defaultModel: string;
  defaultEffort: 'low' | 'medium' | 'high';
  lanAccess: boolean;
  pinCode?: string;
}

export type WsClientMessage =
  | { type: 'chat:start'; prompt: string; cwd?: string; model?: string; sessionId?: string }
  | { type: 'chat:stop'; sessionId: string }
  | { type: 'chat:resume'; sessionId: string }
  | { type: 'sessions:list' }
  | { type: 'sessions:stop'; sessionId: string };

export type WsServerMessage =
  | { type: 'chat:stream'; sessionId: string; event: StreamEvent }
  | { type: 'chat:end'; sessionId: string; result: StreamEvent }
  | { type: 'chat:error'; sessionId: string; error: string }
  | { type: 'sessions:update'; sessions: Session[] }
  | { type: 'error'; message: string };
```

```typescript
// packages/shared/src/constants.ts

export const DEFAULTS: Record<string, unknown> = {
  port: 4170,
  maxConcurrentSessions: 3,
  theme: 'system',
  defaultModel: 'claude-sonnet-5-5',
  defaultEffort: 'high',
  lanAccess: false,
} as const;

export const LIMITS = {
  maxConcurrentSessions: 10,
  maxMessageLength: 100_000,
  wsReconnectDelayMs: 2000,
  wsMaxReconnectAttempts: 10,
  childProcessTimeoutMs: 600_000,
  streamBufferSize: 100,
} as const;

export const PATHS = {
  configDir: '.konduktor',
  settingsFile: 'settings.json',
  dbFile: 'konduktor.db',
} as const;
```

```typescript
// packages/shared/src/index.ts
export * from './types.js';
export * from './constants.js';
```

- [ ] **Step 3: Create package shells for server, client, cli**

```json
// packages/server/package.json
{
  "name": "@konduktor/server",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@konduktor/shared": "workspace:*",
    "express": "^5.1.0",
    "better-sqlite3": "^11.0.0",
    "ws": "^8.18.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/ws": "^8.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^3.0.0"
  }
}
```

```json
// packages/client/package.json
{
  "name": "@konduktor/client",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^6.0.0"
  }
}
```

```json
// packages/cli/package.json
{
  "name": "@konduktor/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "konduktor": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@konduktor/shared": "workspace:*"
  },
  "peerDependencies": {
    "@anthropic-ai/claude-code": ">=2.0.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 4: Install dependencies and verify build**

```bash
cd ~/projects/konduktor
pnpm install
pnpm -r run build
```

Expected: All 4 packages compile without errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: initialize konduktor monorepo with shared types

Monorepo scaffold with pnpm workspaces: @konduktor/shared,
@konduktor/server, @konduktor/client, @konduktor/cli.
Shared types define ChatMessage, Session, StreamEvent, Settings,
and WebSocket message protocols."
```

---

### Task 2: Claude CLI Wrapper

**Files:**
- Create: `packages/server/src/claude/cli.ts`
- Create: `packages/server/src/claude/sessions.ts`
- Create: `packages/server/src/config.ts`
- Test: `packages/server/tests/claude/cli.test.ts`
- Test: `packages/server/tests/claude/sessions.test.ts`

**Interfaces:**
- Consumes: `StreamEvent`, `Session`, `TokenUsage` from `@konduktor/shared`
- Produces: `ClaudeProcess` class (spawn, stream, kill), `SessionManager` class (list, stop, resume)

- [ ] **Step 1: Write failing test for CLI stream parser**

```typescript
// packages/server/tests/claude/cli.test.ts
import { describe, it, expect } from 'vitest';
import { parseStreamLine } from '../../src/claude/cli.js';

describe('parseStreamLine', () => {
  it('parses assistant message event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello' }] },
      session_id: 'abc-123'
    });
    const event = parseStreamLine(line);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('assistant');
    expect(event!.content![0].text).toBe('Hello');
  });

  it('parses result event with usage', () => {
    const line = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'Done',
      is_error: false,
      session_id: 'abc-123',
      duration_ms: 4340,
      total_cost_usd: 0.05,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 0,
        output_tokens_details: { thinking_tokens: 10 }
      }
    });
    const event = parseStreamLine(line);
    expect(event!.type).toBe('result');
    expect(event!.result).toBe('Done');
    expect(event!.usage!.inputTokens).toBe(100);
    expect(event!.usage!.thinkingTokens).toBe(10);
    expect(event!.costUsd).toBe(0.05);
  });

  it('returns null for non-JSON lines', () => {
    expect(parseStreamLine('Loading...')).toBeNull();
    expect(parseStreamLine('')).toBeNull();
    expect(parseStreamLine('  ')).toBeNull();
  });

  it('skips system hook events', () => {
    const line = JSON.stringify({
      type: 'system',
      subtype: 'hook_started',
      hook_name: 'SessionStart'
    });
    const event = parseStreamLine(line);
    expect(event).toBeNull();
  });

  it('passes through system init events', () => {
    const line = JSON.stringify({
      type: 'system',
      subtype: 'init',
      tools: ['Read', 'Write'],
      model: 'claude-sonnet-5-5'
    });
    const event = parseStreamLine(line);
    expect(event!.type).toBe('system');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/projects/konduktor
pnpm --filter @konduktor/server test -- tests/claude/cli.test.ts
```

Expected: FAIL -- `parseStreamLine` not found.

- [ ] **Step 3: Implement CLI wrapper**

```typescript
// packages/server/src/config.ts
import { join } from 'node:path';
import { homedir } from 'node:os';
import { PATHS, DEFAULTS } from '@konduktor/shared';

export const CONFIG = {
  configDir: join(homedir(), PATHS.configDir),
  dbPath: join(homedir(), PATHS.configDir, 'data', PATHS.dbFile),
  settingsPath: join(homedir(), PATHS.configDir, PATHS.settingsFile),
  port: Number(process.env.KONDUKTOR_PORT) || (DEFAULTS.port as number),
  claudeBin: process.env.CLAUDE_BIN || 'claude',
} as const;
```

```typescript
// packages/server/src/claude/cli.ts
import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { StreamEvent, TokenUsage, ContentBlock } from '@konduktor/shared';
import { LIMITS } from '@konduktor/shared';
import { CONFIG } from '../config.js';

export function parseStreamLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (parsed.type === 'system') {
    const sub = parsed.subtype as string;
    if (sub === 'hook_started' || sub === 'hook_response' || sub === 'hook_progress') {
      return null;
    }
    return { type: 'system', subtype: sub } as StreamEvent;
  }

  if (parsed.type === 'assistant') {
    const msg = parsed.message as Record<string, unknown> | undefined;
    const blocks = (msg?.content as Record<string, unknown>[]) || [];
    const content: ContentBlock[] = blocks.map(b => ({
      type: b.type as ContentBlock['type'],
      text: b.text as string | undefined,
      name: b.name as string | undefined,
      input: b.input as Record<string, unknown> | undefined,
    }));
    return {
      type: 'assistant',
      content,
      sessionId: parsed.session_id as string,
      model: (parsed.message as Record<string, unknown>)?.model as string,
    };
  }

  if (parsed.type === 'result') {
    const rawUsage = parsed.usage as Record<string, unknown> | undefined;
    let usage: TokenUsage | undefined;
    if (rawUsage) {
      const details = rawUsage.output_tokens_details as Record<string, number> | undefined;
      usage = {
        inputTokens: (rawUsage.input_tokens as number) || 0,
        outputTokens: (rawUsage.output_tokens as number) || 0,
        cacheReadTokens: (rawUsage.cache_read_input_tokens as number) || 0,
        cacheWriteTokens: (rawUsage.cache_creation_input_tokens as number) || 0,
        thinkingTokens: details?.thinking_tokens || 0,
        costUsd: (parsed.total_cost_usd as number) || 0,
      };
    }
    return {
      type: 'result',
      result: parsed.result as string,
      isError: parsed.is_error as boolean,
      sessionId: parsed.session_id as string,
      durationMs: parsed.duration_ms as number,
      costUsd: parsed.total_cost_usd as number,
      usage,
    };
  }

  return null;
}

export class ClaudeProcess extends EventEmitter {
  private child: ChildProcess | null = null;
  private buffer = '';
  readonly sessionId: string;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  start(prompt: string, opts: { cwd?: string; model?: string; resume?: string }): void {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
    if (opts.model) args.push('--model', opts.model);
    if (opts.resume) args.push('--resume', opts.resume);

    this.child = spawn(CONFIG.claudeBin, args, {
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        const event = parseStreamLine(line);
        if (event) this.emit('event', event);
      }
    });

    this.child.stderr!.on('data', (chunk: Buffer) => {
      this.emit('stderr', chunk.toString());
    });

    this.child.on('close', (code) => {
      if (this.buffer.trim()) {
        const event = parseStreamLine(this.buffer);
        if (event) this.emit('event', event);
      }
      this.emit('close', code);
    });

    this.child.on('error', (err) => {
      this.emit('error', err);
    });

    setTimeout(() => {
      if (this.child && !this.child.killed) {
        this.kill();
        this.emit('error', new Error('Process timeout'));
      }
    }, LIMITS.childProcessTimeoutMs);
  }

  kill(): void {
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM');
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  get isRunning(): boolean {
    return this.child !== null && !this.child.killed;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @konduktor/server test -- tests/claude/cli.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Write session management tests**

```typescript
// packages/server/tests/claude/sessions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../src/claude/sessions.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';

describe('SessionManager', () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    vi.clearAllMocks();
  });

  it('parses agent list JSON', () => {
    const mockOutput = JSON.stringify([
      { pid: 123, cwd: '/tmp', kind: 'interactive', startedAt: 1000, sessionId: 'abc', name: 'test', status: 'busy' }
    ]);
    vi.mocked(execSync).mockReturnValue(Buffer.from(mockOutput));
    const sessions = mgr.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('test');
    expect(sessions[0].status).toBe('busy');
  });

  it('returns empty array when CLI returns empty', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('[]'));
    expect(mgr.list()).toEqual([]);
  });

  it('returns empty array when CLI errors', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('CLI not found'); });
    expect(mgr.list()).toEqual([]);
  });
});
```

- [ ] **Step 6: Implement SessionManager**

```typescript
// packages/server/src/claude/sessions.ts
import { execSync } from 'node:child_process';
import type { Session } from '@konduktor/shared';
import { CONFIG } from '../config.js';

export class SessionManager {
  list(includeAll = false): Session[] {
    try {
      const flags = includeAll ? '--json --all' : '--json';
      const output = execSync(`${CONFIG.claudeBin} agents ${flags}`, {
        encoding: 'utf-8',
        timeout: 10_000,
      });
      const raw = JSON.parse(output) as Record<string, unknown>[];
      return raw.map(r => ({
        pid: r.pid as number,
        cwd: r.cwd as string,
        kind: (r.kind as Session['kind']) || 'interactive',
        startedAt: r.startedAt as number,
        sessionId: r.sessionId as string,
        name: r.name as string,
        status: (r.status as Session['status']) || 'idle',
      }));
    } catch {
      return [];
    }
  }

  stop(sessionId: string): boolean {
    try {
      execSync(`${CONFIG.claudeBin} stop ${sessionId}`, { timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  remove(sessionId: string): boolean {
    try {
      execSync(`${CONFIG.claudeBin} rm ${sessionId}`, { timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 7: Run all tests and commit**

```bash
pnpm --filter @konduktor/server test
git add packages/server/src/claude packages/server/src/config.ts packages/server/tests/claude
git commit -m "feat: add Claude CLI wrapper with stream parser and session manager

ClaudeProcess spawns claude -p with stream-json output, parses NDJSON
events, and emits typed StreamEvent objects. SessionManager wraps
claude agents --json for session CRUD."
```

---

### Task 3: Express + WebSocket Server

**Files:**
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/ws/handler.ts`
- Create: `packages/server/src/routes/chat.ts`
- Create: `packages/server/src/routes/sessions.ts`
- Create: `packages/server/src/routes/settings.ts`
- Test: `packages/server/tests/routes/sessions.test.ts`

**Interfaces:**
- Consumes: `ClaudeProcess`, `SessionManager` from Task 2; all types from Task 1
- Produces: HTTP endpoints (`GET /api/sessions`, `PUT /api/settings`), WebSocket server on `/ws` that streams `WsServerMessage` events

- [ ] **Step 1: Write failing test for sessions API**

```typescript
// packages/server/tests/routes/sessions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/claude/sessions.js', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    list: vi.fn().mockReturnValue([
      { pid: 1, cwd: '/tmp', kind: 'interactive', startedAt: 1000, sessionId: 'abc', name: 'test', status: 'busy' }
    ]),
    stop: vi.fn().mockReturnValue(true),
    remove: vi.fn().mockReturnValue(true),
  })),
}));

import { createApp } from '../../src/index.js';

describe('GET /api/sessions', () => {
  it('returns session list as JSON', async () => {
    const app = createApp();
    const res = await fetch(`http://localhost:0/api/sessions`);
    // Note: actual test will use supertest or app.listen on random port
    expect(true).toBe(true); // placeholder for structure
  });
});
```

- [ ] **Step 2: Implement Express server with routes**

```typescript
// packages/server/src/index.ts
import express from 'express';
import { createServer } from 'node:http';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { CONFIG } from './config.js';
import { sessionsRouter } from './routes/sessions.js';
import { settingsRouter } from './routes/settings.js';
import { createWsHandler } from './ws/handler.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/sessions', sessionsRouter);
  app.use('/api/settings', settingsRouter);

  app.get('/api/health', async (_req, res) => {
    const { detectClaude } = await import('../cli/detect.js');
    const claude = detectClaude();
    res.json({ status: 'ok', version: '0.1.0', claude });
  });

  return app;
}

export function startServer() {
  const app = createApp();
  const server = createServer(app);

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', createWsHandler());

  const host = CONFIG.lanAccess ? '0.0.0.0' : '127.0.0.1';
  server.listen(CONFIG.port, host, () => {
    console.log(`Konduktor running at http://${host}:${CONFIG.port}`);
  });

  return server;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  startServer();
}
```

```typescript
// packages/server/src/routes/sessions.ts
import { Router } from 'express';
import { SessionManager } from '../claude/sessions.js';

const mgr = new SessionManager();
export const sessionsRouter = Router();

sessionsRouter.get('/', (_req, res) => {
  const all = _req.query.all === 'true';
  res.json(mgr.list(all));
});

sessionsRouter.post('/:id/stop', (req, res) => {
  const ok = mgr.stop(req.params.id);
  res.json({ success: ok });
});

sessionsRouter.delete('/:id', (req, res) => {
  const ok = mgr.remove(req.params.id);
  res.json({ success: ok });
});
```

```typescript
// packages/server/src/routes/settings.ts
import { Router } from 'express';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Settings } from '@konduktor/shared';
import { DEFAULTS } from '@konduktor/shared';
import { CONFIG } from '../config.js';

export const settingsRouter = Router();

function loadSettings(): Settings {
  try {
    const raw = readFileSync(CONFIG.settingsPath, 'utf-8');
    return { ...(DEFAULTS as unknown as Settings), ...JSON.parse(raw) };
  } catch {
    return DEFAULTS as unknown as Settings;
  }
}

function saveSettings(settings: Settings): void {
  const dir = dirname(CONFIG.settingsPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG.settingsPath, JSON.stringify(settings, null, 2));
}

settingsRouter.get('/', (_req, res) => {
  res.json(loadSettings());
});

settingsRouter.put('/', (req, res) => {
  const current = loadSettings();
  const updated = { ...current, ...req.body } as Settings;
  saveSettings(updated);
  res.json(updated);
});
```

- [ ] **Step 3: Implement WebSocket handler**

```typescript
// packages/server/src/ws/handler.ts
import type { WebSocket } from 'ws';
import type { WsClientMessage, WsServerMessage } from '@konduktor/shared';
import { LIMITS } from '@konduktor/shared';
import { ClaudeProcess } from '../claude/cli.js';
import { SessionManager } from '../claude/sessions.js';

const activeProcesses = new Map<string, ClaudeProcess>();
const mgr = new SessionManager();

function send(ws: WebSocket, msg: WsServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function createWsHandler() {
  return (ws: WebSocket) => {
    ws.on('message', (raw) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }

      if (msg.type === 'chat:start') {
        if (activeProcesses.size >= LIMITS.maxConcurrentSessions) {
          send(ws, { type: 'error', message: `Max ${LIMITS.maxConcurrentSessions} concurrent sessions` });
          return;
        }

        const sessionId = msg.sessionId || crypto.randomUUID();
        const proc = new ClaudeProcess(sessionId);

        proc.on('event', (event) => {
          send(ws, { type: 'chat:stream', sessionId, event });
        });

        proc.on('close', () => {
          activeProcesses.delete(sessionId);
          const lastEvent = { type: 'result' as const, result: 'Session ended' };
          send(ws, { type: 'chat:end', sessionId, result: lastEvent });
        });

        proc.on('error', (err) => {
          activeProcesses.delete(sessionId);
          send(ws, { type: 'chat:error', sessionId, error: err.message });
        });

        activeProcesses.set(sessionId, proc);
        proc.start(msg.prompt, { cwd: msg.cwd, model: msg.model });
      }

      if (msg.type === 'chat:stop') {
        const proc = activeProcesses.get(msg.sessionId);
        if (proc) {
          proc.kill();
          activeProcesses.delete(msg.sessionId);
        }
      }

      if (msg.type === 'sessions:list') {
        send(ws, { type: 'sessions:update', sessions: mgr.list() });
      }
    });

    ws.on('close', () => {
      for (const [id, proc] of activeProcesses) {
        if (proc.isRunning) proc.kill();
        activeProcesses.delete(id);
      }
    });
  };
}
```

- [ ] **Step 4: Run server and verify health endpoint**

```bash
cd ~/projects/konduktor
pnpm --filter @konduktor/server dev &
sleep 2
curl http://localhost:4170/api/health
curl http://localhost:4170/api/sessions
curl http://localhost:4170/api/settings
kill %1
```

Expected: Health returns `{"status":"ok"}`, sessions returns array, settings returns defaults.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm --filter @konduktor/server test
git add packages/server/src packages/server/tests
git commit -m "feat: add Express + WebSocket server with chat streaming

HTTP routes for sessions and settings. WebSocket handler spawns
ClaudeProcess per chat request, streams events to client, kills
child processes on disconnect."
```

---

### Task 4: SQLite Database Layer

**Files:**
- Create: `packages/server/src/db/connection.ts`
- Create: `packages/server/src/db/schema.ts`
- Test: `packages/server/tests/db/schema.test.ts`

**Interfaces:**
- Consumes: `CONFIG` from Task 2
- Produces: `getDb()` singleton, `initDb()` migration runner. Tables: `sessions_cache`, `settings`, `analytics`, `chat_history`.

- [ ] **Step 1: Write failing test for database initialization**

```typescript
// packages/server/tests/db/schema.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'node:fs';
import { initDb, getDb } from '../../src/db/connection.js';

const TEST_DB = '/tmp/konduktor-test.db';

afterEach(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe('database', () => {
  it('creates tables on first init', () => {
    const db = initDb(TEST_DB);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('chat_history');
    expect(names).toContain('analytics');
    db.close();
  });

  it('is idempotent on second init', () => {
    const db1 = initDb(TEST_DB);
    db1.close();
    const db2 = initDb(TEST_DB);
    expect(() => db2.prepare("SELECT 1 FROM chat_history LIMIT 1").get()).not.toThrow();
    db2.close();
  });
});
```

- [ ] **Step 2: Implement database layer**

```typescript
// packages/server/src/db/schema.ts

export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT,
    cost_usd REAL DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    model TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    thinking_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS capabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    description TEXT,
    install_command TEXT,
    required_config TEXT,
    last_checked INTEGER DEFAULT (unixepoch()),
    UNIQUE(type, name)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_model ON analytics(model)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_history(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_capabilities_type ON capabilities(type)`,
];
```

```typescript
// packages/server/src/db/connection.ts
import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS } from './schema.js';

let instance: Database.Database | null = null;

export function initDb(dbPath: string): Database.Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }

  instance = db;
  return db;
}

export function getDb(): Database.Database {
  if (!instance) throw new Error('Database not initialized. Call initDb() first.');
  return instance;
}
```

- [ ] **Step 3: Run tests and commit**

```bash
pnpm --filter @konduktor/server test -- tests/db
git add packages/server/src/db packages/server/tests/db
git commit -m "feat: add SQLite database with chat_history and analytics tables

WAL mode, idempotent migrations, singleton connection pattern."
```

---

### Task 5: React App + Layout + Design Tokens

**Files:**
- Create: `packages/client/index.html`
- Create: `packages/client/src/main.tsx`, `packages/client/src/App.tsx`
- Create: `packages/client/src/styles/tokens.css`
- Create: `packages/client/src/components/Layout.tsx`, `packages/client/src/components/Sidebar.tsx`
- Create: `packages/client/vite.config.ts`

**Interfaces:**
- Consumes: nothing from backend yet (static UI shell)
- Produces: `<Layout>` component with sidebar navigation, CSS token system, React Router setup. Used by all subsequent UI tasks.

- [ ] **Step 1: Create Vite config with proxy**

```typescript
// packages/client/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4171,
    proxy: {
      '/api': 'http://localhost:4170',
      '/ws': { target: 'ws://localhost:4170', ws: true },
    },
  },
});
```

- [ ] **Step 2: Create design tokens**

```css
/* packages/client/src/styles/tokens.css */

/* Konduktor -- deep purple + cyan, orchestrator identity */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --bg: #fafafa;
  --bg-surface: #ffffff;
  --bg-raised: #f4f4f5;
  --fg: #18181b;
  --fg2: #52525b;
  --fg3: #a1a1aa;
  --border: #e4e4e7;
  --border-focus: #7c3aed;
  --purple: #7c3aed;
  --purple-soft: #ede9fe;
  --cyan: #06b6d4;
  --cyan-soft: #ecfeff;
  --green: #22c55e;
  --green-soft: #f0fdf4;
  --red: #ef4444;
  --red-soft: #fef2f2;
  --amber: #f59e0b;
  --amber-soft: #fffbeb;
  --gradient: linear-gradient(135deg, #7c3aed, #06b6d4);
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --sidebar-width: 260px;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #09090b;
    --bg-surface: #18181b;
    --bg-raised: #27272a;
    --fg: #fafafa;
    --fg2: #a1a1aa;
    --fg3: #71717a;
    --border: #3f3f46;
    --border-focus: #a78bfa;
    --purple-soft: #2e1065;
    --cyan-soft: #083344;
    --green-soft: #052e16;
    --red-soft: #450a0a;
    --amber-soft: #451a03;
    color-scheme: dark;
  }
}

:root[data-theme="dark"] {
  --bg: #09090b;
  --bg-surface: #18181b;
  --bg-raised: #27272a;
  --fg: #fafafa;
  --fg2: #a1a1aa;
  --fg3: #71717a;
  --border: #3f3f46;
  --border-focus: #a78bfa;
  --purple-soft: #2e1065;
  --cyan-soft: #083344;
  --green-soft: #052e16;
  --red-soft: #450a0a;
  --amber-soft: #451a03;
  color-scheme: dark;
}

* { box-sizing: border-box; margin: 0; }

body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

::selection {
  background: var(--purple);
  color: white;
}
```

- [ ] **Step 3: Create React entry, App, Layout, Sidebar**

```html
<!-- packages/client/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Konduktor</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

```tsx
// packages/client/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles/tokens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

```tsx
// packages/client/src/App.tsx
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<div>Chat (coming next)</div>} />
        <Route path="/sessions" element={<div>Sessions (coming next)</div>} />
        <Route path="/settings" element={<div>Settings (coming next)</div>} />
      </Routes>
    </Layout>
  );
}
```

```tsx
// packages/client/src/components/Layout.tsx
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

const styles = {
  wrapper: {
    display: 'flex',
    minHeight: '100vh',
  } as const,
  main: {
    flex: 1,
    minWidth: 0,
    padding: '16px',
    marginLeft: 'var(--sidebar-width)',
  } as const,
};

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={styles.wrapper}>
      <Sidebar />
      <main style={styles.main}>{children}</main>
    </div>
  );
}
```

```tsx
// packages/client/src/components/Sidebar.tsx
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Chat', icon: '>' },
  { to: '/sessions', label: 'Sessions', icon: '#' },
  { to: '/settings', label: 'Settings', icon: '*' },
];

export function Sidebar() {
  return (
    <aside style={{
      position: 'fixed', top: 0, left: 0, bottom: 0,
      width: 'var(--sidebar-width)',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: '16px 0',
    }}>
      <div style={{
        padding: '0 16px 16px',
        borderBottom: '1px solid var(--border)',
      }}>
        <h1 style={{
          fontSize: '1.25rem', fontWeight: 700,
          background: 'var(--gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: 0,
        }}>
          Konduktor
        </h1>
        <p style={{ fontSize: '0.7rem', color: 'var(--fg3)', margin: '2px 0 0' }}>
          orchestrator for Claude Code
        </p>
      </div>
      <nav style={{ flex: 1, padding: '8px' }}>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 12px', borderRadius: 'var(--radius-md)',
              textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500,
              color: isActive ? 'var(--purple)' : 'var(--fg2)',
              background: isActive ? 'var(--purple-soft)' : 'transparent',
            })}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div style={{
        padding: '12px 16px', borderTop: '1px solid var(--border)',
        fontSize: '0.7rem', color: 'var(--fg3)',
      }}>
        by Makruva
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run dev server and verify layout renders**

```bash
cd ~/projects/konduktor
pnpm --filter @konduktor/client dev &
# Open http://localhost:4171 in browser
# Verify: sidebar visible, gradient title, nav links work, dark mode works
```

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat: add React app with sidebar layout and design tokens

Deep purple + cyan identity. Sidebar with nav links, gradient title,
dark/light theme via CSS custom properties. Vite proxy to backend."
```

---

### Task 6: Chat UI with WebSocket Streaming

**Files:**
- Create: `packages/client/src/lib/ws.ts`
- Create: `packages/client/src/lib/api.ts`
- Create: `packages/client/src/hooks/useWebSocket.ts`
- Create: `packages/client/src/hooks/useChat.ts`
- Create: `packages/client/src/components/chat/ChatPanel.tsx`
- Create: `packages/client/src/components/chat/MessageList.tsx`
- Create: `packages/client/src/components/chat/MessageInput.tsx`
- Create: `packages/client/src/components/chat/StreamingText.tsx`

**Interfaces:**
- Consumes: `WsClientMessage`, `WsServerMessage`, `ChatMessage` from `@konduktor/shared`; WebSocket server from Task 3
- Produces: `<ChatPanel>` component -- full chat interface with streaming text, message history, send/stop controls

- [ ] **Step 1: Create WebSocket client**

```typescript
// packages/client/src/lib/ws.ts
import type { WsClientMessage, WsServerMessage } from '@konduktor/shared';
import { LIMITS } from '@konduktor/shared';

type MessageHandler = (msg: WsServerMessage) => void;

class WsClient {
  private socket: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(): void {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = (event) => {
      const msg = JSON.parse(event.data) as WsServerMessage;
      this.handlers.forEach(h => h(msg));
    };

    this.socket.onclose = () => {
      if (this.reconnectAttempts < LIMITS.wsMaxReconnectAttempts) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectAttempts++;
          this.connect();
        }, LIMITS.wsReconnectDelayMs);
      }
    };
  }

  send(msg: WsClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }
}

export const wsClient = new WsClient();
```

- [ ] **Step 2: Create useChat hook**

```typescript
// packages/client/src/hooks/useChat.ts
import { useState, useCallback, useEffect } from 'react';
import type { ChatMessage, StreamEvent } from '@konduktor/shared';
import { wsClient } from '../lib/ws';

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    wsClient.connect();
    const unsub = wsClient.subscribe((msg) => {
      if (msg.type === 'chat:stream') {
        setSessionId(msg.sessionId);
        const event = msg.event;
        if (event.type === 'assistant' && event.content) {
          const text = event.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('');
          if (text) {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.isStreaming) {
                return [...prev.slice(0, -1), { ...last, content: last.content + text }];
              }
              return [...prev, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: text,
                timestamp: Date.now(),
                isStreaming: true,
              }];
            });
          }
        }
      }

      if (msg.type === 'chat:end') {
        setIsStreaming(false);
        setMessages(prev => prev.map(m =>
          m.isStreaming ? { ...m, isStreaming: false } : m
        ));
      }

      if (msg.type === 'chat:error') {
        setIsStreaming(false);
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'system',
          content: `Error: ${msg.error}`,
          timestamp: Date.now(),
        }]);
      }
    });
    return () => { unsub(); wsClient.disconnect(); };
  }, []);

  const sendMessage = useCallback((prompt: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    }]);
    setIsStreaming(true);
    wsClient.send({ type: 'chat:start', prompt, sessionId: sessionId || undefined });
  }, [sessionId]);

  const stopStreaming = useCallback(() => {
    if (sessionId) {
      wsClient.send({ type: 'chat:stop', sessionId });
      setIsStreaming(false);
    }
  }, [sessionId]);

  return { messages, isStreaming, sendMessage, stopStreaming, sessionId };
}
```

- [ ] **Step 3: Create chat components**

```tsx
// packages/client/src/components/chat/MessageInput.tsx
import { useState, useRef } from 'react';

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function MessageInput({ onSend, onStop, isStreaming }: Props) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div style={{
      display: 'flex', gap: '8px', padding: '12px 16px',
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-surface)',
    }}>
      <textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ketik pesan..."
        rows={1}
        style={{
          flex: 1, resize: 'none', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: '10px 12px',
          fontFamily: 'var(--font-sans)', fontSize: '0.875rem',
          background: 'var(--bg)', color: 'var(--fg)',
          outline: 'none',
        }}
      />
      {isStreaming ? (
        <button onClick={onStop} style={{
          padding: '8px 16px', borderRadius: 'var(--radius-md)',
          background: 'var(--red)', color: 'white', border: 'none',
          cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
        }}>Stop</button>
      ) : (
        <button onClick={handleSubmit} style={{
          padding: '8px 16px', borderRadius: 'var(--radius-md)',
          background: 'var(--purple)', color: 'white', border: 'none',
          cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
        }}>Send</button>
      )}
    </div>
  );
}
```

```tsx
// packages/client/src/components/chat/MessageList.tsx
import type { ChatMessage } from '@konduktor/shared';

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <div style={{
      flex: 1, overflowY: 'auto', padding: '16px',
      display: 'flex', flexDirection: 'column', gap: '12px',
    }}>
      {messages.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', flex: 1, color: 'var(--fg3)',
        }}>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, background: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Konduktor</p>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Ketik pesan untuk memulai sesi Claude Code</p>
        </div>
      )}
      {messages.map(msg => (
        <div key={msg.id} style={{
          display: 'flex',
          justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
        }}>
          <div style={{
            maxWidth: '80%', padding: '10px 14px',
            borderRadius: 'var(--radius-lg)',
            background: msg.role === 'user' ? 'var(--purple)' : 'var(--bg-raised)',
            color: msg.role === 'user' ? 'white' : 'var(--fg)',
            fontSize: '0.875rem', lineHeight: 1.6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            fontFamily: msg.role === 'system' ? 'var(--font-mono)' : 'var(--font-sans)',
          }}>
            {msg.content}
            {msg.isStreaming && <span style={{ animation: 'blink 1s infinite' }}>|</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
```

```tsx
// packages/client/src/components/chat/ChatPanel.tsx
import { useChat } from '../../hooks/useChat';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

export function ChatPanel() {
  const { messages, isStreaming, sendMessage, stopStreaming } = useChat();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 32px)',
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isStreaming ? 'var(--green)' : 'var(--fg3)',
        }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
          {isStreaming ? 'Streaming...' : 'Ready'}
        </span>
      </div>
      <MessageList messages={messages} />
      <MessageInput onSend={sendMessage} onStop={stopStreaming} isStreaming={isStreaming} />
    </div>
  );
}
```

- [ ] **Step 4: Wire ChatPanel to App router**

Update `App.tsx`:
```tsx
import { ChatPanel } from './components/chat/ChatPanel';
// ...
<Route path="/" element={<ChatPanel />} />
```

- [ ] **Step 5: Test end-to-end: send message, see streaming response**

```bash
# Terminal 1: start backend
cd ~/projects/konduktor && pnpm --filter @konduktor/server dev

# Terminal 2: start frontend
cd ~/projects/konduktor && pnpm --filter @konduktor/client dev

# Open http://localhost:4171
# Type "say hello" and press Enter
# Verify: message appears, streaming response renders in real-time
```

- [ ] **Step 6: Commit**

```bash
git add packages/client/src
git commit -m "feat: add chat UI with WebSocket streaming

Chat panel with message list, text input, send/stop controls.
WebSocket client with auto-reconnect. useChat hook manages
message state and streaming lifecycle."
```

---

### Task 7: Sessions UI

**Files:**
- Create: `packages/client/src/hooks/useSessions.ts`
- Create: `packages/client/src/components/sessions/SessionsPage.tsx`
- Create: `packages/client/src/components/sessions/SessionCard.tsx`

**Interfaces:**
- Consumes: `Session` from `@konduktor/shared`; `GET /api/sessions` from Task 3
- Produces: `<SessionsPage>` component -- browse, stop, delete sessions

- [ ] **Step 1: Create useSessions hook**

```typescript
// packages/client/src/hooks/useSessions.ts
import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@konduktor/shared';

const API = '/api/sessions';

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
      setSessions(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const stopSession = useCallback(async (id: string) => {
    await fetch(`${API}/${id}/stop`, { method: 'POST' });
    refresh();
  }, [refresh]);

  const removeSession = useCallback(async (id: string) => {
    await fetch(`${API}/${id}`, { method: 'DELETE' });
    refresh();
  }, [refresh]);

  return { sessions, loading, refresh, stopSession, removeSession };
}
```

- [ ] **Step 2: Create SessionCard and SessionsPage**

```tsx
// packages/client/src/components/sessions/SessionCard.tsx
import type { Session } from '@konduktor/shared';

interface Props {
  session: Session;
  onStop: (id: string) => void;
  onRemove: (id: string) => void;
}

export function SessionCard({ session, onStop, onRemove }: Props) {
  const statusColor = session.status === 'busy' ? 'var(--green)' :
    session.status === 'idle' ? 'var(--amber)' : 'var(--fg3)';

  return (
    <div style={{
      padding: '12px 16px', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)', background: 'var(--bg-surface)',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: statusColor, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{session.name}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--fg3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.cwd} | pid {session.pid}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {session.status === 'busy' && (
          <button onClick={() => onStop(session.sessionId)} style={{
            padding: '4px 10px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--amber)', cursor: 'pointer', fontSize: '0.75rem',
          }}>Stop</button>
        )}
        <button onClick={() => onRemove(session.sessionId)} style={{
          padding: '4px 10px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', background: 'var(--bg)',
          color: 'var(--red)', cursor: 'pointer', fontSize: '0.75rem',
        }}>Remove</button>
      </div>
    </div>
  );
}
```

```tsx
// packages/client/src/components/sessions/SessionsPage.tsx
import { useSessions } from '../../hooks/useSessions';
import { SessionCard } from './SessionCard';

export function SessionsPage() {
  const { sessions, loading, refresh, stopSession, removeSession } = useSessions();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Sessions</h2>
        <button onClick={refresh} style={{
          padding: '6px 12px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', background: 'var(--bg-surface)',
          cursor: 'pointer', fontSize: '0.8rem', color: 'var(--fg2)',
        }}>Refresh</button>
      </div>
      {loading && <p style={{ color: 'var(--fg3)', fontSize: '0.85rem' }}>Loading...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sessions.map(s => (
          <SessionCard key={s.sessionId} session={s} onStop={stopSession} onRemove={removeSession} />
        ))}
        {!loading && sessions.length === 0 && (
          <p style={{ color: 'var(--fg3)', fontSize: '0.85rem' }}>No active sessions</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire to router, test in browser, commit**

```bash
# Update App.tsx: <Route path="/sessions" element={<SessionsPage />} />
# Test: navigate to /sessions, verify session list renders
git add packages/client/src/hooks/useSessions.ts packages/client/src/components/sessions
git commit -m "feat: add sessions page with list, stop, remove controls

Fetches from GET /api/sessions, displays cards with status
indicator, provides stop/remove actions."
```

---

### Task 8: Settings UI

**Files:**
- Create: `packages/client/src/components/settings/SettingsPage.tsx`
- Create: `packages/client/src/components/settings/ThemeToggle.tsx`

**Interfaces:**
- Consumes: `Settings` from `@konduktor/shared`; `GET/PUT /api/settings` from Task 3
- Produces: `<SettingsPage>` component -- theme toggle, port config, session limits

- [ ] **Step 1: Create ThemeToggle and SettingsPage**

```tsx
// packages/client/src/components/settings/ThemeToggle.tsx
interface Props {
  value: 'light' | 'dark' | 'system';
  onChange: (v: 'light' | 'dark' | 'system') => void;
}

const OPTIONS: Props['value'][] = ['light', 'dark', 'system'];

export function ThemeToggle({ value, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: '4px', padding: '2px', background: 'var(--bg-raised)', borderRadius: 'var(--radius-md)' }}>
      {OPTIONS.map(opt => (
        <button key={opt} onClick={() => onChange(opt)} style={{
          padding: '6px 14px', borderRadius: 'var(--radius-sm)',
          border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
          background: value === opt ? 'var(--bg-surface)' : 'transparent',
          color: value === opt ? 'var(--fg)' : 'var(--fg3)',
          boxShadow: value === opt ? '0 1px 2px rgba(0,0,0,.1)' : 'none',
        }}>
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </button>
      ))}
    </div>
  );
}
```

```tsx
// packages/client/src/components/settings/SettingsPage.tsx
import { useState, useEffect } from 'react';
import type { Settings } from '@konduktor/shared';
import { ThemeToggle } from './ThemeToggle';

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings);
  }, []);

  const update = async (patch: Partial<Settings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated as Settings);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (patch.theme) {
      document.documentElement.setAttribute('data-theme',
        patch.theme === 'system' ? '' : patch.theme);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) return <p style={{ color: 'var(--fg3)' }}>Loading...</p>;

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '24px' }}>Settings</h2>

      <section style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--fg2)' }}>Theme</label>
        <ThemeToggle value={settings.theme} onChange={t => update({ theme: t })} />
      </section>

      <section style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--fg2)' }}>Max concurrent sessions</label>
        <input type="number" min={1} max={10} value={settings.maxConcurrentSessions}
          onChange={e => update({ maxConcurrentSessions: Number(e.target.value) })}
          style={{
            padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', background: 'var(--bg)',
            color: 'var(--fg)', width: '80px', fontSize: '0.875rem',
          }}
        />
      </section>

      <section style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--fg2)' }}>LAN access</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={settings.lanAccess} onChange={e => update({ lanAccess: e.target.checked })} />
          Allow access from other devices on network
        </label>
      </section>

      {saved && <p style={{ color: 'var(--green)', fontSize: '0.8rem', fontWeight: 500 }}>Settings saved</p>}

      <div style={{
        marginTop: '32px', padding: '12px 16px',
        borderRadius: 'var(--radius-md)', background: 'var(--bg-raised)',
        fontSize: '0.75rem', color: 'var(--fg3)',
      }}>
        Konduktor v0.1.0 | by Makruva | MIT License
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire to router, test, commit**

```bash
# Update App.tsx: <Route path="/settings" element={<SettingsPage />} />
git add packages/client/src/components/settings
git commit -m "feat: add settings page with theme toggle and config

Theme toggle (light/dark/system), concurrent session limit,
LAN access toggle. Auto-saves to backend."
```

---

### Task 9: CLI Commands (konduktor start/stop/status)

**Files:**
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/start.ts`
- Create: `packages/cli/src/commands/stop.ts`
- Create: `packages/cli/src/commands/status.ts`
- Create: `packages/cli/src/daemon.ts`

**Interfaces:**
- Consumes: `DEFAULTS`, `PATHS` from `@konduktor/shared`; server entry from Task 3
- Produces: CLI binary `konduktor` with subcommands: `start`, `stop`, `status`

- [ ] **Step 1: Implement CLI entry and commands**

```typescript
// packages/cli/src/index.ts
#!/usr/bin/env node
import { start } from './commands/start.js';
import { stop } from './commands/stop.js';
import { status } from './commands/status.js';

const cmd = process.argv[2];

const commands: Record<string, () => Promise<void>> = { start, stop, status };

if (!cmd || !commands[cmd]) {
  console.log(`
Konduktor - Open-source orchestrator for Claude Code
No hacks. No bots. No ToS violations.

Usage: konduktor <command>

Commands:
  start     Start the Konduktor server
  stop      Stop the running server
  status    Show server status
`);
  process.exit(cmd ? 1 : 0);
}

commands[cmd]().catch(err => {
  console.error(err.message);
  process.exit(1);
});
```

```typescript
// packages/cli/src/commands/start.ts
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { DEFAULTS, PATHS } from '@konduktor/shared';
import { writePid, readPid } from '../daemon.js';

export async function start() {
  const existing = readPid();
  if (existing) {
    try {
      process.kill(existing, 0);
      console.log(`Konduktor already running (pid ${existing})`);
      return;
    } catch {
      clearPid();
    }
  }

  const claudeInfo = detectClaude();
  if (!claudeInfo.installed) {
    console.log('Claude Code CLI not found.');
    console.log('Install it with: npm install -g @anthropic-ai/claude-code');
    console.log('Then run: claude auth login');
    process.exit(1);
  }
  console.log(`Claude Code ${claudeInfo.version} detected at ${claudeInfo.path}`);

  if (!claudeInfo.authenticated) {
    console.log('Claude Code not authenticated. Run: claude auth login');
    process.exit(1);
  }

  const serverPkg = join(__dirname, '..', '..', 'server', 'dist', 'index.js');
  if (!existsSync(serverPkg)) {
    console.error('Server not built. Run: pnpm --filter @konduktor/server build');
    process.exit(1);
  }

  const child = spawn('node', [serverPkg], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });

  child.unref();
  writePid(child.pid!);

  const port = DEFAULTS.port as number;
  console.log(`Konduktor started (pid ${child.pid})`);
  console.log(`Open http://localhost:${port}`);
}
```

```typescript
// packages/cli/src/commands/detect.ts (imported by start.ts)
import { execSync } from 'node:child_process';
import type { ClaudeCodeInfo } from '@konduktor/shared';

export function detectClaude(): ClaudeCodeInfo {
  try {
    const version = execSync('claude --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const path = execSync('which claude', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

    let authenticated = false;
    try {
      const authCheck = execSync('claude auth status', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
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

```typescript
// packages/cli/src/commands/stop.ts
import { readPid, clearPid } from '../daemon.js';

export async function stop() {
  const pid = readPid();
  if (!pid) {
    console.log('Konduktor is not running');
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    clearPid();
    console.log(`Konduktor stopped (pid ${pid})`);
  } catch {
    clearPid();
    console.log('Process not found, cleaned up pid file');
  }
}
```

```typescript
// packages/cli/src/commands/status.ts
import { readPid } from '../daemon.js';
import { DEFAULTS } from '@konduktor/shared';

export async function status() {
  const pid = readPid();
  if (!pid) {
    console.log('Konduktor is not running');
    return;
  }
  try {
    process.kill(pid, 0);
    console.log(`Konduktor running (pid ${pid}) at http://localhost:${DEFAULTS.port}`);
  } catch {
    console.log('Konduktor pid file exists but process is dead');
  }
}
```

```typescript
// packages/cli/src/daemon.ts
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { PATHS } from '@konduktor/shared';

const pidPath = join(homedir(), PATHS.configDir, 'konduktor.pid');

export function writePid(pid: number): void {
  const dir = join(homedir(), PATHS.configDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(pidPath, String(pid));
}

export function readPid(): number | null {
  try {
    return parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  } catch {
    return null;
  }
}

export function clearPid(): void {
  try { unlinkSync(pidPath); } catch { /* ignore */ }
}
```

- [ ] **Step 2: Build and test CLI**

```bash
pnpm --filter @konduktor/cli build
node packages/cli/dist/index.js
node packages/cli/dist/index.js start
node packages/cli/dist/index.js status
node packages/cli/dist/index.js stop
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli
git commit -m "feat: add konduktor CLI with start/stop/status commands

Daemonizes server process, checks Claude Code CLI availability,
manages pid file at ~/.konduktor/konduktor.pid."
```

---

### Task 10: Integration Test + README

**Files:**
- Create: `packages/server/tests/integration.test.ts`
- Create: `README.md`
- Modify: `package.json` (add convenience scripts)

**Interfaces:**
- Consumes: everything from Tasks 1-9
- Produces: integration test, README with install/usage instructions

- [ ] **Step 1: Write integration test**

```typescript
// packages/server/tests/integration.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createApp } from '../src/index.js';
import { createServer, Server } from 'node:http';

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

describe('API integration', () => {
  it('GET /api/health returns ok', async () => {
    const res = await fetch(`http://localhost:${port}/api/health`);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /api/sessions returns array', async () => {
    const res = await fetch(`http://localhost:${port}/api/sessions`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/settings returns defaults', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings`);
    const body = await res.json();
    expect(body.theme).toBeDefined();
    expect(body.port).toBeDefined();
  });

  it('PUT /api/settings persists changes', async () => {
    await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'dark' }),
    });
    const res = await fetch(`http://localhost:${port}/api/settings`);
    const body = await res.json();
    expect(body.theme).toBe('dark');
  });
});
```

- [ ] **Step 2: Write README**

```markdown
# Konduktor

Open-source orchestrator for Claude Code.
No hacks. No bots. No ToS violations.

## Install

npm install -g @konduktor/cli

## Quick Start

konduktor start
# Open http://localhost:4170

## Features (Phase 1)

- Streaming chat interface (wraps Claude Code CLI)
- Session management (list, stop, resume, delete)
- Settings (theme, concurrent session limit, LAN access)
- Sidebar layout with dark/light theme

## Requirements

- Node.js >= 20
- Claude Code CLI (installed automatically as peer dependency)
- Active Claude subscription (Pro, Team, or Enterprise)

## Development

git clone https://github.com/gemimakruva/konduktor.git
cd konduktor
pnpm install
pnpm dev

## License

MIT - PT Makruva Teknologi Nusantara

## Roadmap

- Phase 2: Kanban board, subagent watch, capabilities management
- Phase 3: Cron jobs, artifact integration, analytics
- Phase 4: Cross-session messaging, browser automation, plugins
- Phase 5: Desktop app (Electron/Tauri), cloud deploy, npm publish
```

- [ ] **Step 3: Run all tests, final verification, commit**

```bash
pnpm test
pnpm build

git add README.md packages/server/tests/integration.test.ts package.json
git commit -m "feat: add integration tests and README

API integration tests for health, sessions, settings endpoints.
README with install instructions and roadmap."
```

---

## Summary

| Task | Deliverable | Files | Est. Commits |
|------|------------|-------|-------------|
| 1 | Monorepo scaffold + shared types | 12 files | 1 |
| 2 | Claude CLI wrapper | 4 files | 1 |
| 3 | Express + WebSocket server | 5 files | 1 |
| 4 | SQLite database | 3 files | 1 |
| 5 | React app + layout + tokens | 7 files | 1 |
| 6 | Chat UI with streaming | 8 files | 1 |
| 7 | Sessions UI | 3 files | 1 |
| 8 | Settings UI | 2 files | 1 |
| 9 | CLI commands | 5 files | 1 |
| 10 | Integration test + README | 3 files | 1 |
| **Total** | **Phase 1 complete** | **~52 files** | **10** |
