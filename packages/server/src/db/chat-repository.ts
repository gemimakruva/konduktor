import type Database from 'better-sqlite3';
import type { ChatMessage, TokenUsage } from '@konduktor/shared';

export class ChatRepository {
  private insertStmt: Database.Statement;
  private selectStmt: Database.Statement;
  private listStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO chat_history (session_id, role, content, model, cost_usd, input_tokens, output_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    this.selectStmt = db.prepare(
      `SELECT * FROM chat_history WHERE session_id = ? ORDER BY created_at ASC`
    );
    this.listStmt = db.prepare(
      `SELECT session_id, COUNT(*) as message_count, MAX(created_at) as updated_at,
              (SELECT content FROM chat_history h2 WHERE h2.session_id = h1.session_id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM chat_history h1 GROUP BY session_id ORDER BY updated_at DESC`
    );
  }

  saveMessage(sessionId: string, role: string, content: string, model?: string, usage?: TokenUsage): void {
    this.insertStmt.run(
      sessionId, role, content, model || null,
      usage?.costUsd || 0, usage?.inputTokens || 0, usage?.outputTokens || 0
    );
  }

  getHistory(sessionId: string): ChatMessage[] {
    const rows = this.selectStmt.all(sessionId) as Record<string, unknown>[];
    return rows.map(r => ({
      id: String(r.id),
      role: r.role as ChatMessage['role'],
      content: r.content as string,
      timestamp: (r.created_at as number) * 1000,
      model: r.model as string | undefined,
      usage: (r.input_tokens as number) > 0 ? {
        inputTokens: r.input_tokens as number,
        outputTokens: r.output_tokens as number,
        cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0,
        costUsd: r.cost_usd as number,
      } : undefined,
    }));
  }

  listSessions(): { sessionId: string; lastMessage: string; messageCount: number; updatedAt: number }[] {
    const rows = this.listStmt.all() as Record<string, unknown>[];
    return rows.map(r => ({
      sessionId: r.session_id as string,
      lastMessage: r.last_message as string,
      messageCount: r.message_count as number,
      updatedAt: (r.updated_at as number) * 1000,
    }));
  }
}
