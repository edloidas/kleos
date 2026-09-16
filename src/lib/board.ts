import { withoutExcluded } from './exclusions';
import type { Contributions } from './github/contributions';
import type { Viewer } from './github/token';
import type { Ladder, LadderEntry } from './rating';
import { ladder } from './rating';
import type { SizeLimit } from './roster';
import { RosterSizeError, sizeLimit } from './roster';
import { score } from './score';
import { loadSeason } from './season';
import type { Season } from './season';
import { loadSeasonFixture } from './source';
import type { WeekId } from './weeks';
import {
  hasCompletedDay,
  isComplete,
  lastCompletedInstant,
  liveWeek,
  seasonWeeks,
  weekStartOf,
  weekThursday,
} from './weeks';

/** A member's row in one round: their counts, their points and what the round moved. */
export type Standing = Contributions & {
  points: number;
  /** Midrank on ties, as the rating uses — two members sharing second both hold 2.5. */
  place: number;
  delta: number;
};

export type WeekView = {
  id: WeekId;
  number: number;
  /** Monday and Sunday of the round, as UTC dates. */
  from: string;
  to: string;
  /** The last completed UTC day the counts include. */
  through: string;
  complete: boolean;
  standings: Standing[];
};

/**
 * A ladder entry with the name and face to print beside it. `rating.ts` knows only
 * logins on purpose — the rating is arithmetic over rounds, not a directory — so
 * the display fields are joined back on here, from the season that produced it.
 */
export type LadderRow = LadderEntry & {
  name: string | null;
  avatarUrl: string;
  /**
   * What the season's last round moved this rating, running or finished.
   * `provisionalDelta` is zero once that round completes, so on a Monday it
   * would print nothing beside a week that had just been played.
   */
  lastDelta: number;
};

export type MonthView = {
  /** First of the month, UTC, as an ISO date — the page formats it. */
  start: string;
  rounds: number;
  ranked: LadderRow[];
  unranked: LadderRow[];
  provisionalRound: WeekId | null;
};

export type Board = {
  org: string;
  week: WeekView;
  month: MonthView;
  members: number;
  /** Set when the organization is outside the served size range; the page prints it instead of the views. */
  limit: SizeLimit | null;
  /** False when the season came from the snapshot rather than from GitHub. */
  live: boolean;
};

/**
 * Two ladders, not two windows on one season: the week is the ISO week the last
 * completed UTC day falls in, and the month is that day's calendar month.
 *
 * They come apart for a day or three whenever the 1st falls midweek, since a week
 * belongs to the month holding its Thursday: on Tuesday 1 September the last
 * completed day is in August while the running week is already a September
 * round. Each view is then rated in its own season, which is why `loadSeason`
 * takes weeks rather than a month.
 */
export async function getBoard(
  viewer: Viewer | null,
  org: string,
  now = new Date(),
  excluded: string[] = [],
): Promise<Board> {
  const week = liveWeek(now);
  const month = seasonMonth(now);
  const weekSeason = monthOf(weekThursday(weekStartOf(week)));
  const shared = weekSeason.getTime() === month.getTime();

  const monthWeeks = roundsOf(month, now);
  const weekWeeks = shared ? monthWeeks : roundsOf(weekSeason, now);
  const wanted = shared ? monthWeeks : [...monthWeeks, ...weekWeeks];

  let rounds: Season;

  try {
    rounds = viewer ? await loadSeason(viewer, org, wanted, now) : loadSeasonFixture(org, wanted);
  } catch (cause) {
    if (cause instanceof RosterSizeError) {
      return refused(org, week, month, cause, now);
    }

    throw cause;
  }

  // Ahead of the ladder, the identities and the member count, so an excluded
  // member leaves no trace in any of them.
  const fetched = rosterSize(rounds);

  rounds = withoutExcluded(rounds, excluded);

  const monthRounds = only(rounds, monthWeeks);
  const table = ladder(monthRounds, now);
  // The running week is rated against its own season, so its delta is the one
  // that season will keep — not zero because the month on screen never saw it.
  const weekTable = shared ? table : ladder(only(rounds, weekWeeks), now);
  const named = identities(rounds);
  const members = rosterSize(rounds);

  return {
    org,
    week: weekView(week, rounds, weekTable, now),
    month: {
      start: month.toISOString(),
      rounds: roundsPlayed(table),
      ranked: table.ranked.map((entry) => withIdentity(entry, named)),
      unranked: table.unranked
        // A member enters the ladder at their first active week. `rating.ts` keeps
        // the ones who never had one so the roster stays countable; naming them on
        // a public page as having done nothing is the judgement kleos is not.
        .filter((entry) => entry.lastActiveWeek !== null)
        .map((entry) => withIdentity(entry, named)),
      provisionalRound: table.provisionalRound,
    },
    members,
    // An empty snapshot is no roster at all rather than a small organization, so
    // a tokenless render with nothing to count says nothing about the size. What
    // was fetched decides that, not what survives exclusion: a roster hidden down
    // to nobody was still counted, and is not an absent snapshot.
    limit: viewer || fetched > 0 ? servedLimit(fetched, members) : null,
    live: viewer !== null,
  };
}

/**
 * The ceiling measures the roster fetched and the floor the roster published,
 * because the two limits are there for different reasons: the fan-out is paid
 * for everyone fetched whether or not they are shown, while two people are not a
 * ladder to read. One number for both would also make the verdict depend on the
 * cache — `loadSeason` refuses an oversized organization on the roster it just
 * fetched, so a warm season would render what a cold one turns away.
 */
function servedLimit(fetched: number, published: number): SizeLimit | null {
  return sizeLimit(fetched) === 'too-large' ? 'too-large' : sizeLimit(published);
}

/** First of the month the instant falls in, UTC. */
function monthOf(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), 1));
}

/**
 * The last completed day's month, unless that month has no round yet — then the
 * one before it. A month owns the weeks whose Thursday falls inside it, so its
 * first round can start days after the 1st: on 2 January 2027 the last completed
 * day is 1 January, but January's first round begins on the 4th, and reporting
 * January would blank a December season that has five finished rounds in it.
 */
function seasonMonth(now: Date, limit = 12): Date {
  let month = monthOf(lastCompletedInstant(now));

  for (let step = 0; step < limit && roundsOf(month, now).length === 0; step++) {
    month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1));
  }

  return month;
}

/** A season's rounds so far: its weeks that have at least one completed day. */
function roundsOf(month: Date, now: Date): WeekId[] {
  return seasonWeeks(month).filter((id) => hasCompletedDay(id, now));
}

function only(rounds: Season, weeks: WeekId[]): Season {
  return new Map(weeks.map((week) => [week, rounds.get(week) ?? []]));
}

/**
 * The most recent round that carries a roster. Latest rather than largest, so a
 * member who left is not counted for the sixty days their cached week survives;
 * non-empty rather than simply last, because the fixture only holds the weeks a
 * snapshot captured and the live week goes missing from it the moment the ISO
 * week rolls over — which would otherwise report a local board as having nobody.
 *
 * A suspended account returns a null node and is dropped by `fetchCounts`, so
 * this can run one short. The limits are coarse enough for that not to matter.
 */
function rosterSize(rounds: Season): number {
  for (const members of [...rounds.values()].reverse()) {
    if (members.length > 0) {
      return members.length;
    }
  }

  return 0;
}

/** A refused organization still gets a shaped `Board`, so nothing downstream has to handle a missing one. */
function refused(org: string, week: WeekId, month: Date, cause: RosterSizeError, now: Date): Board {
  const empty: Ladder = { ranked: [], unranked: [], provisionalRound: null };

  return {
    org,
    week: weekView(week, new Map(), empty, now),
    month: {
      start: month.toISOString(),
      rounds: 0,
      ranked: [],
      unranked: [],
      provisionalRound: null,
    },
    members: cause.members,
    limit: cause.limit,
    live: true,
  };
}

/**
 * A week where fewer than two members scored is not a round — `rating.ts` plays
 * no match and records no result — so counting the season's weeks would print
 * "3 rounds played" above a ladder saying nobody has played one.
 */
function roundsPlayed(table: Ladder): number {
  const played = new Set<WeekId>();

  for (const entry of [...table.ranked, ...table.unranked]) {
    for (const result of entry.results) {
      played.add(result.week);
    }
  }

  return played.size;
}

/** Last round wins: a member who changed their display name shows the current one. */
function identities(rounds: Season): Map<string, Contributions> {
  const named = new Map<string, Contributions>();

  for (const members of rounds.values()) {
    for (const member of members) {
      named.set(member.login, member);
    }
  }

  return named;
}

function withIdentity(entry: LadderEntry, named: Map<string, Contributions>): LadderRow {
  const member = named.get(entry.login);

  return {
    ...entry,
    name: member?.name ?? null,
    avatarUrl: member?.avatarUrl ?? '',
    lastDelta: entry.results.at(-1)?.delta ?? 0,
  };
}

/**
 * The round's table, joined from both halves of the same data: the counts come
 * from the season, the place and the delta from the rating that scored it, so the
 * two numbers on a row can never disagree.
 */
function weekView(id: WeekId, rounds: Season, table: Ladder, now: Date): WeekView {
  const start = weekStartOf(id);
  const results = new Map(
    [...table.ranked, ...table.unranked].flatMap((entry) => {
      const result = entry.results.find((round) => round.week === id);

      return result ? [[entry.login, result] as const] : [];
    }),
  );

  const standings = (rounds.get(id) ?? [])
    .map((member) => ({ member, points: score(member) }))
    .filter((row) => row.points > 0)
    .sort((a, b) => b.points - a.points || a.member.login.localeCompare(b.member.login))
    .map(({ member, points }, index) => {
      const result = results.get(member.login);

      // A member alone in a round has no result to look up in `table`.
      return {
        ...member,
        points,
        place: result?.rank ?? index + 1,
        delta: result?.delta ?? 0,
      };
    });

  return {
    id,
    number: Number(id.slice(-2)),
    from: start.toISOString(),
    to: new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    through: lastCompletedInstant(now).toISOString(),
    complete: isComplete(id, now),
    standings,
  };
}
