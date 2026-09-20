import fixture from '../fixtures/boards.json';
import type { Contributions } from './github/contributions';
import type { SeasonLoad } from './season';
import type { WeekId } from './weeks';
import { fetchRange } from './weeks';

type Fixture = {
  meta?: { roster: 'public' | 'full'; takenAt: string };
  orgs?: Record<string, { weeks?: Record<WeekId, Contributions[]> }>;
};

/**
 * The season's rounds from the snapshot, so the ladder can be developed without a
 * token on disk.
 *
 * A week the fixture does not carry is an empty round rather than a missing one.
 * `loadSeason` throws when it cannot fetch a week, because a ladder missing a
 * round is wrong — but here every week is equally absent, so an empty season
 * renders an empty page instead of an error that says GitHub is down.
 *
 * Nothing here is ever stale: a snapshot is as current as a local board can be, so
 * each round is stamped with the range a fetch would have asked for and the set of
 * stale rounds is empty. That keeps the page's date the same on both paths.
 */
export function loadSeasonFixture(org: string, weeks: WeekId[], now = new Date()): SeasonLoad {
  const stored = (fixture as Fixture).orgs?.[org.toLowerCase()]?.weeks ?? {};

  return {
    rounds: new Map(weeks.map((week) => [week, stored[week] ?? []])),
    through: new Map(weeks.map((week) => [week, fetchRange(week, now).to])),
    stale: new Set(),
  };
}
