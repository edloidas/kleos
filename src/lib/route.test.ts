import { describe, expect, it } from 'vitest';

import { routeFor, routeForAccount } from './route';

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
