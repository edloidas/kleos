import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitHubError } from './github/client';
import type { Viewer } from './github/token';

const kv = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
const github = vi.hoisted(() => ({ fetch: vi.fn() }));

// `cache.ts` reaches for the KV binding, which the node project does not have.
vi.mock('./cache', () => ({ readAccount: kv.read, writeAccount: kv.write }));
vi.mock('./github/account', () => ({ fetchAccountType: github.fetch }));

const { resolveAccount } = await import('./account');

const VIEWER: Viewer = { token: 'test-token', scope: 'public' };

beforeEach(() => {
  vi.clearAllMocks();
  kv.read.mockResolvedValue(null);
  kv.write.mockResolvedValue(undefined);
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

    // The request is what spends the budget, so what it carries is the contract.
    expect(github.fetch).toHaveBeenCalledWith(VIEWER.token, 'enonic');
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
