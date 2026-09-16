import { describe, expect, it } from 'vitest';

import type { Contributions } from './github/contributions';
import type { Rounds } from './rating';
import { K_FACTOR, MIN_ROUNDS, RATING_SCALE, RATING_VERSION, START_RATING, ladder } from './rating';
import type { WeekId } from './weeks';

/** September 2026: the ISO weeks whose Thursday falls in the month. */
const SEASON = ['2026-W36', '2026-W37', '2026-W38', '2026-W39'] as const;

/** W39 ends on the 27th, so every round of the season is complete. */
const AFTER = new Date('2026-09-28T09:00:00Z');

/** Tuesday of W38: W36 and W37 are complete, W38 has one completed day. */
const DURING_W38 = new Date('2026-09-15T09:00:00Z');

function member(login: string, commits: number): Contributions {
  const counts = { pullRequests: 0, reviews: 0, issues: 0, commits, restricted: 0 };

  return { login, name: null, avatarUrl: '', overall: counts, ...counts };
}

/**
 * `weeks[i]` holds one commit count per member, positionally matched to `logins`.
 * `null` leaves the member out of that week's roster entirely, which is not the
 * same as a zero: the roster is refetched per season, so a member who joined the
 * organization mid-month is absent from the earlier rounds rather than idle in them.
 */
function season(
  logins: string[],
  weeks: (number | null)[][],
  ids: readonly WeekId[] = SEASON,
): Rounds {
  return new Map(
    weeks.map((counts, index) => [
      ids[index]!,
      logins.flatMap((login, i) => (counts[i] === null ? [] : [member(login, counts[i] ?? 0)])),
    ]),
  );
}

/** What an entry looks like for a member no round ever moved. */
const idle = {
  rating: START_RATING,
  provisionalDelta: 0,
  roundsPlayed: 0,
  lastActiveWeek: null,
  results: [],
};

function ratingOf(result: ReturnType<typeof ladder>, login: string): number {
  return [...result.ranked, ...result.unranked].find((entry) => entry.login === login)!.rating;
}

describe('ladder', () => {
  // Hand-simulated independently of this module, so the pinned values are an
  // expectation rather than a reading of what the code already does.
  it('matches the hand simulation for ten members and four identical rounds', () => {
    const logins = Array.from({ length: 10 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);
    const order = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const result = ladder(season(logins, [order, order, order, order]), AFTER);

    expect(result.ranked.map((entry) => entry.login)).toEqual(logins);
    expect(result.ranked[0]!.rating).toBeCloseTo(1045.3199, 4);
    expect(result.ranked[1]!.rating).toBeCloseTo(1035.247, 4);
    expect(result.ranked[8]!.rating).toBeCloseTo(964.753, 4);
    expect(result.ranked[9]!.rating).toBeCloseTo(954.6801, 4);
  });

  // Elo moves rating between players and never mints it: expected ranks sum to
  // the same total as actual ranks, midranks included.
  it('keeps the total rating at the starting sum', () => {
    const logins = ['a', 'b', 'c', 'd', 'e'];
    const result = ladder(
      season(logins, [
        [5, 4, 3, 2, 1],
        [1, 1, 9, 0, 4],
        [0, 7, 7, 7, 2],
      ]),
      AFTER,
    );

    const ratings = [...result.ranked, ...result.unranked].map((entry) => entry.rating);

    expect(ratings.reduce((sum, rating) => sum + rating, 0)).toBeCloseTo(
      logins.length * START_RATING,
      9,
    );
    // Two-sided on purpose: conservation alone is also true of a ladder that
    // never moves anyone, so the spread has to be asserted beside it.
    expect(Math.max(...ratings)).toBeGreaterThan(START_RATING);
    expect(Math.min(...ratings)).toBeLessThan(START_RATING);
  });

  // Ten equals, one round: first gains K/2 and last loses it. The single fact
  // that makes the K factor readable on the page.
  it('moves the winner of a round of ten equals by half the K factor', () => {
    const logins = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const result = ladder(season(logins, [[10, 9, 8, 7, 6, 5, 4, 3, 2, 1]]), AFTER);

    expect(ratingOf(result, 'p0')).toBeCloseTo(START_RATING + K_FACTOR / 2, 10);
    expect(ratingOf(result, 'p9')).toBeCloseTo(START_RATING - K_FACTOR / 2, 10);
  });

  it('gives tied members the midrank and the same delta', () => {
    const result = ladder(season(['a', 'b', 'c', 'd'], [[9, 4, 4, 1]]), AFTER);

    const ranks = [...result.ranked, ...result.unranked].map((entry) => ({
      login: entry.login,
      rank: entry.results[0]!.rank,
      delta: entry.results[0]!.delta,
    }));

    expect(ranks).toEqual([
      { login: 'a', rank: 1, delta: 12 },
      { login: 'b', rank: 2.5, delta: 0 },
      { login: 'c', rank: 2.5, delta: 0 },
      { login: 'd', rank: 4, delta: -12 },
    ]);
  });

  // `other` sits out W37, so the field `late` walks into averages 1012. Only in
  // that shape do the starting rating and the field's average differ: across the
  // whole roster Elo conserves the sum, so the average is always 1000.
  it('starts a mid-season joiner at the starting rating with no earlier rounds', () => {
    const result = ladder(
      season(
        ['early', 'other', 'late'],
        [
          [3, 1, null],
          [3, null, 5],
          [3, 1, 5],
          [3, 1, 5],
        ],
      ),
      AFTER,
    );

    const late = result.ranked.find((entry) => entry.login === 'late')!;

    expect(late.roundsPlayed).toBe(3);
    expect(late.results.map((round) => round.week)).toEqual(['2026-W37', '2026-W38', '2026-W39']);
    expect(late.rating).toBeCloseTo(1034.546, 4);
  });

  // No penalty and no protection: an idle week leaves the rating exactly where
  // it was, so an absence costs nothing and earns nothing.
  it('leaves an idle member untouched by a round they sat out', () => {
    const result = ladder(
      season(
        ['a', 'b', 'idle'],
        [
          [3, 1, 0],
          [3, 1, 0],
          [3, 1, 0],
        ],
      ),
      AFTER,
    );

    const idle = result.unranked.find((entry) => entry.login === 'idle')!;

    expect(idle).toMatchObject({
      rating: START_RATING,
      roundsPlayed: 0,
      lastActiveWeek: null,
      results: [],
    });
  });

  it('ranks only members who played the minimum rounds', () => {
    const result = ladder(
      season(
        ['three', 'two', 'rival'],
        [
          [3, 1, 2],
          [3, 1, 2],
          [3, 0, 2],
        ],
      ),
      AFTER,
    );

    expect(result.ranked.map((entry) => entry.login)).toEqual(['three', 'rival']);
    expect(result.unranked).toHaveLength(1);
    expect(result.unranked[0]).toMatchObject({
      login: 'two',
      roundsPlayed: MIN_ROUNDS - 1,
      lastActiveWeek: '2026-W37',
    });
  });

  // `adam` sorts before `zoe` alphabetically and was active first, so the login
  // tie-break would reverse the pair: only recency puts `zoe` above.
  it('orders the unranked by rounds played, then by how recently they were active', () => {
    const result = ladder(
      season(
        ['adam', 'zoe', 'anchor'],
        [
          [2, 0, 3],
          [0, 2, 3],
        ],
      ),
      AFTER,
    );

    expect(result.ranked).toHaveLength(0);
    expect(
      result.unranked.map((entry) => [entry.login, entry.roundsPlayed, entry.lastActiveWeek]),
    ).toEqual([
      ['anchor', 2, '2026-W37'],
      ['zoe', 1, '2026-W37'],
      ['adam', 1, '2026-W36'],
    ]);
  });

  it('plays no round when a week has a single contributor', () => {
    const result = ladder(season(['alone', 'absent'], [[4, 0]]), AFTER);

    expect(result.unranked).toEqual([
      { ...idle, login: 'alone', lastActiveWeek: '2026-W36' },
      { ...idle, login: 'absent' },
    ]);
  });

  it('plays no round when nobody contributed', () => {
    const result = ladder(season(['a', 'b'], [[0, 0]]), AFTER);

    expect(result.unranked).toEqual([
      { ...idle, login: 'a' },
      { ...idle, login: 'b' },
    ]);
  });

  it('returns nothing for a season with no rounds', () => {
    expect(ladder(new Map(), AFTER)).toEqual({ ranked: [], unranked: [], provisionalRound: null });
  });

  describe('provisional round', () => {
    /** `gone` played the settled rounds and sat out the live one. */
    const rounds = (commits: number): Rounds =>
      season(
        ['a', 'b', 'gone'],
        [
          [3, 1, 2],
          [3, 1, 6],
          [5, commits, 0],
        ],
        SEASON.slice(0, 3),
      );

    it('names the live week and the part of the rating still moving', () => {
      const result = ladder(rounds(1), DURING_W38);
      const a = result.ranked.find((entry) => entry.login === 'a')!;

      expect(result.provisionalRound).toBe('2026-W38');
      expect(a.provisionalDelta).toBeCloseTo(10.8035, 4);
      expect(a.rating).toBeCloseTo(1022.1825, 4);
    });

    // The delta of the provisional round, not of the last round played: a member
    // who sat the live week out has nothing still moving.
    it('gives a member idle in the live week no provisional delta', () => {
      const gone = ladder(rounds(1), DURING_W38).unranked.find((entry) => entry.login === 'gone')!;

      expect(gone.results.at(-1)).toMatchObject({ week: '2026-W37', delta: 12 });
      expect(gone.provisionalDelta).toBe(0);
    });

    // The live week is refetched as days complete, so its round is replayed with
    // more data. Only the provisional part may move; the settled rounds may not.
    it('rewrites only the provisional round when a day is added', () => {
      const before = ladder(rounds(1), DURING_W38);
      const after = ladder(rounds(9), DURING_W38);

      const settled = (result: ReturnType<typeof ladder>) =>
        new Map(result.ranked.map((entry) => [entry.login, entry.results.slice(0, -1)]));

      const provisional = (result: ReturnType<typeof ladder>) =>
        result.ranked.find((entry) => entry.login === 'a')!.provisionalDelta;

      expect(settled(after)).toEqual(settled(before));
      expect(provisional(before)).toBeCloseTo(10.8035, 4);
      expect(provisional(after)).toBeCloseTo(-13.1965, 4);
    });

    it('has no provisional round once the last week is complete', () => {
      const result = ladder(rounds(1), AFTER);

      expect(result.provisionalRound).toBeNull();
      expect(result.ranked.every((entry) => entry.provisionalDelta === 0)).toBe(true);
    });
  });

  // A rating a deploy can rewrite has to say which rules produced it, so retuning
  // a constant fails here — which is where the version gets bumped with it.
  it('pins the rating constants and the version printed beside them', () => {
    expect({
      version: RATING_VERSION,
      k: K_FACTOR,
      start: START_RATING,
      scale: RATING_SCALE,
      minRounds: MIN_ROUNDS,
    }).toEqual({ version: 'v1', k: 24, start: 1000, scale: 400, minRounds: 3 });
  });
});
