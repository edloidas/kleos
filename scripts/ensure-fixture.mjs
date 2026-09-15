/**
 * Guarantees src/fixtures/boards.json exists so the build never breaks on a fresh
 * clone. The file is gitignored: it holds named per-person contribution counts,
 * and this repository is public.
 *
 * With --strict (used by build, preview and deploy) it also refuses a snapshot
 * taken with --full. Such a fixture contains members who hid their organization
 * membership, and a static import would compile them into the deployed Worker.
 *
 * Deliberately offline. Refreshing the data is `pnpm run snapshot <org>`, so local
 * data stays deterministic and CI never needs a token.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../src/fixtures/boards.json');
const strict = process.argv.includes('--strict');

if (!existsSync(target)) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, '{}\n');
  console.log('created empty src/fixtures/boards.json — run `pnpm run snapshot <org>` to fill it');
} else if (strict) {
  const { meta } = JSON.parse(readFileSync(target, 'utf8'));

  if (meta?.roster === 'full') {
    console.error(
      'refusing to build: src/fixtures/boards.json was taken with --full and contains members\n' +
        'who hid their organization membership. Re-run `pnpm run snapshot <org>` without --full.',
    );
    process.exit(1);
  }
}
