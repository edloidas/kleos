import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { BadgeKind } from '../lib/badges';
import type { Highlight } from '../lib/spotlight';
import { Spotlight } from './Spotlight';

function highlight(login: string, kind: BadgeKind = 'commits', avatar = true): Highlight {
  return {
    kind,
    login,
    name: login.toUpperCase(),
    avatarUrl: avatar ? `https://example.test/${login}.png` : '',
  };
}

function cards() {
  return [...document.querySelectorAll<HTMLElement>('li.raised')];
}

/** The card is the link's nearest bordered ancestor, as the podium's tests take it. */
function card(login: string) {
  return screen.getByRole('link', { name: login.toUpperCase() }).closest<HTMLElement>('.raised')!;
}

describe('Spotlight', () => {
  it('shows one card per badge holder', () => {
    render(
      <Spotlight
        highlights={[highlight('ada', 'pullRequests'), highlight('bob'), highlight('cy', 'riser')]}
      />,
    );

    expect(cards()).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'ADA' })).toHaveAttribute(
      'href',
      'https://github.com/ada',
    );
  });

  it('prints the badge and its explanation on the card', () => {
    render(<Spotlight highlights={[highlight('ada', 'pullRequests')]} />);

    expect(within(card('ada')).getByText('PR Machine')).toBeInTheDocument();
    expect(within(card('ada')).getByText('Most pull requests this week')).toBeInTheDocument();
  });

  it('does not repeat the explanation into the tooltip and the reader-only text', () => {
    render(<Spotlight highlights={[highlight('ada', 'pullRequests')]} />);

    const title = 'Most pull requests this week';

    expect(within(card('ada')).getByText('PR Machine')).not.toHaveAttribute('title');
    expect(within(card('ada')).getAllByText(title)).toHaveLength(1);
  });

  it('falls back to the login when the round carries no display name', () => {
    render(<Spotlight highlights={[{ ...highlight('ada'), name: null }]} />);

    expect(screen.getByRole('link', { name: 'ada' })).toBeInTheDocument();
  });

  it('draws an empty ring rather than a broken image for a member with no avatar', () => {
    render(<Spotlight highlights={[highlight('ada', 'commits', false)]} />);

    expect(card('ada').querySelector('img')).toBeNull();
    expect(card('ada').querySelector('span[aria-hidden="true"]')).toHaveClass(
      'size-9',
      'bg-sunken',
    );
  });

  it('renders nothing rather than an empty frame when nobody qualifies', () => {
    const { container } = render(<Spotlight highlights={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('gives the grid one column per card, so a short row is not a gapped four', () => {
    const { container, rerender } = render(<Spotlight highlights={[highlight('ada')]} />);
    const frame = () => container.querySelector('ul')!.className;

    expect(frame()).toContain('sm:grid-cols-1');

    rerender(<Spotlight highlights={[highlight('ada'), highlight('bob', 'reviews')]} />);
    expect(frame()).toContain('sm:grid-cols-2');
  });
});
