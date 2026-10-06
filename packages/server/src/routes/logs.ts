import { Router, type Router as RouterType } from 'express';
import { execFileSync } from 'node:child_process';
import { CONFIG } from '../config.js';
import { getDb } from '../db/connection.js';

export const logsRouter: RouterType = Router();

logsRouter.get('/', (req, res) => {
  const sessionId = req.query.sessionId as string | undefined;

  if (sessionId) {
    try {
      const output = execFileSync(CONFIG.claudeBin, ['logs', sessionId], {
        encoding: 'utf-8', timeout: 10_000,
      });
      res.json(output.split('\n').filter(Boolean).map(line => ({
        timestamp: Date.now(), content: line,
      })));
      return;
    } catch {
      res.json([]);
      return;
    }
  }

  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT session_id, role, content, created_at FROM chat_history
       ORDER BY created_at DESC LIMIT 100`
    ).all();
    res.json(rows);
  } catch {
    res.json([]);
  }
});
