import type { Contributions } from './github/contributions';
import type { Category } from './score';
import { CATEGORIES, contribution, score } from './score';

/**
 * Contributions a category needs before its lead is worth naming. The live week is
 * always partial, so the first days of one produce leads of one over nothing; a
 * badge for that reads as noise beside a real week's work.
 */
export const BADGE_FLOOR = 2;

/** Badges shown at once. More than this stops being a highlight and becomes a second table. */
export const MAX_BADGES = 4;

export type BadgeKind = Category | 'allRounder' | 'riser';

export type Award = { kind: BadgeKind; login: string };

export const BADGES: Record<BadgeKind, { label: string; title: string }> = {
  pullRequests: { label: 'PR Machine', title: 'Most pull requests this week' },
  reviews: { label: 'Gatekeeper', title: 'Most reviews this week' },
  issues: { label: 'Scout', title: 'Most issues opened this week' },
  commits: { label: 'Workhorse', title: 'Most commits this week' },
  allRounder: { label: 'All-Rounder', title: 'Strongest weakest category, across all four' },
  riser: { label: 'Riser', title: 'Biggest gain since last week' },
};

/**
 * Category badges first, heaviest category first, so the badges that state a plain
 * fact about the week come before the two derived ones.
 */
const ORDER: BadgeKind[] = [...CATEGORIES, 'allRounder', 'riser'];

/**
 * The single holder of a value, or nobody. A shared lead awards nothing: two people
 * tied on reviews are not "the" leader, and naming one of them would be arbitrary.
 * Below the floor nobody holds it either, however clear the lead.
 */
function soleLeader<T>(
  members: T[],
  of: (member: T) => number,
  floor = Number.NEGATIVE_INFINITY,
): T | null {
  let best: number | null = null;
  let leader: T | null = null;

  for (const member of members) {
    const value = of(member);

    if (best === null || value > best) {
      best = value;
      leader = member;
    } else if (value === best) {
      leader = null;
    }
  }

  return best !== null && best >= floor ? leader : null;
}

/**
 * Balance alone is not a distinction — one contribution in each category is perfectly
 * even and means nothing — so the floor applies per category and the winner is the
 * member whose *weakest* category is strongest. That rewards being substantial
 * everywhere rather than uniformly slight.
 */
function weakest(member: Contributions): number {
  return Math.min(...CATEGORIES.map((category) => contribution(member, category)));
}

function allRounder(members: Contributions[]): Contributions | null {
  const even = members.filter((member) =>
    CATEGORIES.every((category) => member[category] >= BADGE_FLOOR),
  );

  return soleLeader(even, weakest);
}

/**
 * Measured against the member's own previous round, so it reaches people the
 * category badges never do. Only against a round they were in: somebody the roster
 * gained this week has no baseline, and counting their whole score as a gain would
 * hand them the badge for arriving.
 */
function riser(members: Contributions[], previous: Contributions[] | null): Contributions | null {
  if (!previous) {
    return null;
  }

  const before = new Map(previous.map((member) => [member.login, score(member)]));
  const risen = members.flatMap((member) => {
    const had = before.get(member.login);
    const gain = had === undefined ? 0 : score(member) - had;

    return gain > 0 ? [{ member, gain }] : [];
  });

  return soleLeader(risen, (entry) => entry.gain)?.member ?? null;
}

function holder(
  kind: BadgeKind,
  members: Contributions[],
  previous: Contributions[] | null,
): string | null {
  if (kind === 'allRounder') {
    return allRounder(members)?.login ?? null;
  }

  if (kind === 'riser') {
    return riser(members, previous)?.login ?? null;
  }

  return soleLeader(members, (member) => member[kind], BADGE_FLOOR)?.login ?? null;
}

/**
 * Up to `MAX_BADGES` awards for the live week, in `ORDER`.
 *
 * One badge per person, because the point is to name more of the week than the podium
 * already does — and a member who leads three categories would otherwise take three of
 * the four. A badge whose holder is already carrying one is dropped rather than passed
 * down: the runner-up on pull requests is not the most pull requests, and a badge that
 * says otherwise is false.
 *
 * `members` is the round's active members and `previous` the round before it in the
 * same season, both as `weekView` holds them.
 */
export function awardBadges(
  members: Contributions[],
  previous: Contributions[] | null = null,
): Award[] {
  const awards: Award[] = [];
  const held = new Set<string>();

  for (const kind of ORDER) {
    if (awards.length === MAX_BADGES) {
      break;
    }

    const login = holder(kind, members, previous);

    if (login && !held.has(login)) {
      held.add(login);
      awards.push({ kind, login });
    }
  }

  return awards;
}
