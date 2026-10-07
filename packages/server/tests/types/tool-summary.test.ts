import { describe, it, expect } from 'vitest';

const TOOL_PRIMARY_ARG: Record<string, string> = {
  Read: 'file_path',
  Edit: 'file_path',
  Write: 'file_path',
  Bash: 'command',
  WebSearch: 'query',
  WebFetch: 'url',
};

function getToolSummary(
  name: string,
  input?: Record<string, unknown>,
): string {
  if (!input) return name;
  const argKey = TOOL_PRIMARY_ARG[name];
  if (argKey && input[argKey]) {
    const val = String(input[argKey]);
    return `${name}: ${val.length > 60 ? val.slice(0, 57) + '...' : val}`;
  }
  const firstVal = Object.values(input)[0];
  if (firstVal !== undefined && firstVal !== null) {
    const val = String(firstVal);
    return `${name}: ${val.length > 60 ? val.slice(0, 57) + '...' : val}`;
  }
  return name;
}

describe('getToolSummary', () => {
  it('shows file_path for Read', () => {
    expect(getToolSummary('Read', { file_path: '/src/index.ts' })).toBe(
      'Read: /src/index.ts',
    );
  });

  it('shows truncated command for Bash', () => {
    const longCmd =
      'npm run build && npm test && npm run lint && echo "done and more text beyond sixty chars"';
    const result = getToolSummary('Bash', { command: longCmd });
    expect(result.length).toBeLessThanOrEqual(67);
    expect(result).toContain('Bash:');
    expect(result).toContain('...');
  });

  it('shows query for WebSearch', () => {
    expect(getToolSummary('WebSearch', { query: 'vitest mocking' })).toBe(
      'WebSearch: vitest mocking',
    );
  });

  it('falls back to first value for unknown tools', () => {
    expect(getToolSummary('CustomTool', { target: 'build' })).toBe(
      'CustomTool: build',
    );
  });

  it('shows name only when input is empty', () => {
    expect(getToolSummary('Read', {})).toBe('Read');
  });

  it('shows name only when no input', () => {
    expect(getToolSummary('Read')).toBe('Read');
  });
});
