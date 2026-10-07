import type Database from 'better-sqlite3';
import type { Artifact } from '@konduktor/shared';

interface CreateInput {
  sessionId: string | null;
  url: string | null;
  title: string;
  description: string;
  icon: string;
  artifactType: string;
}

export class ArtifactRepository {
  constructor(private db: Database.Database) {}

  create(data: CreateInput): Artifact {
    const title = data.title || 'Untitled';
    const result = this.db
      .prepare(
        `INSERT INTO artifacts (session_id, url, title, description, icon, artifact_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.sessionId,
        data.url,
        title,
        data.description || '',
        data.icon || 'code',
        data.artifactType || 'html',
      );
    return this.getById(result.lastInsertRowid as number)!;
  }

  list(opts?: { tag?: string }): Artifact[] {
    let sql = `SELECT * FROM artifacts`;
    const params: unknown[] = [];
    if (opts?.tag) {
      sql += ` WHERE tags LIKE ?`;
      params.push(`%"${opts.tag}"%`);
    }
    sql += ` ORDER BY pinned DESC, created_at DESC`;
    return (
      this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    ).map(this.mapRow);
  }

  getById(id: number): Artifact | undefined {
    const row = this.db
      .prepare(`SELECT * FROM artifacts WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  update(
    id: number,
    patch: Partial<{
      title: string;
      description: string;
      tags: string[];
      pinned: boolean;
      url: string;
    }>,
  ): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    const ALLOWED = new Set(['title', 'description', 'url']);
    for (const [key, val] of Object.entries(patch)) {
      if (key === 'tags') {
        sets.push('tags = ?');
        vals.push(JSON.stringify(val));
      } else if (key === 'pinned') {
        sets.push('pinned = ?');
        vals.push(val ? 1 : 0);
      } else if (ALLOWED.has(key) && val !== undefined) {
        sets.push(`${key} = ?`);
        vals.push(val);
      }
    }
    if (sets.length === 0) return;
    vals.push(id);
    this.db
      .prepare(`UPDATE artifacts SET ${sets.join(', ')} WHERE id = ?`)
      .run(...vals);
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM artifacts WHERE id = ?`).run(id);
  }

  private mapRow(r: Record<string, unknown>): Artifact {
    let tags: string[] = [];
    try {
      tags = JSON.parse((r.tags as string) || '[]');
    } catch {
      /* default empty */
    }
    return {
      id: r.id as number,
      sessionId: r.session_id as string | null,
      url: r.url as string | null,
      title: r.title as string,
      description: (r.description as string) || '',
      icon: (r.icon as string) || 'code',
      artifactType: r.artifact_type as string,
      tags,
      pinned: (r.pinned as number) === 1,
      createdAt: (r.created_at as number) * 1000,
    };
  }
}
