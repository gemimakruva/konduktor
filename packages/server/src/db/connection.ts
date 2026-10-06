import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS } from './schema.js';

let instance: Database.Database | null = null;

export function initDb(dbPath: string): Database.Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }

  instance = db;
  return db;
}

export function getDb(): Database.Database {
  if (!instance) throw new Error('Database not initialized. Call initDb() first.');
  return instance;
}
