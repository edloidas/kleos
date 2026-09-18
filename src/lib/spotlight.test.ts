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
  it('ranks a holder the podium already shows behind one it misses', () => {
    const standings = board('ada', 'bob', 'cy', 'dee');

    expect(logins(standings, awards(['pullRequests', 'ada'], ['commits', 'dee']))).toEqual([
      'dee',
      'ada',
    ]);
  });

  it('counts the third member as crowned, which is where the podium ends', () => {
    const standings = board('ada', 'bob', 'cy', 'dee');

    expect(logins(standings, awards(['reviews', 'cy'], ['commits', 'dee']))).toEqual(['dee', 'cy']);
  });

  it('keeps the order the badges were awarded in', () => {
    const standings = board('ada', 'bob', 'cy', 'dee', 'eve', 'fay');
    const given = awards(['pullRequests', 'fay'], ['commits', 'dee'], ['riser', 'eve']);

    expect(logins(standings, given)).toEqual(['fay', 'dee', 'eve']);
  });

  it('keeps the award order inside the crowned group too', () => {
    const standings = board('ada', 'bob', 'cy', 'dee');
    const given = awards(['pullRequests', 'bob'], ['reviews', 'dee'], ['commits', 'ada']);

    expect(logins(standings, given)).toEqual(['dee', 'bob', 'ada']);
  });

  it('fills the row from the podium when every badge landed on it', () => {
    const standings = board('ada', 'bob', 'cy', 'dee');

    expect(logins(standings, awards(['pullRequests', 'ada'], ['commits', 'bob']))).toEqual([
      'ada',
      'bob',
    ]);
  });

  it('comes back empty when no badge was awarded', () => {
    expect(spotlight(board('ada', 'bob'), [])).toEqual([]);
  });

  it('shows the whole board when the podium fits it entirely', () => {
    const standings = board('ada', 'bob');

    expect(logins(standings, awards(['pullRequests', 'ada'], ['commits', 'bob']))).toEqual([
      'ada',
      'bob',
    ]);
  });

  it('carries the award and the name and face to print it against', () => {
    const standings = board('ada', 'bob', 'cy', 'dee');

    expect(spotlight(standings, awards(['reviews', 'dee'], ['pullRequests', 'ada']))).toEqual([
      {
        kind: 'reviews',
        login: 'dee',
        name: 'DEE',
        avatarUrl: 'https://example.test/dee.png',
      },
      {
        kind: 'pullRequests',
        login: 'ada',
        name: 'ADA',
        avatarUrl: 'https://example.test/ada.png',
      },
    ]);
  });

  it('skips an award for somebody the round never named', () => {
    expect(spotlight(board('ada', 'bob', 'cy', 'dee'), awards(['commits', 'ghost']))).toEqual([]);
  });
});
