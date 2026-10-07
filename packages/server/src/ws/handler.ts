import type { WebSocket } from 'ws';
import type { WsClientMessage, WsServerMessage, StreamEvent } from '@konduktor/shared';
import { DEFAULTS, LIMITS } from '@konduktor/shared';
import { readFileSync } from 'node:fs';
import { ClaudeProcess } from '../claude/cli.js';
import { SessionManager } from '../claude/sessions.js';
import { ChatRepository } from '../db/chat-repository.js';
import { AnalyticsRepository } from '../db/analytics-repository.js';
import { ArtifactRepository } from '../db/artifact-repository.js';
import { extractArtifactFromEvent } from './artifact-detector.js';
import { StreamBuffer } from './stream-buffer.js';
import { getDb } from '../db/connection.js';
import { CONFIG } from '../config.js';

const sessionBuffers = new Map<string, StreamBuffer<StreamEvent>>();

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

function getChatRepo(): ChatRepository {
  return new ChatRepository(getDb());
}

function startProcess(
  ws: WebSocket,
  sessionId: string,
  prompt: string,
  connectionProcesses: Map<string, ClaudeProcess>,
  opts: { cwd?: string; model?: string; resume?: string },
): void {
  const proc = new ClaudeProcess(sessionId);

  if (!sessionBuffers.has(sessionId)) {
    sessionBuffers.set(sessionId, new StreamBuffer<StreamEvent>(LIMITS.streamBufferSize));
  }
  const buffer = sessionBuffers.get(sessionId)!;

  proc.on('event', (event) => {
    if (event.type === 'rate_limit_event') {
      send(ws, { type: 'rate_limit', sessionId, retryAfterMs: (event as any).retryAfterMs || 30000 });
      return;
    }
    if (event.type === 'system' && event.subtype === 'init') {
      send(ws, { type: 'chat:init', sessionId, init: event as any });
      return;
    }
    const idx = buffer.push(event);
    send(ws, { type: 'chat:stream', sessionId, event, eventIndex: idx });

    const artifactInputs = extractArtifactFromEvent(event);
    for (const input of artifactInputs) {
      try {
        const artifact = new ArtifactRepository(getDb()).create({
          sessionId,
          url: input.url,
          title: input.title,
          description: input.description,
          icon: input.icon,
          artifactType: input.artifactType,
        });
        send(ws, { type: 'artifact:saved', artifact });
      } catch { /* artifact save failure is non-fatal */ }
    }

    if (event.type === 'result' && event.usage) {
      try {
        new AnalyticsRepository(getDb()).record(
          sessionId, event.model || 'unknown', event.usage, event.durationMs || 0
        );
      } catch { /* analytics write failure is non-fatal */ }
    }
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
  proc.start(prompt, opts);
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

        try {
          getChatRepo().saveMessage(sessionId, 'user', msg.prompt);
        } catch { /* DB write failure is non-fatal */ }

        startProcess(ws, sessionId, msg.prompt, connectionProcesses, {
          cwd: msg.cwd, model: msg.model,
        });
      }

      if (msg.type === 'chat:message') {
        const maxConcurrent = loadMaxConcurrent();
        if (globalProcessCount >= maxConcurrent) {
          send(ws, { type: 'error', message: `Max ${maxConcurrent} concurrent sessions` });
          return;
        }

        try {
          getChatRepo().saveMessage(msg.sessionId, 'user', msg.prompt);
        } catch { /* DB write failure is non-fatal */ }

        startProcess(ws, msg.sessionId, msg.prompt, connectionProcesses, {
          cwd: msg.cwd, model: msg.model, resume: msg.sessionId,
        });
      }

      if (msg.type === 'chat:stop') {
        const proc = connectionProcesses.get(msg.sessionId);
        if (proc) {
          proc.kill();
          connectionProcesses.delete(msg.sessionId);
          globalProcessCount--;
        }
      }

      if (msg.type === 'chat:history') {
        try {
          const messages = getChatRepo().getHistory(msg.sessionId);
          send(ws, { type: 'chat:history', sessionId: msg.sessionId, messages });
        } catch {
          send(ws, { type: 'chat:history', sessionId: msg.sessionId, messages: [] });
        }
      }

      if (msg.type === 'chat:reconnect') {
        const buf = sessionBuffers.get(msg.sessionId);
        if (buf) {
          const events = buf.getSince(msg.lastEventIndex);
          send(ws, { type: 'chat:replay', sessionId: msg.sessionId, events, currentIndex: buf.currentIndex });
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
