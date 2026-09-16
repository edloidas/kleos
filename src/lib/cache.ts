import { env } from 'cloudflare:workers';

import type { Scope } from './github/token';
import type { WeekId } from './weeks';
import { nextUtcMidnight } from './weeks';

/** A finished week's counts only change if GitHub rewrites history, so they are held long. */
const WEEK_TTL_SECONDS = 60 * 24 * 60 * 60;

/** KV rejects an expiration less than this far ahead, so the last minute of a day has none to give. */
const MIN_EXPIRATION_SECONDS = 60;

/**
 * `scope` keeps an authenticated viewer's richer results out of the public entry.
 * Dropping it would leak private contribution counts to anonymous visitors.
 *
 * No formula version in the key: these entries hold GitHub's raw counts, not the
 * ladder derived from them, so a scoring change does not invalidate them.
 */
function weekKey(org: string, week: WeekId, scope: Scope): string {
  return `counts:${org.toLowerCase()}:${week}:${scope}`;
}

export async function readWeek<T>(org: string, week: WeekId, scope: Scope): Promise<T | null> {
  return await env.CACHE.get<T>(weekKey(org, week, scope), 'json');
}

/**
 * The live week expires at the next UTC midnight rather than after a duration, so
 * it is refetched once a day at the moment one more day completes — the whole
 * reason a refresh does not move the numbers.
 *
 * Inside the last minute of a day there is no legal expiration left to ask for:
 * KV's floor would push the entry past midnight and serve yesterday's counts into
 * today. Skipping the write costs one uncached request; clamping would be wrong.
 *
 * The deadline comes from `fetchedFor` — the instant the counts were cut off — but
 * is measured against the clock now, because the fetch in between takes seconds and
 * can cross midnight. Reusing the caller's instant for both would ask KV to expire
 * an entry in the past.
 */
export async function writeWeek<T>(
  org: string,
  week: WeekId,
  scope: Scope,
  value: T,
  complete: boolean,
  fetchedFor = new Date(),
): Promise<boolean> {
  if (complete) {
    await env.CACHE.put(weekKey(org, week, scope), JSON.stringify(value), {
      expirationTtl: WEEK_TTL_SECONDS,
    });

    return true;
  }

  const midnight = nextUtcMidnight(fetchedFor);

  if (midnight.getTime() - Date.now() < MIN_EXPIRATION_SECONDS * 1000) {
    return false;
  }

  await env.CACHE.put(weekKey(org, week, scope), JSON.stringify(value), {
    expiration: Math.floor(midnight.getTime() / 1000),
  });

  return true;
}
