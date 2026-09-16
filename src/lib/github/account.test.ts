import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAccountType } from './account';
import { GitHubError } from './client';

function respond(status: number, body: unknown = {}, headers: HeadersInit = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers })),
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

/**
 * `Retry-After` is how a secondary limit names its wait, and it is the only wait
 * such a refusal describes — so both forms the header allows have to arrive as
 * seconds, or the caller backs off for a window GitHub never asked for.
 */
describe('the wait a refusal carries', () => {
  it('reads the delay-seconds form', async () => {
    respond(403, {}, { 'retry-after': '60' });

    await expect(fetchAccountType('token', 'enonic')).rejects.toMatchObject({ retryAfter: 60 });
  });

  it('reads the HTTP-date form as the seconds until it', async () => {
    respond(403, {}, { 'retry-after': new Date(Date.now() + 120_000).toUTCString() });

    const cause = await fetchAccountType('token', 'enonic').catch((error: GitHubError) => error);

    // The header carries whole seconds, so the instant it names rounds to 119 or 120.
    expect(cause).toBeInstanceOf(GitHubError);
    expect((cause as GitHubError).retryAfter).toBeGreaterThanOrEqual(119);
    expect((cause as GitHubError).retryAfter).toBeLessThanOrEqual(120);
  });

  // A date already past asks for no wait at all, not a negative one.
  it('never reads a wait as negative', async () => {
    const past = new Date(Date.now() - 60_000).toUTCString();

    respond(403, {}, { 'retry-after': past });

    await expect(fetchAccountType('token', 'enonic')).rejects.toMatchObject({ retryAfter: 0 });
  });

  it('carries no wait when the header is absent', async () => {
    respond(502);

    await expect(fetchAccountType('token', 'enonic')).rejects.toMatchObject({
      retryAfter: undefined,
    });
  });
});
