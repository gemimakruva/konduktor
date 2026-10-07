import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';
import { AnalyticsRepository } from '../../src/db/analytics-repository.js';

let db: Database.Database;
let repo: AnalyticsRepository;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  repo = new AnalyticsRepository(db);
});

afterAll(() => db.close());

describe('AnalyticsRepository', () => {
  it('records and retrieves analytics', () => {
    repo.record('sess-1', 'claude-sonnet-5-5', {
      inputTokens: 1000, outputTokens: 500,
      cacheReadTokens: 200, cacheWriteTokens: 100,
      thinkingTokens: 50, costUsd: 0.015,
    }, 3200);

    repo.record('sess-2', 'claude-opus-5-5', {
      inputTokens: 2000, outputTokens: 1000,
      cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 100, costUsd: 0.08,
    }, 5400);

    const recent = repo.recent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0].model).toBe('claude-opus-5-5');
    expect(recent[0].costUsd).toBe(0.08);
  });

  it('returns summary with correct aggregation', () => {
    const summary = repo.summary(0);
    expect(summary.totalInputTokens).toBe(3000);
    expect(summary.totalOutputTokens).toBe(1500);
    expect(summary.totalCost).toBeCloseTo(0.095);
    expect(summary.totalSessions).toBe(2);
    expect(summary.avgCostPerSession).toBeCloseTo(0.0475);
  });

  it('returns summary with zeros when no data matches', () => {
    const summary = repo.summary(Math.floor(Date.now() / 1000) + 86400);
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalOutputTokens).toBe(0);
    expect(summary.totalCost).toBe(0);
    expect(summary.totalSessions).toBe(0);
    expect(summary.avgCostPerSession).toBe(0);
  });

  it('returns daily breakdown', () => {
    const daily = repo.daily(0);
    expect(daily.length).toBeGreaterThanOrEqual(1);
    expect(daily[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(daily[0].inputTokens).toBeGreaterThan(0);
  });

  it('returns model breakdown', () => {
    const models = repo.byModel(0);
    expect(models).toHaveLength(2);
    const sonnet = models.find(m => m.model === 'claude-sonnet-5-5');
    expect(sonnet).toBeDefined();
    expect(sonnet!.count).toBe(1);
    expect(sonnet!.totalTokens).toBe(1500);
  });
});
