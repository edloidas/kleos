import { env } from 'cloudflare:workers';

/**
 * Part of every cache key, and a union rather than a string because two entry
 * families now key on it: a signed-in viewer sees contributions the anonymous
 * token cannot, so a new value must not appear in one of them by accident.
 *
 * `public` is the scopeless production token; `self:<login>` and `member:<org>`
 * arrive with sign-in and the App installation.
 */
export type Scope = 'public' | `self:${string}` | `member:${string}`;

export const PUBLIC_SCOPE: Scope = 'public';

export type Viewer = {
  token: string;
  scope: Scope;
};

/**
 * The single place a GitHub token is resolved. Nothing else reads the token out
 * of the environment, so adding OAuth later means teaching this function about
 * the session cookie and touching nothing downstream.
 *
 * No token is a normal state, not an error: local development runs on a fixture
 * so that no secret has to sit on a developer's disk.
 */
export function resolveViewer(_request: Request): Viewer | null {
  const token = env.GITHUB_TOKEN;

  return token ? { token, scope: PUBLIC_SCOPE } : null;
}
