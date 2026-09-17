import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { LadderRow, Standing } from '../lib/board';
import { MonthPodium, WeekPodium } from './Podium';

function standing(login: string, points: number, over: Partial<Standing> = {}): Standing {
  return {
    login,
    name: login.toUpperCase(),
    avatarUrl: `https://example.test/${login}.png`,
    pullRequests: 1,
    reviews: 2,
    issues: 3,
    commits: 4,
    restricted: 0,
    overall: { pullRequests: 1, reviews: 2, issues: 3, commits: 4, restricted: 0 },
    points,
    place: 1,
    delta: 0,
    ...over,
  };
}

function entry(login: string, rating: number): LadderRow {
  return {
    login,
    name: login.toUpperCase(),
    avatarUrl: `https://example.test/${login}.png`,
    rating,
    provisionalDelta: 0,
    lastDelta: 0,
    roundsPlayed: 3,
    lastActiveWeek: '2026-W38',
    results: [],
  };
}

/** The card is the link's nearest bordered ancestor. */
function card(login: string) {
  return screen.getByRole('link', { name: login.toUpperCase() }).closest<HTMLElement>('.raised')!;
}

function cards() {
  return [...document.querySelectorAll<HTMLElement>('li.raised')];
}

/** The place each card prints, in rank order. The numeral alone is ambiguous: a
 *  category count on the same card can carry the same digits. */
function placesShown() {
  return cards().map((node) => node.querySelector('[data-place]')!.getAttribute('data-place'));
}

/** Marked rather than found by position: a card's last child is markup, not a contract. */
function score(login: string) {
  return card(login).querySelector<HTMLElement>('[data-score]')!;
}

/** Classes with no variant prefix. The stepped podium's emphasis is all behind `sm:`, so
 *  dropping the prefixed ones leaves the card as a narrow screen draws it. */
function unprefixed(node: Element) {
  return node.className.split(/\s+/).filter((name) => name && !name.includes(':'));
}

describe('WeekPodium', () => {
  it('shows the leading three and leaves the rest to the table', () => {
    render(
      <WeekPodium
        standings={[standing('ada', 9), standing('bob', 6), standing('cy', 4), standing('dee', 1)]}
      />,
    );

    expect(cards()).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'ADA' })).toHaveAttribute(
      'href',
      'https://github.com/ada',
    );
    expect(screen.queryByRole('link', { name: 'DEE' })).not.toBeInTheDocument();
  });

  it('renders nothing rather than an empty frame when nobody was active', () => {
    const { container } = render(<WeekPodium standings={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders only the cards it has on a short board', () => {
    render(<WeekPodium standings={[standing('ada', 9), standing('bob', 6)]} />);

    expect(placesShown()).toEqual(['1', '2']);
  });

  it('prints each category count beside its icon', () => {
    render(
      <WeekPodium
        standings={[standing('ada', 9, { pullRequests: 7, reviews: 5, issues: 3, commits: 2 })]}
      />,
    );

    const figures = within(card('ada'))
      .getAllByRole('listitem')
      .map((li) => li.textContent);

    expect(figures).toEqual(['7pull requests', '5reviews', '3issues', '2commits']);
  });

  it('numbers a tied lead 1, 1, 3 rather than printing half a place', () => {
    render(<WeekPodium standings={[standing('ada', 9), standing('bob', 9), standing('cy', 4)]} />);

    expect(placesShown()).toEqual(['1', '1', '3']);
  });

  it('says a shared place is shared, for a reader who cannot see the layout', () => {
    render(<WeekPodium standings={[standing('ada', 9), standing('bob', 9), standing('cy', 4)]} />);

    expect(within(card('ada')).getByText('tied')).toBeInTheDocument();
    expect(within(card('bob')).getByText('tied')).toBeInTheDocument();
    expect(within(card('cy')).queryByText('tied')).not.toBeInTheDocument();
  });

  it('gives the leading card the larger avatar, not whichever card is centred', () => {
    render(<WeekPodium standings={[standing('ada', 9), standing('bob', 6), standing('cy', 4)]} />);

    const avatar = (login: string) => card(login).querySelector('img')!.className;

    expect(avatar('ada')).toContain('sm:size-16');
    expect(avatar('bob')).toContain('sm:size-12');
    expect(avatar('cy')).toContain('sm:size-12');
  });

  it('keeps the lead avatar on every tied leader, not just the first of them', () => {
    render(<WeekPodium standings={[standing('ada', 9), standing('bob', 9), standing('cy', 4)]} />);

    const avatar = (login: string) => card(login).querySelector('img')!.className;

    expect(avatar('ada')).toContain('sm:size-11');
    expect(avatar('bob')).toContain('sm:size-11');
    expect(avatar('cy')).not.toContain('sm:size-11');
  });

  it('reads the leading card at the size of the others on a narrow screen', () => {
    render(<WeekPodium standings={[standing('ada', 9), standing('bob', 6), standing('cy', 4)]} />);

    expect(unprefixed(card('ada'))).toEqual(unprefixed(card('bob')));
    expect(unprefixed(card('ada').querySelector('img')!)).toEqual(
      unprefixed(card('bob').querySelector('img')!),
    );
    expect(unprefixed(screen.getByRole('link', { name: 'ADA' }))).toEqual(
      unprefixed(screen.getByRole('link', { name: 'BOB' })),
    );
  });

  it('prints the weekly points the table prints, to the same two decimals', () => {
    render(<WeekPodium standings={[standing('ada', 9.125), standing('bob', 6)]} />);

    expect(score('ada')).toHaveTextContent('9.13');
    expect(score('bob')).toHaveTextContent('6.00');
  });

  it('names each category in a tooltip, and leaves the reader-only label in place', () => {
    render(<WeekPodium standings={[standing('ada', 9)]} />);

    const figures = within(card('ada')).getAllByRole('listitem');

    expect(figures.map((li) => li.getAttribute('title'))).toEqual([
      'pull requests',
      'reviews',
      'issues',
      'commits',
    ]);
    expect(within(card('ada')).getByText('pull requests')).toHaveClass('sr-only');
  });

  it('drops the stepped shape when a tie reaches the podium', () => {
    const { container } = render(
      <WeekPodium standings={[standing('ada', 9), standing('bob', 9), standing('cy', 4)]} />,
    );

    expect(container.querySelector('.sm\\:grid')).toBeNull();
    expect(cards().some((node) => node.className.includes('sm:order'))).toBe(false);
  });

  it('leads the stepped card with the avatar and the row card with the rank', () => {
    const { rerender } = render(
      <WeekPodium standings={[standing('ada', 9), standing('bob', 6), standing('cy', 4)]} />,
    );

    // Stacked by `sm:flex-col`, so the order classes are what put the face on top.
    const stepped = [...card('ada').children].map((node) => node.className);

    expect(stepped[0]).toContain('sm:order-2');
    expect(stepped[1]).toContain('sm:order-1');

    // The tied card stays a row at every width, so nothing may reorder it.
    rerender(
      <WeekPodium standings={[standing('ada', 9), standing('bob', 9), standing('cy', 4)]} />,
    );

    for (const node of card('ada').children) {
      expect(node.className).not.toContain('sm:order');
    }
  });

  it('steps the podium when the three places are distinct', () => {
    const { container } = render(
      <WeekPodium standings={[standing('ada', 9), standing('bob', 6), standing('cy', 4)]} />,
    );

    expect(container.querySelector('.sm\\:grid')).not.toBeNull();
    expect(card('ada').className).toContain('sm:order-2');
    expect(card('bob').className).toContain('sm:order-1');
    expect(card('cy').className).toContain('sm:order-3');
  });

  it('drops the stepped shape for a third place tied with a member it does not show', () => {
    const { container } = render(
      <WeekPodium
        standings={[standing('ada', 9), standing('bob', 6), standing('cy', 4), standing('dee', 4)]}
      />,
    );

    expect(container.querySelector('.sm\\:grid')).toBeNull();
    expect(within(card('cy')).getByText('tied')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'DEE' })).not.toBeInTheDocument();
  });

  it('keeps the stepped shape when the fourth member merely trails third', () => {
    const { container } = render(
      <WeekPodium
        standings={[
          standing('ada', 9),
          standing('bob', 6),
          standing('cy', 4),
          standing('dee', 3.99),
        ]}
      />,
    );

    expect(container.querySelector('.sm\\:grid')).not.toBeNull();
  });

  it('leaves an empty ring where a member has no avatar', () => {
    render(<WeekPodium standings={[standing('ada', 9, { avatarUrl: '' })]} />);

    expect(card('ada').querySelector('img')).toBeNull();
  });
});

describe('MonthPodium', () => {
  it('numbers by ladder position and rounds the rating for display', () => {
    render(
      <MonthPodium ranked={[entry('ada', 1042.6), entry('bob', 1001.2), entry('cy', 980.4)]} />,
    );

    expect(placesShown()).toEqual(['1', '2', '3']);
    expect(within(card('ada')).getByText('1043')).toBeInTheDocument();
    expect(within(card('cy')).getByText('980')).toBeInTheDocument();
  });

  it('prints its rating larger than the week prints its points', () => {
    const month = render(<MonthPodium ranked={[entry('ada', 1042.6)]} />);
    const week = render(<WeekPodium standings={[standing('ada', 9)]} />);

    const size = (view: typeof month) => view.container.querySelector('[data-score]')!.className;

    expect(size(month)).toContain('sm:text-xl');
    expect(size(week)).not.toContain('sm:text-xl');
  });

  it('carries no category figures', () => {
    render(<MonthPodium ranked={[entry('ada', 1042.6)]} />);

    expect(card('ada').querySelector('ul')).toBeNull();
  });

  it('steps the podium, since the ladder cannot tie', () => {
    const { container } = render(
      <MonthPodium ranked={[entry('ada', 1000), entry('bob', 1000), entry('cy', 1000)]} />,
    );

    expect(container.querySelector('.sm\\:grid')).not.toBeNull();
    expect(placesShown()).toEqual(['1', '2', '3']);
  });

  it('renders nothing when nobody is ranked yet', () => {
    const { container } = render(<MonthPodium ranked={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
