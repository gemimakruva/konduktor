import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { StreamEvent, TokenUsage, ContentBlock } from '@konduktor/shared';
import { LIMITS } from '@konduktor/shared';
import { CONFIG } from '../config.js';

export function parseStreamLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (parsed.type === 'system') {
    const sub = parsed.subtype as string;
    if (sub === 'hook_started' || sub === 'hook_response' || sub === 'hook_progress') {
      return null;
    }
    if (sub === 'init') {
      return {
        type: 'system', subtype: 'init',
        tools: (parsed.tools as string[]) || [],
        model: parsed.model as string,
      } as unknown as StreamEvent;
    }
    return { type: 'system', subtype: sub } as StreamEvent;
  }

  if (parsed.type === 'assistant') {
    const msg = parsed.message as Record<string, unknown> | undefined;
    const blocks = (msg?.content as Record<string, unknown>[]) || [];
    const content: ContentBlock[] = blocks.map(b => ({
      type: b.type as ContentBlock['type'],
      text: b.text as string | undefined,
      name: b.name as string | undefined,
      input: b.input as Record<string, unknown> | undefined,
    }));
    return {
      type: 'assistant',
      content,
      sessionId: parsed.session_id as string,
      model: (parsed.message as Record<string, unknown>)?.model as string,
    };
  }

  if (parsed.type === 'result') {
    const rawUsage = parsed.usage as Record<string, unknown> | undefined;
    let usage: TokenUsage | undefined;
    if (rawUsage) {
      const details = rawUsage.output_tokens_details as Record<string, number> | undefined;
      usage = {
        inputTokens: (rawUsage.input_tokens as number) || 0,
        outputTokens: (rawUsage.output_tokens as number) || 0,
        cacheReadTokens: (rawUsage.cache_read_input_tokens as number) || 0,
        cacheWriteTokens: (rawUsage.cache_creation_input_tokens as number) || 0,
        thinkingTokens: details?.thinking_tokens || 0,
        costUsd: (parsed.total_cost_usd as number) || 0,
      };
    }
    return {
      type: 'result',
      result: parsed.result as string,
      isError: parsed.is_error as boolean,
      sessionId: parsed.session_id as string,
      durationMs: parsed.duration_ms as number,
      costUsd: parsed.total_cost_usd as number,
      usage,
    };
  }

  if (parsed.type === 'rate_limit_event') {
    return {
      type: 'rate_limit_event',
      retryAfterMs: (parsed.retry_after_ms as number) || 30000,
    } as unknown as StreamEvent;
  }

  return null;
}

export class ClaudeProcess extends EventEmitter {
  private child: ChildProcess | null = null;
  private buffer = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  readonly sessionId: string;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  start(prompt: string, opts: { cwd?: string; model?: string; resume?: string; env?: Record<string, string> }): void {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
    if (opts.model) args.push('--model', opts.model);
    if (opts.resume) args.push('--resume', opts.resume);

    this.child = spawn(CONFIG.claudeBin, args, {
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, ...opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    this.child.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        const event = parseStreamLine(line);
        if (event) this.emit('event', event);
      }
    });

    this.child.stderr!.on('data', (chunk: Buffer) => {
      this.emit('stderr', chunk.toString());
    });

    this.child.on('close', (code) => {
      if (this.timer) clearTimeout(this.timer);
      if (this.buffer.trim()) {
        const event = parseStreamLine(this.buffer);
        if (event) this.emit('event', event);
      }
      this.emit('close', code);
    });

    this.child.on('error', (err) => {
      if (this.timer) clearTimeout(this.timer);
      this.emit('error', err);
    });

    this.timer = setTimeout(() => {
      if (this.child && !this.child.killed) {
        this.kill();
        this.emit('error', new Error('Process timeout'));
      }
    }, LIMITS.childProcessTimeoutMs);
  }

  kill(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.child && !this.child.killed) {
      if (process.platform === 'win32' && this.child.pid) {
        spawn('taskkill', ['/pid', String(this.child.pid), '/t', '/f'], { stdio: 'ignore' });
      } else {
        this.child.kill('SIGTERM');
        setTimeout(() => {
          if (this.child && !this.child.killed) {
            this.child.kill('SIGKILL');
          }
        }, 5000);
      }
    }
  }

  get isRunning(): boolean {
    return this.child !== null && !this.child.killed;
  }
}
