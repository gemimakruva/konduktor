#!/usr/bin/env node
import { Command } from 'commander';
import { start } from './commands/start.js';
import { stop } from './commands/stop.js';
import { status } from './commands/status.js';
import { open } from './commands/open.js';
import { setupMcp } from './commands/setup-mcp.js';

const program = new Command();

program
  .name('konduktor')
  .description('Open-source orchestrator for Claude Code')
  .version('0.1.0');

program.command('start')
  .description('Start the Konduktor server')
  .option('-o, --open', 'Open in browser after starting')
  .action(start);

program.command('stop')
  .description('Stop the running server')
  .action(stop);

program.command('status')
  .description('Show server status')
  .action(status);

program.command('open')
  .description('Open Konduktor in browser')
  .action(open);

program.command('setup-mcp')
  .description('Register Konduktor as an MCP server for Claude Code')
  .action(setupMcp);

program.command('mcp-serve')
  .description('Run as MCP server (stdio transport, used by Claude Code)')
  .action(async () => {
    const { mcpServe } = await import('./commands/mcp-serve.js');
    await mcpServe();
  });

program.parse();
