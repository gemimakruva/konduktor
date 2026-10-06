import type Database from 'better-sqlite3';

export interface KanbanTask {
  id: number;
  title: string;
  description: string;
  column: string;
  sessionId: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export class KanbanRepository {
  constructor(private db: Database.Database) {}

  create(data: { title: string; column?: string; description?: string; sessionId?: string }): KanbanTask {
    const stmt = this.db.prepare(
      `INSERT INTO kanban_tasks (title, description, column_name, session_id) VALUES (?, ?, ?, ?)`
    );
    const result = stmt.run(data.title, data.description || '', data.column || 'backlog', data.sessionId || null);
    return this.getById(result.lastInsertRowid as number)!;
  }

  list(): KanbanTask[] {
    const rows = this.db.prepare(
      `SELECT * FROM kanban_tasks ORDER BY column_name, position, created_at`
    ).all() as Record<string, unknown>[];
    return rows.map(this.mapRow);
  }

  getById(id: number): KanbanTask | undefined {
    const row = this.db.prepare(`SELECT * FROM kanban_tasks WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  update(id: number, patch: Partial<{ title: string; description: string; sessionId: string | null }>): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (patch.title !== undefined) { sets.push('title = ?'); vals.push(patch.title); }
    if (patch.description !== undefined) { sets.push('description = ?'); vals.push(patch.description); }
    if (patch.sessionId !== undefined) { sets.push('session_id = ?'); vals.push(patch.sessionId); }
    if (sets.length === 0) return;
    sets.push('updated_at = unixepoch()');
    vals.push(id);
    this.db.prepare(`UPDATE kanban_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  moveToColumn(id: number, column: string): void {
    this.db.prepare(`UPDATE kanban_tasks SET column_name = ?, updated_at = unixepoch() WHERE id = ?`).run(column, id);
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM kanban_tasks WHERE id = ?`).run(id);
  }

  private mapRow(r: Record<string, unknown>): KanbanTask {
    return {
      id: r.id as number, title: r.title as string, description: (r.description as string) || '',
      column: r.column_name as string, sessionId: r.session_id as string | null,
      position: r.position as number,
      createdAt: (r.created_at as number) * 1000, updatedAt: (r.updated_at as number) * 1000,
    };
  }
}
