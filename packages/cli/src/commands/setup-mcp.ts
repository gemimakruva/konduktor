import { execSync } from 'node:child_process';

export async function setupMcp() {
  try {
    const existing = execSync('claude mcp list', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    if (existing.includes('konduktor')) {
      console.log('Konduktor MCP server already registered with Claude Code.');
      return;
    }
  } catch {
    console.error('Claude Code CLI not found. Install it first: npm install -g @anthropic-ai/claude-code');
    process.exit(1);
  }

  try {
    execSync('claude mcp add konduktor -- konduktor mcp-serve', {
      encoding: 'utf-8',
      stdio: 'inherit',
    });
    console.log('Konduktor registered as MCP server for Claude Code.');
    console.log('Claude Code will now have access to Konduktor tools.');
  } catch (err) {
    console.error('Failed to register MCP server:', (err as Error).message);
    process.exit(1);
  }
}
