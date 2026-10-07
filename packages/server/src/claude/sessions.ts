import { execFileSync } from 'node:child_process';
import type { Session } from '@konduktor/shared';
import { CONFIG } from '../config.js';

export class SessionManager {
  list(includeAll = false): Session[] {
    try {
      const args = includeAll ? ['agents', '--json', '--all'] : ['agents', '--json'];
      const output = execFileSync(CONFIG.claudeBin, args, {
        encoding: 'utf-8',
        timeout: 3_000,
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
      execFileSync(CONFIG.claudeBin, ['stop', sessionId], { timeout: 3_000 });
      return true;
    } catch {
      return false;
    }
  }

  remove(sessionId: string): boolean {
    try {
      execFileSync(CONFIG.claudeBin, ['rm', sessionId], { timeout: 3_000 });
      return true;
    } catch {
      return false;
    }
  }
}
