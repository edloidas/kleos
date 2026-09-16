import { readAccount, readLookupGate, writeAccount, writeLookupGate } from './cache';
import type { AccountType } from './github/account';
import { fetchAccountType } from './github/account';
import type { Budget } from './github/client';
import { GitHubError } from './github/client';
import type { Viewer } from './github/token';

/**
 * What a login turned out to be. `none` is GitHub answering that it does not
 * exist; `unknown` is nobody having been able to ask.
 */
export type Account = AccountType | 'none' | 'unknown';

/** Only answers GitHub actually gave are cached, so `unknown` is not among them. */
const STORED = new Set<string>(['organization', 'user', 'none']);

/**
 * REST calls held back for the roster path once name resolution stops asking. A
 * cold week costs it `fetchOrgId` plus one page of members, far under this — the
 * point is that resolving names can never be why a board fails.
 */
export const RESERVE = 500;

export function belowReserve(budget: Budget): boolean {
  return budget.remaining <= RESERVE;
}

/** Assumed wait when a refusal names none; the gate widens it to its own floor. */
const DEFAULT_BACKOFF_SECONDS = 60;

/**
 * No token means no lookup rather than a guess, so local development answers
 * `unknown`.
 *
 * `allow` is the caller's throttle, asked rather than passed: it is a counter, and
 * spending from it is only honest at the point a request is about to be made. Every
 * cheaper answer — no token, a cached type, a closed gate — is settled first, so an
 * allowance measured in lookups is charged for lookups.
 */
export async function resolveAccount(
  viewer: Viewer | null,
  name: string,
  allow?: () => Promise<boolean>,
): Promise<Account> {
  if (!viewer) {
    return 'unknown';
  }

  const cached = await read(name);

  if (cached) {
    return cached;
  }

  if (await lookupGateClosed()) {
    return 'unknown';
  }

  if (allow && !(await allow())) {
    return 'unknown';
  }

  let account: Account;
  // Held on an object rather than in a plain `let`: only the callback assigns it,
  // so a variable narrows to `never` by the time the reserve is read.
  const seen: { budget: Budget | null } = { budget: null };

  try {
    account =
      (await fetchAccountType(viewer.token, name, (budget) => {
        seen.budget = budget;
      })) ?? 'none';
  } catch (cause) {
    // A lookup that failed is not a login that is missing: cached, it would hide
    // a real account for the whole day the entry lives.
    console.error(`account lookup failed for ${name}:`, cause);

    // The headers are read before the response is judged, so a refusal reports the
    // budget as an answer does and is worth the same look.
    await closeIfSpent(seen.budget, cause);

    return 'unknown';
  }

  await closeIfSpent(seen.budget, null);

  // Best-effort, as the week entries are: an answer worth serving is worth
  // serving when KV is down.
  try {
    await writeAccount(name, account);
  } catch {
    // Left uncached; the next request pays for it again.
  }

  return account;
}

async function read(name: string): Promise<Account | null> {
  try {
    const value = await readAccount(name);

    return value && STORED.has(value) ? (value as Account) : null;
  } catch {
    return null;
  }
}

/**
 * Whether lookups are paused for everyone. Exported because a caller that has to
 * explain itself needs to tell a paused lookup apart from one GitHub refused.
 *
 * Unreadable reads open, as the account entries do: KV being down is not a refusal.
 */
export async function lookupGateClosed(): Promise<boolean> {
  try {
    return await readLookupGate();
  } catch {
    return false;
  }
}

/**
 * The budget decides, because the budget is what the gate protects. A secondary
 * limit is the one refusal that says nothing about it — GitHub asks for a short wait
 * and leaves the window untouched — so that one is held for the seconds it named
 * rather than for a reset it does not describe.
 */
async function closeIfSpent(budget: Budget | null, cause: unknown): Promise<void> {
  if (budget && belowReserve(budget)) {
    await close(budget.reset);

    return;
  }

  if (cause instanceof GitHubError && cause.rateLimited) {
    await close(now() + (cause.retryAfter ?? DEFAULT_BACKOFF_SECONDS));
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

async function close(until: number): Promise<void> {
  try {
    await writeLookupGate(until);
  } catch {
    // Left open; the next request asks GitHub again and closes it then.
  }
}
