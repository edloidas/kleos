import { describe, expect, it } from 'vitest';

import type { Account } from './account';
import { routeFor, routeForAccount, waitlistFor, waitlistForAccount } from './route';

describe('routeFor', () => {
  it('refuses a reserved segment before anything can ask GitHub', () => {
    expect(routeFor('api', false)).toEqual({ kind: 'not-found', status: 404 });
  });

  it('refuses a segment shaped like a file rather than a login', () => {
    expect(routeFor('favicon.ico', false)).toEqual({ kind: 'not-found', status: 404 });
  });

  it('redirects mixed case to the canonical lowercase path', () => {
    expect(routeFor('Enonic', true)).toEqual({ kind: 'redirect', to: '/enonic', status: 301 });
  });

  // Canonical casing is not a privilege of the allowlist: an unlisted name that
  // skipped the redirect would be looked up, and waitlisted, under two spellings.
  it('redirects an unlisted name just the same', () => {
    expect(routeFor('Edloidas', false)).toEqual({
      kind: 'redirect',
      to: '/edloidas',
      status: 301,
    });
  });

  it('carries the query string through the redirect', () => {
    expect(routeFor('Enonic', true, '?period=week')).toEqual({
      kind: 'redirect',
      to: '/enonic?period=week',
      status: 301,
    });
  });

  it('serves a supported organization without a lookup', () => {
    expect(routeFor('enonic', true)).toEqual({ kind: 'board' });
  });

  // `null` is the one answer that costs a request; everything above is free.
  it('leaves a well-formed unlisted name for the account lookup', () => {
    expect(routeFor('edloidas', false)).toBeNull();
  });

  it('reserves ahead of redirecting, so a reserved name never redirects first', () => {
    expect(routeFor('API', false)).toEqual({ kind: 'not-found', status: 404 });
  });

  it('reserves ahead of the allowlist too', () => {
    expect(routeFor('api', true)).toEqual({ kind: 'not-found', status: 404 });
  });
});

describe('routeForAccount', () => {
  it('sends an organization to the not-enabled page', () => {
    expect(routeForAccount('organization')).toEqual({ kind: 'not-enabled', status: 404 });
  });

  it('renders an unresolved name as an organization, because it is not ruled out', () => {
    expect(routeForAccount('unknown')).toEqual({ kind: 'not-enabled', status: 404 });
  });

  it('sends a user to the not-found page until the personal page exists', () => {
    expect(routeForAccount('user')).toEqual({ kind: 'not-found', status: 404 });
  });

  it('sends a login GitHub does not have to the same place', () => {
    expect(routeForAccount('none')).toEqual({ kind: 'not-found', status: 404 });
  });

  it('answers 200 where a waitlist signup lands', () => {
    expect(routeForAccount('organization', true)).toEqual({ kind: 'not-enabled', status: 200 });
  });

  // Without a token nothing resolves, so this is the local confirmation page.
  it('answers 200 for an unresolved name too', () => {
    expect(routeForAccount('unknown', true)).toEqual({ kind: 'not-enabled', status: 200 });
  });

  // Otherwise appending the parameter to any name would turn a refusal into a page.
  it('does not let the signup parameter lift a refusal', () => {
    expect(routeForAccount('none', true)).toEqual({ kind: 'not-found', status: 404 });
    expect(routeForAccount('user', true)).toEqual({ kind: 'not-found', status: 404 });
  });
});

describe('waitlistFor', () => {
  it('refuses a reserved segment, as the page does', () => {
    expect(waitlistFor('api', false)).toBe('malformed');
  });

  // Both look like logins and neither is one GitHub can issue.
  it('refuses a name GitHub could not issue', () => {
    expect(waitlistFor('foo--bar', false)).toBe('malformed');
    expect(waitlistFor('trailing-', false)).toBe('malformed');
  });

  it('refuses an empty name', () => {
    expect(waitlistFor('', false)).toBe('malformed');
  });

  it('refuses a name past the 39-character limit, and keeps the last legal one', () => {
    expect(waitlistFor('a'.repeat(40), false)).toBe('malformed');
    expect(waitlistFor('a'.repeat(39), false)).toBeNull();
  });

  // No row for a name that already has a board; the form is never rendered there.
  it('answers enabled for an organization that is already served', () => {
    expect(waitlistFor('enonic', true)).toBe('enabled');
  });

  it('leaves a well-formed unlisted name for the account lookup', () => {
    expect(waitlistFor('edloidas', false)).toBeNull();
  });

  // `routeFor` would redirect these; there is nowhere to redirect a POST to.
  it('reads casing as the page would after its redirect', () => {
    expect(waitlistFor('Enonic', true)).toBe('enabled');
    expect(waitlistFor('Edloidas', false)).toBeNull();
  });
});

describe('waitlistForAccount', () => {
  it('accepts an organization', () => {
    expect(waitlistForAccount('organization', true)).toBe('accept');
  });

  // Without a token nothing resolves, so refusing would close the form locally.
  it('accepts a name nobody was in a position to resolve', () => {
    expect(waitlistForAccount('unknown', false)).toBe('accept');
  });

  // A spent rate limit answers `unknown` too, and accepting there would leave the
  // gate open for the length of the window.
  it('refuses a name the lookup was asked for and could not answer', () => {
    expect(waitlistForAccount('unknown', true)).toBe('unresolved');
  });

  // The case the whole gate exists for.
  it('refuses a user login', () => {
    expect(waitlistForAccount('user', true)).toBe('user');
  });

  it('refuses a login GitHub does not have', () => {
    expect(waitlistForAccount('none', true)).toBe('missing');
  });
});

/**
 * The gate is only worth having while the two agree: a form rendered where the
 * POST refuses is a dead end, and a POST accepting where no form is rendered is
 * how the table fills with junk. A failed lookup is the single deliberate
 * divergence, and it answers 503 rather than dropping the submission silently.
 */
describe('the waitlist and the page', () => {
  // Keyed rather than listed: a fifth `Account` fails to compile here until it is
  // added, where a plain array would just never check it.
  const ACCOUNTS = Object.keys({
    organization: null,
    user: null,
    none: null,
    unknown: null,
  } satisfies Record<Account, null>) as Account[];

  it('accept exactly the same accounts when nothing was asked', () => {
    for (const account of ACCOUNTS) {
      expect([account, waitlistForAccount(account, false) === 'accept']).toEqual([
        account,
        routeForAccount(account).kind === 'not-enabled',
      ]);
    }
  });

  it('diverge on nothing but a lookup that was asked and failed', () => {
    for (const account of ACCOUNTS) {
      expect([account, waitlistForAccount(account, true)]).toEqual([
        account,
        account === 'unknown' ? 'unresolved' : waitlistForAccount(account, false),
      ]);
    }
  });
});
