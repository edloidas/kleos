import type { Cached } from './cache';
import { readWeek, writeWeek } from './cache';
import { GitHubError } from './github/client';
import type { Contributions, Roster } from './github/contributions';
import { fetchCounts, fetchRoster } from './github/contributions';
import type { Viewer } from './github/token';
import { RosterSizeError, sizeLimit } from './roster';
import type { WeekId } from './weeks';
import { fetchRange } from './weeks';

/**
 * Weeks in flight at once. A request costs one GraphQL point whatever its window,
 * so this is not a rate-limit budget — it caps how many connections one render
 * opens and how much work GitHub is asked to do in parallel.
 */
const MAX_IN_FLIGHT = 5;

/** The one retry waits this long, plus up to as much again, so a burst re-spreads. */
const RETRY_DELAY_MS = 300;

export type Season = Map<WeekId, Contributions[]>;

/**
 * A loaded season: the rounds, the instant each one's counts were cut off at, and
 * the rounds served from a copy older than a fetch now would have returned.
 *
 * The stamps ride beside `rounds` rather than inside it, so `ladder`,
 * `withoutExcluded` and everything else downstream keep rating a plain
 * `Map<WeekId, Contributions[]>` and never learn that a round can be stale.
 */
export type SeasonLoad = {
  rounds: Season;
  through: Map<WeekId, string>;
  stale: Set<WeekId>;
};

/**
 * The named rounds, cached per week rather than per board: a completed week is
 * fetched once and reused for the rest of the season, so only the live week costs
 * anything after the first day.
 *
 * The caller names the weeks directly rather than a month, because the week and
 * month views can want different seasons (see `getBoard`).
 */
export async function loadSeason(
  viewer: Viewer,
  org: string,
  weeks: WeekId[],
  now = new Date(),
): Promise<SeasonLoad> {
  const rounds: Season = new Map();
  const through = new Map<WeekId, string>();
  const stale = new Set<WeekId>();

  if (weeks.length === 0) {
    return { rounds, through, stale };
  }

  const cached = new Map<WeekId, Cached<Contributions[]>>();

  await Promise.all(
    weeks.map(async (week) => {
      const entry = await read(org, week, viewer);

      if (entry) {
        cached.set(week, entry);
      }
    }),
  );

  const serve = (week: WeekId, counts: Contributions[], cut: string): void => {
    rounds.set(week, counts);
    through.set(week, cut);
  };

  /** Falls the round back on whatever copy survived, and reports having one. */
  const fallBack = (week: WeekId): boolean => {
    const entry = cached.get(week);

    if (!entry) {
      return false;
    }

    serve(week, entry.counts, entry.through);
    stale.add(week);

    return true;
  };

  // A copy is current when it already reaches as far as a fetch now would. Judged
  // against `fetchRange` and never against `isComplete`: a week that has ended by
  // the calendar says nothing about how far the copy goes, so a copy cut on the
  // Thursday would be adopted as that week's final word and held for the full term.
  const wanted = weeks.filter((week) => {
    const entry = cached.get(week);

    if (!entry || Date.parse(entry.through) < Date.parse(fetchRange(week, now).to)) {
      return true;
    }

    serve(week, entry.counts, entry.through);

    return false;
  });

  if (wanted.length > 0) {
    let found: Roster | null;

    try {
      found = await fetchRoster(viewer.token, org, true);
    } catch (cause) {
      // A roster that cannot be fetched only sinks the season when something still
      // needs fetching with it. Every wanted round holding a copy means the board
      // can be served from what it already had.
      if (wanted.every(fallBack)) {
        return ordered(weeks, rounds, through, stale);
      }

      throw cause;
    }

    // Without a roster the uncached rounds cannot be fetched, and serving them as
    // empty beside the cached ones would not read as an outage — it would read as
    // a week nobody worked, which is a rating the ladder would then publish.
    if (!found) {
      throw new Error(`No GitHub organization ${org}; cannot load its season.`);
    }

    const limit = sizeLimit(found.logins.length);

    if (limit) {
      throw new RosterSizeError(found.logins.length, limit);
    }

    const roster = found;

    await inFlight(wanted, MAX_IN_FLIGHT, async (week) => {
      const range = fetchRange(week, now);

      try {
        const counts = await retrying(() => fetchCounts(viewer.token, roster, range));

        serve(week, counts, range.to);

        // Best-effort: data worth serving is worth serving even when KV is down. An
        // empty week is a real result and still gets cached — a member simply did
        // nothing that week.
        try {
          await writeWeek(org, week, viewer.scope, counts, range.to);
        } catch {
          // Left uncached; the next request pays for it again.
        }
      } catch (cause) {
        // A round the season never had is the case the rule below was written for,
        // and no copy is what makes it unrecoverable.
        if (!fallBack(week)) {
          throw cause;
        }
      }
    });
  }

  return ordered(weeks, rounds, through, stale);
}

/** Rebuilt in round order: the fetched weeks landed in completion order. */
function ordered(
  weeks: WeekId[],
  rounds: Season,
  through: Map<WeekId, string>,
  stale: Set<WeekId>,
): SeasonLoad {
  return { rounds: new Map(weeks.map((week) => [week, rounds.get(week)!])), through, stale };
}

/**
 * One retry, for the failures a second attempt can actually clear. A refusal is not
 * among them, and `rateLimited` is read before the status because `graphql` reports
 * a spent budget as a synthetic 502 — retrying a refusal is what gets a token banned.
 */
async function retrying<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (!worthRetrying(cause)) {
      throw cause;
    }

    await new Promise((resume) => setTimeout(resume, RETRY_DELAY_MS * (1 + Math.random())));

    return await run();
  }
}

function worthRetrying(cause: unknown): boolean {
  if (cause instanceof GitHubError) {
    return !cause.rateLimited && cause.status >= 500;
  }

  // `AbortSignal.timeout` rejects with a `TimeoutError`, which never became a
  // `GitHubError` because no response came back to build one from.
  return cause instanceof Error && cause.name === 'TimeoutError';
}

async function read(
  org: string,
  week: WeekId,
  viewer: Viewer,
): Promise<Cached<Contributions[]> | null> {
  try {
    return await readWeek<Contributions[]>(org, week, viewer.scope);
  } catch {
    return null;
  }
}

/**
 * A worker pool rather than chunked `Promise.all`: chunking waits for the slowest
 * week in each group before starting the next, and the whole point is that a
 * season is five requests deep, not five wide.
 *
 * Rejections propagate, so one failed week fails the season. A ladder missing a
 * round is wrong in a way an error page is not.
 */
async function inFlight<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      await run(items[next++]!);
    }
  });

  await Promise.all(workers);
}
