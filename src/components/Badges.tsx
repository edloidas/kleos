import type { BadgeKind } from '../lib/badges';
import { BADGES } from '../lib/badges';

/**
 * One earned badge, beside the member who holds it. Static like the podium: it
 * decorates data the table already carries, so it hydrates nothing.
 */
export function Badge({ kind, explained = true }: { kind: BadgeKind; explained?: boolean }) {
  const badge = BADGES[kind];

  return (
    <span
      // A screen reader is not promised the tooltip, so the explanation is spelled
      // out for it as well, the same way the podium's figures are. `explained` turns
      // both off where the card beside the badge already prints it in full.
      title={explained ? badge.title : undefined}
      className="inline-flex shrink-0 items-center rounded-full border border-line-soft px-1.5 py-px text-[0.6875rem] whitespace-nowrap text-bronze"
    >
      {badge.label}
      {explained && <span className="sr-only"> — {badge.title}</span>}
    </span>
  );
}
