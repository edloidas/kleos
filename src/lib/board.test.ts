import { describe, expect, it, vi } from 'vitest';

import type { Contributions } from './github/contributions';
import type { Viewer } from './github/token';
import { RosterSizeError } from './roster';
import { loadSeason } from './season';
import type { SeasonLoad } from './season';
import { fetchRange } from './weeks';

const fixtureWeeks = vi.hoisted(() => ({ value: {} as Record<string, Contributions[]> }));

// The snapshot is what gets stood in for, not `source.ts`: the JSON is gitignored
// and usually empty, and mocking the module instead would test `loadSeasonFixture`
// against a reimplementation of itself. `season.ts` is mocked for a different
// reason — it reaches for the KV binding, which the node project does not have.
//
// A getter, because each test reassigns the weeks after this module is evaluated.
vi.mock('../fixtures/boards.json', () => ({
  get default() {
    return { orgs: { acme: { weeks: fixtureWeeks.value } } };
  },
}));

vi.mock('./season', () => ({ loadSeason: vi.fn() }));

const { getBoard } = await import('./board');

const VIEWER: Viewer = { token: 'test-token', scope: 'public' };
const NOW = new Date('2026-09-16T09:00:00.000Z');

/** Rounds as `loadSeason` hands them back when every one of them is current. */
function loaded(rounds: Map<string, Contributions[]>, now = NOW): SeasonLoad {
  return {
    rounds,
    through: new Map([...rounds.keys()].map((week) => [week, fetchRange(week, now).to])),
    stale: new Set<string>(),
  };
}

function member(login: string, counts: Partial<Contributions> = {}): Contributions {
  const zero = { commits: 0, pullRequests: 0, reviews: 0, issues: 0, restricted: 0 };

  return {
    login,
    name: login.toUpperCase(),
    avatarUrl: `https://example.test/${login}.png`,
    ...zero,
    ...counts,
    overall: zero,
  };
}

describe('getBoard week resolution', () => {
  // Wednesday 16 September 2026 sits in ISO week 38, whose Thursday is 17 Sep.
  it('shows the running week, counted through yesterday', async () => {
    fixtureWeeks.value = { '2026-W38': [member('ada', { pullRequests: 1 })] };

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));

    expect(board.week.id).toBe('2026-W38');
    expect(board.week.number).toBe(38);
    expect(board.week.complete).toBe(false);
    expect(board.week.through).toBe('2026-09-15T23:59:59.999Z');
  });

  // The new week has no completed day yet, so it is not yet a round.
  it('still shows last week on a Monday', async () => {
    fixtureWeeks.value = {};

    const board = await getBoard(null, 'acme', new Date('2026-09-21T06:00:00.000Z'));

    expect(board.week.id).toBe('2026-W38');
    expect(board.week.complete).toBe(true);
  });

  // 1 September 2026 is a Tuesday: the last completed day is 31 August, so the
  // month is still August, while the running week is W36 — whose Thursday is
  // 3 September, making it a September round. The two views come apart here.
  it('shows last month on the 1st while the running week belongs to the next', async () => {
    fixtureWeeks.value = {};

    const board = await getBoard(null, 'acme', new Date('2026-09-01T09:00:00.000Z'));

    expect(board.week.id).toBe('2026-W36');
    expect(board.month.start).toBe('2026-08-01T00:00:00.000Z');
  });

  // The rounds of the month on screen, not of the week's season.
  it('rates the month from its own rounds when the seasons diverge', async () => {
    fixtureWeeks.value = {
      // August rounds, by Thursday: W32-W35.
      '2026-W35': [member('ada', { pullRequests: 2 }), member('bob', { commits: 1 })],
      // A September round, and the running week on 1 September.
      '2026-W36': [member('cas', { pullRequests: 3 }), member('dan', { commits: 2 })],
    };

    const board = await getBoard(null, 'acme', new Date('2026-09-01T09:00:00.000Z'));

    // The week table is W36's, rated inside September's season.
    expect(board.week.standings.map((row) => row.login)).toEqual(['cas', 'dan']);
    expect(board.week.standings[0]!.delta).toBeGreaterThan(0);

    // The ladder is August's, so nobody from W36 is on it.
    expect(board.month.unranked.map((row) => row.login).sort()).toEqual(['ada', 'bob']);
    expect(board.month.rounds).toBe(1);
  });
});

describe('getBoard badges', () => {
  it('awards the live week its badges', async () => {
    fixtureWeeks.value = {
      '2026-W38': [
        member('ada', { pullRequests: 4, reviews: 1 }),
        member('bob', { pullRequests: 1, commits: 6 }),
      ],
    };

    const board = await getBoard(null, 'acme', NOW);

    expect(board.week.badges).toEqual([
      { kind: 'pullRequests', login: 'ada' },
      { kind: 'commits', login: 'bob' },
    ]);
  });

  // W36 opens September's season, so it has no round behind it. W35 is August's, and
  // reaching it would rate a member against a week this view never shows — bob would
  // take a riser for a climb that happened in another season.
  it('never measures a riser against a round outside the week season', async () => {
    fixtureWeeks.value = {
      '2026-W35': [
        member('ada', { pullRequests: 20 }),
        member('bob', { pullRequests: 1 }),
        member('cas', { pullRequests: 1 }),
      ],
      '2026-W36': [
        member('ada', { pullRequests: 20 }),
        member('bob', { pullRequests: 9 }),
        member('cas', { pullRequests: 1 }),
      ],
    };

    const board = await getBoard(null, 'acme', new Date('2026-09-01T09:00:00.000Z'));

    expect(board.week.id).toBe('2026-W36');
    expect(board.week.badges).toEqual([{ kind: 'pullRequests', login: 'ada' }]);
  });
});

describe('getBoard standings', () => {
  // An earlier round with the placings reversed: a standings row that read the
  // member's first result instead of this week's would show bob ahead.
  it('orders by points and carries the delta of this round, not another', async () => {
    fixtureWeeks.value = {
      '2026-W37': [member('ada', { commits: 1 }), member('bob', { pullRequests: 9 })],
      '2026-W38': [
        member('ada', { pullRequests: 3, reviews: 6, issues: 1, commits: 18 }),
        member('bob', { pullRequests: 1, issues: 4, commits: 45 }),
      ],
    };

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));
    const [first, second] = board.week.standings;

    expect(first!.login).toBe('ada');
    expect(second!.login).toBe('bob');
    expect(first!.points).toBeCloseTo(7.0256, 4);
    expect(second!.points).toBeCloseTo(3.8491, 4);

    // Ada lost W37, so she enters W38 rated below bob and gains more than the
    // 12 two equal members would trade; a W37 delta here would be negative.
    expect(first!.delta).toBeGreaterThan(12);
    expect(second!.delta).toBeCloseTo(-first!.delta, 5);
  });

  // Equal points are a tie, and the rating scores a tie at the midrank — 1.5 for
  // two members sharing first — which has to survive onto the row.
  it('carries the rating midrank onto a tied standings row', async () => {
    fixtureWeeks.value = {
      '2026-W38': [member('ada', { commits: 2 }), member('bob', { commits: 2 })],
    };

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));

    expect(board.week.standings.map((row) => row.place)).toEqual([1.5, 1.5]);
  });

  it('leaves an idle member out of the round entirely', async () => {
    fixtureWeeks.value = {
      '2026-W38': [member('ada', { pullRequests: 2 }), member('idle')],
    };

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));

    expect(board.week.standings.map((row) => row.login)).toEqual(['ada']);
  });

  // With nobody to finish against there is no round, so `rating.ts` records no
  // result — the member still has to appear, first, having gained nothing.
  it('places a lone active member first with no rating change', async () => {
    fixtureWeeks.value = { '2026-W38': [member('ada', { commits: 4 })] };

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));

    expect(board.week.standings).toHaveLength(1);
    expect(board.week.standings[0]!.place).toBe(1);
    expect(board.week.standings[0]!.delta).toBe(0);
  });
});

describe('getBoard ladder', () => {
  it('joins display names onto ladder rows the rating never sees', async () => {
    fixtureWeeks.value = {
      '2026-W38': [member('ada', { pullRequests: 2 }), member('bob', { commits: 3 })],
    };

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));
    const rows = [...board.month.ranked, ...board.month.unranked]
      .map((row) => ({ login: row.login, name: row.name, avatarUrl: row.avatarUrl }))
      .sort((a, b) => a.login.localeCompare(b.login));

    expect(rows).toEqual([
      { login: 'ada', name: 'ADA', avatarUrl: 'https://example.test/ada.png' },
      { login: 'bob', name: 'BOB', avatarUrl: 'https://example.test/bob.png' },
    ]);
  });

  it('shows the name from the latest round a renamed member appears in', async () => {
    fixtureWeeks.value = {
      '2026-W37': [{ ...member('ada', { commits: 1 }), name: 'Old Name' }],
      '2026-W38': [{ ...member('ada', { commits: 1 }), name: 'New Name' }],
    };

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));

    expect(board.month.unranked[0]!.name).toBe('New Name');
  });

  // MIN_ROUNDS is 3 and this season has one played round, so nobody is ranked yet.
  it('holds members below the round threshold as unranked', async () => {
    fixtureWeeks.value = {
      '2026-W38': [member('ada', { pullRequests: 2 }), member('bob', { commits: 3 })],
    };

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));

    expect(board.month.ranked).toEqual([]);
    expect(board.month.unranked.map((row) => row.login).sort()).toEqual(['ada', 'bob']);
    expect(board.month.provisionalRound).toBe('2026-W38');
  });

  it('leaves out a member who was never active in the season', async () => {
    fixtureWeeks.value = {
      '2026-W38': [
        member('ada', { pullRequests: 2 }),
        member('bob', { commits: 3 }),
        member('ghost'),
      ],
    };

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));

    expect(board.month.unranked.map((row) => row.login)).not.toContain('ghost');
    // Still on the roster, though — the size limit counts members, not activity.
    expect(board.members).toBe(3);
  });

  it('returns empty views for a season the fixture does not carry', async () => {
    fixtureWeeks.value = {};

    const board = await getBoard(null, 'acme', NOW);

    expect(board.week.standings).toEqual([]);
    expect(board.month.ranked).toEqual([]);
    expect(board.month.unranked).toEqual([]);
    expect(board.live).toBe(false);
  });
});

describe('getBoard season month', () => {
  // A month owns the weeks whose Thursday falls in it, so January 2027's first
  // round starts on the 4th. On the 2nd the last completed day is 1 January, and
  // taking its month would blank a December that has five finished rounds.
  it('falls back to the previous month before its first round begins', async () => {
    fixtureWeeks.value = {
      '2026-W53': [member('ada', { pullRequests: 2 }), member('bob', { commits: 3 })],
    };

    const board = await getBoard(null, 'acme', new Date('2027-01-02T09:00:00.000Z'));

    expect(board.month.start).toBe('2026-12-01T00:00:00.000Z');
    expect(board.month.rounds).toBe(1);
  });

  it('takes the new month once it has a round', async () => {
    fixtureWeeks.value = {};

    const board = await getBoard(null, 'acme', new Date('2027-01-05T09:00:00.000Z'));

    expect(board.month.start).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('getBoard rounds played', () => {
  // Three September weeks have a completed day by the 16th, and counting those
  // would print "3 rounds played" above a ladder saying nobody has played one.
  it('counts no rounds when nobody was active', async () => {
    fixtureWeeks.value = {};

    const board = await getBoard(null, 'acme', NOW);

    expect(board.month.rounds).toBe(0);
  });

  // One scorer is not a match, so `rating.ts` plays no round that week.
  it('does not count a week with a single active member', async () => {
    fixtureWeeks.value = {
      '2026-W37': [member('ada', { commits: 2 }), member('bob')],
      '2026-W38': [member('ada', { commits: 2 }), member('bob', { pullRequests: 1 })],
    };

    const board = await getBoard(null, 'acme', NOW);

    expect(board.month.rounds).toBe(1);
  });
});

describe('getBoard size limits', () => {
  // The roster comes from the most recent round only, so `left` from W37 isn't counted.
  it('counts the roster from the most recent round, not the fullest', async () => {
    fixtureWeeks.value = {
      '2026-W37': [member('ada'), member('bob'), member('cas'), member('left', { commits: 1 })],
      '2026-W38': [member('ada'), member('bob'), member('cas', { commits: 1 })],
    };

    const board = await getBoard(null, 'acme', NOW);

    expect(board.members).toBe(3);
    expect(board.limit).toBeNull();
  });

  // The live week is missing here, as it is from a real fixture the moment the ISO
  // week rolls over, so the roster has to fall back to W37 rather than reading zero.
  it('falls back past an empty round the fixture never captured', async () => {
    fixtureWeeks.value = {
      '2026-W37': [member('ada', { commits: 1 }), member('bob'), member('cas')],
    };

    const board = await getBoard(null, 'acme', NOW);

    expect(board.members).toBe(3);
    expect(board.limit).toBeNull();
  });

  it('rejects an organization below the minimum roster', async () => {
    fixtureWeeks.value = { '2026-W38': [member('ada', { commits: 4 }), member('bob')] };

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));

    expect(board.members).toBe(2);
    expect(board.limit).toBe('too-small');
  });

  it('serves an organization exactly at the maximum roster', async () => {
    fixtureWeeks.value = { '2026-W38': Array.from({ length: 100 }, (_, i) => member(`m${i}`)) };

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));

    expect(board.members).toBe(100);
    expect(board.limit).toBeNull();
  });

  it('rejects an organization above the maximum roster', async () => {
    fixtureWeeks.value = { '2026-W38': Array.from({ length: 101 }, (_, i) => member(`m${i}`)) };

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));

    expect(board.members).toBe(101);
    expect(board.limit).toBe('too-large');
  });

  // Otherwise a developer with no snapshot is told their organization is too
  // small, when the real state is that there is nothing on disk to read.
  it('passes no verdict on an empty snapshot', async () => {
    fixtureWeeks.value = {};

    const board = await getBoard(null, 'acme', new Date('2026-09-16T09:00:00.000Z'));

    expect(board.members).toBe(0);
    expect(board.limit).toBeNull();
  });
});

describe('getBoard last-round delta', () => {
  // `provisionalDelta` is zero once the round completes, so on a Monday the month
  // view would print nothing beside a week that had just been played out.
  it('carries the finished round delta on a Monday', async () => {
    fixtureWeeks.value = {
      '2026-W36': [member('ada', { pullRequests: 2 }), member('bob', { commits: 3 })],
      '2026-W37': [member('ada', { pullRequests: 5 }), member('bob', { commits: 1 })],
      '2026-W38': [member('ada', { pullRequests: 9 }), member('bob', { commits: 1 })],
    };

    const board = await getBoard(null, 'acme', new Date('2026-09-21T06:00:00.000Z'));
    const rows = [...board.month.ranked, ...board.month.unranked];

    expect(board.month.provisionalRound).toBeNull();
    expect(rows.every((row) => row.provisionalDelta === 0)).toBe(true);
    expect(rows.map((row) => Math.abs(row.lastDelta) > 1)).toEqual([true, true]);
  });

  it('matches the provisional delta while the round is still running', async () => {
    fixtureWeeks.value = {
      '2026-W38': [member('ada', { pullRequests: 2 }), member('bob', { commits: 3 })],
    };

    const board = await getBoard(null, 'acme', NOW);
    const rows = [...board.month.ranked, ...board.month.unranked];

    expect(board.month.provisionalRound).toBe('2026-W38');
    expect(rows.map((row) => row.lastDelta)).toEqual(rows.map((row) => row.provisionalDelta));
  });
});

describe('getBoard with a token', () => {
  it('takes the season from GitHub and marks the board live', async () => {
    vi.mocked(loadSeason).mockResolvedValue(
      loaded(
        new Map([
          [
            '2026-W38',
            [
              member('ada', { pullRequests: 2 }),
              member('bob', { commits: 1 }),
              member('cas', { issues: 1 }),
            ],
          ],
        ]),
      ),
    );

    const board = await getBoard(VIEWER, 'acme', NOW);

    expect(board.live).toBe(true);
    expect(board.members).toBe(3);
    expect(board.week.standings).toHaveLength(3);
  });

  // The three fields the stale path puts on the board, together: a round that fell
  // back reports its own cut rather than the clock, the board reports the earliest
  // of them, and a finished round's own week end is not mistaken for a shortfall.
  it('reports how far a fallen-back board actually reaches', async () => {
    const roster = [member('ada', { pullRequests: 2 }), member('bob', { commits: 1 })];

    vi.mocked(loadSeason).mockResolvedValue({
      rounds: new Map([
        ['2026-W36', roster],
        ['2026-W37', roster],
        ['2026-W38', roster],
      ]),
      through: new Map([
        // Cut at its own week end, which is what a finished round always reports.
        ['2026-W36', '2026-09-06T23:59:59.999Z'],
        ['2026-W37', '2026-09-10T23:59:59.999Z'],
        ['2026-W38', '2026-09-14T23:59:59.999Z'],
      ]),
      stale: new Set(['2026-W37', '2026-W38']),
    });

    const board = await getBoard(VIEWER, 'acme', NOW);

    expect(board.stale).toBe(true);
    // The earlier of the two that fell back, not the later one and not W36's end.
    expect(board.through).toBe('2026-09-10T23:59:59.999Z');
    // The running week's own stamp; the clock would have said the 15th.
    expect(board.week.through).toBe('2026-09-14T23:59:59.999Z');
  });

  // The calendar says week 38 finished on the 20th, but the copy stops on the 17th.
  // Calling it final would print "final" directly above a date that contradicts it.
  it('does not call a round final when its copy stops short of the week end', async () => {
    const roster = [member('ada', { pullRequests: 2 }), member('bob', { commits: 1 })];

    vi.mocked(loadSeason).mockResolvedValue({
      rounds: new Map([['2026-W38', roster]]),
      through: new Map([['2026-W38', '2026-09-17T23:59:59.999Z']]),
      stale: new Set(['2026-W38']),
    });

    const board = await getBoard(VIEWER, 'acme', new Date('2026-09-21T09:00:00.000Z'));

    expect(board.week.id).toBe('2026-W38');
    expect(board.week.complete).toBe(false);
    expect(board.week.through).toBe('2026-09-17T23:59:59.999Z');
  });

  it('calls a round final once its copy reaches the week end', async () => {
    const roster = [member('ada', { pullRequests: 2 }), member('bob', { commits: 1 })];

    vi.mocked(loadSeason).mockResolvedValue({
      rounds: new Map([['2026-W38', roster]]),
      through: new Map([['2026-W38', '2026-09-20T23:59:59.999Z']]),
      stale: new Set(),
    });

    const board = await getBoard(VIEWER, 'acme', new Date('2026-09-21T09:00:00.000Z'));

    expect(board.week.complete).toBe(true);
  });

  it('reports a board with nothing stale as reaching yesterday', async () => {
    vi.mocked(loadSeason).mockResolvedValue(
      loaded(new Map([['2026-W38', [member('ada', { pullRequests: 2 })]]])),
    );

    const board = await getBoard(VIEWER, 'acme', NOW);

    expect(board.stale).toBe(false);
    expect(board.through).toBe('2026-09-15T23:59:59.999Z');
  });

  it('refuses a roster the season rejected before fetching it', async () => {
    vi.mocked(loadSeason).mockRejectedValue(new RosterSizeError(4000, 'too-large'));

    const board = await getBoard(VIEWER, 'acme', NOW);

    expect(board.members).toBe(4000);
    expect(board.limit).toBe('too-large');
    expect(board.month.rounds).toBe(0);
    expect(board.week.standings).toEqual([]);
  });

  it('lets any other season failure reach the page', async () => {
    vi.mocked(loadSeason).mockRejectedValue(new Error('GitHub is down'));

    await expect(getBoard(VIEWER, 'acme', NOW)).rejects.toThrow('GitHub is down');
  });

  // The production case for an allowlisted organization whose members are all
  // private: the roster comes back empty and a verdict is owed, unlike the
  // tokenless render where an empty season only means no snapshot on disk.
  it('rejects a live organization with no public members', async () => {
    vi.mocked(loadSeason).mockResolvedValue(loaded(new Map([['2026-W38', []]])));

    const board = await getBoard(VIEWER, 'acme', NOW);

    expect(board.live).toBe(true);
    expect(board.members).toBe(0);
    expect(board.limit).toBe('too-small');
  });
});

describe('getBoard exclusions', () => {
  it('drops an excluded member from the standings, the ladder and the count', async () => {
    fixtureWeeks.value = {
      '2026-W38': [
        member('ada', { pullRequests: 2 }),
        member('bob', { commits: 3 }),
        member('cas', { issues: 1 }),
      ],
    };

    const board = await getBoard(null, 'acme', NOW, ['bob']);

    expect(board.week.standings.map((row) => row.login)).toEqual(['ada', 'cas']);
    expect([...board.month.ranked, ...board.month.unranked].map((row) => row.login)).not.toContain(
      'bob',
    );
    expect(board.members).toBe(2);
  });

  // The filter runs before the rating, so a round the excluded member won is a
  // round the remaining members played among themselves.
  it('re-rates the round without the excluded member rather than hiding the row', async () => {
    fixtureWeeks.value = {
      '2026-W38': [
        member('ada', { pullRequests: 1 }),
        member('bob', { pullRequests: 9 }),
        member('cas', { commits: 1 }),
      ],
    };

    const board = await getBoard(null, 'acme', NOW, ['bob']);
    const [first, second] = board.week.standings;

    expect(first!.login).toBe('ada');
    expect(first!.place).toBe(1);
    expect(second!.delta).toBeCloseTo(-first!.delta, 5);
  });

  it('matches a login whose case differs from the configured entry', async () => {
    fixtureWeeks.value = {
      '2026-W38': [member('AdaLovelace', { pullRequests: 2 }), member('bob', { commits: 3 })],
    };

    const board = await getBoard(null, 'acme', NOW, ['adalovelace']);

    expect(board.week.standings.map((row) => row.login)).toEqual(['bob']);
  });

  it('excludes nobody when no list is configured', async () => {
    fixtureWeeks.value = {
      '2026-W38': [member('ada', { pullRequests: 2 }), member('bob', { commits: 3 })],
    };

    const board = await getBoard(null, 'acme', NOW);

    expect(board.week.standings.map((row) => row.login)).toEqual(['ada', 'bob']);
  });

  // The size verdict is recomputed from the season on every render, so it sees
  // the published roster rather than the one GitHub returned. Three members with
  // one excluded leave two, and two are not a ladder.
  it('refuses a board the exclusion leaves below the minimum roster', async () => {
    fixtureWeeks.value = {
      '2026-W38': [member('ada', { commits: 4 }), member('bob'), member('cas')],
    };

    const board = await getBoard(null, 'acme', NOW, ['cas']);

    expect(board.members).toBe(2);
    expect(board.limit).toBe('too-small');
  });

  // The case `servedLimit` splits the ceiling from the floor for.
  it('keeps refusing an oversized organization the exclusions bring under the cap', async () => {
    fixtureWeeks.value = {
      '2026-W38': Array.from({ length: 101 }, (_, i) => member(`m${i}`)),
    };

    const board = await getBoard(null, 'acme', NOW, ['m0', 'm1']);

    expect(board.members).toBe(99);
    expect(board.limit).toBe('too-large');
  });

  // The boundary between a hidden roster and an absent one, which the tokenless
  // render passes no verdict on.
  it('still refuses an oversized roster the exclusions hide entirely', async () => {
    fixtureWeeks.value = {
      '2026-W38': Array.from({ length: 101 }, (_, i) => member(`m${i}`)),
    };

    const board = await getBoard(
      null,
      'acme',
      NOW,
      Array.from({ length: 101 }, (_, i) => `m${i}`),
    );

    expect(board.members).toBe(0);
    expect(board.limit).toBe('too-large');
  });

  it('excludes from a live season the same way as from the snapshot', async () => {
    vi.mocked(loadSeason).mockResolvedValue(
      loaded(
        new Map([
          [
            '2026-W38',
            [
              member('ada', { pullRequests: 2 }),
              member('bob', { commits: 1 }),
              member('cas', { issues: 1 }),
            ],
          ],
        ]),
      ),
    );

    const board = await getBoard(VIEWER, 'acme', NOW, ['bob']);

    expect(board.week.standings.map((row) => row.login)).toEqual(['ada', 'cas']);
    expect(board.members).toBe(2);
  });
});
