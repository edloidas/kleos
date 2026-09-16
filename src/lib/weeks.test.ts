import { describe, expect, it } from 'vitest';

import {
  fetchRange,
  hasCompletedDay,
  isComplete,
  isoWeekId,
  lastCompletedInstant,
  liveWeek,
  nextUtcMidnight,
  seasonWeeks,
  weekRange,
  weekStart,
  weekStartOf,
} from './weeks';

const at = (iso: string) => new Date(iso);

describe('isoWeekId', () => {
  it('numbers a week by the year its Thursday falls in', () => {
    // 2026 opens on a Thursday, so W01 reaches back into December 2025.
    expect(isoWeekId(at('2025-12-29T00:00:00.000Z'))).toBe('2026-W01');
    expect(isoWeekId(at('2026-01-04T23:59:59.999Z'))).toBe('2026-W01');
  });

  it('keeps January in the old year when the Thursday belongs to it', () => {
    expect(isoWeekId(at('2021-01-01T12:00:00.000Z'))).toBe('2020-W53');
  });

  it('numbers an ordinary midweek day', () => {
    expect(isoWeekId(at('2026-09-16T08:24:57.000Z'))).toBe('2026-W38');
  });

  it('reads the same for every instant of one week', () => {
    const ids = ['2026-09-14T00:00:00.000Z', '2026-09-17T13:00:00.000Z', '2026-09-20T23:59:59.999Z']
      .map(at)
      .map(isoWeekId);

    expect(ids).toEqual(['2026-W38', '2026-W38', '2026-W38']);
  });
});

describe('weekStart', () => {
  it('lands on Monday midnight UTC from any day of the week', () => {
    expect(weekStart(at('2026-09-20T23:59:59.999Z')).toISOString()).toBe(
      '2026-09-14T00:00:00.000Z',
    );
    expect(weekStart(at('2026-09-14T00:00:00.000Z')).toISOString()).toBe(
      '2026-09-14T00:00:00.000Z',
    );
  });

  // setUTCDate mutates, so a shared reference would leak between calls.
  it('leaves the caller clock untouched', () => {
    const now = at('2026-09-16T08:00:00.000Z');

    weekStart(now);

    expect(now.toISOString()).toBe('2026-09-16T08:00:00.000Z');
  });
});

describe('weekStartOf', () => {
  it('inverts isoWeekId across a year boundary', () => {
    expect(weekStartOf('2026-W01').toISOString()).toBe('2025-12-29T00:00:00.000Z');
  });

  it('anchors on January 4th, not merely on early January', () => {
    // 2021 and 2027 open on a Friday, so the 3rd still belongs to the old year's
    // last week while the 4th opens the new one. Any other anchor rejects a valid id.
    expect(weekStartOf('2021-W01').toISOString()).toBe('2021-01-04T00:00:00.000Z');
    expect(weekStartOf('2027-W01').toISOString()).toBe('2027-01-04T00:00:00.000Z');
    expect(isoWeekId(at('2021-01-03T12:00:00.000Z'))).toBe('2020-W53');
  });

  it('rejects a week the year does not have', () => {
    // 2026 really has 53 weeks; 2025 does not, and W53 would silently roll forward.
    expect(weekStartOf('2026-W53').toISOString()).toBe('2026-12-28T00:00:00.000Z');
    expect(() => weekStartOf('2025-W53')).toThrow('No such ISO week');
  });

  it('rejects anything that is not a week id', () => {
    expect(() => weekStartOf('2026-38')).toThrow('Not an ISO week id');
    expect(() => weekStartOf('week')).toThrow('Not an ISO week id');
  });
});

describe('weekRange', () => {
  it('spans Monday midnight to the last instant of Sunday', () => {
    expect(weekRange('2026-W38')).toEqual({
      from: '2026-09-14T00:00:00.000Z',
      to: '2026-09-20T23:59:59.999Z',
    });
  });
});

describe('seasonWeeks', () => {
  it('takes the weeks whose Thursday falls in the month', () => {
    expect(seasonWeeks(at('2026-09-16T00:00:00.000Z'))).toEqual([
      '2026-W36',
      '2026-W37',
      '2026-W38',
      '2026-W39',
    ]);
  });

  it('gives a month five rounds when it has five Thursdays', () => {
    expect(seasonWeeks(at('2026-01-15T00:00:00.000Z'))).toEqual([
      '2026-W01',
      '2026-W02',
      '2026-W03',
      '2026-W04',
      '2026-W05',
    ]);
  });

  it('leaves a first-of-month Sunday to the month that owns its Thursday', () => {
    // 2026-02-01 is a Sunday inside 2026-W05, whose Thursday is in January.
    expect(isoWeekId(at('2026-02-01T00:00:00.000Z'))).toBe('2026-W05');
    expect(seasonWeeks(at('2026-02-10T00:00:00.000Z'))).toEqual([
      '2026-W06',
      '2026-W07',
      '2026-W08',
      '2026-W09',
    ]);
  });

  it('reads the month off the given date, not off the day of month', () => {
    expect(seasonWeeks(at('2026-03-01T00:00:00.000Z'))).toEqual(
      seasonWeeks(at('2026-03-31T23:59:59.999Z')),
    );
  });

  it('covers every week of the year exactly once across the twelve seasons', () => {
    const rounds = Array.from({ length: 12 }, (_, month) =>
      seasonWeeks(new Date(Date.UTC(2026, month, 1))),
    ).flat();

    expect(rounds).toEqual([...new Set(rounds)]);
    expect(rounds).toHaveLength(53);
    expect(rounds[0]).toBe('2026-W01');
    expect(rounds.at(-1)).toBe('2026-W53');
  });
});

describe('lastCompletedInstant', () => {
  it('ends at the last millisecond of yesterday', () => {
    expect(lastCompletedInstant(at('2026-09-16T08:24:57.000Z')).toISOString()).toBe(
      '2026-09-15T23:59:59.999Z',
    );
  });

  it('does not count a day that has only just begun', () => {
    expect(lastCompletedInstant(at('2026-09-16T00:00:00.000Z')).toISOString()).toBe(
      '2026-09-15T23:59:59.999Z',
    );
  });
});

describe('liveWeek', () => {
  it('is the current week once it has a completed day', () => {
    expect(liveWeek(at('2026-09-16T08:00:00.000Z'))).toBe('2026-W38');
  });

  it('is still last week on a Monday, which has none', () => {
    // 2026-09-14 is a Monday: the new week holds no completed day yet.
    expect(liveWeek(at('2026-09-14T09:00:00.000Z'))).toBe('2026-W37');
    expect(liveWeek(at('2026-09-15T00:00:00.001Z'))).toBe('2026-W38');
  });
});

describe('isComplete', () => {
  it('is false for the week still being played', () => {
    expect(isComplete('2026-W38', at('2026-09-16T08:00:00.000Z'))).toBe(false);
  });

  it('turns true only once the whole week is behind us', () => {
    expect(isComplete('2026-W38', at('2026-09-20T23:00:00.000Z'))).toBe(false);
    expect(isComplete('2026-W38', at('2026-09-21T00:00:00.000Z'))).toBe(true);
  });
});

describe('hasCompletedDay', () => {
  it('rejects a round the season has not reached', () => {
    expect(hasCompletedDay('2026-W39', at('2026-09-16T08:00:00.000Z'))).toBe(false);
    expect(hasCompletedDay('2026-W38', at('2026-09-16T08:00:00.000Z'))).toBe(true);
  });
});

describe('fetchRange', () => {
  it('takes a completed week whole', () => {
    expect(fetchRange('2026-W37', at('2026-09-16T08:00:00.000Z'))).toEqual({
      from: '2026-09-07T00:00:00.000Z',
      to: '2026-09-13T23:59:59.999Z',
    });
  });

  it('stops the live week at the end of yesterday', () => {
    expect(fetchRange('2026-W38', at('2026-09-16T08:24:57.000Z'))).toEqual({
      from: '2026-09-14T00:00:00.000Z',
      to: '2026-09-15T23:59:59.999Z',
    });
  });

  it('returns the same range all day, so the counts do not move', () => {
    const morning = fetchRange('2026-W38', at('2026-09-16T00:00:00.001Z'));
    const evening = fetchRange('2026-W38', at('2026-09-16T23:59:59.999Z'));

    expect(morning).toEqual(evening);
  });
});

describe('nextUtcMidnight', () => {
  it('is the start of tomorrow', () => {
    expect(nextUtcMidnight(at('2026-09-16T08:24:57.000Z')).toISOString()).toBe(
      '2026-09-17T00:00:00.000Z',
    );
  });

  it('crosses a month boundary', () => {
    expect(nextUtcMidnight(at('2026-09-30T23:59:59.999Z')).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });
});
