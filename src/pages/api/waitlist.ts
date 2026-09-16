import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

/** Deliberately loose — the point is to reject junk, not to adjudicate RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
const ORG = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const org = String(form.get('org') ?? '')
    .trim()
    .toLowerCase();
  const email = String(form.get('email') ?? '').trim();

  if (!ORG.test(org)) {
    return new Response('That does not look like a GitHub organization name.', { status: 400 });
  }

  if (email.length > 254 || !EMAIL.test(email)) {
    return new Response('That does not look like an email address.', { status: 400 });
  }

  await env.DB.prepare('INSERT OR IGNORE INTO waitlist (org, email) VALUES (?, ?)')
    .bind(org, email)
    .run();

  return redirect(`/${encodeURIComponent(org)}?requested=1`, 303);
};
