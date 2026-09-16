/**
 * Writes src/fixtures/boards.json so local development needs no GitHub token.
 *
 * The token is borrowed from the `gh` CLI, which keeps it in the system keychain,
 * or taken from GITHUB_TOKEN when set. It lives in this process's memory only —
 * never printed, never written to disk.
 *
 * A `gh` token can see the organization's private repositories, so its counts run
 * higher than the deployed site's. Pass the same scopeless token production uses
 * through GITHUB_TOKEN for a snapshot that matches exactly.
 *
 * The snapshot goes through the same `fetchRoster` and `fetchCounts` the deployed
 * Worker uses, over the same ISO weeks, so the fixture cannot drift from the shape
 * of a real response.
 *
 * Defaults to the public roster, which is what the deployed site sees, so local
 * data matches the demo. `--full` uses every member the token can reach.
 *
 *   pnpm run snapshot enonic
 *   pnpm run snapshot enonic --full
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchCounts, fetchRoster } from '../src/lib/github/contributions';
import {
  fetchRange,
  hasCompletedDay,
  lastCompletedInstant,
  liveWeek,
  seasonWeeks,
  weekStartOf,
  weekThursday,
} from '../src/lib/weeks';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/fixtures/boards.json');

function githubToken(): string {
  const supplied = process.env.GITHUB_TOKEN;

  if (supplied) {
    return supplied;
  }

  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error('Could not read a token from `gh`. Run `gh auth login` first.');
  }
}

const args = process.argv.slice(2);
const publicOnly = !args.includes('--full');
const orgs = args.filter((arg) => !arg.startsWith('--'));

if (orgs.length === 0) {
  console.error('usage: pnpm run snapshot <org> [org...] [--full]');
  process.exit(2);
}

const token = githubToken();
const fixture = {
  // `ensure-fixture --strict` refuses a full-roster snapshot, so a laptop build
  // cannot bundle members who hid their organization membership.
  meta: { roster: publicOnly ? 'public' : 'full', takenAt: new Date().toISOString() },
  orgs: {} as Record<string, Record<string, unknown>>,
};

/*
 * Both seasons the page can ask for, deduplicated. Around a 1st that falls
 * midweek the week view and the month view sit in different months, and a
 * snapshot holding only one of them renders the other as empty rounds.
 */
const now = new Date();
const rounds = (month: Date) => seasonWeeks(month).filter((week) => hasCompletedDay(week, now));
const weekSeason = rounds(monthOf(weekThursday(weekStartOf(liveWeek(now)))));
const monthSeason = rounds(monthOf(lastCompletedInstant(now)));
const season = [...new Set([...monthSeason, ...weekSeason])].sort();

function monthOf(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), 1));
}

for (const org of orgs) {
  const key = org.toLowerCase();
  fixture.orgs[key] = {};

  // One roster for every round, as the Worker does: the weeks differ only by range.
  const roster = await fetchRoster(token, org, publicOnly);

  if (!roster) {
    console.error(`${key}: no such organization; weeks not taken`);
    continue;
  }

  const weeks: Record<string, unknown> = {};

  for (const week of season) {
    const members = await fetchCounts(token, roster, fetchRange(week, now));
    weeks[week] = members;
    console.log(
      `${key}/${week}: ${members.length} members${publicOnly ? ' (public)' : ' (FULL ROSTER)'}`,
    );
  }

  fixture.orgs[key].weeks = weeks;
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${OUT}`);
