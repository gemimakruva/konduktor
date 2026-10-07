import type { AgentProfile } from '@konduktor/shared';

export function buildProfileArgs(profile: AgentProfile, prompt: string): string[] {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];

  args.push('--model', profile.model);

  let systemPrompt = profile.systemPrompt;
  if (profile.personalityPrompt) {
    systemPrompt += `\n\n${profile.personalityPrompt}`;
  }
  if (profile.knowledgeSources.length > 0) {
    systemPrompt += `\n\nReference these files: ${profile.knowledgeSources.join(', ')}`;
  }
  if (systemPrompt.trim()) {
    args.push('--system-prompt', systemPrompt);
  }

  if (profile.toolRestrictions.tools.length > 0) {
    if (profile.toolRestrictions.mode === 'allow') {
      args.push('--allowedTools', profile.toolRestrictions.tools.join(','));
    } else {
      args.push('--disallowedTools', profile.toolRestrictions.tools.join(','));
    }
  }

  return args;
}
