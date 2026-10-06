import { readPid } from '../daemon.js';
import { DEFAULTS } from '@konduktor/shared';

export async function status() {
  const pid = readPid();
  if (!pid) {
    console.log('Konduktor is not running');
    return;
  }
  try {
    process.kill(pid, 0);
    console.log(`Konduktor running (pid ${pid}) at http://localhost:${DEFAULTS.port}`);
  } catch {
    console.log('Konduktor pid file exists but process is dead');
  }
}
