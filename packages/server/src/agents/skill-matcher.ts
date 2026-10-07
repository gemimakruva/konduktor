import type { AgentProfile } from '@konduktor/shared';

export function scoreMatch(taskText: string, skills: string[]): number {
  if (!taskText || skills.length === 0) return 0;
  const lower = taskText.toLowerCase();
  let score = 0;
  for (const skill of skills) {
    if (lower.includes(skill.toLowerCase())) score++;
  }
  return score;
}

export function matchAgent(taskText: string, agents: AgentProfile[]): AgentProfile | null {
  if (agents.length === 0) return null;
  let best: AgentProfile | null = null;
  let bestScore = 0;
  for (const agent of agents) {
    const score = scoreMatch(taskText, agent.skills);
    if (score > bestScore) {
      bestScore = score;
      best = agent;
    }
  }
  return best;
}
