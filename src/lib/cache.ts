import { env } from 'cloudflare:workers';

import type { Period } from './periods';

const TTL_SECONDS = 6 * 60 * 60;

/**
 * `scope` keeps an authenticated viewer's richer results out of the public entry.
 * Dropping it would leak private contribution counts to anonymous visitors.
 */
function key(org: string, period: Period, scope: string): string {
  return `board:${org.toLowerCase()}:${period}:${scope}`;
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
