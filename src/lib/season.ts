import { readWeek, writeWeek } from './cache';
import type { Contributions, Roster } from './github/contributions';
import { fetchCounts, fetchRoster } from './github/contributions';
import type { Viewer } from './github/token';
import type { WeekId } from './weeks';
import { fetchRange, hasCompletedDay, isComplete, seasonWeeks } from './weeks';

/**
 * Weeks in flight at once. A request costs one GraphQL point whatever its window,
 * so this is not a rate-limit budget — it caps how many connections one render
 * opens and how much work GitHub is asked to do in parallel.
 */
const MAX_IN_FLIGHT = 5;

export type Season = Map<WeekId, Contributions[]>;

/**
 * Every round of `month`'s season, cached per week rather than per board: a
 * completed week is fetched once and reused for the rest of the season, so only
 * the live week costs anything after the first day.
 *
 * Which month to show is the page's decision, so the caller names it.
 */
export async function loadSeason(
  viewer: Viewer,
  org: string,
  month: Date,
  now = new Date(),
): Promise<Season> {
  const weeks = seasonWeeks(month).filter((week) => hasCompletedDay(week, now));

  if (weeks.length === 0) {
    return new Map();
  }

  const season: Season = new Map();

  await Promise.all(
    weeks.map(async (week) => {
      const counts = await read(org, week, viewer);

      if (counts) {
        season.set(week, counts);
      }
    }),
  );

  const missing = weeks.filter((week) => !season.has(week));

  if (missing.length > 0) {
    const roster = await fetchRoster(viewer.token, org, true);

    // Without a roster the uncached rounds cannot be fetched, and serving them as
    // empty beside the cached ones would not read as an outage — it would read as
    // a week nobody worked, which is a rating the ladder would then publish.
    if (!roster) {
      throw new Error(`No GitHub organization ${org}; cannot load its season.`);
    }

    await inFlight(missing, MAX_IN_FLIGHT, async (week) => {
      season.set(week, await load(viewer, org, roster, week, now));
    });
  }

  // Rebuilt in round order: the fetched weeks landed in completion order.
  return new Map(weeks.map((week) => [week, season.get(week)!]));
}

async function load(
  viewer: Viewer,
  org: string,
  roster: Roster,
  week: WeekId,
  now: Date,
): Promise<Contributions[]> {
  const counts = await fetchCounts(viewer.token, roster, fetchRange(week, now));

  // Best-effort, like the board cache: data worth serving is worth serving when
  // KV is unavailable. An empty week is real and gets cached — a member simply
  // did nothing — unlike an empty board, which is almost always misconfiguration.
  try {
    await writeWeek(org, week, viewer.scope, counts, isComplete(week, now), now);
  } catch {
    // Left uncached; the next request pays for it again.
  }

  return counts;
}

async function read(org: string, week: WeekId, viewer: Viewer): Promise<Contributions[] | null> {
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
