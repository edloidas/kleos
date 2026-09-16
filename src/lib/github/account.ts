import type { BudgetWatcher } from './client';
import { GitHubError, rest } from './client';

/** The two kinds a GitHub login can be; the REST `type` field distinguishes them. */
export type AccountType = 'organization' | 'user';

type UserResponse = { type: string };

/**
 * `null` means GitHub answered that no such login exists, and only a 404 says
 * that. Every other failure is rethrown, so a spent budget or an outage is never
 * read as an absent account — the split `fetchOrgId` already makes.
 */
export async function fetchAccountType(
  token: string,
  name: string,
  onBudget?: BudgetWatcher,
): Promise<AccountType | null> {
  try {
    const data = await rest<UserResponse>(token, `/users/${encodeURIComponent(name)}`, onBudget);

    return data.type === 'Organization' ? 'organization' : 'user';
  } catch (cause) {
    if (cause instanceof GitHubError && cause.status === 404) {
      return null;
    }

    throw cause;
  }
}
