const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';

const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'kleos',
};

/** Without this a hung GitHub connection holds the request until the platform kills it. */
const TIMEOUT_MS = 10_000;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
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
    throw new GitHubError(`GitHub GraphQL responded ${response.status}`, response.status);
  }

  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };

  /*
   * GraphQL answers partially: one renamed or suspended account returns an error
   * alongside data for everyone else in the batch. Failing here would drop the
   * other nineteen users, so errors only matter when nothing came back.
   */
  if (!body.data) {
    const reason = body.errors?.map((e) => e.message).join('; ') ?? 'no data';

    throw new GitHubError(`GitHub GraphQL returned ${reason}`, 502);
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
    throw new GitHubError(`GitHub REST ${path} responded ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}
