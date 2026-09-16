<p align="center">
  <img src="public/favicon-192.png" width="96" alt="kleos logo">
</p>

<h1 align="center">kleos</h1>

<p align="center">
Contribution leaderboards for GitHub organizations, ranked by pull requests, reviews, issues and commits.
</p>

Enter an organization, get its members ranked over the last week, month or year. `kleos` (κλέος) is the Homeric idea that renown is not something you claim but something others recount from your deeds — which is all this does: it reads the public record and reads it back.

Astro with a React island, server-rendered on Cloudflare Workers.

## Setup

Requires Node 22.19+ and pnpm (`corepack enable pnpm` — the exact version is pinned in `package.json`).

```bash
pnpm install
pnpm run snapshot enonic   # writes src/fixtures/boards.json using your `gh` login
pnpm run dev
```

No token is needed locally: with the token unset, the app serves that snapshot. It is gitignored, so a fresh clone starts with an empty board until you run the snapshot command. The script borrows a credential from the `gh` CLI keychain for the length of one process and never writes it anywhere.

A token is only needed in production, because GitHub's GraphQL API rejects unauthenticated requests outright.

## Commands

```bash
pnpm run dev       # dev server on :4321
pnpm run check     # type-check
pnpm run preview   # build, then serve through the real Workers runtime
pnpm run deploy    # build and publish
```

`preview` is the honest one: `dev` emulates the Cloudflare bindings, `preview` runs the same `workerd` that production does.

`pnpm install` points `core.hooksPath` at `.githooks`, so committing runs the staged-file guard and `pnpm run check` first. `git commit --no-verify` skips it.

## Deployment

Pushing to `master` deploys to <https://kleos.edloidas.io> through `.github/workflows/deploy.yml`. Pull requests run the same checks without deploying.

Deploys happen on a runner rather than a laptop on purpose: `src/fixtures/boards.json` is gitignored, so the runner has no snapshot to compile into the bundle and production reads live GitHub through its `GITHUB_TOKEN` secret.

## Scoring

```
score = sum over categories of  weight × n / (n + k)

           weight   k
PR         5        2
review     4        3
issue      2        2
commit     1        8
```

Each category maxes out at its weight and reaches half of it at k, so the first
contribution in a category counts for far more than the fiftieth: 0 to 2 commits
earns 0.20 points, 20 to 40 earns 0.12.

The weights live in `src/lib/score.ts` and are printed under the table on purpose. An opaque ranking of people reads as a judgement; a published formula reads as a game, which is what this is.

## Known limits

- **Public members only.** The deployed site authenticates with a scopeless token, so it sees only members who made their organization membership public — for `enonic`, 9 of 18. This is deliberate: the narrow credential is what keeps hidden members from being published.
- **Public contributions only.** Work in private repositories cannot be attributed to a person.
- **Allowlisted organizations.** Every visitor spends the same shared token's rate limit, so only approved organizations resolve. Everything else lands on the waitlist form.

Signing in with GitHub would show a viewer their own contributions across all of GitHub, the organizations they belong to, and their standing in each — through their own access, so nobody else is exposed by it. Not built yet.

## License

MIT
