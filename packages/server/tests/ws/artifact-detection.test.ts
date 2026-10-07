import { describe, it, expect } from 'vitest';
import { extractArtifactFromEvent } from '../../src/ws/artifact-detector.js';
import type { StreamEvent } from '@konduktor/shared';

describe('extractArtifactFromEvent', () => {
  it('extracts artifact from tool_use content block', () => {
    const event: StreamEvent = {
      type: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'Artifact',
          input: {
            file_path: '/tmp/dashboard.html',
            title: 'Dashboard',
            icon: 'chart',
            description: 'A metrics dashboard',
          },
        },
      ],
    };
    const result = extractArtifactFromEvent(event);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Dashboard');
    expect(result[0].icon).toBe('chart');
    expect(result[0].description).toBe('A metrics dashboard');
  });

  it('returns empty array for non-artifact events', () => {
    const event: StreamEvent = {
      type: 'assistant',
      content: [{ type: 'text', text: 'hello' }],
    };
    expect(extractArtifactFromEvent(event)).toHaveLength(0);
  });

  it('returns empty array for result events', () => {
    const event: StreamEvent = { type: 'result', result: 'done' };
    expect(extractArtifactFromEvent(event)).toHaveLength(0);
  });

  it('handles missing input fields gracefully', () => {
    const event: StreamEvent = {
      type: 'assistant',
      content: [{ type: 'tool_use', name: 'Artifact', input: {} }],
    };
    const result = extractArtifactFromEvent(event);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Untitled');
    expect(result[0].icon).toBe('code');
  });

  it('extracts multiple artifacts from one event', () => {
    const event: StreamEvent = {
      type: 'assistant',
      content: [
        { type: 'tool_use', name: 'Artifact', input: { title: 'First' } },
        { type: 'text', text: 'between' },
        { type: 'tool_use', name: 'Artifact', input: { title: 'Second' } },
      ],
    };
    const result = extractArtifactFromEvent(event);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('First');
    expect(result[1].title).toBe('Second');
  });
});
