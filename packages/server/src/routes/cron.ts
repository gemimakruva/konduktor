import { Router, type Router as RouterType } from 'express';
import { CronRepository } from '../db/cron-repository.js';
import { CronScheduler } from '../cron/scheduler.js';
import { getDb } from '../db/connection.js';

export function createCronRouter(scheduler: CronScheduler): RouterType {
  const router: RouterType = Router();

  router.get('/', (_req, res) => {
    const repo = new CronRepository(getDb());
    res.json(repo.list());
  });

  router.post('/', (req, res) => {
    const { name, schedule, prompt, cwd, model, agentId } = req.body;
    if (!name || !schedule || !prompt) {
      res.status(400).json({ error: 'name, schedule, and prompt required' }); return;
    }
    if (!CronScheduler.validate(schedule)) {
      res.status(400).json({ error: 'Invalid cron schedule expression' }); return;
    }
    const repo = new CronRepository(getDb());
    const job = repo.create({ name, schedule, prompt, cwd, model, agentId });
    scheduler.scheduleJob(job);
    res.json(job);
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const { schedule, agentId } = req.body;
    if (schedule && !CronScheduler.validate(schedule)) {
      res.status(400).json({ error: 'Invalid cron schedule expression' }); return;
    }
    if (agentId !== undefined && agentId !== null && typeof agentId !== 'number') {
      res.status(400).json({ error: 'agentId must be a number or null' }); return;
    }
    const repo = new CronRepository(getDb());
    repo.update(id, req.body);
    const updated = repo.getById(id);
    if (updated && updated.enabled) scheduler.scheduleJob(updated);
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    scheduler.stopJob(id);
    const repo = new CronRepository(getDb());
    repo.delete(id);
    res.json({ success: true });
  });

  router.post('/:id/enable', (req, res) => {
    const id = Number(req.params.id);
    const repo = new CronRepository(getDb());
    repo.enable(id);
    const job = repo.getById(id);
    if (job) scheduler.scheduleJob(job);
    res.json({ success: true });
  });

  router.post('/:id/disable', (req, res) => {
    const id = Number(req.params.id);
    scheduler.stopJob(id);
    const repo = new CronRepository(getDb());
    repo.disable(id);
    res.json({ success: true });
  });

  router.get('/:id/executions', (req, res) => {
    const repo = new CronRepository(getDb());
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(repo.listExecutions(Number(req.params.id), limit));
  });

  router.post('/:id/run', (req, res) => {
    const id = Number(req.params.id);
    const repo = new CronRepository(getDb());
    const job = repo.getById(id);
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    if (scheduler.isRunning(id)) { res.status(409).json({ error: 'Job already running' }); return; }
    scheduler.runNow(job);
    res.json({ triggered: true });
  });

  return router;
}
