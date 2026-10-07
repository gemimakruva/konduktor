const BASE = 'http://127.0.0.1:4170';

async function callApi(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export const TOOLS: McpTool[] = [
  {
    name: 'create_cron',
    description: 'Create a scheduled cron job. Returns the created job.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Job display name' },
        schedule: { type: 'string', description: 'Cron expression (e.g. "0 7 * * *" for daily at 7 AM)' },
        prompt: { type: 'string', description: 'The prompt for Claude to execute on each run' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        model: { type: 'string', description: 'Claude model to use (optional)' },
        agentId: { type: 'number', description: 'Agent profile ID to run as (optional)' },
      },
      required: ['name', 'schedule', 'prompt'],
    },
    handler: (args) => callApi('/api/cron', 'POST', args),
  },
  {
    name: 'list_crons',
    description: 'List all scheduled cron jobs.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => callApi('/api/cron'),
  },
  {
    name: 'store_secret',
    description: 'Store an encrypted secret (API key, credential). Name must be uppercase with underscores (e.g. META_ADS_API_KEY). Injected as env var into agent/cron processes.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Env-var-safe name, e.g. META_ADS_API_KEY' },
        value: { type: 'string', description: 'The secret value to encrypt and store' },
        scope: { type: 'string', description: '"global" (default) or "agent:<id>" for agent-specific' },
      },
      required: ['name', 'value'],
    },
    handler: (args) => callApi('/api/secrets', 'POST', args),
  },
  {
    name: 'list_secrets',
    description: 'List stored secrets (names and scopes only, no values).',
    inputSchema: { type: 'object', properties: {} },
    handler: () => callApi('/api/secrets'),
  },
  {
    name: 'delete_secret',
    description: 'Delete a stored secret by name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the secret to delete' },
      },
      required: ['name'],
    },
    handler: (args) => callApi(`/api/secrets/${args.name}`, 'DELETE'),
  },
  {
    name: 'create_agent',
    description: 'Create a new agent profile with skills, model, and configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent display name' },
        icon: { type: 'string', description: 'Emoji icon (default: 🤖)' },
        systemPrompt: { type: 'string', description: 'System prompt for the agent' },
        model: { type: 'string', description: 'Claude model (default: claude-sonnet-5-5)' },
        skills: { type: 'array', items: { type: 'string' }, description: 'Skill tags for task matching' },
        defaultCwd: { type: 'string', description: 'Default working directory' },
        maxConcurrentTasks: { type: 'number', description: 'Max parallel tasks (default: 1)' },
        memoryPolicy: { type: 'string', enum: ['ephemeral', 'persistent'], description: 'Memory policy' },
      },
      required: ['name'],
    },
    handler: (args) => callApi('/api/profiles', 'POST', args),
  },
  {
    name: 'kanban_create',
    description: 'Create a kanban task.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        column: { type: 'string', description: 'Column: backlog, in-progress, review, done (default: backlog)' },
        description: { type: 'string', description: 'Task description (optional)' },
      },
      required: ['title'],
    },
    handler: (args) => callApi('/api/kanban', 'POST', args),
  },
  {
    name: 'manage_mcp',
    description: 'Add or remove MCP servers from Claude Code configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'remove'], description: '"add" or "remove"' },
        name: { type: 'string', description: 'MCP server name' },
        command: { type: 'string', description: 'Server command (required for add)' },
        args: { type: 'array', items: { type: 'string' }, description: 'Server command arguments (for add)' },
      },
      required: ['action', 'name'],
    },
    handler: async (args) => {
      if (args.action === 'add') {
        return callApi('/api/capabilities/mcp/add', 'POST', {
          name: args.name, command: args.command, args: args.args || [],
        });
      }
      return callApi(`/api/capabilities/mcp/${args.name}`, 'DELETE');
    },
  },
];
