import { env } from 'cloudflare:workers';

import { parseCommaList } from './exclusions';

/** Only a shortlist is enabled while the shared token carries everyone's rate limit. */
export function isSupported(org: string): boolean {
  return supportedOrgs().includes(org.toLowerCase());
}

export function supportedOrgs(): string[] {
  return parseCommaList(env.SUPPORTED_ORGS);
}

/**
 * Members who asked to leave a public ranking. A secret rather than a var in
 * `wrangler.jsonc`: that file is committed and this repository is public, so the
 * list itself would publish who asked to be removed, and when. Unset is an empty
 * list, which excludes nobody.
 */
export function excludedLogins(): string[] {
  return parseCommaList(env.EXCLUDED_LOGINS);
}
