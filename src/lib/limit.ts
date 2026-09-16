import { env } from 'cloudflare:workers';

/**
 * Cloudflare counts this per location, so it bounds one source rather than the
 * fleet. That is the whole of what it claims: the budget gate in `account.ts` is
 * what stands between a distributed walk and the roster path's headroom.
 *
 * Fails open throughout. A missing binding, an unkeyable request or a limiter that
 * throws must not be the reason a name goes unresolved — the cost of guessing wrong
 * here is a lookup, and the cost of guessing wrong the other way is the site.
 */
export async function mayLookUp(request: Request): Promise<boolean> {
  const limiter = env.LOOKUP_LIMIT;

  if (!limiter) {
    return true;
  }

  // Cloudflare sets this; `astro dev` does not, where one shared bucket is the
  // honest local answer rather than an invented per-request key.
  const key = request.headers.get('cf-connecting-ip') ?? 'local';

  try {
    const { success } = await limiter.limit({ key });

    return success;
  } catch {
    return true;
  }
}
