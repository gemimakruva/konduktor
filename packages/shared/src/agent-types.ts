export interface DelegationRule {
  taskPattern: string;
  targetAgentId: number;
}

export interface ToolRestriction {
  mode: 'allow' | 'deny';
  tools: string[];
}

export interface AgentPerformanceStats {
  tasksCompleted: number;
  tasksFailed: number;
  avgDurationMs: number;
  successRate: number;
}

export interface AgentProfile {
  id: number;
  name: string;
  icon: string;
  systemPrompt: string;
  model: string;
  defaultCwd: string;
  skills: string[];
  maxConcurrentTasks: number;
  personalityPrompt: string;
  delegationRules: DelegationRule[];
  memoryPolicy: 'ephemeral' | 'persistent';
  toolRestrictions: ToolRestriction;
  knowledgeSources: string[];
  createdAt: number;
  updatedAt: number;
}

export type AgentProfileCreate = Pick<AgentProfile,
  'name' | 'icon' | 'systemPrompt' | 'model' | 'defaultCwd' | 'skills' |
  'maxConcurrentTasks' | 'personalityPrompt' | 'delegationRules' |
  'memoryPolicy' | 'toolRestrictions' | 'knowledgeSources'
>;

export type AgentProfileUpdate = Partial<AgentProfileCreate>;

export interface AgentAssignment {
  id: number;
  taskId: number;
  agentId: number;
  sessionId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: string;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  createdAt: number;
}
