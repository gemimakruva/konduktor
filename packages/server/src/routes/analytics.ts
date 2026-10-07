import { Router, type Router as RouterType } from 'express';
import { AnalyticsRepository } from '../db/analytics-repository.js';
import { getDb } from '../db/connection.js';

export const analyticsRouter: RouterType = Router();

function periodToTimestamp(period: string | undefined): number {
  if (!period) return 0;
  const match = period.match(/^(\d+)d$/);
  if (!match) return 0;
  const days = Number(match[1]);
  return Math.floor(Date.now() / 1000) - days * 86400;
}

analyticsRouter.get('/summary', (req, res) => {
  const repo = new AnalyticsRepository(getDb());
  const since = periodToTimestamp(req.query.period as string);
  res.json(repo.summary(since));
});

analyticsRouter.get('/daily', (req, res) => {
  const repo = new AnalyticsRepository(getDb());
  const since = periodToTimestamp(req.query.period as string);
  res.json(repo.daily(since));
});

analyticsRouter.get('/models', (req, res) => {
  const repo = new AnalyticsRepository(getDb());
  const since = periodToTimestamp(req.query.period as string);
  res.json(repo.byModel(since));
});

analyticsRouter.get('/recent', (req, res) => {
  const repo = new AnalyticsRepository(getDb());
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  res.json(repo.recent(limit));
});
