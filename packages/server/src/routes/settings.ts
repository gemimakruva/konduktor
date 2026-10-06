import { Router, type Router as RouterType } from 'express';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Settings } from '@konduktor/shared';
import { DEFAULTS, LIMITS } from '@konduktor/shared';
import { CONFIG } from '../config.js';

export const settingsRouter: RouterType = Router();

const VALID_THEMES = ['light', 'dark', 'system'] as const;
const SETTINGS_KEYS: (keyof Settings)[] = [
  'port', 'maxConcurrentSessions', 'theme', 'defaultModel',
  'defaultEffort', 'lanAccess', 'pinCode',
];

function loadSettings(): Settings {
  try {
    const raw = readFileSync(CONFIG.settingsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...pickKnownKeys(parsed) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings: Settings): void {
  const dir = dirname(CONFIG.settingsPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG.settingsPath, JSON.stringify(settings, null, 2));
}

function validatePatch(body: Record<string, unknown>): string | null {
  if (body.maxConcurrentSessions !== undefined) {
    const v = body.maxConcurrentSessions;
    if (typeof v !== 'number' || v < 1 || v > LIMITS.maxConcurrentSessions) {
      return `maxConcurrentSessions must be 1-${LIMITS.maxConcurrentSessions}`;
    }
  }
  if (body.theme !== undefined) {
    if (!VALID_THEMES.includes(body.theme as typeof VALID_THEMES[number])) {
      return `theme must be one of: ${VALID_THEMES.join(', ')}`;
    }
  }
  if (body.port !== undefined) {
    const v = body.port;
    if (typeof v !== 'number' || v < 1 || v > 65535) {
      return 'port must be 1-65535';
    }
  }
  return null;
}

function pickKnownKeys(body: Record<string, unknown>): Partial<Settings> {
  const picked: Record<string, unknown> = {};
  for (const key of SETTINGS_KEYS) {
    if (key in body) picked[key] = body[key];
  }
  return picked as Partial<Settings>;
}

settingsRouter.get('/', (_req, res) => {
  res.json(loadSettings());
});

settingsRouter.put('/', (req, res) => {
  const error = validatePatch(req.body);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const current = loadSettings();
  const patch = pickKnownKeys(req.body);
  const updated: Settings = { ...current, ...patch };
  saveSettings(updated);
  res.json(updated);
});
