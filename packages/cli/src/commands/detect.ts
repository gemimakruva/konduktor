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
      execSync('claude auth status', { stdio: ['pipe', 'pipe', 'pipe'] });
      authenticated = true;
    } catch (err) {
      const output = [(err as { stdout?: Buffer })?.stdout, (err as { stderr?: Buffer })?.stderr]
        .map(b => b?.toString().toLowerCase() || '').join(' ');
      authenticated = /authenticat|logged.in|signed.in|active/.test(output);
    }

    return { installed: true, version, path, authenticated };
  } catch {
    return { installed: false, authenticated: false };
  }
}
