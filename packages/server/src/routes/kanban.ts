import { Router, type Router as RouterType } from 'express';
import { KanbanRepository } from '../db/kanban-repository.js';
import { AgentRepository } from '../db/agent-repository.js';
import { AssignmentRepository } from '../db/assignment-repository.js';
import { matchAgent } from '../agents/skill-matcher.js';
import { getDb } from '../db/connection.js';

export const kanbanRouter: RouterType = Router();

kanbanRouter.get('/', (_req, res) => {
  const repo = new KanbanRepository(getDb());
  res.json(repo.list());
});

kanbanRouter.post('/', (req, res) => {
  const { title, column, description, sessionId } = req.body;
  if (!title || typeof title !== 'string') { res.status(400).json({ error: 'title required' }); return; }
  const repo = new KanbanRepository(getDb());
  res.json(repo.create({ title, column, description, sessionId }));
});

kanbanRouter.put('/:id', (req, res) => {
  const repo = new KanbanRepository(getDb());
  repo.update(Number(req.params.id), req.body);
  const updated = repo.getById(Number(req.params.id));
  res.json(updated);
});

kanbanRouter.put('/:id/move', (req, res) => {
  const { column } = req.body;
  if (!column) { res.status(400).json({ error: 'column required' }); return; }
  const repo = new KanbanRepository(getDb());
  repo.moveToColumn(Number(req.params.id), column);
  res.json({ success: true });
});

kanbanRouter.delete('/:id', (req, res) => {
  const repo = new KanbanRepository(getDb());
  repo.delete(Number(req.params.id));
  res.json({ success: true });
});

kanbanRouter.post('/:id/assign', (req, res) => {
  const { agentId } = req.body;
  if (!agentId) { res.status(400).json({ error: 'agentId required' }); return; }
  const db = getDb();
  const agent = new AgentRepository(db).getById(agentId);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  const active = new AssignmentRepository(db).countActive(agentId);
  if (active >= agent.maxConcurrentTasks) {
    res.status(409).json({ error: `Agent at capacity (${active}/${agent.maxConcurrentTasks})` });
    return;
  }
  const assignment = new AssignmentRepository(db).create({ taskId: Number(req.params.id), agentId });
  res.json(assignment);
});

kanbanRouter.get('/:id/suggest-agent', (req, res) => {
  const db = getDb();
  const task = new KanbanRepository(db).getById(Number(req.params.id));
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  const agents = new AgentRepository(db).list();
  const available = agents.filter(a => {
    const active = new AssignmentRepository(db).countActive(a.id);
    return active < a.maxConcurrentTasks;
  });
  const suggested = matchAgent(`${task.title} ${task.description}`, available);
  res.json({ suggested, available });
});
