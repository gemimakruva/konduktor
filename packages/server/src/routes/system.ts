import { Router, type Router as RouterType } from 'express';
import { cpus, totalmem, freemem, platform, arch, uptime, hostname, type } from 'node:os';
import { detectClaude } from '../claude/detect.js';

export const systemRouter: RouterType = Router();

systemRouter.get('/', (_req, res) => {
  const mem = { totalMb: Math.round(totalmem() / 1048576), freeMb: Math.round(freemem() / 1048576) };
  res.json({
    node: process.version,
    platform: platform(),
    arch: arch(),
    hostname: hostname(),
    osType: type(),
    uptime: Math.round(uptime()),
    cpus: cpus().length,
    memory: mem,
    claude: detectClaude(),
    konduktor: { version: '0.1.0', pid: process.pid, uptimeSeconds: Math.round(process.uptime()) },
  });
});
