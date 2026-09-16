import type { Contributions } from './github/contributions';
import type { WeekId } from './weeks';

/**
 * Binding-free so the node test project can reach it: `orgs.ts` reads the
 * environment at import time and is unreachable from there, the same reason
 * `roster.ts` stands apart.
 */
export function parseCommaList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Drops the excluded members from every round. `excluded` is already lowercased
 * by `parseCommaList`; the login is lowercased here to match, because GitHub
 * returns a login in the case its owner chose and an operator will not guess it.
 */
export function withoutExcluded(
  rounds: Map<WeekId, Contributions[]>,
  excluded: string[],
): Map<WeekId, Contributions[]> {
  if (excluded.length === 0) {
    return rounds;
  }

  const dropped = new Set(excluded);

  return new Map(
    [...rounds].map(([week, members]) => [
      week,
      members.filter((member) => !dropped.has(member.login.toLowerCase())),
    ]),
  );
}
