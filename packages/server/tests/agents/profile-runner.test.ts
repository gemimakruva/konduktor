import { describe, it, expect } from 'vitest';
import { buildProfileArgs } from '../../src/agents/profile-runner.js';
import type { AgentProfile } from '@konduktor/shared';

const baseProfile: AgentProfile = {
  id: 1, name: 'Test', icon: '🤖', systemPrompt: 'You are helpful',
  model: 'claude-opus-4-6', defaultCwd: '/tmp', skills: [],
  maxConcurrentTasks: 1, personalityPrompt: 'Be brief',
  delegationRules: [], memoryPolicy: 'ephemeral',
  toolRestrictions: { mode: 'allow', tools: [] },
  knowledgeSources: [], createdAt: 0, updatedAt: 0,
};

describe('buildProfileArgs', () => {
  it('builds CLI args with system prompt and model', () => {
    const args = buildProfileArgs(baseProfile, 'Do something');
    expect(args).toContain('--model');
    expect(args).toContain('claude-opus-4-6');
    expect(args).toContain('--system-prompt');
  });

  it('includes personality in system prompt', () => {
    const args = buildProfileArgs(baseProfile, 'Task');
    const sysIdx = args.indexOf('--system-prompt');
    const sysPrompt = args[sysIdx + 1];
    expect(sysPrompt).toContain('You are helpful');
    expect(sysPrompt).toContain('Be brief');
  });

  it('adds tool restrictions as allowlist', () => {
    const profile = { ...baseProfile, toolRestrictions: { mode: 'allow' as const, tools: ['Read', 'Edit'] } };
    const args = buildProfileArgs(profile, 'Task');
    expect(args).toContain('--allowedTools');
    expect(args).toContain('Read,Edit');
  });

  it('empty allow-tools means no restriction flag', () => {
    const args = buildProfileArgs(baseProfile, 'Task');
    expect(args).not.toContain('--allowedTools');
    expect(args).not.toContain('--disallowedTools');
  });

  it('adds knowledge sources to system prompt', () => {
    const profile = { ...baseProfile, knowledgeSources: ['docs/guide.md'] };
    const args = buildProfileArgs(profile, 'Task');
    const sysIdx = args.indexOf('--system-prompt');
    expect(args[sysIdx + 1]).toContain('docs/guide.md');
  });
});
