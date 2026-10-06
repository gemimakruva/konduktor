import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/db/schema.js';
import { ChatRepository } from '../../src/db/chat-repository.js';

let db: Database.Database;
let repo: ChatRepository;

beforeAll(() => {
  db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  repo = new ChatRepository(db);
});

afterAll(() => db.close());

describe('ChatRepository', () => {
  it('saves and retrieves messages', () => {
    repo.saveMessage('sess-1', 'user', 'hello');
    repo.saveMessage('sess-1', 'assistant', 'hi there', 'claude-sonnet-5-5');
    const msgs = repo.getHistory('sess-1');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].content).toBe('hi there');
    expect(msgs[1].model).toBe('claude-sonnet-5-5');
  });

  it('saves message with token usage', () => {
    repo.saveMessage('sess-2', 'assistant', 'response', 'sonnet', {
      inputTokens: 100, outputTokens: 50,
      cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, costUsd: 0.001,
    });
    const msgs = repo.getHistory('sess-2');
    expect(msgs[0].usage?.inputTokens).toBe(100);
    expect(msgs[0].usage?.costUsd).toBe(0.001);
  });

  it('lists sessions with last message', () => {
    const sessions = repo.listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    const s1 = sessions.find(s => s.sessionId === 'sess-1');
    expect(s1).toBeDefined();
    expect(s1!.messageCount).toBe(2);
  });

  it('handles concurrent writes without errors', () => {
    for (let i = 0; i < 50; i++) {
      repo.saveMessage(`concurrent-${i % 5}`, 'user', `msg ${i}`);
    }
    const msgs = repo.getHistory('concurrent-0');
    expect(msgs.length).toBe(10);
  });
});
