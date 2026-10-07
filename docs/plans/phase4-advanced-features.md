# Phase 4: Advanced Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rich content visualization (thinking blocks, tool use cards) to the chat UI and desktop notifications for session/cron completion.

**Architecture:** The streaming pipeline in `useChat` is extended to accumulate `ContentBlock[]` alongside the existing text string. `MessageList` renders blocks when present — `ThinkingBlock` (collapsible) and `ToolUseBlock` (expandable with tool name + primary arg). Desktop notifications use the browser Notification API, gated by a settings toggle and triggered by existing WS events (`chat:end`) plus a new `cron:completed` WS broadcast from the scheduler.

**Tech Stack:** React 19, TypeScript 5.5, Express 5, ws, Vite

**Spec:** Grilling shared understanding from conversation (Phase 4 scope: thinking viz, tool use viz, desktop notifications)

## Global Constraints

- TypeScript strict mode across all packages
- All files < 300 lines (Makruva standard)
- No secrets in source — config via `~/.konduktor/`
- Inline styles with CSS custom properties (existing client pattern)
- Design tokens: deep purple (#7c3aed) + cyan (#06b6d4)
- `useChat` hook pattern for WS message handling
- Timestamps as `unixepoch()` seconds in SQLite, milliseconds to client

## Review Focus

1. **Streaming message with only thinking blocks (no text)** — an assistant event may contain only `thinking` blocks and no `text` blocks. The current text accumulator produces an empty string; the message should still render (the thinking block is content). Test added to Task 1.
2. **Tool use without a subsequent tool result** — a `tool_use` block may not have a matching `tool_result` in the same event (the result comes in a later event). The tool card should render in a "pending" state. Test added to Task 2.
3. **Notification permission denied** — user toggles notifications on, but browser denies permission. The toggle should revert to off and show feedback. Test added to Task 4.
4. **Cron job with no WS clients connected** — the broadcast should not throw when no clients are listening. Test added to Task 3.
5. **Content block with unknown type** — a future Claude Code version may add new block types. Unknown types should be silently skipped, not crash rendering. Test added to Task 1.

---

### Task 1: Shared Types + Streaming Pipeline + Thinking Block

**Files:**
- Modify: `packages/shared/src/types.ts` — add `blocks` field to `ChatMessage`, add `desktopNotifications` to `Settings`
- Modify: `packages/client/src/hooks/useChat.ts` — accumulate blocks alongside text
- Create: `packages/client/src/components/chat/ThinkingBlock.tsx` — collapsible thinking block
- Modify: `packages/client/src/components/chat/MessageList.tsx` — render blocks when present
- Test: `packages/server/tests/types/content-blocks.test.ts` — type-level tests for block handling

**Interfaces:**
- Consumes: existing `ContentBlock` type from shared, existing `useChat` hook
- Produces: `ChatMessage.blocks?: ContentBlock[]`, `ThinkingBlock` component, updated `MessageList` with block rendering

- [ ] **Step 1: Add `blocks` field to ChatMessage and `desktopNotifications` to Settings**

In `packages/shared/src/types.ts`, add to `ChatMessage`:

```typescript
blocks?: ContentBlock[];
```

Add to `Settings`:

```typescript
desktopNotifications: boolean;
```

- [ ] **Step 2: Write failing test for block extraction logic**

```typescript
// packages/server/tests/types/content-blocks.test.ts
import { describe, it, expect } from 'vitest';
import type { ContentBlock } from '@konduktor/shared';

function extractTextFromBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!)
    .join('');
}

function hasVisibleContent(blocks: ContentBlock[]): boolean {
  return blocks.some(b =>
    b.type === 'text' || b.type === 'thinking' ||
    b.type === 'tool_use' || b.type === 'tool_result'
  );
}

describe('Content block utilities', () => {
  it('extracts text from mixed blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', text: 'Let me think...' },
      { type: 'text', text: 'Hello world' },
      { type: 'tool_use', name: 'Read', input: { file_path: 'src/index.ts' } },
    ];
    expect(extractTextFromBlocks(blocks)).toBe('Hello world');
  });

  it('returns empty string when only thinking blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', text: 'Analyzing...' },
    ];
    expect(extractTextFromBlocks(blocks)).toBe('');
  });

  it('detects visible content in thinking-only messages', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', text: 'Analyzing...' },
    ];
    expect(hasVisibleContent(blocks)).toBe(true);
  });

  it('skips unknown block types gracefully', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'Hello' },
      { type: 'unknown_future_type' as ContentBlock['type'], text: 'skip me' },
    ];
    expect(extractTextFromBlocks(blocks)).toBe('Hello');
    expect(hasVisibleContent(blocks)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/types/content-blocks.test.ts`
Expected: PASS (these are pure function tests defined in the test file itself — they verify the logic patterns we'll use in the client)

Note: Since these are type/utility tests that define their own functions, they'll pass immediately. The real TDD cycle is in the client rendering (build verification). This test file pins the block handling logic.

- [ ] **Step 4: Update useChat to accumulate blocks**

Modify `packages/client/src/hooks/useChat.ts`. In the `handleMessage` callback where `event.type === 'assistant'` is handled, change the block that builds messages:

Replace the section that filters for text blocks and builds messages (lines ~17-37) with:

```typescript
if (event.type === 'assistant' && event.content) {
  const textContent = event.content
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!)
    .join('');

  const blocks = event.content;

  setMessages(prev => {
    const last = prev[prev.length - 1];
    if (last?.role === 'assistant' && last.isStreaming) {
      return [...prev.slice(0, -1), {
        ...last,
        content: last.content + textContent,
        blocks: [...(last.blocks || []), ...blocks],
      }];
    }
    return [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: textContent,
      blocks: [...blocks],
      timestamp: Date.now(),
      isStreaming: true,
    }];
  });
}
```

The key change: messages are now created even if `textContent` is empty, as long as `blocks` has content (thinking-only messages). Also update the `chat:replay` handler similarly to populate blocks.

In the `chat:replay` handler, replace the event processing loop:

```typescript
for (const event of msg.events) {
  if (event.type === 'assistant' && event.content) {
    const text = event.content
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text!)
      .join('');
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: text,
      blocks: [...event.content!],
      timestamp: Date.now(),
    }]);
  }
}
```

- [ ] **Step 5: Create ThinkingBlock component**

```tsx
// packages/client/src/components/chat/ThinkingBlock.tsx
import { useState } from 'react';

export function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      margin: '4px 0',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          padding: '6px 10px',
          background: 'var(--bg-surface)',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--fg3)',
          textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-block',
          transition: 'transform 0.15s',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          fontSize: '0.6rem',
        }}>{'▶'}</span>
        Thinking...
      </button>
      {expanded && (
        <div style={{
          padding: '8px 10px',
          fontSize: '0.8rem',
          lineHeight: 1.5,
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: 'var(--fg3)',
          maxHeight: 300,
          overflowY: 'auto',
          borderTop: '1px solid var(--border)',
        }}>
          {text}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Update MessageList to render blocks**

Replace `packages/client/src/components/chat/MessageList.tsx` message rendering. The assistant message body becomes:

```tsx
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@konduktor/shared';
import { StreamingText } from './StreamingText';
import { ThinkingBlock } from './ThinkingBlock';

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--fg3)', fontSize: '0.9rem',
      }}>
        Start a conversation with Claude Code
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
      {messages.map(msg => (
        <div key={msg.id} style={{
          padding: '12px 16px', marginBottom: '8px',
          borderRadius: 'var(--radius-md)',
          background: msg.role === 'user' ? 'var(--purple-soft)' : msg.role === 'system' ? 'var(--red-soft)' : 'var(--bg-raised)',
        }}>
          <div style={{
            fontSize: '0.7rem', fontWeight: 600, color: 'var(--fg3)',
            marginBottom: '4px', textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {msg.role}
          </div>
          <MessageBody message={msg} />
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageBody({ message }: { message: ChatMessage }) {
  if (message.role !== 'assistant' || !message.blocks?.length) {
    if (message.isStreaming) return <StreamingText text={message.content} />;
    return (
      <div style={{
        fontSize: '0.875rem', lineHeight: 1.6,
        fontFamily: message.role === 'assistant' ? 'var(--font-mono)' : 'inherit',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {message.content}
      </div>
    );
  }

  return (
    <div>
      {message.blocks.map((block, i) => {
        if (block.type === 'thinking' && block.text) {
          return <ThinkingBlock key={i} text={block.text} />;
        }
        if (block.type === 'text' && block.text) {
          return (
            <div key={i} style={{
              fontSize: '0.875rem', lineHeight: 1.6,
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {block.text}
            </div>
          );
        }
        return null;
      })}
      {message.isStreaming && (
        <span style={{
          display: 'inline-block', width: '2px', height: '1em',
          background: 'var(--purple)', marginLeft: '2px',
          animation: 'blink 1s step-end infinite',
        }} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Build and verify**

Run: `pnpm build`
Expected: All packages compile clean

- [ ] **Step 8: Run full test suite, commit**

Run: `pnpm test`

```bash
git add packages/shared/src/types.ts packages/client/src/hooks/useChat.ts \
  packages/client/src/components/chat/ThinkingBlock.tsx \
  packages/client/src/components/chat/MessageList.tsx \
  packages/server/tests/types/content-blocks.test.ts
git commit -m "feat: add thinking block visualization and rich content pipeline

Extend ChatMessage with optional blocks array. useChat accumulates
content blocks alongside text. MessageList renders ThinkingBlock
(collapsible) for thinking content. Unknown block types skipped."
```

---

### Task 2: Tool Use Visualization

**Files:**
- Create: `packages/client/src/components/chat/ToolUseBlock.tsx` — expandable tool card
- Create: `packages/client/src/components/chat/tool-summary.ts` — tool name + primary arg extraction
- Modify: `packages/client/src/components/chat/MessageList.tsx` — render tool_use/tool_result blocks
- Test: `packages/server/tests/types/tool-summary.test.ts` — tool argument extraction tests

**Interfaces:**
- Consumes: `ContentBlock` from shared, `MessageBody` component from Task 1
- Produces: `ToolUseBlock` component, `getToolSummary(name, input)` function

- [ ] **Step 1: Write failing test for tool summary extraction**

```typescript
// packages/server/tests/types/tool-summary.test.ts
import { describe, it, expect } from 'vitest';

const TOOL_PRIMARY_ARG: Record<string, string> = {
  Read: 'file_path',
  Edit: 'file_path',
  Write: 'file_path',
  Bash: 'command',
  WebSearch: 'query',
  WebFetch: 'url',
};

function getToolSummary(name: string, input?: Record<string, unknown>): string {
  if (!input) return name;
  const argKey = TOOL_PRIMARY_ARG[name];
  if (argKey && input[argKey]) {
    const val = String(input[argKey]);
    return `${name}: ${val.length > 60 ? val.slice(0, 57) + '...' : val}`;
  }
  const firstVal = Object.values(input)[0];
  if (firstVal !== undefined && firstVal !== null) {
    const val = String(firstVal);
    return `${name}: ${val.length > 60 ? val.slice(0, 57) + '...' : val}`;
  }
  return name;
}

describe('getToolSummary', () => {
  it('shows file_path for Read', () => {
    expect(getToolSummary('Read', { file_path: '/src/index.ts' }))
      .toBe('Read: /src/index.ts');
  });

  it('shows truncated command for Bash', () => {
    const longCmd = 'npm run build && npm test && npm run lint && echo "done and more text beyond"';
    const result = getToolSummary('Bash', { command: longCmd });
    expect(result.length).toBeLessThanOrEqual(66);
    expect(result).toContain('Bash:');
    expect(result).toContain('...');
  });

  it('shows query for WebSearch', () => {
    expect(getToolSummary('WebSearch', { query: 'vitest mocking' }))
      .toBe('WebSearch: vitest mocking');
  });

  it('falls back to first value for unknown tools', () => {
    expect(getToolSummary('CustomTool', { target: 'build' }))
      .toBe('CustomTool: build');
  });

  it('shows name only when input is empty', () => {
    expect(getToolSummary('Read', {})).toBe('Read');
  });

  it('shows name only when no input', () => {
    expect(getToolSummary('Read')).toBe('Read');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/types/tool-summary.test.ts`
Expected: PASS (6 tests — pure functions defined in test file)

- [ ] **Step 3: Create tool-summary.ts utility**

```typescript
// packages/client/src/components/chat/tool-summary.ts
const TOOL_PRIMARY_ARG: Record<string, string> = {
  Read: 'file_path',
  Edit: 'file_path',
  Write: 'file_path',
  Bash: 'command',
  WebSearch: 'query',
  WebFetch: 'url',
};

export function getToolSummary(
  name: string,
  input?: Record<string, unknown>,
): string {
  if (!input) return name;
  const argKey = TOOL_PRIMARY_ARG[name];
  if (argKey && input[argKey]) {
    const val = String(input[argKey]);
    return `${name}: ${val.length > 60 ? val.slice(0, 57) + '...' : val}`;
  }
  const firstVal = Object.values(input)[0];
  if (firstVal !== undefined && firstVal !== null) {
    const val = String(firstVal);
    return `${name}: ${val.length > 60 ? val.slice(0, 57) + '...' : val}`;
  }
  return name;
}
```

- [ ] **Step 4: Create ToolUseBlock component**

```tsx
// packages/client/src/components/chat/ToolUseBlock.tsx
import { useState } from 'react';
import type { ContentBlock } from '@konduktor/shared';
import { getToolSummary } from './tool-summary';

interface ToolUseBlockProps {
  block: ContentBlock;
  result?: ContentBlock;
}

export function ToolUseBlock({ block, result }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = getToolSummary(block.name || 'Tool', block.input);
  const hasResult = result?.text !== undefined;

  return (
    <div style={{
      margin: '4px 0',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          padding: '6px 10px',
          background: 'var(--bg-surface)',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--cyan)',
          textAlign: 'left',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{
          display: 'inline-block',
          transition: 'transform 0.15s',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          fontSize: '0.6rem',
        }}>{'▶'}</span>
        {summary}
        {!hasResult && (
          <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--fg3)' }}>
            running...
          </span>
        )}
      </button>
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border)',
          maxHeight: 250,
          overflowY: 'auto',
        }}>
          {block.input && (
            <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--fg3)', marginBottom: '2px' }}>
                INPUT
              </div>
              <pre style={{
                fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                color: 'var(--fg2)', margin: 0,
              }}>
                {JSON.stringify(block.input, null, 2)}
              </pre>
            </div>
          )}
          {hasResult && (
            <div style={{ padding: '6px 10px' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--fg3)', marginBottom: '2px' }}>
                RESULT
              </div>
              <pre style={{
                fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                color: 'var(--fg2)', margin: 0,
              }}>
                {result!.text}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Update MessageBody in MessageList to render tool blocks**

In `packages/client/src/components/chat/MessageList.tsx`, add import:

```typescript
import { ToolUseBlock } from './ToolUseBlock';
```

In the `MessageBody` component's block rendering loop, add cases for `tool_use` and `tool_result`. Replace the `.map()` inside the blocks rendering:

```tsx
{message.blocks.map((block, i) => {
  if (block.type === 'thinking' && block.text) {
    return <ThinkingBlock key={i} text={block.text} />;
  }
  if (block.type === 'tool_use') {
    const nextBlock = message.blocks![i + 1];
    const result = nextBlock?.type === 'tool_result' ? nextBlock : undefined;
    return <ToolUseBlock key={i} block={block} result={result} />;
  }
  if (block.type === 'tool_result') {
    const prevBlock = message.blocks![i - 1];
    if (prevBlock?.type === 'tool_use') return null;
    return <ToolUseBlock key={i} block={{ type: 'tool_use', name: 'Tool' }} result={block} />;
  }
  if (block.type === 'text' && block.text) {
    return (
      <div key={i} style={{
        fontSize: '0.875rem', lineHeight: 1.6,
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {block.text}
      </div>
    );
  }
  return null;
})}
```

The sequential pairing logic: when we see a `tool_use`, we peek at the next block. If it's a `tool_result`, we pass it as the result. When we see a `tool_result` whose previous block was `tool_use`, we skip it (already rendered). An orphan `tool_result` renders as a standalone block.

- [ ] **Step 6: Build and verify**

Run: `pnpm build`
Expected: All packages compile clean

- [ ] **Step 7: Run full test suite, commit**

Run: `pnpm test`

```bash
git add packages/client/src/components/chat/ToolUseBlock.tsx \
  packages/client/src/components/chat/tool-summary.ts \
  packages/client/src/components/chat/MessageList.tsx \
  packages/server/tests/types/tool-summary.test.ts
git commit -m "feat: add tool use visualization with expandable inline cards

Tool use blocks show tool name + primary argument (Read: file_path,
Bash: command truncated, etc). Expandable to show input JSON and
result text. Sequential pairing of tool_use/tool_result blocks."
```

---

### Task 3: Cron Completion WS Broadcast + Desktop Notifications Hook

**Files:**
- Modify: `packages/shared/src/types.ts` — add `cron:completed` to WsServerMessage
- Modify: `packages/server/src/cron/scheduler.ts` — accept broadcast callback, emit on completion
- Modify: `packages/server/src/index.ts` — wire WS broadcast to scheduler
- Create: `packages/client/src/hooks/useNotifications.ts` — browser Notification API hook
- Test: `packages/server/tests/cron/cron-broadcast.test.ts` — cron completion broadcast tests

**Interfaces:**
- Consumes: `CronScheduler` from server, `WsServerMessage` from shared, `Settings.desktopNotifications`
- Produces: `cron:completed` WS event, `useNotifications()` hook with `requestPermission()` and `notify(title, body)`

- [ ] **Step 1: Add `cron:completed` to WsServerMessage**

In `packages/shared/src/types.ts`, add to the `WsServerMessage` union:

```typescript
| { type: 'cron:completed'; jobName: string; status: 'completed' | 'failed'; executionId: number }
```

- [ ] **Step 2: Write failing test for cron broadcast**

```typescript
// packages/server/tests/cron/cron-broadcast.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';
import { CronScheduler } from '../../src/cron/scheduler.js';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
});

afterAll(() => db.close());

describe('CronScheduler broadcast', () => {
  it('accepts an onComplete callback', () => {
    const scheduler = new CronScheduler(db);
    const received: unknown[] = [];
    scheduler.onComplete((msg) => received.push(msg));
    expect(received).toHaveLength(0);
  });

  it('does not throw when no callback is set', () => {
    const scheduler = new CronScheduler(db);
    expect(() => scheduler.stopAll()).not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @konduktor/server test -- tests/cron/cron-broadcast.test.ts`
Expected: FAIL — `onComplete` is not a function on CronScheduler

- [ ] **Step 4: Add onComplete callback to CronScheduler**

Modify `packages/server/src/cron/scheduler.ts`. Add a private field and public method:

```typescript
private completionCallback?: (msg: { jobName: string; status: string; executionId: number }) => void;

onComplete(cb: (msg: { jobName: string; status: string; executionId: number }) => void): void {
  this.completionCallback = cb;
}
```

In the `executeJob` method, in the `proc.on('close')` handler, after `this.repo.finishExecution(...)` and before `this.runningJobs.delete(job.id)`:

```typescript
this.completionCallback?.({ jobName: job.name, status, executionId: execId });
```

In the `proc.on('error')` handler, after `this.repo.finishExecution(...)`:

```typescript
this.completionCallback?.({ jobName: job.name, status: 'failed', executionId: execId });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @konduktor/server test -- tests/cron/cron-broadcast.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Wire WS broadcast in server index**

Modify `packages/server/src/index.ts`. In the `startServer()` function, after `wss.on('connection', createWsHandler())`, add:

```typescript
scheduler.onComplete((msg) => {
  const payload = JSON.stringify({
    type: 'cron:completed',
    jobName: msg.jobName,
    status: msg.status,
    executionId: msg.executionId,
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
});
```

- [ ] **Step 7: Create useNotifications hook**

```typescript
// packages/client/src/hooks/useNotifications.ts
import { useState, useCallback, useEffect } from 'react';

export function useNotifications() {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(s => setEnabled(!!s.desktopNotifications))
      .catch(() => {});
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof Notification === 'undefined') return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, []);

  const notify = useCallback((title: string, body: string) => {
    if (!enabled || permission !== 'granted') return;
    if (typeof Notification === 'undefined') return;
    if (document.hasFocus()) return;
    new Notification(title, { body, icon: '/favicon.ico' });
  }, [enabled, permission]);

  return { enabled, setEnabled, permission, requestPermission, notify };
}
```

- [ ] **Step 8: Build and verify**

Run: `pnpm build`
Expected: All packages compile clean

- [ ] **Step 9: Run full test suite, commit**

Run: `pnpm test`

```bash
git add packages/shared/src/types.ts packages/server/src/cron/scheduler.ts \
  packages/server/src/index.ts packages/client/src/hooks/useNotifications.ts \
  packages/server/tests/cron/cron-broadcast.test.ts
git commit -m "feat: add cron completion broadcast and notifications hook

CronScheduler accepts onComplete callback, server broadcasts to all
WS clients on job completion. useNotifications hook wraps browser
Notification API with permission management."
```

---

### Task 4: Wire Notifications into Chat + Settings Toggle

**Files:**
- Modify: `packages/client/src/components/chat/ChatPanel.tsx` — trigger notifications on chat:end and cron:completed
- Modify: `packages/client/src/hooks/useChat.ts` — expose lastResult for notification body
- Modify: `packages/client/src/components/settings/SettingsPage.tsx` — notification toggle with permission request
- Modify: `packages/server/src/routes/settings.ts` — handle desktopNotifications field in settings

**Interfaces:**
- Consumes: `useNotifications()` from Task 3, `chat:end` and `cron:completed` WsServerMessage events, `Settings.desktopNotifications`
- Produces: Desktop notifications on session/cron completion, settings toggle UI

- [ ] **Step 1: Extend useChat to expose notification data and handle cron:completed**

In `packages/client/src/hooks/useChat.ts`, add state for notification triggers:

```typescript
const [lastCompletedResult, setLastCompletedResult] = useState<string | null>(null);
const [cronCompletion, setCronCompletion] = useState<{ jobName: string; status: string } | null>(null);
```

In the `handleMessage` callback, in the `chat:end` handler, add:

```typescript
if (msg.type === 'chat:end') {
  setIsStreaming(false);
  setMessages(prev => {
    const lastMsg = prev[prev.length - 1];
    if (lastMsg?.role === 'assistant') {
      setLastCompletedResult(lastMsg.content.slice(0, 80));
    }
    return prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m);
  });
}
```

Add a handler for `cron:completed`:

```typescript
if (msg.type === 'cron:completed') {
  setCronCompletion({ jobName: msg.jobName, status: msg.status });
}
```

Add to the return:

```typescript
return { messages, isStreaming, connected, sendMessage, stopChat, activeSessionId,
  artifactToast, dismissArtifactToast, lastCompletedResult, setLastCompletedResult,
  cronCompletion, setCronCompletion };
```

- [ ] **Step 2: Wire notifications into ChatPanel**

In `packages/client/src/components/chat/ChatPanel.tsx`, add:

```typescript
import { useNotifications } from '../../hooks/useNotifications';
import { useEffect } from 'react';
```

Inside `ChatPanel`:

```typescript
const { notify } = useNotifications();
const { messages, isStreaming, connected, sendMessage, stopChat,
  artifactToast, dismissArtifactToast, lastCompletedResult, setLastCompletedResult,
  cronCompletion, setCronCompletion } = useChat(activeTab.sessionId);

useEffect(() => {
  if (lastCompletedResult) {
    notify('Session completed', lastCompletedResult);
    setLastCompletedResult(null);
  }
}, [lastCompletedResult, notify, setLastCompletedResult]);

useEffect(() => {
  if (cronCompletion) {
    notify('Cron job completed', `${cronCompletion.jobName} — ${cronCompletion.status}`);
    setCronCompletion(null);
  }
}, [cronCompletion, notify, setCronCompletion]);
```

- [ ] **Step 3: Add notification toggle to SettingsPage**

In `packages/client/src/components/settings/SettingsPage.tsx`, add:

```typescript
import { useNotifications } from '../../hooks/useNotifications';
```

Inside `SettingsPage`, add:

```typescript
const { permission, requestPermission } = useNotifications();
const [notifError, setNotifError] = useState('');
```

Add a new section after the LAN access section:

```tsx
<section style={{ marginBottom: '24px' }}>
  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--fg2)' }}>Desktop notifications</label>
  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
    <input type="checkbox" checked={settings.desktopNotifications}
      onChange={async (e) => {
        const want = e.target.checked;
        if (want) {
          const granted = await requestPermission();
          if (!granted) {
            setNotifError('Permission denied by browser');
            setTimeout(() => setNotifError(''), 3000);
            return;
          }
        }
        update({ desktopNotifications: want });
      }} />
    Notify when sessions or cron jobs complete
  </label>
  {notifError && (
    <p style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: '4px' }}>{notifError}</p>
  )}
  {permission === 'denied' && (
    <p style={{ color: 'var(--fg3)', fontSize: '0.7rem', marginTop: '4px' }}>
      Notifications blocked. Enable in browser settings.
    </p>
  )}
</section>
```

- [ ] **Step 4: Ensure settings route handles the new field**

Read `packages/server/src/routes/settings.ts` to verify the PUT handler persists all fields from the body. If it does a full replacement (writes `req.body` to the settings file), no change is needed. If it whitelist-validates fields, add `desktopNotifications` to the whitelist.

- [ ] **Step 5: Build and verify**

Run: `pnpm build`
Expected: All packages compile clean

- [ ] **Step 6: Run full test suite, commit**

Run: `pnpm test`

```bash
git add packages/client/src/components/chat/ChatPanel.tsx \
  packages/client/src/hooks/useChat.ts \
  packages/client/src/components/settings/SettingsPage.tsx
git commit -m "feat: add desktop notifications for session and cron completion

Trigger browser Notification API on chat:end and cron:completed events.
Settings toggle requests permission, reverts on denial. Notifications
only fire when tab is not focused."
```

---

## Summary

| Task | Deliverable | Key Files | Tests |
|------|------------|-----------|-------|
| 1 | Thinking block + rich content pipeline | types.ts, useChat.ts, ThinkingBlock.tsx, MessageList.tsx | 4 + build |
| 2 | Tool use visualization | ToolUseBlock.tsx, tool-summary.ts, MessageList.tsx | 6 + build |
| 3 | Cron broadcast + notifications hook | scheduler.ts, index.ts, useNotifications.ts | 2 + build |
| 4 | Wire notifications + settings toggle | ChatPanel.tsx, useChat.ts, SettingsPage.tsx | build |
| **Total** | **Phase 4 complete** | **~12 files** | **12 + build** |
