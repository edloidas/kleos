import { readBoard, writeBoard } from './cache';
import type { Viewer } from './github/token';
import type { Period } from './periods';
import type { ScoredMember } from './score';
import { rank } from './score';
import { loadContributions } from './source';

export type Board = {
  org: string;
  period: Period;
  members: ScoredMember[];
  cachedAt: string;
  live: boolean;
};

export async function getBoard(viewer: Viewer | null, org: string, period: Period): Promise<Board> {
  const live = viewer !== null;

  /*
   * The cache exists to spare GitHub's rate limit. Fixture data costs nothing to
   * read, so caching it buys nothing and would keep a stale board for the whole
   * TTL after every `pnpm run snapshot`.
   */
  if (!live) {
    const members = rank(await loadContributions(viewer, org, period));

    return { org, period, members, cachedAt: new Date().toISOString(), live };
  }

  const cached = await read(org, period, viewer.scope);

  if (cached) {
    return { org, period, members: cached.value, cachedAt: cached.cachedAt, live };
  }

  const members = rank(await loadContributions(viewer, org, period));

  // An empty board is almost always a misconfiguration; caching it would hide the
  // recovery for six hours. Both cache calls are best-effort: fetched data is
  // worth serving even when KV is unavailable.
  const cachedAt =
    members.length > 0
      ? ((await write(org, period, viewer.scope, members)) ?? new Date().toISOString())
      : new Date().toISOString();

  return { org, period, members, cachedAt, live };
}

async function read(org: string, period: Period, scope: string) {
  try {
    return await readBoard<ScoredMember[]>(org, period, scope);
  } catch {
    return null;
  }
}

async function write(org: string, period: Period, scope: string, members: ScoredMember[]) {
  try {
    return (await writeBoard(org, period, scope, members)).cachedAt;
  } catch {
    return null;
  }
}
