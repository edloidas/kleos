import type { Contributions } from './github/contributions';
import { score } from './score';
import type { WeekId } from './weeks';
import { isComplete } from './weeks';

/** Everyone starts level: the season is a hard reset, not a carried-over rating. */
export const START_RATING = 1000;

/** Among ten equals, first gains 12 a week and last loses 12. */
export const K_FACTOR = 24;

/** Rating gap at which the stronger member is expected to place above the weaker 10 times in 11. */
export const RATING_SCALE = 400;

/** Rounds a member has to have played before their rating says anything about them. */
export const MIN_ROUNDS = 3;

/**
 * Printed beside the season name: a redeploy that re-rates the season has to be
 * explainable. It covers everything the ladder is derived from — the placement
 * weights and their k table in `score.ts` as well as the constants here — because
 * nothing is stored, so retuning any of them rewrites the whole season's history
 * on the next render. Bump it whenever one of them moves.
 */
export const LADDER_VERSION = 'v1';

/** A season's rounds in order, as `loadSeason` returns them. */
export type Rounds = ReadonlyMap<WeekId, Contributions[]>;

export type RoundResult = {
  week: WeekId;
  points: number;
  /** Midrank on ties, so two members sharing second place both hold 2.5. */
  rank: number;
  participants: number;
  delta: number;
};

export type LadderEntry = {
  login: string;
  /** Float, including the provisional round. Round for display, sort on this. */
  rating: number;
  /** The part of `rating` the provisional round contributed, and the part still moving. */
  provisionalDelta: number;
  roundsPlayed: number;
  /** A week with contributions, even one nobody else played, so an unranked row can say why. */
  lastActiveWeek: WeekId | null;
  results: RoundResult[];
};

export type Ladder = {
  ranked: LadderEntry[];
  unranked: LadderEntry[];
  provisionalRound: WeekId | null;
};

type State = LadderEntry;

/**
 * Elo over the season's weeks. The match is a week, not a pull request: everyone
 * active in a round plays everyone else active in it, and placement is by the
 * diminishing-returns score.
 */
export function ladder(rounds: Rounds, now = new Date()): Ladder {
  const states = new Map<string, State>();
  const last = [...rounds.keys()].at(-1);
  const provisionalRound = last !== undefined && !isComplete(last, now) ? last : null;

  for (const [week, members] of rounds) {
    for (const member of members) {
      if (!states.has(member.login)) {
        states.set(member.login, fresh(member.login));
      }
    }

    play(states, week, members);
  }

  const entries = [...states.values()].map((state) => ({
    ...state,
    provisionalDelta: state.results.find((result) => result.week === provisionalRound)?.delta ?? 0,
  }));

  return {
    ranked: entries.filter(isRanked).sort(byRating),
    unranked: entries.filter((entry) => !isRanked(entry)).sort(byActivity),
    provisionalRound,
  };
}

function fresh(login: string): State {
  return {
    login,
    rating: START_RATING,
    provisionalDelta: 0,
    roundsPlayed: 0,
    lastActiveWeek: null,
    results: [],
  };
}

/**
 * Scored against the ratings every member brought into the round: updating from
 * ratings already moved would make the result depend on arrival order.
 */
function play(states: Map<string, State>, week: WeekId, members: Contributions[]): void {
  const played = members
    .map((member) => ({ login: member.login, points: score(member) }))
    // An idle member is absent from the round rather than placed last in it.
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points);

  for (const entry of played) {
    states.get(entry.login)!.lastActiveWeek = week;
  }

  // Nobody finishes above or below expectation with no one to finish against, so
  // the lone member is active that week without having played a round.
  if (played.length < 2) {
    return;
  }

  const ranks = midranks(played.map((entry) => entry.points));
  const ratings = played.map((entry) => states.get(entry.login)!.rating);

  played.forEach((entry, index) => {
    const delta = (K_FACTOR * (expectedRank(index, ratings) - ranks[index]!)) / (played.length - 1);
    const state = states.get(entry.login)!;

    state.rating += delta;
    state.roundsPlayed += 1;
    state.results.push({
      week,
      points: entry.points,
      rank: ranks[index]!,
      participants: played.length,
      delta,
    });
  });
}

/**
 * The rank a member's rating alone predicts: one for themselves, plus the chance
 * each other participant beats them. Finishing above it gains rating.
 */
function expectedRank(index: number, ratings: number[]): number {
  return ratings.reduce(
    (expected, other, j) =>
      j === index ? expected : expected + 1 - winProbability(ratings[index]!, other),
    1,
  );
}

function winProbability(rating: number, other: number): number {
  return 1 / (1 + 10 ** ((other - rating) / RATING_SCALE));
}

/** Tied members share the average of the places they cover, so the ranks still sum to 1..N. */
function midranks(points: number[]): number[] {
  const ranks: number[] = [];

  for (let start = 0; start < points.length;) {
    let end = start;

    while (end + 1 < points.length && points[end + 1] === points[start]) {
      end++;
    }

    for (let i = start; i <= end; i++) {
      ranks[i] = (start + end) / 2 + 1;
    }

    start = end + 1;
  }

  return ranks;
}

function isRanked(entry: LadderEntry): boolean {
  return entry.roundsPlayed >= MIN_ROUNDS;
}

function byRating(a: LadderEntry, b: LadderEntry): number {
  return b.rating - a.rating || a.login.localeCompare(b.login);
}

/** Unranked ratings are not comparable yet, so the rows read as who is on their way in. */
function byActivity(a: LadderEntry, b: LadderEntry): number {
  return (
    b.roundsPlayed - a.roundsPlayed ||
    (b.lastActiveWeek ?? '').localeCompare(a.lastActiveWeek ?? '') ||
    a.login.localeCompare(b.login)
  );
}
