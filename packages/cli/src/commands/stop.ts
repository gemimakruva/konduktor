import { readPid, clearPid } from '../daemon.js';

export async function stop() {
  const pid = readPid();
  if (!pid) {
    console.log('Konduktor is not running');
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    clearPid();
    console.log(`Konduktor stopped (pid ${pid})`);
  } catch {
    clearPid();
    console.log('Process not found, cleaned up pid file');
  }
}
