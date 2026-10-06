import { Router, type Router as RouterType } from 'express';
import { getDb } from '../db/connection.js';

export const searchRouter: RouterType = Router();

function sanitizeFtsQuery(raw: string): string {
  return raw.replace(/['"*(){}[\]^~\\]/g, ' ').trim().split(/\s+/).filter(Boolean).join(' ');
}

searchRouter.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) { res.json([]); return; }

  const sanitized = sanitizeFtsQuery(q);
  if (!sanitized) { res.json([]); return; }

  const db = getDb();
  const rows = db.prepare(
    `SELECT session_id, role, content,
            highlight(chat_history_fts, 2, '<mark>', '</mark>') as highlight,
            rank
     FROM chat_history_fts
     WHERE chat_history_fts MATCH ?
     ORDER BY rank
     LIMIT 50`
  ).all(sanitized);
  res.json(rows);
});
