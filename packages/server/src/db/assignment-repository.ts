import type Database from 'better-sqlite3';
import type { AgentAssignment } from '@konduktor/shared';

export class AssignmentRepository {
  constructor(private db: Database.Database) {}

  create(data: { taskId: number; agentId: number; sessionId?: string }): AgentAssignment {
    const stmt = this.db.prepare(
      `INSERT INTO agent_assignments (task_id, agent_id, session_id) VALUES (?, ?, ?)`,
    );
    const result = stmt.run(data.taskId, data.agentId, data.sessionId || null);
    return this.getById(result.lastInsertRowid as number)!;
  }

  getById(id: number): AgentAssignment | undefined {
    const row = this.db.prepare(`SELECT * FROM agent_assignments WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  getByTask(taskId: number): AgentAssignment | undefined {
    const row = this.db.prepare(
      `SELECT * FROM agent_assignments WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`,
    ).get(taskId) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  list(agentId?: number): AgentAssignment[] {
    const sql = agentId
      ? `SELECT * FROM agent_assignments WHERE agent_id = ? ORDER BY created_at DESC`
      : `SELECT * FROM agent_assignments ORDER BY created_at DESC`;
    const rows = (agentId
      ? this.db.prepare(sql).all(agentId)
      : this.db.prepare(sql).all()
    ) as Record<string, unknown>[];
    return rows.map(this.mapRow);
  }

  countActive(agentId: number): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM agent_assignments WHERE agent_id = ? AND status IN ('pending','running')`,
    ).get(agentId) as { cnt: number };
    return row.cnt;
  }

  updateStatus(id: number, status: string, output?: string): void {
    const sets = ['status = ?'];
    const vals: unknown[] = [status];
    if (status === 'running') { sets.push('started_at = unixepoch()'); }
    if (status === 'completed' || status === 'failed') {
      sets.push('completed_at = unixepoch()');
      sets.push('duration_ms = (unixepoch() - started_at) * 1000');
    }
    if (output !== undefined) { sets.push('output = ?'); vals.push(output); }
    vals.push(id);
    this.db.prepare(`UPDATE agent_assignments SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  private mapRow(r: Record<string, unknown>): AgentAssignment {
    return {
      id: r.id as number,
      taskId: r.task_id as number,
      agentId: r.agent_id as number,
      sessionId: r.session_id as string | null,
      status: r.status as AgentAssignment['status'],
      output: (r.output as string) || '',
      startedAt: r.started_at ? (r.started_at as number) * 1000 : null,
      completedAt: r.completed_at ? (r.completed_at as number) * 1000 : null,
      durationMs: r.duration_ms as number | null,
      createdAt: (r.created_at as number) * 1000,
    };
  }
}
