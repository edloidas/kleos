export const PERIODS = ['week', 'month', 'year'] as const;

export type Period = (typeof PERIODS)[number];

export const DEFAULT_PERIOD: Period = 'month';

const DAYS: Record<Period, number> = {
  week: 7,
  month: 30,
  year: 365,
};

export function isPeriod(value: unknown): value is Period {
  return PERIODS.includes(value as Period);
}

export function parsePeriod(value: string | null): Period {
  return isPeriod(value) ? value : DEFAULT_PERIOD;
}

/** GitHub's contributionsCollection takes an inclusive ISO-8601 range. */
export function periodRange(period: Period, now = new Date()): { from: string; to: string } {
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - DAYS[period]);

  return { from: from.toISOString(), to: to.toISOString() };
}
