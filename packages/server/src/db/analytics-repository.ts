import type Database from 'better-sqlite3';
import type { TokenUsage, AnalyticsRecord, AnalyticsSummary, DailyAnalytics, ModelAnalytics } from '@konduktor/shared';

export class AnalyticsRepository {
  constructor(private db: Database.Database) {}

  record(sessionId: string | null, model: string, usage: TokenUsage, durationMs: number): void {
    this.db.prepare(
      `INSERT INTO analytics (session_id, model, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, thinking_tokens, cost_usd, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId, model,
      usage.inputTokens, usage.outputTokens,
      usage.cacheReadTokens, usage.cacheWriteTokens,
      usage.thinkingTokens, usage.costUsd, durationMs
    );
  }

  summary(since: number): AnalyticsSummary {
    const row = this.db.prepare(
      `SELECT
        COALESCE(SUM(input_tokens), 0) as total_input,
        COALESCE(SUM(output_tokens), 0) as total_output,
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COUNT(DISTINCT session_id) as total_sessions
       FROM analytics WHERE created_at >= ?`
    ).get(since) as Record<string, number>;

    const sessions = row.total_sessions || 0;
    return {
      totalInputTokens: row.total_input,
      totalOutputTokens: row.total_output,
      totalCost: row.total_cost,
      totalSessions: sessions,
      avgCostPerSession: sessions > 0 ? row.total_cost / sessions : 0,
    };
  }

  daily(since: number): DailyAnalytics[] {
    const rows = this.db.prepare(
      `SELECT
        date(created_at, 'unixepoch') as date,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(cost_usd) as cost,
        COUNT(DISTINCT session_id) as sessions
       FROM analytics WHERE created_at >= ?
       GROUP BY date(created_at, 'unixepoch')
       ORDER BY date ASC`
    ).all(since) as Record<string, unknown>[];

    return rows.map(r => ({
      date: r.date as string,
      inputTokens: r.input_tokens as number,
      outputTokens: r.output_tokens as number,
      cost: r.cost as number,
      sessions: r.sessions as number,
    }));
  }

  byModel(since: number): ModelAnalytics[] {
    const rows = this.db.prepare(
      `SELECT
        model,
        COUNT(*) as count,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(cost_usd) as total_cost
       FROM analytics WHERE created_at >= ?
       GROUP BY model ORDER BY total_cost DESC`
    ).all(since) as Record<string, unknown>[];

    return rows.map(r => ({
      model: r.model as string,
      count: r.count as number,
      totalTokens: r.total_tokens as number,
      totalCost: r.total_cost as number,
    }));
  }

  recent(limit: number): AnalyticsRecord[] {
    const rows = this.db.prepare(
      `SELECT * FROM analytics ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as Record<string, unknown>[];

    return rows.map(r => ({
      id: r.id as number,
      sessionId: r.session_id as string | null,
      model: r.model as string,
      inputTokens: r.input_tokens as number,
      outputTokens: r.output_tokens as number,
      cacheReadTokens: r.cache_read_tokens as number,
      cacheWriteTokens: r.cache_write_tokens as number,
      thinkingTokens: r.thinking_tokens as number,
      costUsd: r.cost_usd as number,
      durationMs: r.duration_ms as number,
      createdAt: (r.created_at as number) * 1000,
    }));
  }
}
