export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: string;
  usage?: TokenUsage;
  isStreaming?: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  thinkingTokens: number;
  costUsd: number;
}

export interface Session {
  pid: number;
  cwd: string;
  kind: 'interactive' | 'background' | 'cloud';
  startedAt: number;
  sessionId: string;
  name: string;
  status: 'busy' | 'idle' | 'completed' | 'error';
}

export interface StreamEvent {
  type: 'system' | 'assistant' | 'result' | 'rate_limit_event';
  subtype?: string;
  content?: ContentBlock[];
  result?: string;
  isError?: boolean;
  sessionId?: string;
  usage?: TokenUsage;
  model?: string;
  durationMs?: number;
  costUsd?: number;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface CliInitEvent {
  type: 'system';
  subtype: 'init';
  tools: string[];
  mcpServers: McpServerInfo[];
  model: string;
  plugins: PluginInfo[];
  skills: string[];
}

export interface McpServerInfo {
  name: string;
  status: 'connected' | 'failed';
  error?: string;
}

export interface PluginInfo {
  name: string;
  version: string;
  enabled: boolean;
}

export interface Capability {
  type: 'mcp' | 'plugin' | 'skill' | 'tool';
  name: string;
  status: 'installed' | 'available' | 'missing';
  description?: string;
  installCommand?: string;
  requiredConfig?: string[];
}

export interface ClaudeCodeInfo {
  installed: boolean;
  version?: string;
  path?: string;
  authenticated: boolean;
  model?: string;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  port: number;
  maxConcurrentSessions: number;
  defaultModel: string;
  defaultEffort: 'low' | 'medium' | 'high';
  lanAccess: boolean;
  pinCode?: string;
}

export interface AnalyticsRecord {
  id: number;
  sessionId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  thinkingTokens: number;
  costUsd: number;
  durationMs: number;
  createdAt: number;
}

export interface AnalyticsSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  totalSessions: number;
  avgCostPerSession: number;
}

export interface DailyAnalytics {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  sessions: number;
}

export interface ModelAnalytics {
  model: string;
  count: number;
  totalTokens: number;
  totalCost: number;
}

export interface CronJob {
  id: number;
  name: string;
  schedule: string;
  prompt: string;
  cwd: string | null;
  model: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CronExecution {
  id: number;
  jobId: number;
  sessionId: string | null;
  status: 'running' | 'completed' | 'failed';
  output: string;
  startedAt: number;
  finishedAt: number | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export type WsClientMessage =
  | { type: 'chat:start'; prompt: string; cwd?: string; model?: string; sessionId?: string }
  | { type: 'chat:message'; sessionId: string; prompt: string; cwd?: string; model?: string }
  | { type: 'chat:stop'; sessionId: string }
  | { type: 'chat:history'; sessionId: string }
  | { type: 'chat:reconnect'; sessionId: string; lastEventIndex: number }
  | { type: 'sessions:list' }
  | { type: 'sessions:stop'; sessionId: string };

export type WsServerMessage =
  | { type: 'chat:stream'; sessionId: string; event: StreamEvent; eventIndex?: number }
  | { type: 'chat:end'; sessionId: string; result: StreamEvent }
  | { type: 'chat:error'; sessionId: string; error: string }
  | { type: 'chat:history'; sessionId: string; messages: ChatMessage[] }
  | { type: 'chat:init'; sessionId: string; init: CliInitEvent }
  | { type: 'chat:replay'; sessionId: string; events: StreamEvent[]; currentIndex: number }
  | { type: 'rate_limit'; sessionId: string; retryAfterMs: number }
  | { type: 'sessions:update'; sessions: Session[] }
  | { type: 'error'; message: string };
