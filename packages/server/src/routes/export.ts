import { Router, type Router as RouterType } from 'express';
import { getDb } from '../db/connection.js';
import { ChatRepository } from '../db/chat-repository.js';

export const exportRouter: RouterType = Router();

function periodToTimestamp(period: string | undefined): number {
  if (!period) return 0;
  const match = period.match(/^(\d+)d$/);
  if (!match) return 0;
  return Math.floor(Date.now() / 1000) - Number(match[1]) * 86400;
}

function escapeCsvField(value: string): string {
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `"'${str.replace(/"/g, '""')}"`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

exportRouter.get('/analytics', (req, res) => {
  const format = req.query.format as string || 'json';
  const since = periodToTimestamp(req.query.period as string);
  const db = getDb();

  const rows = db.prepare(
    `SELECT session_id, model, input_tokens, output_tokens, cache_read_tokens,
            cache_write_tokens, thinking_tokens, cost_usd, duration_ms, created_at
     FROM analytics WHERE created_at >= ? ORDER BY created_at DESC LIMIT 10000`
  ).all(since) as Record<string, unknown>[];

  if (format === 'csv') {
    const headers = ['session_id', 'model', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'thinking_tokens', 'cost_usd', 'duration_ms', 'created_at'];
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map(h => escapeCsvField(String(row[h] ?? ''))).join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
    res.send(lines.join('\n'));
    return;
  }

  res.json(rows);
});

exportRouter.get('/chat', (req, res) => {
  const sessionId = req.query.sessionId as string;
  const format = req.query.format as string || 'json';

  if (!sessionId) { res.status(400).json({ error: 'sessionId required' }); return; }

  const repo = new ChatRepository(getDb());
  const messages = repo.getHistory(sessionId);

  if (format === 'md') {
    const lines = [`# Chat Session: ${sessionId}\n`];
    for (const msg of messages) {
      const time = new Date(msg.timestamp).toLocaleString();
      lines.push(`## ${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}`);
      lines.push(`*${time}*${msg.model ? ` (${msg.model})` : ''}\n`);
      lines.push(msg.content);
      lines.push('');
    }
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="chat-${sessionId.slice(0, 8)}.md"`);
    res.send(lines.join('\n'));
    return;
  }

  res.json(messages);
});
