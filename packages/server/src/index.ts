import express, { type Express } from 'express';
import { createServer } from 'node:http';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { CONFIG } from './config.js';
import { sessionsRouter } from './routes/sessions.js';
import { settingsRouter } from './routes/settings.js';
import { chatHistoryRouter } from './routes/chat-history.js';
import { searchRouter } from './routes/search.js';
import { capabilitiesRouter } from './routes/capabilities.js';
import { systemRouter } from './routes/system.js';
import { logsRouter } from './routes/logs.js';
import { kanbanRouter } from './routes/kanban.js';
import { agentsRouter } from './routes/agents.js';
import { analyticsRouter } from './routes/analytics.js';
import { createCronRouter } from './routes/cron.js';
import { CronScheduler } from './cron/scheduler.js';
import { createWsHandler } from './ws/handler.js';
import { detectClaude } from './claude/detect.js';
import { pinAuth } from './middleware/pin-auth.js';
import { getDb } from './db/connection.js';

export function createApp(scheduler?: CronScheduler): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(pinAuth);

  app.use('/api/sessions', sessionsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/chat', chatHistoryRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/capabilities', capabilitiesRouter);
  app.use('/api/system', systemRouter);
  app.use('/api/logs', logsRouter);
  app.use('/api/kanban', kanbanRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/analytics', analyticsRouter);

  if (scheduler) {
    app.use('/api/cron', createCronRouter(scheduler));
  }

  app.get('/api/health', (_req, res) => {
    const claude = detectClaude();
    res.json({ status: 'ok', version: '0.1.0', claude });
  });

  return app;
}

export function startServer() {
  const scheduler = new CronScheduler(getDb());
  scheduler.startAll();

  const app = createApp(scheduler);
  const server = createServer(app);

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', createWsHandler());

  const host = CONFIG.lanAccess ? '0.0.0.0' : '127.0.0.1';
  server.listen(CONFIG.port, host, () => {
    console.log(`Konduktor running at http://${host}:${CONFIG.port}`);
  });

  return server;
}
