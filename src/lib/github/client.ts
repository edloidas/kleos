const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';

const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'kleos',
};

/** Without this a hung GitHub connection holds the request until the platform kills it. */
const TIMEOUT_MS = 10_000;

/**
 * `rateLimited` is carried rather than inferred from the status. GitHub answers
 * 403 for a spent budget *and* for a scope the token does not hold, and this
 * project runs a scopeless token on purpose — so reading 403 as "too many
 * requests" would tell a visitor to wait an hour for a permanent misconfiguration.
 * Only the response itself knows which one it was.
 */
export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly rateLimited = false,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

/**
 * A spent primary budget zeroes the remaining count. A secondary limit does not:
 * it answers 403 with `Retry-After` and a budget still showing room, so reading
 * the count alone reports abuse throttling as a scope failure.
 */
function isRateLimited(response: Response): boolean {
  return (
    response.status === 429 ||
    response.headers.get('x-ratelimit-remaining') === '0' ||
    (response.status === 403 && response.headers.has('retry-after'))
  );
}

export async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new GitHubError(
      `GitHub GraphQL responded ${response.status}`,
      response.status,
      isRateLimited(response),
    );
  }

  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string; type?: string }[];
  };

  /*
   * GraphQL answers partially: one renamed or suspended account returns an error
   * alongside data for everyone else in the batch. Failing here would drop the
   * other nineteen users, so errors only matter when nothing came back.
   */
  if (!body.data) {
    const reason = body.errors?.map((e) => e.message).join('; ') ?? 'no data';

    // GraphQL refuses a spent budget with 200 and an error body, so the status
    // says nothing. `type` is the field that names it; the message is prose and
    // has no promise of carrying the words.
    const limited = body.errors?.some((e) => e.type === 'RATE_LIMITED') ?? false;

    throw new GitHubError(`GitHub GraphQL returned ${reason}`, 502, limited);
  }

  return body.data;
}

export async function rest<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      ...HEADERS,
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new GitHubError(
      `GitHub REST ${path} responded ${response.status}`,
      response.status,
      isRateLimited(response),
    );
  }

  return (await response.json()) as T;
}
