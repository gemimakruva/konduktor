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
