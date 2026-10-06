export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT,
    cost_usd REAL DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    model TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    thinking_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS capabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    description TEXT,
    install_command TEXT,
    required_config TEXT,
    last_checked INTEGER DEFAULT (unixepoch()),
    UNIQUE(type, name)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_model ON analytics(model)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_history(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_capabilities_type ON capabilities(type)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS chat_history_fts USING fts5(
    session_id, role, content,
    content='chat_history', content_rowid='id'
  )`,
  `CREATE TRIGGER IF NOT EXISTS chat_history_ai AFTER INSERT ON chat_history BEGIN
    INSERT INTO chat_history_fts(rowid, session_id, role, content)
    VALUES (new.id, new.session_id, new.role, new.content);
  END`,
  `CREATE TRIGGER IF NOT EXISTS chat_history_ad AFTER DELETE ON chat_history BEGIN
    INSERT INTO chat_history_fts(chat_history_fts, rowid, session_id, role, content)
    VALUES ('delete', old.id, old.session_id, old.role, old.content);
  END`,
  `CREATE TABLE IF NOT EXISTS kanban_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    column_name TEXT NOT NULL DEFAULT 'backlog',
    session_id TEXT,
    position INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS idx_kanban_column ON kanban_tasks(column_name)`,
];
