import express, { type Express } from 'express';
import { createServer } from 'node:http';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { CONFIG } from './config.js';
import { sessionsRouter } from './routes/sessions.js';
import { settingsRouter } from './routes/settings.js';
import { chatHistoryRouter } from './routes/chat-history.js';
import { createWsHandler } from './ws/handler.js';
import { detectClaude } from './claude/detect.js';
import { pinAuth } from './middleware/pin-auth.js';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(pinAuth);

  app.use('/api/sessions', sessionsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/chat', chatHistoryRouter);

  app.get('/api/health', (_req, res) => {
    const claude = detectClaude();
    res.json({ status: 'ok', version: '0.1.0', claude });
  });

  return app;
}

export function startServer() {
  const app = createApp();
  const server = createServer(app);

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', createWsHandler());

  const host = CONFIG.lanAccess ? '0.0.0.0' : '127.0.0.1';
  server.listen(CONFIG.port, host, () => {
    console.log(`Konduktor running at http://${host}:${CONFIG.port}`);
  });

  return server;
}
