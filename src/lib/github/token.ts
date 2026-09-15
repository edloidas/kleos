import { env } from 'cloudflare:workers';

/**
 * The single place a GitHub token is resolved. Nothing else reads the token out
 * of the environment, so adding OAuth later means teaching this function about
 * the session cookie and touching nothing downstream.
 *
 * `scope` is part of every cache key. A signed-in viewer sees contributions the
 * anonymous token cannot, so their results must never land in the public entry.
 */
export type Viewer = {
  token: string;
  scope: string;
};

/**
 * No token is a normal state, not an error: local development runs on a fixture
 * so that no secret has to sit on a developer's disk.
 */
export function resolveViewer(_request: Request): Viewer | null {
  const token = env.GITHUB_TOKEN;

  return token ? { token, scope: 'public' } : null;
}
