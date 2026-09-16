import { describe, expect, it } from 'vitest';

import { parseCommaList, withoutExcluded } from './exclusions';
import type { Contributions } from './github/contributions';
import type { WeekId } from './weeks';

function member(login: string): Contributions {
  const zero = { commits: 0, pullRequests: 0, reviews: 0, issues: 0, restricted: 0 };

  return { login, name: null, avatarUrl: '', ...zero, overall: zero };
}

function season(entries: Record<string, string[]>): Map<WeekId, Contributions[]> {
  return new Map(
    Object.entries(entries).map(([week, logins]) => [
      week as WeekId,
      logins.map((login) => member(login)),
    ]),
  );
}

function logins(rounds: Map<WeekId, Contributions[]>): Record<string, string[]> {
  return Object.fromEntries(
    [...rounds].map(([week, members]) => [week, members.map((entry) => entry.login)]),
  );
}

describe('parseCommaList', () => {
  it('trims, lowercases and drops empty entries', () => {
    expect(parseCommaList(' Ada , ,GRACE,  ')).toEqual(['ada', 'grace']);
  });

  it('reads an unset variable as excluding nobody', () => {
    expect(parseCommaList(undefined)).toEqual([]);
    expect(parseCommaList('')).toEqual([]);
  });
});

describe('withoutExcluded', () => {
  it('drops the member from every round, not just the latest', () => {
    const rounds = withoutExcluded(
      season({ '2026-W37': ['ada', 'grace'], '2026-W38': ['ada', 'linus'] }),
      ['ada'],
    );

    expect(logins(rounds)).toEqual({ '2026-W37': ['grace'], '2026-W38': ['linus'] });
  });

  it('matches a login whose case differs from the configured entry', () => {
    const rounds = withoutExcluded(season({ '2026-W38': ['AdaLovelace', 'grace'] }), [
      'adalovelace',
    ]);

    expect(logins(rounds)).toEqual({ '2026-W38': ['grace'] });
  });

  it('keeps a round that has no excluded member', () => {
    const rounds = withoutExcluded(season({ '2026-W38': ['grace'] }), ['ada']);

    expect(logins(rounds)).toEqual({ '2026-W38': ['grace'] });
  });

  it('leaves an emptied round in place rather than dropping the week', () => {
    const rounds = withoutExcluded(season({ '2026-W37': ['ada'], '2026-W38': ['grace'] }), ['ada']);

    expect(logins(rounds)).toEqual({ '2026-W37': [], '2026-W38': ['grace'] });
  });

  it('excludes nobody when the list is empty', () => {
    const rounds = withoutExcluded(season({ '2026-W38': ['ada', 'grace'] }), []);

    expect(logins(rounds)).toEqual({ '2026-W38': ['ada', 'grace'] });
  });
});
