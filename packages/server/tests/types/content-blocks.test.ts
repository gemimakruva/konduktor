import { describe, it, expect } from 'vitest';
import type { ContentBlock } from '@konduktor/shared';

function extractTextFromBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
    .join('');
}

function hasVisibleContent(blocks: ContentBlock[]): boolean {
  return blocks.some(
    (b) =>
      b.type === 'text' ||
      b.type === 'thinking' ||
      b.type === 'tool_use' ||
      b.type === 'tool_result',
  );
}

describe('Content block utilities', () => {
  it('extracts text from mixed blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', text: 'Let me think...' },
      { type: 'text', text: 'Hello world' },
      { type: 'tool_use', name: 'Read', input: { file_path: 'src/index.ts' } },
    ];
    expect(extractTextFromBlocks(blocks)).toBe('Hello world');
  });

  it('returns empty string when only thinking blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', text: 'Analyzing...' },
    ];
    expect(extractTextFromBlocks(blocks)).toBe('');
  });

  it('detects visible content in thinking-only messages', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', text: 'Analyzing...' },
    ];
    expect(hasVisibleContent(blocks)).toBe(true);
  });

  it('skips unknown block types gracefully', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'Hello' },
      {
        type: 'unknown_future_type' as ContentBlock['type'],
        text: 'skip me',
      },
    ];
    expect(extractTextFromBlocks(blocks)).toBe('Hello');
    expect(hasVisibleContent(blocks)).toBe(true);
  });
});
