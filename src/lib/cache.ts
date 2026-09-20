import { env } from 'cloudflare:workers';

import type { Scope } from './github/token';
import type { WeekId } from './weeks';

/**
 * Every round is held the same length, running or finished. The live week used to
 * expire at the next UTC midnight so a refresh could not serve yesterday's numbers;
 * `through` now carries that, and carrying it beats expiring because the entry the
 * board falls back on when GitHub is unreachable is the one midnight deleted.
 */
const WEEK_TTL_SECONDS = 60 * 24 * 60 * 60;

/** A cached round: the counts, and the instant they were cut off at. */
export type Cached<T> = { counts: T; through: string };

/**
 * `scope` keeps an authenticated viewer's richer results out of the public entry.
 * Dropping it would leak private contribution counts to anonymous visitors.
 *
 * No formula version in the key: these entries hold GitHub's raw counts, not the
 * ladder derived from them, so a scoring change does not invalidate them. `v2`
 * versions the value shape instead — a reader expecting the bare array the earlier
 * entries hold throws on this one, so a rollback must not be handed them.
 */
function weekKey(org: string, week: WeekId, scope: Scope): string {
  return `counts:v2:${org.toLowerCase()}:${week}:${scope}`;
}

export async function readWeek<T>(
  org: string,
  week: WeekId,
  scope: Scope,
): Promise<Cached<T> | null> {
  return await env.CACHE.get<Cached<T>>(weekKey(org, week, scope), 'json');
}

/**
 * `through` is the caller's, not the clock's: it is the end of the range the counts
 * were actually fetched over, so a reader can tell a copy cut on Thursday from one
 * cut on Sunday without knowing when it was written.
 */
export async function writeWeek<T>(
  org: string,
  week: WeekId,
  scope: Scope,
  value: T,
  through: string,
): Promise<void> {
  const entry: Cached<T> = { counts: value, through };

  await env.CACHE.put(weekKey(org, week, scope), JSON.stringify(entry), {
    expirationTtl: WEEK_TTL_SECONDS,
  });
}

/** A login can be renamed or converted, so the type behind one is held for a day and no longer. */
const ACCOUNT_TTL_SECONDS = 24 * 60 * 60;

/**
 * No scope in the key, unlike the week entries: an account's type is public and
 * reads the same for every viewer.
 */
function accountKey(name: string): string {
  return `account:${name.toLowerCase()}`;
}

export async function readAccount(name: string): Promise<string | null> {
  return await env.CACHE.get(accountKey(name), 'text');
}

export async function writeAccount(name: string, value: string): Promise<void> {
  await env.CACHE.put(accountKey(name), value, { expirationTtl: ACCOUNT_TTL_SECONDS });
}

/** One key for the whole Worker, because the budget it describes is one budget. */
const GATE_KEY = 'gate:lookup';

export async function readLookupGate(): Promise<boolean> {
  return (await env.CACHE.get(GATE_KEY, 'text')) !== null;
}

/** KV rejects an expiration less than this far ahead. */
const MIN_EXPIRATION_SECONDS = 60;

/**
 * KV won't take an expiration under a minute away, and caches a read — a miss
 * included — for about as long again, so a shorter gate may never reach the colo
 * that wrote it. Doubling the floor clears both at once: overshooting costs a few
 * needlessly precise answers, where undershooting silently keeps calling an API
 * that already refused — which is what gets a token banned.
 *
 * A duration, not the instant itself: an instant computed a moment earlier is no
 * longer a minute away by the time KV checks it.
 */
const MIN_GATE_SECONDS = 2 * MIN_EXPIRATION_SECONDS;

export async function writeLookupGate(until: number): Promise<void> {
  const seconds = until - Math.floor(Date.now() / 1000);

  await env.CACHE.put(GATE_KEY, '1', {
    expirationTtl: Math.max(seconds, MIN_GATE_SECONDS),
  });
}
