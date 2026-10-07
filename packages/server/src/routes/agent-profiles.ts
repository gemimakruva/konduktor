import { Router, type Router as RouterType } from 'express';
import { AgentRepository } from '../db/agent-repository.js';
import { getDb } from '../db/connection.js';

export const agentProfilesRouter: RouterType = Router();

agentProfilesRouter.get('/', (_req, res) => {
  const repo = new AgentRepository(getDb());
  res.json(repo.list());
});

agentProfilesRouter.get('/:id', (req, res) => {
  const repo = new AgentRepository(getDb());
  const profile = repo.getById(Number(req.params.id));
  if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }
  res.json(profile);
});

agentProfilesRouter.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name required' });
    return;
  }
  const repo = new AgentRepository(getDb());
  res.json(repo.create(req.body));
});

agentProfilesRouter.put('/:id', (req, res) => {
  const repo = new AgentRepository(getDb());
  const id = Number(req.params.id);
  repo.update(id, req.body);
  const updated = repo.getById(id);
  if (!updated) { res.status(404).json({ error: 'Profile not found' }); return; }
  res.json(updated);
});

agentProfilesRouter.delete('/:id', (req, res) => {
  const repo = new AgentRepository(getDb());
  repo.delete(Number(req.params.id));
  res.json({ success: true });
});
