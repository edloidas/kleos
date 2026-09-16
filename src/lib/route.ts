import type { Account } from './account';
import { isLoginShape, isReserved } from './names';

/** `board` carries no status: that path answers 200, 502 or 503 on its own. */
export type Route =
  | { kind: 'redirect'; to: string; status: number }
  | { kind: 'board' }
  | { kind: 'not-enabled'; status: number }
  | { kind: 'not-found'; status: number };

/**
 * Everything the route settles without asking GitHub. `null` is a well-formed,
 * unlisted name — the one case an account lookup has to place.
 */
export function routeFor(name: string, supported: boolean, search = ''): Route | null {
  if (isReserved(name) || !isLoginShape(name)) {
    return { kind: 'not-found', status: 404 };
  }

  const canonical = name.toLowerCase();

  if (name !== canonical) {
    return { kind: 'redirect', to: `/${canonical}${search}`, status: 301 };
  }

  return supported ? { kind: 'board' } : null;
}

/**
 * `unknown` renders as an organization does, because a name nobody could resolve
 * is not a name ruled out. `requested`, where a waitlist signup lands, lifts the
 * status for exactly those — it cannot turn a refusal GitHub answered into a page.
 */
export function routeForAccount(account: Account, requested = false): Route {
  if (account === 'user' || account === 'none') {
    return { kind: 'not-found', status: 404 };
  }

  return { kind: 'not-enabled', status: requested ? 200 : 404 };
}
