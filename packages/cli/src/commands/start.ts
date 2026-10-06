import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS } from '@konduktor/shared';
import { writePid, readPid, clearPid } from '../daemon.js';
import { detectClaude } from './detect.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function start() {
  const existing = readPid();
  if (existing) {
    try {
      process.kill(existing, 0);
      console.log(`Konduktor already running (pid ${existing})`);
      return;
    } catch {
      clearPid();
    }
  }

  const claudeInfo = detectClaude();
  if (!claudeInfo.installed) {
    console.log('Claude Code CLI not found.');
    console.log('Install it with: npm install -g @anthropic-ai/claude-code');
    console.log('Then run: claude auth login');
    process.exit(1);
  }
  console.log(`Claude Code ${claudeInfo.version} detected at ${claudeInfo.path}`);

  if (!claudeInfo.authenticated) {
    console.log('Claude Code not authenticated. Run: claude auth login');
    process.exit(1);
  }

  const serverPkg = join(__dirname, '..', '..', '..', 'server', 'dist', 'index.js');
  if (!existsSync(serverPkg)) {
    console.error('Server not built. Run: pnpm --filter @konduktor/server build');
    process.exit(1);
  }

  const child = spawn('node', [serverPkg], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });

  child.unref();
  writePid(child.pid!);

  console.log(`Konduktor started (pid ${child.pid})`);
  console.log(`Open http://localhost:${DEFAULTS.port}`);
}
