/// <reference types="astro/client" />

declare namespace Cloudflare {
  // Secrets are set with `wrangler secret put`, so `wrangler types` never sees them.
  interface Env {
    GITHUB_TOKEN?: string;
    EXCLUDED_LOGINS?: string;
  }
}
