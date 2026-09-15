import type { Contributions } from './github/contributions';

/**
 * Weights are shown in the UI on purpose: an opaque ranking of people reads as
 * a judgement, a published formula reads as a game.
 */
export const WEIGHTS = {
  pullRequests: 5,
  reviews: 3,
  issues: 2,
  commits: 1,
} as const;

export type ScoredMember = Contributions & { score: number };

export function score(c: Contributions): number {
  return (
    c.pullRequests * WEIGHTS.pullRequests +
    c.reviews * WEIGHTS.reviews +
    c.issues * WEIGHTS.issues +
    c.commits * WEIGHTS.commits
  );
}

export function rank(members: Contributions[]): ScoredMember[] {
  return members
    .map((member) => ({ ...member, score: score(member) }))
    .sort((a, b) => b.score - a.score || a.login.localeCompare(b.login));
}
