import { describe, expect, it } from 'vitest';

import { BADGE_FLOOR, MAX_BADGES, awardBadges } from './badges';
import type { Contributions } from './github/contributions';

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

/** Badge kinds awarded, in order, so a changed priority fails here rather than silently. */
function kinds(members: Contributions[], previous: Contributions[] | null = null): string[] {
  return awardBadges(members, previous).map((award) => award.kind);
}

function holderOf(kind: string, members: Contributions[], previous: Contributions[] | null = null) {
  return awardBadges(members, previous).find((award) => award.kind === kind)?.login ?? null;
}

describe('category badges', () => {
  it('names the member who leads a category outright', () => {
    const board = [member('ada', 9, 0, 0, 0), member('bob', 3, 0, 0, 0)];

    expect(holderOf('pullRequests', board)).toBe('ada');
  });

  it('awards nothing when the lead is shared', () => {
    const board = [member('ada', 9, 0, 0, 0), member('bob', 9, 0, 0, 0)];

    expect(holderOf('pullRequests', board)).toBeNull();
  });

  it('withholds a badge below the floor, however clear the lead', () => {
    const under = [member('ada', BADGE_FLOOR - 1, 0, 0, 0), member('bob', 0, 0, 0, 0)];
    const at = [member('ada', BADGE_FLOOR, 0, 0, 0), member('bob', 0, 0, 0, 0)];

    expect(holderOf('pullRequests', under)).toBeNull();
    expect(holderOf('pullRequests', at)).toBe('ada');
  });

  it('orders the four categories by weight, heaviest first', () => {
    const board = [
      member('ada', 9, 0, 0, 0),
      member('bob', 0, 9, 0, 0),
      member('cat', 0, 0, 9, 0),
      member('dan', 0, 0, 0, 9),
    ];

    expect(kinds(board)).toEqual(['pullRequests', 'reviews', 'issues', 'commits']);
  });
});

describe('one badge per person', () => {
  it('drops a badge whose leader already holds one rather than passing it down', () => {
    // ada leads pull requests and reviews; bob is second in reviews and leads nothing.
    const board = [member('ada', 9, 9, 0, 0), member('bob', 2, 5, 0, 0)];
    const awards = awardBadges(board);

    expect(awards).toEqual([{ kind: 'pullRequests', login: 'ada' }]);
    expect(awards.map((award) => award.login)).not.toContain('bob');
  });

  it('one member leading everything still takes exactly one badge', () => {
    const board = [member('ada', 9, 9, 9, 9), member('bob', 2, 2, 2, 2)];

    expect(awardBadges(board).filter((award) => award.login === 'ada')).toHaveLength(1);
  });

  it('stops at the cap while further badges still have holders', () => {
    // Six badges have a distinct, eligible holder: one per category, an all-rounder
    // nobody else qualifies for, and a riser nobody else can beat. Only the cap can
    // keep the last two off the board.
    const before = [
      member('ada', 20, 0, 0, 0),
      member('bob', 0, 20, 0, 0),
      member('cat', 0, 0, 20, 0),
      member('dan', 0, 0, 0, 20),
      member('eve', 3, 3, 3, 3),
      member('fay', 0, 0, 0, 0),
    ];
    const now = [...before.slice(0, 5), member('fay', 1, 0, 0, 0)];

    expect(awardBadges(now, before)).toHaveLength(MAX_BADGES);
    expect(kinds(now, before)).toEqual(['pullRequests', 'reviews', 'issues', 'commits']);
    // The two that were dropped had holders of their own, and neither was awarded.
    expect(awardBadges(now, before).map((award) => award.login)).not.toContain('eve');
    expect(awardBadges(now, before).map((award) => award.login)).not.toContain('fay');
  });
});

describe('all-rounder', () => {
  it('passes over perfect balance that is uniformly slight', () => {
    // bob is even across all four but at the floor; ada is even and substantial. The
    // other two take every category badge, so neither candidate is spent on one first.
    const board = [
      member('ada', 6, 6, 6, 12),
      member('bob', 2, 2, 2, 2),
      member('cat', 20, 20, 20, 1),
      member('dan', 0, 0, 0, 40),
    ];

    expect(holderOf('allRounder', board)).toBe('ada');
  });

  it('ignores a member short in any one category, however strong elsewhere', () => {
    const board = [
      member('ada', 40, 40, 40, 1),
      member('bob', 3, 3, 3, 9),
      member('cat', 0, 0, 0, 20),
    ];

    expect(holderOf('allRounder', board)).toBe('bob');
  });

  it('awards nothing when nobody clears the floor in all four', () => {
    const board = [member('ada', 9, 9, 9, 1), member('bob', 0, 4, 4, 4)];

    expect(holderOf('allRounder', board)).toBeNull();
  });

  it('counts a member sitting exactly on the floor in every category', () => {
    // ada and dan take the four category badges between them and neither is eligible,
    // so eve is the only candidate — and she is at the floor exactly, nowhere above it.
    const board = [
      member('ada', 20, 20, 20, 1),
      member('dan', 0, 0, 0, 20),
      member('eve', BADGE_FLOOR, BADGE_FLOOR, BADGE_FLOOR, BADGE_FLOOR),
    ];

    expect(holderOf('allRounder', board)).toBe('eve');
  });

  it('excludes a member one short of the floor who would otherwise win it', () => {
    // fay is stronger everywhere she counts, and a single category at floor − 1 is
    // what keeps the badge with eve.
    const board = [
      member('ada', 20, 20, 20, 1),
      member('dan', 0, 0, 0, 20),
      member('eve', BADGE_FLOOR, BADGE_FLOOR, BADGE_FLOOR, BADGE_FLOOR),
      member('fay', BADGE_FLOOR - 1, 9, 9, 9),
    ];

    expect(holderOf('allRounder', board)).toBe('eve');
  });
});

describe('riser', () => {
  it("names the biggest gain against the member's own previous round", () => {
    // cat holds the pull-request badge and gained nothing, so bob is free to be the riser.
    const before = [
      member('ada', 1, 0, 0, 0),
      member('bob', 1, 0, 0, 0),
      member('cat', 20, 0, 0, 0),
    ];
    const now = [member('ada', 2, 0, 0, 0), member('bob', 9, 0, 0, 0), member('cat', 20, 0, 0, 0)];

    expect(holderOf('riser', now, before)).toBe('bob');
  });

  it('has no holder in the season first round', () => {
    expect(kinds([member('ada', 9, 0, 0, 0)])).not.toContain('riser');
  });

  it('passes over a member the previous round never saw', () => {
    // joined this round, so there is no baseline to have risen from
    const before = [member('ada', 1, 0, 0, 0)];
    const now = [member('ada', 2, 0, 0, 0), member('new', 9, 0, 0, 0)];

    expect(holderOf('riser', now, before)).toBe('ada');
  });

  it('passes over a member who fell or stood still', () => {
    const before = [member('ada', 9, 0, 0, 0), member('bob', 4, 0, 0, 0)];
    const now = [member('ada', 3, 0, 0, 0), member('bob', 4, 0, 0, 0)];

    expect(holderOf('riser', now, before)).toBeNull();
  });
});

describe('an empty round', () => {
  it('awards nothing', () => {
    expect(awardBadges([])).toEqual([]);
  });
});
