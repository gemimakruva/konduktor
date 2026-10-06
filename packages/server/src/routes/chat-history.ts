import { Router, type Router as RouterType } from 'express';
import { ChatRepository } from '../db/chat-repository.js';
import { getDb } from '../db/connection.js';

export const chatHistoryRouter: RouterType = Router();

chatHistoryRouter.get('/', (_req, res) => {
  const repo = new ChatRepository(getDb());
  res.json(repo.listSessions());
});

chatHistoryRouter.get('/:sessionId', (req, res) => {
  const repo = new ChatRepository(getDb());
  res.json(repo.getHistory(req.params.sessionId));
});
