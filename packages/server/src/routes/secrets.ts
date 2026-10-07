import { Router, type Router as RouterType } from 'express';
import type { SecretsManager } from '../secrets/secrets-manager.js';

export function createSecretsRouter(secrets: SecretsManager): RouterType {
  const router: RouterType = Router();

  router.get('/', (_req, res) => {
    res.json(secrets.list());
  });

  router.post('/', (req, res) => {
    const { name, value, scope } = req.body;
    if (!name || typeof name !== 'string' || !value || typeof value !== 'string') {
      res.status(400).json({ error: 'name and value required' });
      return;
    }
    try {
      const meta = secrets.store(name, value, scope || 'global');
      res.json(meta);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/:name', (req, res) => {
    const deleted = secrets.delete(req.params.name);
    if (!deleted) { res.status(404).json({ error: 'Secret not found' }); return; }
    res.json({ success: true });
  });

  return router;
}
