import { execSync } from 'node:child_process';
import type { ClaudeCodeInfo } from '@konduktor/shared';

function findExecutable(name: string): string {
  const cmd = process.platform === 'win32' ? `where.exe ${name}` : `which ${name}`;
  return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().split(/\r?\n/)[0];
}

export function detectClaude(): ClaudeCodeInfo {
  try {
    const version = execSync('claude --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const path = findExecutable('claude');

    let authenticated = false;
    try {
      const authCheck = execSync('claude auth status', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      authenticated = authCheck.includes('authenticated') || authCheck.includes('logged in');
    } catch {
      authenticated = false;
    }

    return { installed: true, version, path, authenticated };
  } catch {
    return { installed: false, authenticated: false };
  }
}
