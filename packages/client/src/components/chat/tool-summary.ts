const TOOL_PRIMARY_ARG: Record<string, string> = {
  Read: 'file_path',
  Edit: 'file_path',
  Write: 'file_path',
  Bash: 'command',
  WebSearch: 'query',
  WebFetch: 'url',
};

export function getToolSummary(
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
