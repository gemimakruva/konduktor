import type { WebSocket } from 'ws';
import type { WsClientMessage, WsServerMessage } from '@konduktor/shared';
import { DEFAULTS, LIMITS } from '@konduktor/shared';
import { readFileSync } from 'node:fs';
import { ClaudeProcess } from '../claude/cli.js';
import { SessionManager } from '../claude/sessions.js';
import { CONFIG } from '../config.js';

const mgr = new SessionManager();

let globalProcessCount = 0;

function send(ws: WebSocket, msg: WsServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function loadMaxConcurrent(): number {
  try {
    const raw = JSON.parse(readFileSync(CONFIG.settingsPath, 'utf-8'));
    const val = raw.maxConcurrentSessions;
    if (typeof val === 'number' && val >= 1 && val <= LIMITS.maxConcurrentSessions) return val;
  } catch { /* use default */ }
  return DEFAULTS.maxConcurrentSessions;
}

export function createWsHandler() {
  return (ws: WebSocket) => {
    const connectionProcesses = new Map<string, ClaudeProcess>();

    ws.on('message', (raw) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }

      if (msg.type === 'chat:start') {
        const maxConcurrent = loadMaxConcurrent();
        if (globalProcessCount >= maxConcurrent) {
          send(ws, { type: 'error', message: `Max ${maxConcurrent} concurrent sessions` });
          return;
        }

        const sessionId = msg.sessionId || crypto.randomUUID();
        const proc = new ClaudeProcess(sessionId);

        proc.on('event', (event) => {
          send(ws, { type: 'chat:stream', sessionId, event });
        });

        proc.on('close', () => {
          connectionProcesses.delete(sessionId);
          globalProcessCount--;
          const lastEvent = { type: 'result' as const, result: 'Session ended' };
          send(ws, { type: 'chat:end', sessionId, result: lastEvent });
        });

        proc.on('error', (err: Error) => {
          connectionProcesses.delete(sessionId);
          globalProcessCount--;
          send(ws, { type: 'chat:error', sessionId, error: err.message });
        });

        connectionProcesses.set(sessionId, proc);
        globalProcessCount++;
        proc.start(msg.prompt, { cwd: msg.cwd, model: msg.model });
      }

      if (msg.type === 'chat:stop') {
        const proc = connectionProcesses.get(msg.sessionId);
        if (proc) {
          proc.kill();
          connectionProcesses.delete(msg.sessionId);
          globalProcessCount--;
        }
      }

      if (msg.type === 'sessions:list') {
        send(ws, { type: 'sessions:update', sessions: mgr.list() });
      }
    });

    ws.on('close', () => {
      for (const [id, proc] of connectionProcesses) {
        if (proc.isRunning) {
          proc.kill();
          globalProcessCount--;
        }
        connectionProcesses.delete(id);
      }
    });
  };
}
