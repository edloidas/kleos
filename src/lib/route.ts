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

/**
 * The free half of the waitlist decision, read off the route the page takes, so
 * one definition of a well-formed name serves both. Lowercased first because a
 * POST has no canonical URL to send anyone to — which leaves `routeFor` only the
 * two answers below, and `null` where an account lookup has to place the name.
 */
export function waitlistFor(name: string, supported: boolean): 'malformed' | 'enabled' | null {
  const route = routeFor(name.toLowerCase(), supported);

  if (route === null) {
    return null;
  }

  return route.kind === 'board' ? 'enabled' : 'malformed';
}

/**
 * `unknown` means two things, and the waitlist is where they have to be told apart.
 * Nothing asked — no token — accepts, as the page renders the form there. Asked and
 * unanswered does not: a spent rate limit or an outage would otherwise reopen this
 * gate for the length of the window.
 */
export function waitlistForAccount(
  account: Account,
  asked: boolean,
): 'accept' | 'user' | 'missing' | 'unresolved' {
  if (account === 'user') {
    return 'user';
  }

  if (account === 'none') {
    return 'missing';
  }

  return account === 'unknown' && asked ? 'unresolved' : 'accept';
}
