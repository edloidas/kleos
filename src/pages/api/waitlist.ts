import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { lookupGateClosed, resolveAccount } from '../../lib/account';
import { resolveViewer } from '../../lib/github/token';
import { mayLookUp } from '../../lib/limit';
import { isSupported } from '../../lib/orgs';
import { waitlistFor, waitlistForAccount } from '../../lib/route';

export const prerender = false;

/** Deliberately loose — the point is to reject junk, not to adjudicate RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * The form is rendered only where `[name].astro` routes to `not-enabled`, so this
 * composes the same two decisions and accepts exactly that.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const org = String(form.get('org') ?? '')
    .trim()
    .toLowerCase();
  const email = String(form.get('email') ?? '').trim();

  const local = waitlistFor(org, isSupported(org));

  if (local === 'malformed') {
    return new Response('That does not look like a GitHub organization name.', { status: 400 });
  }

  if (email.length > 254 || !EMAIL.test(email)) {
    return new Response('That does not look like an email address.', { status: 400 });
  }

  const path = `/${encodeURIComponent(org)}`;

  if (local === 'enabled') {
    return redirect(path, 303);
  }

  // The same throttle the page applies, on the other path into the same lookup —
  // a POST resolves a name as cheaply to script as a GET does. Recorded on the way
  // through, because only this side knows it was the one refused.
  const viewer = resolveViewer(request);
  const refused = { throttle: false };
  const account = await resolveAccount(viewer, org, async () => {
    const allowed = await mayLookUp(request);
    refused.throttle = !allowed;

    return allowed;
  });
  const decision = waitlistForAccount(account, viewer !== null);

  if (decision === 'user') {
    return new Response(`${org} is a GitHub user, not an organization.`, { status: 422 });
  }

  if (decision === 'missing') {
    return new Response(`GitHub has no organization called ${org}.`, { status: 422 });
  }

  // Two of the three ways this lands never asked GitHub at all, and the difference
  // is the wait: a throttle clears within the minute, a spent budget within the hour,
  // and only the third is GitHub failing to answer.
  if (decision === 'unresolved') {
    if (refused.throttle) {
      return new Response('Too many lookups from here. Try again in a minute.', { status: 429 });
    }

    // The gate does not record which refusal set it, so the wait is given as the
    // bound that holds for both rather than as the hour only one of them needs.
    return (await lookupGateClosed())
      ? new Response(
          'kleos has paused GitHub lookups while it is rate limited. Try again within the hour.',
          {
            status: 503,
          },
        )
      : new Response('Could not reach GitHub. Try again in a moment.', { status: 503 });
  }

  await env.DB.prepare('INSERT OR IGNORE INTO waitlist (org, email) VALUES (?, ?)')
    .bind(org, email)
    .run();

  return redirect(`${path}?requested=1`, 303);
};
