import { describe, it, expect } from 'vitest';
import { scoreMatch, matchAgent } from '../../src/agents/skill-matcher.js';
import type { AgentProfile } from '@konduktor/shared';

const makeAgent = (name: string, skills: string[]): AgentProfile => ({
  id: 1, name, icon: '🤖', systemPrompt: '', model: 'claude-sonnet-5-5',
  defaultCwd: '', skills, maxConcurrentTasks: 1, personalityPrompt: '',
  delegationRules: [], memoryPolicy: 'ephemeral',
  toolRestrictions: { mode: 'allow', tools: [] },
  knowledgeSources: [], createdAt: 0, updatedAt: 0,
});

describe('scoreMatch', () => {
  it('scores exact skill match', () => {
    expect(scoreMatch('deploy to production', ['deploy', 'devops'])).toBeGreaterThan(0);
  });

  it('scores zero for no match', () => {
    expect(scoreMatch('write frontend code', ['devops', 'database'])).toBe(0);
  });

  it('scores higher for more matching skills', () => {
    const s1 = scoreMatch('deploy docker container', ['deploy']);
    const s2 = scoreMatch('deploy docker container', ['deploy', 'docker']);
    expect(s2).toBeGreaterThan(s1);
  });

  it('handles empty skills array', () => {
    expect(scoreMatch('any task', [])).toBe(0);
  });

  it('handles empty task text', () => {
    expect(scoreMatch('', ['testing'])).toBe(0);
  });
});

describe('matchAgent', () => {
  it('returns best matching agent', () => {
    const agents = [
      makeAgent('Frontend', ['react', 'css']),
      makeAgent('DevOps', ['deploy', 'docker']),
    ];
    const result = matchAgent('deploy the app', agents);
    expect(result?.name).toBe('DevOps');
  });

  it('returns null for empty agents', () => {
    expect(matchAgent('task', [])).toBeNull();
  });

  it('returns null when no skills match', () => {
    const agents = [makeAgent('Narrow', ['haskell'])];
    expect(matchAgent('write python code', agents)).toBeNull();
  });
});
