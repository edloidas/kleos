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

/** Open at the top so the numeral reads through. */
function Laurel() {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="absolute inset-0 size-full text-laurel"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M18 7c-7 4-10 11-9 18 .6 4.2 2.7 8 6 10.8" />
      <path d="M30 7c7 4 10 11 9 18-.6 4.2-2.7 8-6 10.8" />
      <path d="M15 14c-2.6.2-4.4 1.6-5 3.7 2 1 4 .7 5.6-.7M13 21c-2.6.4-4.2 2-4.5 4.2 2.1.8 4 .3 5.5-1.2M13.5 28c-2.4.8-3.7 2.6-3.5 4.8 2.2.4 4-.4 5.1-2.1" />
      <path d="M33 14c2.6.2 4.4 1.6 5 3.7-2 1-4 .7-5.6-.7M35 21c2.6.4 4.2 2 4.5 4.2-2.1.8-4 .3-5.5-1.2M34.5 28c2.4.8 3.7 2.6 3.5 4.8-2.2.4-4-.4-5.1-2.1" />
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

function Card({
  slot,
  lead,
  stepped,
  order,
  figures,
  rating,
}: {
  slot: Slot<Entry>;
  lead: boolean;
  stepped: boolean;
  order: string;
  figures: Figure[] | null;
  rating: number | null;
}) {
  const member = slot.member;
  const shape = stepped
    ? `${order} sm:flex-col sm:gap-2 sm:text-center ${lead ? 'sm:pt-5 sm:pb-6' : 'sm:pt-4 sm:pb-5'}`
    : '';

  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border border-line-soft raised px-3 ${
        lead ? 'py-3' : 'py-2.5'
      } ${shape}`}
    >
      <span
        data-place={slot.place}
        className={`relative grid shrink-0 place-items-center ${
          stepped ? 'sm:order-2' : ''
        } ${lead ? 'size-11 sm:size-12' : 'size-9'}`}
      >
        {slot.place === 1 && <Laurel />}
        <span className={`font-display text-bronze ${lead ? 'text-xl' : 'text-base'}`}>
          {slot.place}
        </span>
        {slot.shared && <span className="sr-only">tied</span>}
      </span>

      <Avatar member={member} lead={lead} stepped={stepped} />

      <div className={`min-w-0 flex-1 ${stepped ? 'sm:order-3 sm:w-full sm:flex-none' : ''}`}>
        <a
          href={`https://github.com/${member.login}`}
          className={`block truncate transition-colors duration-150 hover:text-ember hover:underline ${
            lead ? 'text-base font-medium' : 'text-sm'
          }`}
        >
          {member.name ?? member.login}
        </a>

        {figures && (
          <ul
            className={`mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted ${
              stepped ? 'sm:justify-center' : ''
            }`}
          >
            {figures.map((figure) => (
              <li key={figure.label} className="flex items-center gap-1">
                <span className={`size-3.5 ${ICON}`}>{figure.icon}</span>
                <span className="tabular-nums">{figure.value}</span>
                <span className="sr-only">{figure.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {rating !== null && (
        <span
          className={`shrink-0 text-sm text-bronze tabular-nums ${stepped ? 'sm:order-4' : ''}`}
        >
          {rating}
        </span>
      )}
    </li>
  );
}

function Avatar({ member, lead, stepped }: { member: Entry; lead: boolean; stepped: boolean }) {
  const size = lead
    ? `size-11 ${stepped ? 'sm:size-16' : ''}`
    : `size-9 ${stepped ? 'sm:size-12' : ''}`;
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
  ratingOf,
}: {
  slots: Slot<Entry>[];
  stepped: boolean;
  figuresOf: ((login: string) => Figure[]) | null;
  ratingOf: ((login: string) => number) | null;
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
          rating={ratingOf?.(slot.member.login) ?? null}
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

  return (
    <Podium
      slots={slots}
      stepped={!tied}
      figuresOf={(login) => figures.get(login)!}
      ratingOf={null}
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

  const ratings = new Map(ranked.map((entry) => [entry.login, Math.round(entry.rating)]));

  return (
    <Podium
      slots={slots}
      stepped={!tied}
      figuresOf={null}
      ratingOf={(login) => ratings.get(login)!}
    />
  );
}
