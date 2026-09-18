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
 * The round's badge holders, the ones the podium already crowns ranked last.
 *
 * The members the ladder passes over are the point of the row, so they take the places
 * first. A holder the podium shows is worth less here — the visitor has just read that
 * name three cards up — but not nothing, and keeping them fills a row `awardBadges` has
 * already capped. Award order holds inside each group; `awardBadges` set it.
 *
 * `standings` is the round as `weekView` holds it, sorted, and `awards` the badges it
 * produced from exactly that list, so every holder has a row to take a name and a face
 * from.
 */
export function spotlight(standings: Contributions[], awards: Award[]): Highlight[] {
  const crowned = new Set(standings.slice(0, PODIUM_SIZE).map((member) => member.login));
  const named = new Map(standings.map((member) => [member.login, member]));

  const cards = awards.flatMap((award) => {
    const member = named.get(award.login);

    return member
      ? [{ kind: award.kind, login: member.login, name: member.name, avatarUrl: member.avatarUrl }]
      : [];
  });

  return [
    ...cards.filter((card) => !crowned.has(card.login)),
    ...cards.filter((card) => crowned.has(card.login)),
  ];
}
