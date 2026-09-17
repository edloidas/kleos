import type { Award, BadgeKind } from './badges';
import type { Contributions } from './github/contributions';
import { PODIUM_SIZE } from './podium';

/** One badge holder's card: the award, and the identity to print it against. */
export type Highlight = {
  kind: BadgeKind;
  login: string;
  name: string | null;
  avatarUrl: string;
};

/**
 * The round's badge holders the podium does not already show.
 *
 * The podium crowns the leading three on points and a badge usually lands on one of
 * them, so repeating those cards a few rows down would name the same people twice and
 * add nothing. What is left is the whole point of the row: the members the ladder
 * passes over. Award order is kept — `awardBadges` has already ordered it.
 *
 * `standings` is the round as `weekView` holds it, sorted, and `awards` the badges it
 * produced from exactly that list, so every holder has a row to take a name and a face
 * from.
 */
export function spotlight(standings: Contributions[], awards: Award[]): Highlight[] {
  const crowned = new Set(standings.slice(0, PODIUM_SIZE).map((member) => member.login));
  const named = new Map(standings.map((member) => [member.login, member]));

  return awards.flatMap((award) => {
    const member = crowned.has(award.login) ? undefined : named.get(award.login);

    return member
      ? [{ kind: award.kind, login: member.login, name: member.name, avatarUrl: member.avatarUrl }]
      : [];
  });
}
