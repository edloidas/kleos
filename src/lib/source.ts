import fixture from '../fixtures/boards.json';
import type { Contributions } from './github/contributions';
import { fetchContributions } from './github/contributions';
import type { Viewer } from './github/token';
import type { Period } from './periods';

type Fixture = {
  meta?: { roster: 'public' | 'full'; takenAt: string };
  orgs?: Record<string, Partial<Record<Period, Contributions[]>>>;
};

/**
 * With a token, live GitHub — restricted to public members, because the deployed
 * site must not be able to publish someone who hid their membership even if it is
 * handed a broader credential.
 *
 * Without a token, the local snapshot. That is how development runs, so no secret
 * has to sit on a developer's disk. `scripts/snapshot.ts` produces it through this
 * same `fetchContributions`, so its shape cannot drift from the real response.
 */
export async function loadContributions(
  viewer: Viewer | null,
  org: string,
  period: Period,
): Promise<Contributions[]> {
  if (viewer) {
    return await fetchContributions(viewer.token, org, period, true);
  }

  return (fixture as Fixture).orgs?.[org.toLowerCase()]?.[period] ?? [];
}
