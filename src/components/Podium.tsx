import type { ReactNode } from 'react';

import type { LadderRow, Standing } from '../lib/board';
import type { Slot } from '../lib/podium';
import { competitionPlaces, podium } from '../lib/podium';

/**
 * The three cards above the table. Decoration over data the table already carries,
 * so it stays static: no hydration and no state.
 *
 * One card, two shapes: a row on narrow screens, stepped on wider ones with first in
 * the middle. Stepping ranks the three against each other, so a tie keeps the row at
 * every width.
 */

type Figure = { label: string; value: number; icon: ReactNode };

type Entry = { login: string; name: string | null; avatarUrl: string };

/** Lucide-style, matching `Header.astro`: stroked, never filled, 24-square. */
const ICON = '[&_svg]:size-full [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2';

function PullRequestIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M6 9v6a6 6 0 0 0 6 6h3" />
      <path d="M15 9h3a3 3 0 0 0 3-3V3" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9 9 0 0 1-3.9-.9L3 21l1.9-5.1A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z" />
      <path d="m9 11.5 2 2 4-4" />
    </svg>
  );
}

function IssueIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CommitIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M2 12h6" />
      <path d="M16 12h6" />
    </svg>
  );
}

/**
 * Filled where the other icons are stroked, hence the toned-down laurel. The glyph box is
 * wider than it is tall, so it is sized by height and overflows the square place marker —
 * absolutely, not off the marker, because the narrow card is a row with the avatar beside it.
 */
function Laurel() {
  return (
    <svg
      viewBox="0 0 1268 1024"
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 h-8 w-auto max-w-none -translate-x-1/2 -translate-y-1/2 text-laurel/70 sm:h-9"
      fill="currentColor"
    >
      <path d="M484.206 27.063c-43.154 6.339-77.775 21.943-109.227 49.493-43.886 38.278-65.341 78.994-72.899 138.728l-2.926 21.455-10.484-19.505c-5.608-10.728-13.653-24.381-17.798-30.476-11.703-16.823-42.423-46.324-62.659-59.733-16.091-10.971-19.992-12.434-30.72-12.434s-13.166 0.975-19.992 8.29c-4.389 4.389-13.897 20.48-21.455 35.84-22.674 46.811-29.257 73.143-29.501 119.223 0 39.741 8.29 74.118 27.55 112.152 4.145 8.046 7.070 14.629 6.827 14.629-0.488 0-7.802-2.194-16.579-4.876-19.505-5.851-62.171-10.971-74.118-8.777-4.632 0.975-11.947 4.876-16.091 9.021l-7.314 7.558v36.084c0 37.79 2.926 58.514 12.678 87.771 15.36 46.568 54.37 95.573 97.524 122.636 9.021 5.608 16.335 10.728 16.579 11.459 0 0.731-7.802 3.17-17.067 5.364-26.088 6.095-66.804 26.575-73.143 36.571-7.314 11.459-5.12 24.137 8.29 46.568 37.547 63.878 88.99 105.326 152.625 123.611 22.918 6.583 73.63 9.265 99.962 5.12 9.996-1.707 29.501-6.583 43.154-11.215l24.869-8.533 14.141 9.021 14.141 9.265-31.208 15.116c-17.31 8.533-35.596 18.773-40.716 22.674-23.893 18.773-21.455 55.589 4.389 73.387 7.314 4.876 11.459 5.851 24.625 5.608 14.385-0.244 19.505-1.95 46.568-14.872 67.779-32.427 125.074-44.617 210.895-44.617 85.577 0 143.36 12.19 210.895 44.373 35.84 17.067 49.493 19.749 66.072 12.434 22.187-9.996 32.427-38.034 21.699-60.221-7.070-14.872-14.629-20.236-51.2-37.059-75.581-34.621-136.533-48.030-229.181-50.712-112.884-3.17-186.758-32.183-252.83-98.743-51.931-52.175-82.408-109.714-94.354-178.225-15.36-87.771 3.657-179.444 52.419-253.806l12.19-18.53 15.604-1.707c75.581-7.802 141.897-57.783 170.667-128.488 11.703-28.526 15.848-53.15 15.848-91.916 0-37.547-2.682-44.617-19.017-49.25-10.484-2.926-49.006-2.682-69.73 0.244z" />
      <path d="M713.143 28.282c-14.385 7.314-15.848 11.215-15.848 47.299 0 39.253 4.145 63.634 15.848 92.404 28.77 70.705 95.33 120.686 170.667 128.488l15.604 1.707 12.19 18.53c63.39 96.549 75.337 219.429 31.695 324.998-22.918 55.589-70.217 113.615-120.198 147.017l-21.455 14.629 19.017 5.608c26.331 7.558 82.895 30.476 108.983 43.642 11.703 6.095 26.575 15.848 33.158 21.699 11.459 10.24 12.434 10.728 27.307 10.728 28.282 0 67.779-9.265 98.011-22.674 43.642-19.749 88.99-65.341 116.541-118.248 13.897-25.844 7.558-39.985-24.625-55.832-11.459-5.608-29.745-12.678-40.716-15.848-11.215-3.17-20.236-6.339-20.236-7.314s6.827-5.851 15.116-10.728c19.017-11.703 49.981-40.96 63.634-60.465 33.158-46.811 45.592-87.771 45.592-148.968v-35.109l-7.558-8.533c-5.364-6.339-9.996-9.021-17.798-9.996-13.41-2.194-52.663 2.682-72.411 8.533-8.533 2.682-15.848 4.876-16.335 4.876-0.244 0 3.901-8.533 9.021-19.017 27.55-53.882 33.402-121.173 15.604-179.688-8.777-29.013-29.501-68.998-43.154-83.627-6.339-6.583-9.021-7.802-18.773-7.802s-14.385 1.95-29.501 11.947c-33.646 22.674-61.928 54.857-82.651 93.623l-8.777 16.823-2.926-21.699c-6.095-48.518-20.724-82.408-49.981-115.81-45.349-51.931-98.743-74.85-174.568-75.093-16.091 0-25.356 1.219-30.476 3.901z" />
    </svg>
  );
}

function weekFigures(member: Standing): Figure[] {
  return [
    { label: 'pull requests', value: member.pullRequests, icon: <PullRequestIcon /> },
    { label: 'reviews', value: member.reviews, icon: <ReviewIcon /> },
    { label: 'issues', value: member.issues, icon: <IssueIcon /> },
    { label: 'commits', value: member.commits, icon: <CommitIcon /> },
  ];
}

/** Written out, not interpolated: Tailwind generates only names it finds in the source. */
const STEP_ORDER = ['sm:order-2', 'sm:order-1', 'sm:order-3'];

/**
 * The two podiums are never on screen together, so nothing can equalise their cards but a
 * shared floor: without it the same rank changes height when the period switches. The
 * values are the week card measured at each rank, and they hold only because the category
 * row cannot wrap — a second line would lift the week card off a floor the month card,
 * having no row, could not follow.
 */
const STEPPED_FLOOR = { lead: 'sm:min-h-[15.625rem]', rest: 'sm:min-h-[13.125rem]' };

function Card({
  slot,
  lead,
  stepped,
  order,
  figures,
  score,
  scoreSize,
}: {
  slot: Slot<Entry>;
  lead: boolean;
  stepped: boolean;
  order: string;
  figures: Figure[] | null;
  score: string;
  scoreSize: string;
}) {
  const member = slot.member;
  const shape = stepped
    ? `${order} sm:flex-col sm:justify-center sm:gap-2 sm:text-center ${
        lead ? `sm:pt-5 sm:pb-6 ${STEPPED_FLOOR.lead}` : `sm:pt-4 sm:pb-5 ${STEPPED_FLOOR.rest}`
      }`
    : '';

  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border border-line-soft raised px-3 py-2.5 ${
        lead && !stepped ? 'sm:py-3' : ''
      } ${shape}`}
    >
      <span
        data-place={slot.place}
        className={`relative grid size-9 shrink-0 place-items-center ${
          stepped ? 'sm:order-2' : ''
        } ${lead ? 'sm:size-12' : ''}`}
      >
        {slot.place === 1 && <Laurel />}
        <span className={`font-display text-bronze ${lead ? 'text-lg sm:text-xl' : 'text-base'}`}>
          {slot.place}
        </span>
        {slot.shared && <span className="sr-only">tied</span>}
      </span>

      <Avatar member={member} lead={lead} stepped={stepped} />

      <div className={`min-w-0 flex-1 ${stepped ? 'sm:order-3 sm:w-full sm:flex-none' : ''}`}>
        <a
          href={`https://github.com/${member.login}`}
          className={`block truncate text-sm transition-colors duration-150 hover:text-ember hover:underline ${
            lead ? 'sm:text-base sm:font-medium' : ''
          }`}
        >
          {member.name ?? member.login}
        </a>

        {figures && (
          <ul
            className={`mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted sm:mt-2 sm:flex-nowrap ${
              stepped ? 'sm:justify-center' : ''
            }`}
          >
            {figures.map((figure) => (
              // A screen reader is not promised the tooltip, so the label stays as well.
              <li key={figure.label} title={figure.label} className="flex items-center gap-1">
                <span className={`size-3.5 ${ICON}`}>{figure.icon}</span>
                <span className="tabular-nums">{figure.value}</span>
                <span className="sr-only">{figure.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <span
        data-score=""
        className={`shrink-0 text-bronze tabular-nums ${scoreSize} ${stepped ? 'sm:order-4' : ''}`}
      >
        {score}
      </span>
    </li>
  );
}

function Avatar({ member, lead, stepped }: { member: Entry; lead: boolean; stepped: boolean }) {
  const size = lead
    ? stepped
      ? 'size-9 sm:size-16'
      : 'size-9 sm:size-11'
    : stepped
      ? 'size-9 sm:size-12'
      : 'size-9';
  const classes = `${size} ${
    stepped ? 'sm:order-1' : ''
  } shrink-0 rounded-full border border-line-soft bg-sunken object-cover`;

  // A member the last round never named has no avatar; an empty ring beats a broken image.
  return member.avatarUrl ? (
    <img src={member.avatarUrl} alt="" loading="lazy" className={classes} />
  ) : (
    <span className={classes} aria-hidden="true" />
  );
}

function Frame({ stepped, children }: { stepped: boolean; children: ReactNode }) {
  return (
    <ol
      // Rank order is the document order; `order` only moves the cards on screen, so a
      // reader who never sees the steps still gets first, second, third.
      className={`mx-auto flex max-w-lg flex-col gap-2 ${
        stepped ? 'sm:grid sm:max-w-2xl sm:grid-cols-[1fr_1.18fr_1fr] sm:items-end sm:gap-3' : ''
      }`}
    >
      {children}
    </ol>
  );
}

function Podium({
  slots,
  stepped,
  figuresOf,
  scoreOf,
  scoreSize,
}: {
  slots: Slot<Entry>[];
  stepped: boolean;
  figuresOf: ((login: string) => Figure[]) | null;
  scoreOf: (login: string) => string;
  scoreSize: string;
}) {
  return (
    <Frame stepped={stepped}>
      {slots.map((slot, index) => (
        <Card
          key={slot.member.login}
          slot={slot}
          lead={slot.place === 1}
          stepped={stepped}
          order={STEP_ORDER[index] ?? ''}
          figures={figuresOf?.(slot.member.login) ?? null}
          score={scoreOf(slot.member.login)}
          scoreSize={scoreSize}
        />
      ))}
    </Frame>
  );
}

export function WeekPodium({ standings }: { standings: Standing[] }) {
  const { slots, tied } = podium<Entry>(
    standings,
    competitionPlaces(standings.map((member) => member.points)),
  );

  if (slots.length === 0) return null;

  const figures = new Map(standings.map((member) => [member.login, weekFigures(member)]));
  // Two decimals, as the table below prints them.
  const points = new Map(standings.map((member) => [member.login, member.points.toFixed(2)]));

  return (
    <Podium
      slots={slots}
      stepped={!tied}
      figuresOf={(login) => figures.get(login)!}
      scoreOf={(login) => points.get(login)!}
      scoreSize="text-sm"
    />
  );
}

export function MonthPodium({ ranked }: { ranked: LadderRow[] }) {
  // The ladder numbers by position, so its places are distinct and the tie branch never fires.
  const { slots, tied } = podium<Entry>(
    ranked,
    ranked.map((_, index) => index + 1),
  );

  if (slots.length === 0) return null;

  const ratings = new Map(ranked.map((entry) => [entry.login, String(Math.round(entry.rating))]));

  return (
    <Podium
      slots={slots}
      stepped={!tied}
      figuresOf={null}
      scoreOf={(login) => ratings.get(login)!}
      scoreSize="text-base sm:text-xl"
    />
  );
}
