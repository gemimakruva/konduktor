import type { Request, Response, NextFunction } from 'express';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../config.js';

const LOCALHOST_ADDRS = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

function isLocalRequest(req: Request): boolean {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return false;
  const ip = req.socket.remoteAddress || '';
  return LOCALHOST_ADDRS.includes(ip);
}

function loadPinCode(): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(CONFIG.settingsPath, 'utf-8'));
    if (raw.lanAccess && raw.pinCode) return raw.pinCode;
  } catch { /* no settings */ }
  return undefined;
}

export function pinAuth(req: Request, res: Response, next: NextFunction): void {
  if (isLocalRequest(req)) {
    next();
    return;
  }

  const pin = loadPinCode();
  if (!pin) {
    next();
    return;
  }

  const provided = req.headers['x-pin-code'];
  if (provided === pin) {
    next();
    return;
  }

  res.status(401).json({ error: 'PIN code required for LAN access' });
}
