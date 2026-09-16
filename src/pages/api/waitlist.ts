import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { resolveAccount } from '../../lib/account';
import { resolveViewer } from '../../lib/github/token';
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

  const viewer = resolveViewer(request);
  const decision = waitlistForAccount(await resolveAccount(viewer, org), viewer !== null);

  if (decision === 'user') {
    return new Response(`${org} is a GitHub user, not an organization.`, { status: 422 });
  }

  if (decision === 'missing') {
    return new Response(`GitHub has no organization called ${org}.`, { status: 422 });
  }

  if (decision === 'unresolved') {
    return new Response('Could not reach GitHub. Try again in a moment.', { status: 503 });
  }

  await env.DB.prepare('INSERT OR IGNORE INTO waitlist (org, email) VALUES (?, ?)')
    .bind(org, email)
    .run();

  return redirect(`${path}?requested=1`, 303);
};
