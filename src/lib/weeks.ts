/**
 * ISO weeks in UTC. The week is the ladder's round and the calendar month its
 * season, so everything here is arithmetic on whole UTC days — never a rolling
 * window like `periodRange`, and never local time.
 *
 * Nothing in this module reaches for a binding, which is what lets the node test
 * project cover the cache's expiry math as well as the calendar.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** `YYYY-Www` over the ISO week-numbering year, so 2026-W01 can start in December 2025. */
export type WeekId = string;

const WEEK_ID = /^(\d{4})-W(\d{2})$/;

function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Monday 00:00 UTC of the ISO week holding `date`. */
export function weekStart(date: Date): Date {
  const day = utcMidnight(date);
  // getUTCDay puts Sunday at 0; ISO puts it at 7, at the end of its own week.
  const isoDay = day.getUTCDay() || 7;

  day.setUTCDate(day.getUTCDate() - (isoDay - 1));

  return day;
}

/**
 * The Thursday decides both things a week needs deciding: which year numbers it,
 * and which month owns it as a season round.
 */
export function weekThursday(date: Date): Date {
  const thursday = weekStart(date);

  thursday.setUTCDate(thursday.getUTCDate() + 3);

  return thursday;
}

export function isoWeekId(date: Date): WeekId {
  const thursday = weekThursday(date);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / WEEK_MS) + 1;

  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** January 4th is in week 1 by definition, which is what makes an id invertible. */
export function weekStartOf(id: WeekId): Date {
  const parts = WEEK_ID.exec(id);

  if (!parts) {
    throw new Error(`Not an ISO week id: ${id}`);
  }

  const monday = weekStart(new Date(Date.UTC(Number(parts[1]), 0, 4)));

  monday.setUTCDate(monday.getUTCDate() + (Number(parts[2]) - 1) * 7);

  // A year has 52 or 53 weeks, so W53 of a 52-week year parses into the next
  // year instead of failing. The round trip is what catches it.
  if (isoWeekId(monday) !== id) {
    throw new Error(`No such ISO week: ${id}`);
  }

  return monday;
}

/** GitHub's contributionsCollection takes an inclusive ISO-8601 range. */
export function weekRange(id: WeekId): { from: string; to: string } {
  const from = weekStartOf(id);

  return { from: from.toISOString(), to: new Date(from.getTime() + WEEK_MS - 1).toISOString() };
}

/** The last instant of the most recent completed UTC day. */
export function lastCompletedInstant(now: Date): Date {
  return new Date(utcMidnight(now).getTime() - 1);
}

export function nextUtcMidnight(now: Date): Date {
  return new Date(utcMidnight(now).getTime() + DAY_MS);
}

/**
 * The round still being played. On a Monday the new week holds no completed day,
 * so this is still last week — which is the whole reason it is derived from the
 * last completed instant rather than from `now`.
 */
export function liveWeek(now: Date): WeekId {
  return isoWeekId(lastCompletedInstant(now));
}

export function isComplete(id: WeekId, now: Date): boolean {
  return new Date(weekRange(id).to) <= lastCompletedInstant(now);
}

/** A week nobody has played a day of yet is not a round; the season simply has not reached it. */
export function hasCompletedDay(id: WeekId, now: Date): boolean {
  return weekStartOf(id) <= lastCompletedInstant(now);
}

/**
 * A completed week is fetched whole. The live one stops at the end of yesterday:
 * counting a day still in progress would move the numbers on every refresh.
 */
export function fetchRange(id: WeekId, now: Date): { from: string; to: string } {
  const range = weekRange(id);

  if (isComplete(id, now)) {
    return range;
  }

  return { from: range.from, to: lastCompletedInstant(now).toISOString() };
}

/** The rounds of a month season: the ISO weeks whose Thursday falls inside it. */
export function seasonWeeks(date: Date): WeekId[] {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const weeks: WeekId[] = [];
  const thursday = weekThursday(new Date(Date.UTC(year, month, 1)));

  // The 1st can sit in a week the previous month owns, and then it is not a round here.
  if (thursday.getUTCMonth() !== month) {
    thursday.setUTCDate(thursday.getUTCDate() + 7);
  }

  while (thursday.getUTCFullYear() === year && thursday.getUTCMonth() === month) {
    weeks.push(isoWeekId(thursday));
    thursday.setUTCDate(thursday.getUTCDate() + 7);
  }

  return weeks;
}
