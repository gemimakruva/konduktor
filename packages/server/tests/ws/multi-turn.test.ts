import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
// EventEmitter used for mockWs below; mock classes use async import

vi.mock('../../src/claude/cli.js', async () => {
  const { EventEmitter } = await import('node:events');
  function makeMockProc(sessionId: string) {
    const ee = new EventEmitter();
    return Object.assign(ee, {
      sessionId,
      isRunning: true,
      start: vi.fn(),
      kill: vi.fn(() => { (ee as any).isRunning = false; }),
    });
  }
  return { ClaudeProcess: vi.fn(makeMockProc) };
});

vi.mock('../../src/claude/sessions.js', () => {
  class MockSessionManager {
    list = vi.fn(() => []);
  }
  return { SessionManager: MockSessionManager };
});

vi.mock('../../src/db/connection.js', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn(), all: vi.fn(() => []), get: vi.fn() })),
  })),
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

  it('chat:history sends stored messages', () => {
    const handler = createWsHandler();
    const ws = mockWs();
    handler(ws);

    ws.emit('message', JSON.stringify({
      type: 'chat:history', sessionId: 'sess-1',
    }));

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe('chat:history');
    expect(sent.sessionId).toBe('sess-1');
    expect(Array.isArray(sent.messages)).toBe(true);
  });
});
