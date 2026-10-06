import { Router, type Router as RouterType } from 'express';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Settings } from '@konduktor/shared';
import { DEFAULTS } from '@konduktor/shared';
import { CONFIG } from '../config.js';

export const settingsRouter: RouterType = Router();

function loadSettings(): Settings {
  try {
    const raw = readFileSync(CONFIG.settingsPath, 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings: Settings): void {
  const dir = dirname(CONFIG.settingsPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG.settingsPath, JSON.stringify(settings, null, 2));
}

settingsRouter.get('/', (_req, res) => {
  res.json(loadSettings());
});

settingsRouter.put('/', (req, res) => {
  const current = loadSettings();
  const updated = { ...current, ...req.body } as Settings;
  saveSettings(updated);
  res.json(updated);
});
