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
 * The snapshot goes through the same `fetchContributions` the deployed Worker
 * uses, so the fixture cannot drift from the shape of a real response.
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

import { fetchContributions } from '../src/lib/github/contributions';
import { PERIODS, periodRange } from '../src/lib/periods';

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

for (const org of orgs) {
  const key = org.toLowerCase();
  fixture.orgs[key] = {};

  for (const period of PERIODS) {
    const members = await fetchContributions(token, org, periodRange(period), publicOnly);
    fixture.orgs[key][period] = members;
    console.log(
      `${key}/${period}: ${members.length} members${publicOnly ? ' (public)' : ' (FULL ROSTER)'}`,
    );
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${OUT}`);
