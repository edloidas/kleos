import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitHubError } from './github/client';
import type { Contributions } from './github/contributions';
import type { Viewer } from './github/token';

const kv = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
const github = vi.hoisted(() => ({ roster: vi.fn(), counts: vi.fn() }));

// `cache.ts` reaches for the KV binding, which the node project does not have.
vi.mock('./cache', () => ({ readWeek: kv.read, writeWeek: kv.write }));
vi.mock('./github/contributions', () => ({
  fetchRoster: github.roster,
  fetchCounts: github.counts,
}));

const { loadSeason } = await import('./season');

const VIEWER: Viewer = { token: 'test-token', scope: 'public' };
const ROSTER = { orgId: 'O_1', logins: ['ada', 'bob', 'cas'] };

/** The longest `retrying` can sleep: its base delay plus the full jitter. */
const RETRY_CEILING_MS = 600;

/** Wednesday of ISO week 39; week 38 ran 14–20 September and has finished. */
const NOW = new Date('2026-09-23T09:00:00.000Z');
const W38 = '2026-W38';

/** The end of week 38 — where a copy has to reach to be that week's final word. */
const WEEK_END = '2026-09-20T23:59:59.999Z';
/** A copy taken on the Friday, three days short of the week it belongs to. */
const MID_WEEK = '2026-09-17T23:59:59.999Z';

function member(login: string): Contributions {
  const zero = { commits: 0, pullRequests: 0, reviews: 0, issues: 0, restricted: 0 };

  return {
    login,
    name: login.toUpperCase(),
    avatarUrl: `https://example.test/${login}.png`,
    ...zero,
    overall: zero,
  };
}

/** A cache holding one entry for week 38 and nothing else. */
function cached(through: string, counts = [member('ada')]): void {
  kv.read.mockImplementation(async (_org, week) => (week === W38 ? { counts, through } : null));
}

// `resetAllMocks`, not `clearAllMocks`: the latter leaves a queued
// `mockResolvedValueOnce` behind, so one failing test feeds its leftover to the
// next and a single red turns into two.
beforeEach(() => {
  vi.resetAllMocks();
  kv.read.mockResolvedValue(null);
  kv.write.mockResolvedValue(undefined);
  github.roster.mockResolvedValue(ROSTER);
  github.counts.mockResolvedValue([member('bob')]);
});

describe('freshness triage', () => {
  it('serves a copy that already reaches the end of a finished week', async () => {
    cached(WEEK_END);

    const load = await loadSeason(VIEWER, 'acme', [W38], NOW);

    expect(github.counts).not.toHaveBeenCalled();
    expect(load.rounds.get(W38)?.map((m) => m.login)).toEqual(['ada']);
    expect(load.through.get(W38)).toBe(WEEK_END);
    expect(load.stale.size).toBe(0);
  });

  // The reason freshness is judged against `fetchRange` and not `isComplete`: the
  // week has ended either way, so a calendar test would adopt this copy as final
  // and hold it — three days short — for the whole sixty-day term.
  it('refetches a copy cut mid-week once that week has ended', async () => {
    cached(MID_WEEK);

    const load = await loadSeason(VIEWER, 'acme', [W38], NOW);

    expect(github.counts).toHaveBeenCalledTimes(1);
    expect(load.rounds.get(W38)?.map((m) => m.login)).toEqual(['bob']);
    expect(load.through.get(W38)).toBe(WEEK_END);
    expect(load.stale.size).toBe(0);
  });

  it('refetches a live week whose copy stops short of yesterday', async () => {
    const now = new Date('2026-09-16T09:00:00.000Z');

    cached('2026-09-14T23:59:59.999Z');

    const load = await loadSeason(VIEWER, 'acme', [W38], now);

    expect(github.counts).toHaveBeenCalledTimes(1);
    expect(load.through.get(W38)).toBe('2026-09-15T23:59:59.999Z');
  });

  it('stamps a fetched week with the range it was fetched over', async () => {
    const load = await loadSeason(VIEWER, 'acme', [W38], NOW);

    expect(kv.write).toHaveBeenCalledWith('acme', W38, 'public', [member('bob')], WEEK_END);
    expect(load.through.get(W38)).toBe(WEEK_END);
  });
});

describe('falling back on a copy', () => {
  it('serves the stale copy when the counts cannot be fetched', async () => {
    cached(MID_WEEK);
    github.counts.mockRejectedValue(new GitHubError('gone', 503));

    const load = await loadSeason(VIEWER, 'acme', [W38], NOW);

    expect(load.rounds.get(W38)?.map((m) => m.login)).toEqual(['ada']);
    expect(load.through.get(W38)).toBe(MID_WEEK);
    expect(load.stale.has(W38)).toBe(true);
  });

  it('serves the stale copy when the roster cannot be fetched', async () => {
    cached(MID_WEEK);
    github.roster.mockRejectedValue(new GitHubError('gone', 503));

    const load = await loadSeason(VIEWER, 'acme', [W38], NOW);

    expect(load.rounds.get(W38)?.map((m) => m.login)).toEqual(['ada']);
    expect(load.stale.has(W38)).toBe(true);
  });

  // A round the season never had, which is the case the whole-season failure was
  // written for: serving it empty would publish a week nobody worked.
  it('throws when the failing week has no copy at all', async () => {
    github.counts.mockRejectedValue(new GitHubError('gone', 503));

    await expect(loadSeason(VIEWER, 'acme', [W38], NOW)).rejects.toThrow('gone');
  });

  it('throws when the roster fails and a wanted week has no copy', async () => {
    github.roster.mockRejectedValue(new GitHubError('gone', 503));

    await expect(loadSeason(VIEWER, 'acme', [W38], NOW)).rejects.toThrow('gone');
  });

  // Falling back needs a copy for *every* wanted round, not merely one of them:
  // serving the rest around a hole is the board the whole-season failure forbids.
  it('throws when the roster fails and only some wanted weeks have a copy', async () => {
    cached(MID_WEEK);
    github.roster.mockRejectedValue(new GitHubError('gone', 503));

    await expect(loadSeason(VIEWER, 'acme', ['2026-W37', W38], NOW)).rejects.toThrow('gone');
  });
});

/** Drives the retry's backoff rather than waiting out its 300-600ms of real time. */
async function settled<T>(pending: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(RETRY_CEILING_MS);

  return await pending;
}

describe('retry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('retries a 5xx once and keeps the second answer', async () => {
    github.counts
      .mockRejectedValueOnce(new GitHubError('bad gateway', 502))
      .mockResolvedValueOnce([member('cas')]);

    const load = await settled(loadSeason(VIEWER, 'acme', [W38], NOW));

    expect(github.counts).toHaveBeenCalledTimes(2);
    expect(load.rounds.get(W38)?.map((m) => m.login)).toEqual(['cas']);
    expect(load.stale.size).toBe(0);
  });

  it('retries a timeout, which never became a GitHubError', async () => {
    // The shape `AbortSignal.timeout` really rejects with.
    const timeout = new DOMException('timed out', 'TimeoutError');

    github.counts.mockRejectedValueOnce(timeout).mockResolvedValueOnce([member('cas')]);

    const load = await settled(loadSeason(VIEWER, 'acme', [W38], NOW));

    expect(github.counts).toHaveBeenCalledTimes(2);
    expect(load.rounds.get(W38)?.map((m) => m.login)).toEqual(['cas']);
  });

  // GraphQL reports a spent budget as a synthetic 502, so the status alone would
  // send kleos straight back at an API that just refused it.
  it('does not retry a refusal wearing a 5xx status', async () => {
    cached(MID_WEEK);
    github.counts.mockRejectedValue(new GitHubError('rate limited', 502, true));

    const load = await loadSeason(VIEWER, 'acme', [W38], NOW);

    expect(github.counts).toHaveBeenCalledTimes(1);
    expect(load.stale.has(W38)).toBe(true);
  });

  it('does not retry a 4xx', async () => {
    cached(MID_WEEK);
    github.counts.mockRejectedValue(new GitHubError('forbidden', 403));

    const load = await loadSeason(VIEWER, 'acme', [W38], NOW);

    expect(github.counts).toHaveBeenCalledTimes(1);
    expect(load.stale.has(W38)).toBe(true);
  });
});

describe('the shape it hands back', () => {
  // The later week is cached and lands during the freshness pass, the earlier one
  // is fetched after it. Without the rebuild they would come back the other way up.
  it('keeps the rounds in the order they were asked for', async () => {
    cached(WEEK_END);

    const load = await loadSeason(VIEWER, 'acme', ['2026-W37', W38], NOW);

    expect([...load.rounds.keys()]).toEqual(['2026-W37', W38]);
  });

  it('returns an empty season without touching GitHub', async () => {
    const load = await loadSeason(VIEWER, 'acme', [], NOW);

    expect(load.rounds.size).toBe(0);
    expect(github.roster).not.toHaveBeenCalled();
  });

  it('survives a cache that throws on read', async () => {
    kv.read.mockRejectedValue(new Error('KV is down'));

    const load = await loadSeason(VIEWER, 'acme', [W38], NOW);

    expect(load.rounds.get(W38)?.map((m) => m.login)).toEqual(['bob']);
  });

  it('serves the counts even when the cache cannot store them', async () => {
    kv.write.mockRejectedValue(new Error('KV is down'));

    const load = await loadSeason(VIEWER, 'acme', [W38], NOW);

    expect(load.rounds.get(W38)?.map((m) => m.login)).toEqual(['bob']);
  });
});
