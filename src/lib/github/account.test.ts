import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAccountType } from './account';
import { GitHubError } from './client';

function respond(status: number, body: unknown = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAccountType', () => {
  it('reads an organization off the type field', async () => {
    respond(200, { type: 'Organization' });

    await expect(fetchAccountType('token', 'enonic')).resolves.toBe('organization');
  });

  it('reads anything else as a user', async () => {
    respond(200, { type: 'User' });

    await expect(fetchAccountType('token', 'edloidas')).resolves.toBe('user');
  });

  it('answers null when GitHub says there is no such login', async () => {
    respond(404, { message: 'Not Found' });

    await expect(fetchAccountType('token', 'nobody')).resolves.toBeNull();
  });

  /**
   * The split the cache rests on: a 404 is an answer and gets stored, everything
   * else is a failure and must reach the caller, or a spent hour would be held
   * as a missing account for the whole day the entry lives.
   */
  it('rethrows a spent budget rather than reporting an absent account', async () => {
    respond(429);

    await expect(fetchAccountType('token', 'enonic')).rejects.toThrow(GitHubError);
  });

  it('rethrows an outage the same way', async () => {
    respond(502);

    await expect(fetchAccountType('token', 'enonic')).rejects.toThrow(GitHubError);
  });

  it('asks for the login it was given, with the token it was given', async () => {
    respond(200, { type: 'User' });

    await fetchAccountType('token-1', 'Some-User');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/users/Some-User',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );
  });
});
