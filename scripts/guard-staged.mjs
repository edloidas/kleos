/**
 * Run by nano-staged over the files a commit is about to add. Two things this
 * repository cannot afford in public history: local secrets, and the named
 * per-person contribution counts in the fixture. Both are gitignored, so only a
 * deliberate `git add -f` reaches here — which is exactly the mistake to catch.
 *
 * Deliberately a plain Node script, like ensure-fixture.mjs: scripts/ is outside
 * tsconfig.json so Worker code keeps failing on Node built-ins.
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const NEVER_COMMIT = new Set(['.dev.vars', '.env', 'src/fixtures/boards.json']);

const SECRETS = [
  [/\bgh[pousr]_[A-Za-z0-9]{36,}/, 'a GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{60,}/, 'a GitHub fine-grained token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
];

const failures = [];

for (const file of process.argv.slice(2)) {
  // nano-staged hands over absolute paths; NEVER_COMMIT is written repo-relative.
  const path = relative(process.cwd(), file);

  if (NEVER_COMMIT.has(path)) {
    failures.push(`${path} is gitignored on purpose and must never be committed`);
    continue;
  }

  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    continue; // Binary or unreadable: nothing to scan for.
  }

  for (const [pattern, what] of SECRETS) {
    if (pattern.test(content)) failures.push(`${path} looks like it contains ${what}`);
  }
}

if (failures.length > 0) {
  console.error('pre-commit refused the following:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
