/**
 * How large an organization has to be to get a ladder. Two people are not a
 * ladder, and the fan-out for thousands is not paid for.
 *
 * Its own module rather than part of `orgs.ts`, which reads a binding at import
 * time: this is arithmetic, and keeping it binding-free is what lets the node
 * test project cover it — the same reason `weeks.ts` stands apart.
 */
export const MIN_MEMBERS = 3;
export const MAX_MEMBERS = 100;

export type SizeLimit = 'too-small' | 'too-large';

export function sizeLimit(members: number): SizeLimit | null {
  if (members < MIN_MEMBERS) {
    return 'too-small';
  }

  return members > MAX_MEMBERS ? 'too-large' : null;
}

/**
 * Thrown by `loadSeason` when the roster it just fetched is outside the range,
 * so an oversized organization is refused before its counts are fetched rather
 * than after. On a warm cache no roster is read and nothing throws; the board
 * counts the members itself and reaches the same verdict for nothing.
 */
export class RosterSizeError extends Error {
  constructor(
    readonly members: number,
    readonly limit: SizeLimit,
  ) {
    super(`Roster of ${members} is ${limit}`);
    this.name = 'RosterSizeError';
  }
}
