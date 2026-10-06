import { Router, type Router as RouterType } from 'express';
import { KanbanRepository } from '../db/kanban-repository.js';
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
