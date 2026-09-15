import type { Period } from '../periods';
import { periodRange } from '../periods';
import { GitHubError, graphql, rest } from './client';

export type Counts = {
  commits: number;
  pullRequests: number;
  reviews: number;
  issues: number;
  /** Contributions the current token is not allowed to attribute to a repository. */
  restricted: number;
};

/**
 * The top-level counts are scoped to the organization and are the only ones the
 * score uses. `overall` is everything the person did on GitHub in the same window
 * — shown as context on a profile card, never ranked, because personal projects
 * are not work done for the organization.
 */
export type Contributions = Counts & {
  login: string;
  name: string | null;
  avatarUrl: string;
  overall: Counts;
};

/** GraphQL aliases let one request carry many users; 20 keeps the query well under the cost limit. */
const BATCH_SIZE = 20;

type OrgResponse = { organization: { id: string } | null };

type Collection = {
  totalCommitContributions: number;
  totalPullRequestContributions: number;
  totalPullRequestReviewContributions: number;
  totalIssueContributions: number;
  restrictedContributionsCount: number;
};

type UserNode = {
  login: string;
  name: string | null;
  avatarUrl: string;
  inOrg: Collection;
  overall: Collection;
} | null;

/**
 * The full roster needs `read:org`; without it GitHub refuses and only the people
 * who made their membership public are visible. Falling back rather than failing
 * keeps a scopeless token working, at the cost of a shorter board.
 *
 * `publicOnly` forces the narrow list even when the token could see more, so a
 * snapshot can be taken against exactly what the deployed site will show.
 */
export async function fetchMemberLogins(
  token: string,
  org: string,
  publicOnly = false,
): Promise<string[]> {
  const base = `/orgs/${encodeURIComponent(org)}`;

  if (!publicOnly) {
    try {
      return await paginate(token, `${base}/members`);
    } catch (cause) {
      if (!(cause instanceof GitHubError) || (cause.status !== 403 && cause.status !== 404)) {
        throw cause;
      }
    }
  }

  return await paginate(token, `${base}/public_members`);
}

/** GitHub caps a page at 100; an organization larger than that would be silently truncated. */
async function paginate(token: string, path: string): Promise<string[]> {
  const logins: string[] = [];

  for (let page = 1; ; page++) {
    const batch = await rest<{ login: string }[]>(token, `${path}?per_page=100&page=${page}`);

    logins.push(...batch.map((member) => member.login));

    if (batch.length < 100) {
      return logins;
    }
  }
}

export async function fetchOrgId(token: string, org: string): Promise<string | null> {
  const data = await graphql<OrgResponse>(
    token,
    `query ($org: String!) { organization(login: $org) { id } }`,
    { org },
  );

  return data.organization?.id ?? null;
}

export async function fetchContributions(
  token: string,
  org: string,
  period: Period,
  publicOnly = false,
): Promise<Contributions[]> {
  const orgId = await fetchOrgId(token, org);

  if (!orgId) {
    return [];
  }

  const logins = await fetchMemberLogins(token, org, publicOnly);
  const { from, to } = periodRange(period);
  const results: Contributions[] = [];

  for (let i = 0; i < logins.length; i += BATCH_SIZE) {
    const batch = logins.slice(i, i + BATCH_SIZE);
    const data = await graphql<Record<string, UserNode>>(
      token,
      buildBatchQuery(batch.length),
      Object.fromEntries([
        ['orgId', orgId],
        ['from', from],
        ['to', to],
        ...batch.map((login, index) => [`login${index}`, login]),
      ]),
    );

    for (const node of Object.values(data)) {
      if (node) {
        results.push(toContributions(node));
      }
    }
  }

  return results;
}

function buildBatchQuery(size: number): string {
  const params = ['$orgId: ID!', '$from: DateTime!', '$to: DateTime!'];
  const fields: string[] = [];

  for (let i = 0; i < size; i++) {
    params.push(`$login${i}: String!`);
    fields.push(`u${i}: user(login: $login${i}) { ...stats }`);
  }

  return `
    query (${params.join(', ')}) {
      ${fields.join('\n      ')}
    }

    fragment stats on User {
      login
      name
      avatarUrl
      inOrg: contributionsCollection(organizationID: $orgId, from: $from, to: $to) {
        ...counts
      }
      overall: contributionsCollection(from: $from, to: $to) {
        ...counts
      }
    }

    fragment counts on ContributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalIssueContributions
      restrictedContributionsCount
    }
  `;
}

function toContributions(node: NonNullable<UserNode>): Contributions {
  return {
    login: node.login,
    name: node.name,
    avatarUrl: node.avatarUrl,
    ...toCounts(node.inOrg),
    overall: toCounts(node.overall),
  };
}

function toCounts(c: Collection): Counts {
  return {
    commits: c.totalCommitContributions,
    pullRequests: c.totalPullRequestContributions,
    reviews: c.totalPullRequestReviewContributions,
    issues: c.totalIssueContributions,
    restricted: c.restrictedContributionsCount,
  };
}
