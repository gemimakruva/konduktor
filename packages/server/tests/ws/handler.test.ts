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

import { createWsHandler } from '../../src/ws/handler.js';
import { ClaudeProcess } from '../../src/claude/cli.js';

function mockWs() {
  const ws = new EventEmitter() as any;
  ws.readyState = 1;
  ws.OPEN = 1;
  ws.send = vi.fn();
  return ws;
}

describe('WebSocket handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closing one connection does NOT kill processes from another', () => {
    const handler = createWsHandler();
    const ws1 = mockWs();
    const ws2 = mockWs();

    handler(ws1);
    handler(ws2);

    ws1.emit('message', JSON.stringify({
      type: 'chat:start', prompt: 'hello', sessionId: 'sess-1',
    }));

    ws2.emit('message', JSON.stringify({
      type: 'chat:start', prompt: 'world', sessionId: 'sess-2',
    }));

    const proc1 = vi.mocked(ClaudeProcess).mock.results[0].value;
    const proc2 = vi.mocked(ClaudeProcess).mock.results[1].value;

    ws1.emit('close');

    expect(proc1.kill).toHaveBeenCalled();
    expect(proc2.kill).not.toHaveBeenCalled();
  });
});
