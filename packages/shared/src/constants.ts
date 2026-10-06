import type { Settings } from './types.js';

export const DEFAULTS: Settings = {
  port: 4170,
  maxConcurrentSessions: 3,
  theme: 'system',
  defaultModel: 'claude-sonnet-5-5',
  defaultEffort: 'high',
  lanAccess: false,
};

export const LIMITS = {
  maxConcurrentSessions: 10,
  maxMessageLength: 100_000,
  wsReconnectDelayMs: 2000,
  wsMaxReconnectAttempts: 10,
  childProcessTimeoutMs: 600_000,
  streamBufferSize: 100,
} as const;

export const PATHS = {
  configDir: '.konduktor',
  settingsFile: 'settings.json',
  dbFile: 'konduktor.db',
} as const;
