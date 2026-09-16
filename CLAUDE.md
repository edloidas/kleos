# kleos

Contribution leaderboards for GitHub organizations. Astro 7 SSR on Cloudflare Workers, KV for cached boards, D1 for the waitlist.

## Commands

```bash
pnpm run dev       # Astro dev server on :4321 (Node, bindings emulated)
pnpm run preview   # build + wrangler dev on :8787 (real workerd — use before deploying)
pnpm run check     # everything below, in parallel
pnpm run check:types   # wrangler types + astro check
pnpm run check:lint    # oxlint
pnpm run check:format  # oxfmt --check
pnpm run check:test    # both vitest projects
pnpm run format    # oxfmt, writing in place
pnpm run lint      # oxlint --fix
pnpm run test      # both vitest projects
pnpm run test:unit # the node project only
pnpm run deploy    # build + publish
```

## CI and hooks

- Pull requests run `.github/workflows/check.yml`, whose `lint` and `build` jobs run in parallel. Pushes to `master` run `.github/workflows/deploy.yml`, which checks and then `pnpm run deploy` against the `production` environment.
- The workflows use `pnpm exec wrangler` rather than `cloudflare/wrangler-action`, so CI deploys with the wrangler version the lockfile pins. Authentication is `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.
- `pnpm install` runs `prepare`, which sets `core.hooksPath` to `.githooks`.
- Three stages, split by what each costs. **pre-commit** (~1s) runs `nano-staged` over staged files only: `scripts/guard-staged.mjs`, which refuses staged secrets and a force-added fixture, then oxfmt and oxlint. **pre-push** (~10s) runs `astro check` and the unit tests concurrently. **CI** runs everything, and is the only stage that runs the jsdom project.
- The budgets are the design. A check that outgrows its stage moves to the next one rather than making commits slower; that is why the unit tests are on push and not on commit.
- `astro check` reads the working tree, not the staged content, so pre-push verifies what is on disk rather than what is being pushed.

## Constraints

- TypeScript stays on 6. The 7.x native compiler does not expose the programmatic API `astro check` relies on, and `@astrojs/check` peers on `^5 || ^6`. Re-test when Astro ships support; do not upgrade on the strength of the version number.
- `wrangler deploy` does not read `wrangler.jsonc` directly. `astro build` generates `dist/server/wrangler.json` and writes `.wrangler/deploy/config.json` pointing wrangler at it, so an edit to `wrangler.jsonc` takes effect only after the next build. Every deploy path builds first for this reason; a bare `wrangler deploy` ships the previous build's bindings.
- Package manager is pnpm, pinned to a single version by `packageManager` in `package.json`. Not bun, not npm.
- Runtime: Cloudflare Workers (`workerd`), not Node. Web APIs only — no `fs`, no sockets, no long-lived process.
- Server code is bundled, so npm packages are fine as long as they do not need Node built-ins.
- Every route is SSR (`output: 'server'`); they all read bindings, so nothing prerenders.
- Bindings come from `import { env } from 'cloudflare:workers'`. `Astro.locals.runtime` was removed in adapter v13 / Astro 6; the properties survive as throwing getters, so older examples fail at runtime rather than at build.
- oxlint and oxfmt cover `.ts` and `.tsx`; oxlint also reads the script block of an `.astro` file, oxfmt does not touch one. `astro check` remains the only checker that understands a component as a whole, and the only one that type-checks. oxfmt is also kept off `.json` and `.jsonc`: it rewrites `wrangler.jsonc` with trailing commas, which is churn on the file every deploy reads.
- Tests are vitest, in two projects: `unit` on node for `src/lib`, `components` on jsdom for `src/components`. The split is what lets `test:unit` run in a hook while the jsdom project cannot.
- `scripts/` is linted with Node globals allowed, through an override in `.oxlintrc.json` scoped to that directory. Everywhere else the Node globals stay absent, for the same reason `@types/node` is not installed.

## Architecture rules (target state)

These describe where the interactive version is going. **None of it is built yet** — there is no island, no shader and no `pushState`; the period switcher is still plain links. Treat the list as the design to build toward, not a description of the code.

- **Path segment is the server, query string is the island.** `/enonic` → `/acme` is a navigation and a fresh server render. `?period=year` is island state written back with `pushState` — no reload.
- **One island, not many.** Islands are isolated hydration roots and cannot share state. All interactive state lives in a single island per page.
- **Changing the organization navigates.** Rare and deliberate, so it is served by SSR and needs no client fetch. There is no data API and adding one needs a reason.
- **Period, sorting and cards are local.** One SSR pass hands the island every period at once; nothing after first paint hits the server.
- **Island props must be serializable.** They are JSON-encoded into an HTML attribute — no functions, class instances or nodes across that boundary.
- **The shader canvas is `client:only`, outside the island,** and never re-renders. It shares the main thread with everything else, so animations stay on CSS transforms and `opacity`.
- **Decoration is fetched last or not at all.** The front-page mark is WebGL and costs 131 KB gzipped, so it is behind a dynamic import gated on idle, on visibility, and on the visitor having WebGL and asking for neither reduced motion nor reduced data. The static medallion is what the page renders; the badge is an upgrade a visitor may never receive, and nothing may depend on it having loaded.

## No token on disk

Local development runs on a local snapshot, so no GitHub token is needed and `.dev.vars` stays empty.

- `getBoard` is the only branch: token set means `loadSeason` against live GitHub, token unset means `loadSeasonFixture` over `src/fixtures/boards.json`.
- `src/fixtures/boards.json` is **gitignored** — it holds named per-person counts and this repository is public. Every entry point (`dev`, `check`, `build`, `preview`, `deploy`) creates an empty `{}` if it is missing, so a fresh clone builds; the board is simply empty until it is filled.
- `pnpm run snapshot <org>` refreshes the fixture. It borrows the token from the `gh` CLI keychain into process memory and never prints or writes it. Refreshing is always explicit: auto-snapshotting on every `dev` would break CI, slow every start and make local data non-deterministic.
- The snapshot takes the **public roster by default**, matching what the deployed site sees. `--full` takes everything the token can reach; the fixture records which was used, and `build`, `preview` and `deploy` refuse a `--full` one so it cannot be compiled into a Worker.
- Counts still differ from production: a `gh` token can see the organization's private repositories (46 of enonic's 237), so its numbers run higher. Set `GITHUB_TOKEN` to the scopeless production token when the snapshot has to match exactly.
- The snapshot runs through the same `fetchRoster` and `fetchCounts` the Worker uses, over the same ISO weeks, so the fixture cannot drift from a real response. Re-run it whenever the query shape changes.
- Live data comes from `wrangler dev --remote` or a deploy. The production secret is set with `wrangler secret put`, piped from `op read`.

## Roster size depends on token scope

`fetchMemberLogins` asks for the full roster and falls back to public members when GitHub refuses. For enonic that is **18 members with `read:org` versus 9 public**.

The deployed site runs on a **scopeless token on purpose**: it can only reach public members, so people who hid their organization membership cannot be published by accident. Do not give the production token `read:org` — the narrower credential is the safeguard, not a limitation to work around. `loadSeason` also passes `publicOnly: true` to `fetchRoster`, so the policy holds even if a broader token is configured by mistake.

GraphQL gates `Organization.id` behind `read:org` even for a public organization, so `fetchOrgId` reads the node ID from REST `/orgs/{org}` instead. The error names the scope and reads like a token that needs widening; it does not.

A statically imported fixture is compiled into the Worker bundle, so a `--full` snapshot on a developer's machine would ship those hidden members inside a laptop deploy. Building on Cloudflare from the repository avoids this entirely: the fixture is gitignored, so the build environment has none.

## Do not install `@types/node`

Wrangler suggests it on every run. Declining is deliberate: `tsconfig.json` narrows `types` to `worker-configuration.d.ts`, so `astro check` rejects `node:fs`, `node:buffer` and `process` before anything is built. Installing it puts those globals back, the check goes quiet, and the code still breaks on the edge.

`scripts/` is excluded from `tsconfig.json` for the same reason: those are real Node scripts, and the alternative was installing the types that hold the gate open.

## GitHub

This repository has no GitHub Project board. Skip project lookup and status updates entirely rather than searching for one.

## Conventions

- All user-facing text and code comments in English.
- Conventional commits, as in the global config.
- Secrets live in `.dev.vars` locally and `wrangler secret put` in production — never in `wrangler.jsonc`.
