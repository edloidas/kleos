/**
 * Which of the page's two ladders to render. Not `Period`: that type is a rolling
 * window over the last N days, which is what the board used before the ladder.
 * The two usually share one season fetch, but not always — see `getBoard`.
 */
export const VIEWS = ['week', 'month'] as const;

export type View = (typeof VIEWS)[number];

export const DEFAULT_VIEW: View = 'month';

export function isView(value: unknown): value is View {
  return VIEWS.includes(value as View);
}

export function parseView(value: string | null): View {
  return isView(value) ? value : DEFAULT_VIEW;
}
