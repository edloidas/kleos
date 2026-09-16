import { describe, expect, it } from 'vitest';

import type { Contributions } from './github/contributions';
import { FORMULA_VERSION, HALF_AT, WEIGHTS, rank, score } from './score';

function member(
  login: string,
  pullRequests: number,
  reviews: number,
  issues: number,
  commits: number,
): Contributions {
  const counts = { pullRequests, reviews, issues, commits, restricted: 0 };

  return { login, name: null, avatarUrl: '', overall: counts, ...counts };
}

const ALICE = member('alice', 3, 6, 1, 18);
const BOB = member('bob', 1, 0, 4, 45);
const CAROL = member('carol', 0, 12, 0, 2);

describe('score', () => {
  it('is zero for a member with no contributions', () => {
    expect(score(member('nobody', 0, 0, 0, 0))).toBe(0);
  });

  // Hand-computed from the weight/k table, not read back from the module, so
  // a changed constant fails here instead of moving the expectation with it.
  it('gives the reference members their hand-computed totals', () => {
    expect(score(ALICE)).toBeCloseTo(7.0256, 4);
    expect(score(BOB)).toBeCloseTo(3.8491, 4);
    expect(score(CAROL)).toBeCloseTo(3.4, 4);
  });

  it.each([
    ['pullRequests', 2, 2.5, 5],
    ['reviews', 3, 2, 4],
    ['issues', 2, 1, 2],
    ['commits', 8, 0.5, 1],
  ] as const)('pays %s half of %d at k and approaches %d', (category, k, half, ceiling) => {
    const atK = member('x', 0, 0, 0, 0);
    atK[category] = k;

    const many = member('x', 0, 0, 0, 0);
    many[category] = 1_000_000;

    expect(score(atK)).toBeCloseTo(half, 10);
    expect(score(many)).toBeLessThan(ceiling);
    expect(score(many)).toBeGreaterThan(ceiling * 0.99);
  });

  // The whole reason for the rational curve: bulk has to flatten, and each
  // further doubling has to be worth less than the one before it.
  it('pays less for each further contribution in a category', () => {
    const commits = (n: number) => score(member('x', 0, 0, 0, n));

    const first = commits(2) - commits(0);
    const middle = commits(40) - commits(20);
    const last = commits(100) - commits(40);

    expect(first).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(last);
  });

  // weight / (1 + k) per category, so these are joint facts about both tables.
  it.each([
    ['pullRequests', 5 / 3],
    ['reviews', 1],
    ['issues', 2 / 3],
    ['commits', 1 / 9],
  ] as const)('pays %s %d for a first contribution', (category, expected) => {
    const c = member('x', 0, 0, 0, 0);
    c[category] = 1;

    expect(score(c)).toBeCloseTo(expected, 10);
  });

  it('ignores contributions it cannot attribute to a repository', () => {
    const hidden = member('x', 1, 0, 0, 0);
    hidden.restricted = 7;

    expect(score(hidden)).toBeCloseTo(5 / 3, 10);
  });

  it('scores the organization counts, never the member overall totals', () => {
    const c = member('x', 0, 0, 0, 0);
    c.overall = { pullRequests: 90, reviews: 90, issues: 90, commits: 90, restricted: 0 };

    expect(score(c)).toBe(0);
  });

  // The version is part of the board cache key, and KV outlives a deploy. Change
  // a weight or a k here without bumping the version and the old boards are
  // served for a whole TTL, so the two are pinned as one literal.
  it('ties the formula version to the constants it versions', () => {
    expect({ version: FORMULA_VERSION, weights: WEIGHTS, halfAt: HALF_AT }).toEqual({
      version: 'v2',
      weights: { pullRequests: 5, reviews: 4, issues: 2, commits: 1 },
      halfAt: { pullRequests: 2, reviews: 3, issues: 2, commits: 8 },
    });
  });
});

describe('rank', () => {
  it('orders by score, highest first', () => {
    expect(rank([CAROL, ALICE, BOB]).map((m) => m.login)).toEqual(['alice', 'bob', 'carol']);
  });

  it('breaks a tie on login so the order is stable', () => {
    const zoe = member('zoe', 1, 1, 1, 1);
    const adam = member('adam', 1, 1, 1, 1);

    expect(rank([zoe, adam]).map((m) => m.login)).toEqual(['adam', 'zoe']);
  });

  it('attaches the score it sorted by', () => {
    const [top] = rank([CAROL, ALICE]);

    expect(top.score).toBeCloseTo(score(ALICE), 10);
  });
});
