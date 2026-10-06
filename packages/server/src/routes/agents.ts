import { Router, type Router as RouterType } from 'express';
import { execFileSync } from 'node:child_process';
import { CONFIG } from '../config.js';

export const agentsRouter: RouterType = Router();

agentsRouter.get('/', (req, res) => {
  const includeAll = req.query.all === 'true';
  try {
    const args = includeAll ? ['agents', '--json', '--all'] : ['agents', '--json'];
    const output = execFileSync(CONFIG.claudeBin, args, {
      encoding: 'utf-8', timeout: 10_000,
    });
    res.json(JSON.parse(output));
  } catch {
    res.json([]);
  }
});
