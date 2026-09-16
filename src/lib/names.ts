/** Binding-free so the node test project reaches it, as `roster.ts` is. */

/**
 * Astro serves a static route ahead of `[name].astro`, so a page added later is
 * never shadowed by an account of that name. This list is only for segments with
 * no page of their own.
 */
const RESERVED = new Set(['api', 'login', 'logout', 'callback']);

export function isReserved(name: string): boolean {
  return RESERVED.has(name.toLowerCase());
}

/**
 * GitHub's own shape, and rejecting the rest is what keeps `/favicon.ico` and
 * every scanner probe from costing an account lookup.
 *
 * Length is checked separately because the pattern counts groups, and a
 * hyphenated group spans two characters.
 */
const LOGIN = /^[a-z\d](?:-?[a-z\d])*$/i;
const MAX_LOGIN = 39;

export function isLoginShape(name: string): boolean {
  return name.length <= MAX_LOGIN && LOGIN.test(name);
}
