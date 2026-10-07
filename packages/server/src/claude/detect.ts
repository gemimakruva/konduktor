import { execFileSync } from 'node:child_process';
import type { ClaudeCodeInfo } from '@konduktor/shared';
import { CONFIG } from '../config.js';

export function detectClaude(): ClaudeCodeInfo {
  try {
    const execOpts = { encoding: 'utf-8' as const, timeout: 3000 };
    const version = execFileSync(CONFIG.claudeBin, ['--version'], execOpts).trim();
    const path = execFileSync('which', [CONFIG.claudeBin], execOpts).trim();

    let authenticated = false;
    try {
      const authCheck = execFileSync(CONFIG.claudeBin, ['auth', 'status'], execOpts);
      authenticated = authCheck.includes('authenticated') || authCheck.includes('logged in');
    } catch {
      authenticated = false;
    }

    return { installed: true, version, path, authenticated };
  } catch {
    return { installed: false, authenticated: false };
  }
}
