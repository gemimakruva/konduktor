import type Database from 'better-sqlite3';
import type { AgentProfile, AgentProfileCreate, AgentProfileUpdate, AgentPerformanceStats } from '@konduktor/shared';

const PROFILE_DEFAULTS: Omit<AgentProfileCreate, 'name'> = {
  icon: '🤖',
  systemPrompt: '',
  model: 'claude-sonnet-5-5',
  defaultCwd: '',
  skills: [],
  maxConcurrentTasks: 1,
  personalityPrompt: '',
  delegationRules: [],
  memoryPolicy: 'ephemeral',
  toolRestrictions: { mode: 'allow', tools: [] },
  knowledgeSources: [],
};

export class AgentRepository {
  constructor(private db: Database.Database) {}

  create(data: Partial<AgentProfileCreate> & { name: string }): AgentProfile {
    const full = { ...PROFILE_DEFAULTS, ...data };
    const stmt = this.db.prepare(`
      INSERT INTO agent_profiles
        (name, icon, system_prompt, model, default_cwd, skills,
         max_concurrent_tasks, personality_prompt, delegation_rules,
         memory_policy, tool_restrictions, knowledge_sources)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      full.name, full.icon, full.systemPrompt, full.model, full.defaultCwd,
      JSON.stringify(full.skills), full.maxConcurrentTasks, full.personalityPrompt,
      JSON.stringify(full.delegationRules), full.memoryPolicy,
      JSON.stringify(full.toolRestrictions), JSON.stringify(full.knowledgeSources),
    );
    return this.getById(result.lastInsertRowid as number)!;
  }

  list(): AgentProfile[] {
    const rows = this.db.prepare(
      `SELECT * FROM agent_profiles ORDER BY name`,
    ).all() as Record<string, unknown>[];
    return rows.map(this.mapRow);
  }

  getById(id: number): AgentProfile | undefined {
    const row = this.db.prepare(
      `SELECT * FROM agent_profiles WHERE id = ?`,
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  update(id: number, patch: AgentProfileUpdate): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    const fieldMap: Record<string, string> = {
      name: 'name', icon: 'icon', systemPrompt: 'system_prompt',
      model: 'model', defaultCwd: 'default_cwd', maxConcurrentTasks: 'max_concurrent_tasks',
      personalityPrompt: 'personality_prompt', memoryPolicy: 'memory_policy',
    };
    const jsonFields: Record<string, string> = {
      skills: 'skills', delegationRules: 'delegation_rules',
      toolRestrictions: 'tool_restrictions', knowledgeSources: 'knowledge_sources',
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if ((patch as Record<string, unknown>)[key] !== undefined) {
        sets.push(`${col} = ?`);
        vals.push((patch as Record<string, unknown>)[key]);
      }
    }
    for (const [key, col] of Object.entries(jsonFields)) {
      if ((patch as Record<string, unknown>)[key] !== undefined) {
        sets.push(`${col} = ?`);
        vals.push(JSON.stringify((patch as Record<string, unknown>)[key]));
      }
    }
    if (sets.length === 0) return;
    sets.push('updated_at = unixepoch()');
    vals.push(id);
    this.db.prepare(`UPDATE agent_profiles SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM agent_profiles WHERE id = ?`).run(id);
  }

  getStats(agentId: number): AgentPerformanceStats {
    const row = this.db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) as avg_dur
      FROM agent_assignments WHERE agent_id = ?
    `).get(agentId) as { completed: number; failed: number; avg_dur: number | null };
    const total = row.completed + row.failed;
    return {
      tasksCompleted: row.completed,
      tasksFailed: row.failed,
      avgDurationMs: row.avg_dur || 0,
      successRate: total > 0 ? row.completed / total : 0,
    };
  }

  private mapRow(r: Record<string, unknown>): AgentProfile {
    return {
      id: r.id as number,
      name: r.name as string,
      icon: (r.icon as string) || '🤖',
      systemPrompt: (r.system_prompt as string) || '',
      model: (r.model as string) || 'claude-sonnet-5-5',
      defaultCwd: (r.default_cwd as string) || '',
      skills: JSON.parse((r.skills as string) || '[]'),
      maxConcurrentTasks: (r.max_concurrent_tasks as number) || 1,
      personalityPrompt: (r.personality_prompt as string) || '',
      delegationRules: JSON.parse((r.delegation_rules as string) || '[]'),
      memoryPolicy: (r.memory_policy as string as 'ephemeral' | 'persistent') || 'ephemeral',
      toolRestrictions: JSON.parse((r.tool_restrictions as string) || '{"mode":"allow","tools":[]}'),
      knowledgeSources: JSON.parse((r.knowledge_sources as string) || '[]'),
      createdAt: (r.created_at as number) * 1000,
      updatedAt: (r.updated_at as number) * 1000,
    };
  }
}
