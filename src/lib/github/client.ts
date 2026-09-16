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
    readonly reset?: number,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

/** What a response said about the budget it was drawn from; `reset` is unix seconds. */
export type Budget = { remaining: number; reset: number };

/** A caller that wants to watch the budget it is spending. */
export type BudgetWatcher = (budget: Budget) => void;

/**
 * Read from every response, not only a refused one: a caller that waits for the
 * refusal has already spent the budget it was trying to protect.
 *
 * GraphQL carries no such headers — it reports its own budget inside the response
 * body — so this reads `null` there and only `rest` offers it.
 */
function readBudget(response: Response): Budget | null {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const reset = response.headers.get('x-ratelimit-reset');

  if (remaining === null || reset === null) {
    return null;
  }

  const budget = { remaining: Number(remaining), reset: Number(reset) };

  return Number.isFinite(budget.remaining) && Number.isFinite(budget.reset) ? budget : null;
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

/**
 * The seconds a secondary limit asks to be left alone for, which is the only wait
 * such a refusal describes: its budget is untouched, so `x-ratelimit-reset` names a
 * window that has nothing to do with it and can be most of an hour away.
 */
function readRetryAfter(response: Response): number | undefined {
  const header = response.headers.get('retry-after');

  if (header === null) {
    return undefined;
  }

  const seconds = Number(header);

  if (Number.isFinite(seconds)) {
    return Math.max(seconds, 0);
  }

  // The other form the header allows is an HTTP-date, which names the instant to
  // resume at rather than a count of seconds to wait.
  const deadline = Date.parse(header);

  return Number.isNaN(deadline)
    ? undefined
    : Math.max(Math.round((deadline - Date.now()) / 1000), 0);
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

export async function rest<T>(token: string, path: string, onBudget?: BudgetWatcher): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      ...HEADERS,
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const budget = readBudget(response);

  if (budget) {
    onBudget?.(budget);
  }

  if (!response.ok) {
    throw new GitHubError(
      `GitHub REST ${path} responded ${response.status}`,
      response.status,
      isRateLimited(response),
      budget?.reset,
      readRetryAfter(response),
    );
  }

  return (await response.json()) as T;
}
