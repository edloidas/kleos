/**
 * Backs `pnpm run clean`. The order is the point: deleting node_modules/.vite
 * under a live daemon is what produces the stale-chunk error this clears.
 * CLAUDE.md, "The dev server is a daemon", has the reasoning.
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(file, args) {
  try {
    return execFileSync(file, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    return error.stdout ?? '';
  }
}

function stopDaemon() {
  // Idempotent, and it reports which case it hit, so nothing needs checking first.
  if (run('pnpm', ['exec', 'astro', 'dev', 'stop']).includes('Stopped')) {
    console.log('stopped the astro dev daemon');
  }

  if (run('pnpm', ['exec', 'astro', 'dev', 'status']).includes('Dev server running')) {
    console.error('refusing to continue: the astro dev daemon is still running');
    process.exit(1);
  }
}

/**
 * Orphans only, by ppid — a live `pnpm run preview` still has its shell as a
 * parent. Matching on the inspector port instead would kill that, and would kill
 * anything else on 9229, which is node's own default `--inspect` port.
 */
function orphans() {
  return run('ps', ['-axo', 'pid=,ppid=,command='])
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((match) => match && match[2] === '1')
    .filter((match) => match[3].includes(root) && /workerd|wrangler/.test(match[3]))
    .map((match) => Number(match[1]));
}

function signal(pid, sig) {
  try {
    process.kill(pid, sig);
    return true;
  } catch {
    return false;
  }
}

async function sweepOrphans() {
  let killed = 0;

  // A workerd child reparents when its wrangler parent dies, so it only looks
  // like an orphan after the first pass.
  for (let pass = 0; pass < 2; pass++) {
    const pids = orphans();

    if (pids.length === 0) break;

    for (const pid of pids) signal(pid, 'SIGTERM');
    await new Promise((done) => setTimeout(done, 1500));

    for (const pid of pids) {
      if (signal(pid, 0)) signal(pid, 'SIGKILL');
      if (!signal(pid, 0)) killed++;
    }
  }

  if (killed > 0) console.log(`killed ${killed} orphaned wrangler/workerd process(es)`);
}

function warmCache() {
  // The first `astro dev` on an empty cache always dies on its own reload, having
  // populated the cache. Spend that run here, not on the next `dev`.
  run('pnpm', ['exec', 'astro', 'dev']);
  run('pnpm', ['exec', 'astro', 'dev', 'stop']);
  console.log('warmed the optimizer cache');
}

stopDaemon();
await sweepOrphans();
rmSync(resolve(root, 'node_modules/.vite'), { recursive: true, force: true });
console.log('removed node_modules/.vite');
warmCache();
