import cron from 'node-cron';
import type Database from 'better-sqlite3';
import type { CronJob } from '@konduktor/shared';
import { CronRepository } from '../db/cron-repository.js';
import { ClaudeProcess } from '../claude/cli.js';
import { AnalyticsRepository } from '../db/analytics-repository.js';

type ScheduledTask = ReturnType<typeof cron.schedule>;

export class CronScheduler {
  private tasks = new Map<number, ScheduledTask>();
  private runningJobs = new Set<number>();
  private repo: CronRepository;
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.repo = new CronRepository(db);
  }

  startAll(): void {
    const jobs = this.repo.listEnabled();
    for (const job of jobs) this.scheduleJob(job);
  }

  scheduleJob(job: CronJob): void {
    this.stopJob(job.id);
    const task = cron.schedule(job.schedule, () => this.executeJob(job));
    this.tasks.set(job.id, task);
  }

  stopJob(id: number): void {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      this.tasks.delete(id);
    }
  }

  stopAll(): void {
    for (const [id, task] of this.tasks) {
      task.stop();
      this.tasks.delete(id);
    }
    this.runningJobs.clear();
  }

  isRunning(id: number): boolean {
    return this.runningJobs.has(id);
  }

  static validate(expression: string): boolean {
    return cron.validate(expression);
  }

  private executeJob(job: CronJob): void {
    if (this.runningJobs.has(job.id)) return;
    this.runningJobs.add(job.id);

    const sessionId = `cron-${job.id}-${Date.now()}`;
    const execId = this.repo.createExecution(job.id, sessionId);
    const proc = new ClaudeProcess(sessionId);
    let output = '';

    proc.on('event', (event: { type: string; result?: string; usage?: Record<string, number>; durationMs?: number; model?: string }) => {
      if (event.type === 'result') {
        output = event.result || '';
        if (event.usage) {
          try {
            new AnalyticsRepository(this.db).record(
              sessionId, event.model || job.model || 'unknown',
              event.usage as never, event.durationMs || 0,
            );
          } catch { /* non-fatal */ }
        }
      }
    });

    proc.on('close', (code: number) => {
      const status = code === 0 ? 'completed' : 'failed';
      this.repo.finishExecution(execId, status, output);
      this.runningJobs.delete(job.id);
    });

    proc.on('error', () => {
      this.repo.finishExecution(execId, 'failed', output || 'Process error');
      this.runningJobs.delete(job.id);
    });

    proc.start(job.prompt, { cwd: job.cwd || undefined, model: job.model || undefined });
  }
}
