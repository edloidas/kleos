import { beforeEach, describe, expect, it, vi } from 'vitest';

// `orgs.ts` is the one place the bindings are read, so the node project can only
// reach it by standing in for the module they come from.
const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('cloudflare:workers', () => ({ env }));

const { excludedLogins, featuredOrgs, isSupported, supportedOrgs } = await import('./orgs');

beforeEach(() => {
  delete env.SUPPORTED_ORGS;
  delete env.FEATURED_ORGS;
  delete env.EXCLUDED_LOGINS;
});

describe('supportedOrgs', () => {
  it('parses the configured list', () => {
    env.SUPPORTED_ORGS = ' Enonic , enonic-playground ';

    expect(supportedOrgs()).toEqual(['enonic', 'enonic-playground']);
  });

  it('supports nothing when the variable is unset', () => {
    expect(supportedOrgs()).toEqual([]);
    expect(isSupported('enonic')).toBe(false);
  });

  it('matches an organization whatever case it arrives in', () => {
    env.SUPPORTED_ORGS = 'enonic';

    expect(isSupported('Enonic')).toBe(true);
    expect(isSupported('acme')).toBe(false);
  });
});

describe('featuredOrgs', () => {
  it('keeps the configured order rather than the supported one', () => {
    env.SUPPORTED_ORGS = 'enonic,anomalyco,pnpm';
    env.FEATURED_ORGS = ' Pnpm , enonic ';

    expect(featuredOrgs()).toEqual(['pnpm', 'enonic']);
  });

  it('drops a name the supported list does not carry', () => {
    env.SUPPORTED_ORGS = 'enonic';
    env.FEATURED_ORGS = 'enonic,acme';

    expect(featuredOrgs()).toEqual(['enonic']);
  });

  it('features nothing when the variable is unset', () => {
    env.SUPPORTED_ORGS = 'enonic';

    expect(featuredOrgs()).toEqual([]);
  });
});

describe('excludedLogins', () => {
  it('parses the configured list', () => {
    env.EXCLUDED_LOGINS = ' AdaLovelace , grace ';

    expect(excludedLogins()).toEqual(['adalovelace', 'grace']);
  });

  // The feature fails open: an unset secret excludes nobody, never everybody.
  it('excludes nobody when the secret is unset', () => {
    expect(excludedLogins()).toEqual([]);
  });

  it('excludes nobody when the secret is set to an empty string', () => {
    env.EXCLUDED_LOGINS = '';

    expect(excludedLogins()).toEqual([]);
  });
});
