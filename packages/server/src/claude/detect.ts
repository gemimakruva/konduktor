import { execFileSync } from 'node:child_process';
import type { ClaudeCodeInfo } from '@konduktor/shared';
import { CONFIG } from '../config.js';

export function detectClaude(): ClaudeCodeInfo {
  try {
    const version = execFileSync(CONFIG.claudeBin, ['--version'], {
      encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const path = execFileSync('which', [CONFIG.claudeBin], {
      encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    let authenticated = false;
    try {
      const authCheck = execFileSync(CONFIG.claudeBin, ['auth', 'status'], {
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
