import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { PATHS } from '@konduktor/shared';

const pidPath = join(homedir(), PATHS.configDir, 'konduktor.pid');

export function writePid(pid: number): void {
  const dir = join(homedir(), PATHS.configDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(pidPath, String(pid));
}

export function readPid(): number | null {
  try {
    return parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  } catch {
    return null;
  }
}

export function clearPid(): void {
  try { unlinkSync(pidPath); } catch { /* already gone */ }
}
