import { join } from 'node:path';
import { homedir } from 'node:os';
import { PATHS, DEFAULTS } from '@konduktor/shared';

export const CONFIG = {
  configDir: join(homedir(), PATHS.configDir),
  dbPath: join(homedir(), PATHS.configDir, 'data', PATHS.dbFile),
  settingsPath: join(homedir(), PATHS.configDir, PATHS.settingsFile),
  port: Number(process.env.KONDUKTOR_PORT) || DEFAULTS.port,
  lanAccess: DEFAULTS.lanAccess,
  claudeBin: process.env.CLAUDE_BIN || 'claude',
} as const;
