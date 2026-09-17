import { describe, expect, it } from 'vitest';

import type { Award } from './badges';
import type { Contributions } from './github/contributions';
import { spotlight } from './spotlight';

/** Standings as `weekView` hands them over: sorted, highest points first. */
function board(...names: string[]): Contributions[] {
  const counts = { pullRequests: 0, reviews: 0, issues: 0, commits: 0, restricted: 0 };

  return names.map((login) => ({
    login,
    name: login.toUpperCase(),
    avatarUrl: `https://example.test/${login}.png`,
    overall: counts,
    pullRequests: 0,
    reviews: 0,
    issues: 0,
    commits: 0,
    restricted: 0,
  }));
}

function awards(...pairs: [Award['kind'], string][]): Award[] {
  return pairs.map(([kind, login]) => ({ kind, login }));
}

function logins(standings: Contributions[], given: Award[]): string[] {
  return spotlight(standings, given).map((highlight) => highlight.login);
}

describe('spotlight', () => {
  it('drops a holder the podium already shows', () => {
    const standings = board('ada', 'bob', 'cy', 'dee');

    expect(logins(standings, awards(['pullRequests', 'ada'], ['commits', 'dee']))).toEqual(['dee']);
  });

  it('keeps the fourth member, who is the first the podium misses', () => {
    const standings = board('ada', 'bob', 'cy', 'dee');

    expect(logins(standings, awards(['reviews', 'dee']))).toEqual(['dee']);
  });

  it('keeps the order the badges were awarded in', () => {
    const standings = board('ada', 'bob', 'cy', 'dee', 'eve', 'fay');
    const given = awards(['pullRequests', 'fay'], ['commits', 'dee'], ['riser', 'eve']);

    expect(logins(standings, given)).toEqual(['fay', 'dee', 'eve']);
  });

  it('comes back empty when every badge landed on the podium', () => {
    const standings = board('ada', 'bob', 'cy', 'dee');

    expect(spotlight(standings, awards(['pullRequests', 'ada'], ['commits', 'bob']))).toEqual([]);
  });

  it('comes back empty when no badge was awarded', () => {
    expect(spotlight(board('ada', 'bob'), [])).toEqual([]);
  });

  it('shows nobody on a board the podium fits entirely', () => {
    const standings = board('ada', 'bob');

    expect(spotlight(standings, awards(['pullRequests', 'ada'], ['commits', 'bob']))).toEqual([]);
  });

  it('carries the name and face to print, from the standing itself', () => {
    const standings = board('ada', 'bob', 'cy', 'dee');

    expect(spotlight(standings, awards(['commits', 'dee']))).toEqual([
      {
        kind: 'commits',
        login: 'dee',
        name: 'DEE',
        avatarUrl: 'https://example.test/dee.png',
      },
    ]);
  });

  it('skips an award for somebody the round never named', () => {
    expect(spotlight(board('ada', 'bob', 'cy', 'dee'), awards(['commits', 'ghost']))).toEqual([]);
  });
});
