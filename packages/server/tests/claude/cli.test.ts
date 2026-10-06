import { describe, it, expect } from 'vitest';
import { parseStreamLine } from '../../src/claude/cli.js';

describe('parseStreamLine', () => {
  it('parses assistant message event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello' }] },
      session_id: 'abc-123'
    });
    const event = parseStreamLine(line);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('assistant');
    expect(event!.content![0].text).toBe('Hello');
  });

  it('parses result event with usage', () => {
    const line = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'Done',
      is_error: false,
      session_id: 'abc-123',
      duration_ms: 4340,
      total_cost_usd: 0.05,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 0,
        output_tokens_details: { thinking_tokens: 10 }
      }
    });
    const event = parseStreamLine(line);
    expect(event!.type).toBe('result');
    expect(event!.result).toBe('Done');
    expect(event!.usage!.inputTokens).toBe(100);
    expect(event!.usage!.thinkingTokens).toBe(10);
    expect(event!.costUsd).toBe(0.05);
  });

  it('returns null for non-JSON lines', () => {
    expect(parseStreamLine('Loading...')).toBeNull();
    expect(parseStreamLine('')).toBeNull();
    expect(parseStreamLine('  ')).toBeNull();
  });

  it('skips system hook events', () => {
    const line = JSON.stringify({
      type: 'system',
      subtype: 'hook_started',
      hook_name: 'SessionStart'
    });
    const event = parseStreamLine(line);
    expect(event).toBeNull();
  });

  it('passes through system init events', () => {
    const line = JSON.stringify({
      type: 'system',
      subtype: 'init',
      tools: ['Read', 'Write'],
      model: 'claude-sonnet-5-5'
    });
    const event = parseStreamLine(line);
    expect(event!.type).toBe('system');
  });
});
