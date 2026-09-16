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

/** Part of the board cache key: a scoring change must not serve entries scored by the old rules. */
export const FORMULA_VERSION = 'v2';

export const CATEGORIES = ['pullRequests', 'reviews', 'issues', 'commits'] as const;

export type Category = (typeof CATEGORIES)[number];

export type ScoredMember = Contributions & { score: number };

/**
 * `weight × n / (n + k)` per category. Saturating rather than linear, so the
 * first contribution in a category is worth far more than the fiftieth: a
 * category approaches its weight and never exceeds it.
 */
export function score(c: Contributions): number {
  return CATEGORIES.reduce((total, category) => {
    const n = c[category];

    return total + (WEIGHTS[category] * n) / (n + HALF_AT[category]);
  }, 0);
}

export function rank(members: Contributions[]): ScoredMember[] {
  return members
    .map((member) => ({ ...member, score: score(member) }))
    .sort((a, b) => b.score - a.score || a.login.localeCompare(b.login));
}
