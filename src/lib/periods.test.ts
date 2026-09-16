import { describe, expect, it } from 'vitest';

import { DEFAULT_PERIOD, isPeriod, parsePeriod, periodRange } from './periods';

describe('parsePeriod', () => {
  it('accepts every declared period', () => {
    expect(parsePeriod('week')).toBe('week');
    expect(parsePeriod('month')).toBe('month');
    expect(parsePeriod('year')).toBe('year');
  });

  it('falls back to the default for anything else', () => {
    // Written out, not DEFAULT_PERIOD: 'month' is what a bare /<org> renders.
    expect(parsePeriod(null)).toBe('month');
    expect(parsePeriod('decade')).toBe(DEFAULT_PERIOD);
    expect(parsePeriod('')).toBe(DEFAULT_PERIOD);
    expect(parsePeriod('WEEK')).toBe(DEFAULT_PERIOD);
  });
});

describe('isPeriod', () => {
  it('guards the type without widening it', () => {
    expect(isPeriod('year')).toBe(true);
    expect(isPeriod('fortnight')).toBe(false);
  });
});

describe('periodRange', () => {
  it('ends at the given instant', () => {
    const now = new Date('2026-03-03T09:15:00.000Z');

    expect(periodRange('week', now).to).toBe('2026-03-03T09:15:00.000Z');
  });

  it('counts back across a month boundary', () => {
    const now = new Date('2026-03-03T00:00:00.000Z');

    expect(periodRange('week', now).from).toBe('2026-02-24T00:00:00.000Z');
    expect(periodRange('month', now).from).toBe('2026-02-01T00:00:00.000Z');
    expect(periodRange('year', now).from).toBe('2025-03-03T00:00:00.000Z');
  });

  // The Date is mutated by setUTCDate, so a shared reference would leak between calls.
  it('leaves the caller clock untouched', () => {
    const now = new Date('2026-03-03T00:00:00.000Z');

    periodRange('year', now);

    expect(now.toISOString()).toBe('2026-03-03T00:00:00.000Z');
  });
});
