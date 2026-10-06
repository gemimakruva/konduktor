import { Router, type Router as RouterType } from 'express';
import { SessionManager } from '../claude/sessions.js';

const mgr = new SessionManager();
export const sessionsRouter: RouterType = Router();

sessionsRouter.get('/', (req, res) => {
  const all = req.query.all === 'true';
  res.json(mgr.list(all));
});

sessionsRouter.post('/:id/stop', (req, res) => {
  const ok = mgr.stop(req.params.id);
  res.json({ success: ok });
});

sessionsRouter.delete('/:id', (req, res) => {
  const ok = mgr.remove(req.params.id);
  res.json({ success: ok });
});
