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

        proc.on('error', (err: Error) => {
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
