import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitHubError } from './github/client';
import type { Viewer } from './github/token';

const kv = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  readGate: vi.fn(),
  writeGate: vi.fn(),
}));
const github = vi.hoisted(() => ({ fetch: vi.fn() }));

// `cache.ts` reaches for the KV binding, which the node project does not have.
vi.mock('./cache', () => ({
  readAccount: kv.read,
  writeAccount: kv.write,
  readLookupGate: kv.readGate,
  writeLookupGate: kv.writeGate,
}));
vi.mock('./github/account', () => ({ fetchAccountType: github.fetch }));

const { RESERVE, belowReserve, resolveAccount } = await import('./account');

const VIEWER: Viewer = { token: 'test-token', scope: 'public' };

/** Far enough ahead that nothing under test mistakes it for an expired window. */
const RESET = Math.floor(Date.now() / 1000) + 3600;

/** A throttle that has nothing left to give. */
const denied = async () => false;

/** Stands in for a lookup that spent one call and reported what was left. */
function answers(type: string, remaining: number): void {
  github.fetch.mockImplementation(async (_token, _name, onBudget) => {
    onBudget?.({ remaining, reset: RESET });

    return type;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  kv.read.mockResolvedValue(null);
  kv.write.mockResolvedValue(undefined);
  kv.readGate.mockResolvedValue(false);
  kv.writeGate.mockResolvedValue(true);
});

describe('resolveAccount without a token', () => {
  it('answers unknown without reading or fetching anything', async () => {
    await expect(resolveAccount(null, 'edloidas')).resolves.toBe('unknown');

    expect(kv.read).not.toHaveBeenCalled();
    expect(github.fetch).not.toHaveBeenCalled();
  });
});

describe('resolveAccount with a token', () => {
  it('serves a cached answer without spending a request', async () => {
    kv.read.mockResolvedValue('user');

    await expect(resolveAccount(VIEWER, 'edloidas')).resolves.toBe('user');

    expect(github.fetch).not.toHaveBeenCalled();
  });

  it('fetches on a miss and caches what GitHub said', async () => {
    github.fetch.mockResolvedValue('organization');

    await expect(resolveAccount(VIEWER, 'enonic')).resolves.toBe('organization');

    // The request is what spends the budget, so what it carries is the contract —
    // the watcher included, since that is how the spend is noticed at all.
    expect(github.fetch).toHaveBeenCalledWith(VIEWER.token, 'enonic', expect.any(Function));
    expect(kv.write).toHaveBeenCalledWith('enonic', 'organization');
  });

  it('caches an absent login, because that is a real answer', async () => {
    github.fetch.mockResolvedValue(null);

    await expect(resolveAccount(VIEWER, 'nobody')).resolves.toBe('none');

    expect(kv.write).toHaveBeenCalledWith('nobody', 'none');
  });

  it('ignores a cached value that is not one of the answers', async () => {
    kv.read.mockResolvedValue('organisation');
    github.fetch.mockResolvedValue('organization');

    await expect(resolveAccount(VIEWER, 'enonic')).resolves.toBe('organization');

    expect(github.fetch).toHaveBeenCalled();
  });

  it('falls through to the lookup when KV cannot be read', async () => {
    kv.read.mockRejectedValue(new Error('KV down'));
    github.fetch.mockResolvedValue('organization');

    await expect(resolveAccount(VIEWER, 'enonic')).resolves.toBe('organization');
  });

  it('still answers when the write fails', async () => {
    github.fetch.mockResolvedValue('user');
    kv.write.mockRejectedValue(new Error('KV down'));

    await expect(resolveAccount(VIEWER, 'edloidas')).resolves.toBe('user');
  });
});

/**
 * The reason the answer is a union of four and not three: a rate limit cached as
 * `none` would hide a real account for the whole day the entry lives.
 */
describe('resolveAccount when the lookup fails', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers unknown rather than absent, and caches nothing', async () => {
    github.fetch.mockRejectedValue(new GitHubError('spent', 403, true));

    await expect(resolveAccount(VIEWER, 'enonic')).resolves.toBe('unknown');

    expect(kv.write).not.toHaveBeenCalled();
  });

  it('does the same for an outage', async () => {
    github.fetch.mockRejectedValue(new GitHubError('bad gateway', 502));

    await expect(resolveAccount(VIEWER, 'enonic')).resolves.toBe('unknown');

    expect(kv.write).not.toHaveBeenCalled();
  });
});

/**
 * The throttle is the caller's decision, so the only thing tested here is where it
 * is read: after the cache, before the request. A visitor who has spent their slots
 * is denied a new name, not the answers KV already holds.
 */
describe('resolveAccount when the caller has been throttled', () => {
  it('answers unknown without spending a request', async () => {
    await expect(resolveAccount(VIEWER, 'enonic', denied)).resolves.toBe('unknown');

    expect(github.fetch).not.toHaveBeenCalled();
    expect(kv.write).not.toHaveBeenCalled();
  });

  it('still serves a cached answer, because that costs nothing', async () => {
    kv.read.mockResolvedValue('organization');

    await expect(resolveAccount(VIEWER, 'enonic', denied)).resolves.toBe('organization');
  });

  it('does not close the gate, which describes the budget and not one visitor', async () => {
    await resolveAccount(VIEWER, 'enonic', denied);

    expect(kv.writeGate).not.toHaveBeenCalled();
  });
});

describe('resolveAccount while the budget gate is closed', () => {
  beforeEach(() => {
    kv.readGate.mockResolvedValue(true);
  });

  it('answers unknown without spending a request', async () => {
    await expect(resolveAccount(VIEWER, 'enonic')).resolves.toBe('unknown');

    expect(github.fetch).not.toHaveBeenCalled();
  });

  it('serves a cached answer from ahead of the gate', async () => {
    kv.read.mockResolvedValue('user');

    await expect(resolveAccount(VIEWER, 'edloidas')).resolves.toBe('user');
  });

  // The gate exists to protect the budget, not to survive KV being down.
  it('asks anyway when the gate cannot be read', async () => {
    kv.readGate.mockRejectedValue(new Error('KV down'));
    github.fetch.mockResolvedValue('organization');

    await expect(resolveAccount(VIEWER, 'enonic')).resolves.toBe('organization');
  });
});

describe('resolveAccount closing the gate on the reserve', () => {
  it('closes it when the answer left the budget at the reserve', async () => {
    answers('organization', RESERVE);

    await expect(resolveAccount(VIEWER, 'enonic')).resolves.toBe('organization');

    expect(kv.writeGate).toHaveBeenCalledWith(RESET);
  });

  it('leaves it open one call above the reserve', async () => {
    answers('organization', RESERVE + 1);

    await resolveAccount(VIEWER, 'enonic');

    expect(kv.writeGate).not.toHaveBeenCalled();
  });

  // The answer was paid for either way; withholding it would spend the call twice.
  it('still returns and caches the answer that closed the gate', async () => {
    answers('user', 0);

    await expect(resolveAccount(VIEWER, 'edloidas')).resolves.toBe('user');

    expect(kv.write).toHaveBeenCalledWith('edloidas', 'user');
  });

  it('answers even when the gate cannot be written', async () => {
    answers('organization', 0);
    kv.writeGate.mockRejectedValue(new Error('KV down'));

    await expect(resolveAccount(VIEWER, 'enonic')).resolves.toBe('organization');
  });
});

describe('resolveAccount closing the gate on a refusal', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A refusal reports the budget as an answer does, so the reserve still decides.
  it('closes it until the reset when the refusal reported a spent budget', async () => {
    github.fetch.mockImplementation(async (_token, _name, onBudget) => {
      onBudget?.({ remaining: 0, reset: RESET });

      throw new GitHubError('spent', 429, true, RESET);
    });

    await expect(resolveAccount(VIEWER, 'enonic')).resolves.toBe('unknown');

    expect(kv.writeGate).toHaveBeenCalledWith(RESET);
  });

  /**
   * The case the two windows have to be told apart for: an abuse throttle leaves the
   * budget untouched, so holding the gate for `x-ratelimit-reset` would stop every
   * lookup for the rest of an hour that has 4000 requests left in it.
   */
  it('holds a secondary limit for the seconds it asked for, not the reset', async () => {
    github.fetch.mockImplementation(async (_token, _name, onBudget) => {
      onBudget?.({ remaining: 4873, reset: RESET });

      throw new GitHubError('slow down', 403, true, RESET, 60);
    });

    await resolveAccount(VIEWER, 'enonic');

    const [until] = kv.writeGate.mock.calls[0]!;

    expect(until).toBeLessThan(RESET);
    expect(until).toBeGreaterThanOrEqual(Math.floor(Date.now() / 1000) + 59);
  });

  // Still a refusal to honour, so it backs off; it just cannot back off precisely.
  it('falls back to a short wait when the refusal named no window', async () => {
    github.fetch.mockRejectedValue(new GitHubError('slow down', 403, true));

    await resolveAccount(VIEWER, 'enonic');

    const [until] = kv.writeGate.mock.calls[0]!;

    expect(until).toBeLessThan(RESET);
    expect(until).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  // An outage says nothing about the budget, so it must not cost an hour of lookups.
  it('leaves it open for a failure that is not a spent budget', async () => {
    github.fetch.mockRejectedValue(new GitHubError('bad gateway', 502, false, RESET));

    await resolveAccount(VIEWER, 'enonic');

    expect(kv.writeGate).not.toHaveBeenCalled();
  });
});

describe('resolveAccount charging the throttle', () => {
  it('asks it when a request is about to be made', async () => {
    const allow = vi.fn(async () => true);
    github.fetch.mockResolvedValue('organization');

    await resolveAccount(VIEWER, 'enonic', allow);

    expect(allow).toHaveBeenCalledOnce();
  });

  it('does not ask it for a name already in the cache', async () => {
    const allow = vi.fn(async () => true);
    kv.read.mockResolvedValue('organization');

    await resolveAccount(VIEWER, 'enonic', allow);

    expect(allow).not.toHaveBeenCalled();
  });

  it('does not ask it while the gate is closed', async () => {
    const allow = vi.fn(async () => true);
    kv.readGate.mockResolvedValue(true);

    await resolveAccount(VIEWER, 'enonic', allow);

    expect(allow).not.toHaveBeenCalled();
  });

  // Local development has no token, so every request there would spend a slot.
  it('does not ask it without a token', async () => {
    const allow = vi.fn(async () => true);

    await resolveAccount(null, 'enonic', allow);

    expect(allow).not.toHaveBeenCalled();
  });
});

describe('belowReserve', () => {
  it('is the boundary the gate closes on, inclusive', () => {
    expect(belowReserve({ remaining: RESERVE + 1, reset: RESET })).toBe(false);
    expect(belowReserve({ remaining: RESERVE, reset: RESET })).toBe(true);
  });

  // GitHub reports the count for the window, so zero is reachable and means spent.
  it('reads an exhausted budget as below it', () => {
    expect(belowReserve({ remaining: 0, reset: RESET })).toBe(true);
  });
});
