import { env } from 'cloudflare:workers';

/** Only a shortlist is enabled while the shared token carries everyone's rate limit. */
export function isSupported(org: string): boolean {
  return supportedOrgs().includes(org.toLowerCase());
}

export function supportedOrgs(): string[] {
  return (env.SUPPORTED_ORGS ?? '')
    .split(',')
    .map((org) => org.trim().toLowerCase())
    .filter(Boolean);
}
