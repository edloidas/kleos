import { readAccount, writeAccount } from './cache';
import type { AccountType } from './github/account';
import { fetchAccountType } from './github/account';
import type { Viewer } from './github/token';

/**
 * What a login turned out to be. `none` is GitHub answering that it does not
 * exist; `unknown` is nobody having been able to ask.
 */
export type Account = AccountType | 'none' | 'unknown';

/** Only answers GitHub actually gave are cached, so `unknown` is not among them. */
const STORED = new Set<string>(['organization', 'user', 'none']);

/** No token means no lookup rather than a guess, so local development answers `unknown`. */
export async function resolveAccount(viewer: Viewer | null, name: string): Promise<Account> {
  if (!viewer) {
    return 'unknown';
  }

  const cached = await read(name);

  if (cached) {
    return cached;
  }

  let account: Account;

  try {
    account = (await fetchAccountType(viewer.token, name)) ?? 'none';
  } catch (cause) {
    // A lookup that failed is not a login that is missing: cached, it would hide
    // a real account for the whole day the entry lives.
    console.error(`account lookup failed for ${name}:`, cause);

    return 'unknown';
  }

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
