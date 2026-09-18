import { BADGES } from '../lib/badges';
import type { Highlight } from '../lib/spotlight';
import { Avatar } from './Avatar';
import { Badge } from './Badges';

/**
 * The week's badge holders, between the podium and the table. Static like the podium
 * and the badges in the table: it decorates data the table already carries, so it
 * hydrates nothing.
 *
 * One card, two shapes, as the podium has: a row on narrow screens with the name, the
 * badge and its explanation stacked beside the face, a centred column on wider ones.
 * Smaller than a podium card at every width: the podium is the page's ranking, this row
 * is a footnote to it.
 */

/**
 * Written out, not interpolated: Tailwind generates only names it finds in the source.
 * Indexed by card count, because a row of two spread across four columns reads as two
 * cards missing rather than as the two the week produced.
 */
const FRAME = [
  '',
  'sm:max-w-xs sm:grid-cols-1',
  'sm:max-w-md sm:grid-cols-2',
  'sm:max-w-xl sm:grid-cols-3',
  'sm:max-w-2xl sm:grid-cols-4',
];

export function Spotlight({ highlights }: { highlights: Highlight[] }) {
  if (highlights.length === 0) {
    return null;
  }

  return (
    // Unordered: the order is a priority for the places, not a ranking of the holders.
    <ul
      className={`mx-auto flex max-w-lg flex-col gap-2 sm:grid sm:gap-3 ${
        FRAME[highlights.length] ?? ''
      }`}
    >
      {highlights.map((highlight) => (
        <li
          key={highlight.login}
          className="flex items-center gap-3 rounded-2xl border border-line-soft raised px-3 py-2.5 sm:flex-col sm:gap-2 sm:py-4 sm:text-center"
        >
          <Avatar src={highlight.avatarUrl} className="size-9 sm:size-12" />

          <div className="min-w-0 flex-1 sm:w-full sm:flex-none">
            <a
              href={`https://github.com/${highlight.login}`}
              className="block truncate text-sm transition-colors duration-150 hover:text-ember hover:underline"
            >
              {highlight.name ?? highlight.login}
            </a>

            <p className="mt-1">
              <Badge kind={highlight.kind} explained={false} />
            </p>

            <p className="mt-1 text-xs text-muted">{BADGES[highlight.kind].title}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
