import type Database from 'better-sqlite3';
import type { CronJob, CronExecution } from '@konduktor/shared';

export class CronRepository {
  constructor(private db: Database.Database) {}

  create(data: { name: string; schedule: string; prompt: string; cwd?: string; model?: string }): CronJob {
    const result = this.db.prepare(
      `INSERT INTO cron_jobs (name, schedule, prompt, cwd, model) VALUES (?, ?, ?, ?, ?)`
    ).run(data.name, data.schedule, data.prompt, data.cwd || null, data.model || null);
    return this.getById(result.lastInsertRowid as number)!;
  }

  list(): CronJob[] {
    return (this.db.prepare(`SELECT * FROM cron_jobs ORDER BY created_at DESC`).all() as Record<string, unknown>[]).map(this.mapJob);
  }

  listEnabled(): CronJob[] {
    return (this.db.prepare(`SELECT * FROM cron_jobs WHERE enabled = 1`).all() as Record<string, unknown>[]).map(this.mapJob);
  }

  getById(id: number): CronJob | undefined {
    const row = this.db.prepare(`SELECT * FROM cron_jobs WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapJob(row) : undefined;
  }

  update(id: number, patch: Partial<{ name: string; schedule: string; prompt: string; cwd: string | null; model: string | null }>): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(patch)) {
      if (val !== undefined) { sets.push(`${key} = ?`); vals.push(val); }
    }
    if (sets.length === 0) return;
    sets.push('updated_at = unixepoch()');
    vals.push(id);
    this.db.prepare(`UPDATE cron_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  enable(id: number): void {
    this.db.prepare(`UPDATE cron_jobs SET enabled = 1, updated_at = unixepoch() WHERE id = ?`).run(id);
  }

  disable(id: number): void {
    this.db.prepare(`UPDATE cron_jobs SET enabled = 0, updated_at = unixepoch() WHERE id = ?`).run(id);
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM cron_jobs WHERE id = ?`).run(id);
  }

  createExecution(jobId: number, sessionId?: string): number {
    const result = this.db.prepare(
      `INSERT INTO cron_executions (job_id, session_id) VALUES (?, ?)`
    ).run(jobId, sessionId || null);
    return result.lastInsertRowid as number;
  }

  finishExecution(id: number, status: string, output: string, usage?: { costUsd: number; inputTokens: number; outputTokens: number }): void {
    this.db.prepare(
      `UPDATE cron_executions SET status = ?, output = ?, finished_at = unixepoch(),
        cost_usd = ?, input_tokens = ?, output_tokens = ? WHERE id = ?`
    ).run(status, output, usage?.costUsd || 0, usage?.inputTokens || 0, usage?.outputTokens || 0, id);
  }

  listExecutions(jobId: number, limit: number): CronExecution[] {
    return (this.db.prepare(
      `SELECT * FROM cron_executions WHERE job_id = ? ORDER BY started_at DESC LIMIT ?`
    ).all(jobId, limit) as Record<string, unknown>[]).map(this.mapExec);
  }

  private mapJob(r: Record<string, unknown>): CronJob {
    return {
      id: r.id as number, name: r.name as string, schedule: r.schedule as string,
      prompt: r.prompt as string, cwd: r.cwd as string | null, model: r.model as string | null,
      enabled: (r.enabled as number) === 1,
      createdAt: (r.created_at as number) * 1000, updatedAt: (r.updated_at as number) * 1000,
    };
  }

  private mapExec(r: Record<string, unknown>): CronExecution {
    return {
      id: r.id as number, jobId: r.job_id as number,
      sessionId: r.session_id as string | null, status: r.status as CronExecution['status'],
      output: (r.output as string) || '', startedAt: (r.started_at as number) * 1000,
      finishedAt: r.finished_at ? (r.finished_at as number) * 1000 : null,
      costUsd: r.cost_usd as number, inputTokens: r.input_tokens as number, outputTokens: r.output_tokens as number,
    };
  }
}
