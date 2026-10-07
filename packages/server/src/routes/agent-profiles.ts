import { Router, type Router as RouterType } from 'express';
import { AgentRepository } from '../db/agent-repository.js';
import { AssignmentRepository } from '../db/assignment-repository.js';
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

function validateProfileFields(body: Record<string, unknown>): string | null {
  if ('name' in body && (typeof body.name !== 'string' || !body.name.trim())) return 'name must be a non-empty string';
  if ('maxConcurrentTasks' in body && (typeof body.maxConcurrentTasks !== 'number' || body.maxConcurrentTasks < 1)) return 'maxConcurrentTasks must be >= 1';
  if ('memoryPolicy' in body && body.memoryPolicy !== 'ephemeral' && body.memoryPolicy !== 'persistent') return 'memoryPolicy must be ephemeral or persistent';
  return null;
}

agentProfilesRouter.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name required' });
    return;
  }
  const err = validateProfileFields(req.body);
  if (err) { res.status(400).json({ error: err }); return; }
  const repo = new AgentRepository(getDb());
  res.json(repo.create(req.body));
});

agentProfilesRouter.put('/:id', (req, res) => {
  const err = validateProfileFields(req.body);
  if (err) { res.status(400).json({ error: err }); return; }
  const repo = new AgentRepository(getDb());
  const id = Number(req.params.id);
  repo.update(id, req.body);
  const updated = repo.getById(id);
  if (!updated) { res.status(404).json({ error: 'Profile not found' }); return; }
  res.json(updated);
});

agentProfilesRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const assignRepo = new AssignmentRepository(db);
  for (const a of assignRepo.list(id)) {
    if (a.status === 'pending' || a.status === 'running') {
      assignRepo.updateStatus(a.id, 'failed', 'Agent profile deleted');
    }
  }
  new AgentRepository(db).delete(id);
  res.json({ success: true });
});
