import { env } from 'cloudflare:workers';

import type { Scope } from './github/token';
import type { Period } from './periods';
import { FORMULA_VERSION } from './score';
import type { WeekId } from './weeks';
import { nextUtcMidnight } from './weeks';

const TTL_SECONDS = 6 * 60 * 60;

/** A finished week's counts only change if GitHub rewrites history, so they are held long. */
const WEEK_TTL_SECONDS = 60 * 24 * 60 * 60;

/** KV rejects an expiration less than this far ahead, so the last minute of a day has none to give. */
const MIN_EXPIRATION_SECONDS = 60;

/**
 * `scope` keeps an authenticated viewer's richer results out of the public entry.
 * Dropping it would leak private contribution counts to anonymous visitors.
 *
 * Entries hold scores, not counts, and KV outlives a deploy. Without the formula
 * version a scoring change would serve boards ranked by the old rules for a whole
 * TTL, under a page printing the new ones.
 */
function key(org: string, period: Period, scope: string): string {
  return `board:${FORMULA_VERSION}:${org.toLowerCase()}:${period}:${scope}`;
}

/**
 * No formula version here, unlike the board: these entries hold GitHub's raw
 * counts, which a scoring change does not invalidate. Versioning them would
 * throw away weeks of already-fetched data every time a weight is retuned.
 */
function weekKey(org: string, week: WeekId, scope: Scope): string {
  return `counts:${org.toLowerCase()}:${week}:${scope}`;
}

export type Cached<T> = { value: T; cachedAt: string };

export async function readBoard<T>(
  org: string,
  period: Period,
  scope: string,
): Promise<Cached<T> | null> {
  return await env.CACHE.get<Cached<T>>(key(org, period, scope), 'json');
}

export async function writeBoard<T>(
  org: string,
  period: Period,
  scope: string,
  value: T,
): Promise<Cached<T>> {
  const entry: Cached<T> = { value, cachedAt: new Date().toISOString() };

  await env.CACHE.put(key(org, period, scope), JSON.stringify(entry), {
    expirationTtl: TTL_SECONDS,
  });

  return entry;
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
