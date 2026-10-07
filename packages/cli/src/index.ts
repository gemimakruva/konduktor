#!/usr/bin/env node
import { start } from './commands/start.js';
import { stop } from './commands/stop.js';
import { status } from './commands/status.js';
import { open } from './commands/open.js';

const cmd = process.argv[2];

const commands: Record<string, () => Promise<void>> = { start, stop, status, open };

if (!cmd || !commands[cmd]) {
  console.log(`
Konduktor - Open-source orchestrator for Claude Code
No hacks. No bots. No ToS violations.

Usage: konduktor <command>

Commands:
  start     Start the Konduktor server
  start -o  Start and open in browser
  stop      Stop the running server
  status    Show server status
  open      Open Konduktor in browser
`);
  process.exit(cmd ? 1 : 0);
}

commands[cmd]().catch(err => {
  console.error(err.message);
  process.exit(1);
});
