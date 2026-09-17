import type { Contributions } from './github/contributions';

/**
 * Weights are shown in the UI on purpose: an opaque ranking of people reads as
 * a judgement, a published formula reads as a game.
 */
export const WEIGHTS = {
  pullRequests: 5,
  reviews: 4,
  issues: 2,
  commits: 1,
} as const;

/** Contributions at which a category reaches half its weight. */
export const HALF_AT = {
  pullRequests: 2,
  reviews: 3,
  issues: 2,
  commits: 8,
} as const;

export const CATEGORIES = ['pullRequests', 'reviews', 'issues', 'commits'] as const;

export type Category = (typeof CATEGORIES)[number];

export type ScoredMember = Contributions & { score: number };

/**
 * `weight × n / (n + k)` for one category. Saturating rather than linear, so the
 * first contribution in a category is worth far more than the fiftieth: a
 * category approaches its weight and never exceeds it.
 */
export function contribution(c: Contributions, category: Category): number {
  const n = c[category];

  return (WEIGHTS[category] * n) / (n + HALF_AT[category]);
}

export function score(c: Contributions): number {
  return CATEGORIES.reduce((total, category) => total + contribution(c, category), 0);
}

export function rank(members: Contributions[]): ScoredMember[] {
  return members
    .map((member) => ({ ...member, score: score(member) }))
    .sort((a, b) => b.score - a.score || a.login.localeCompare(b.login));
}
