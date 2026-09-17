import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Standing } from '../lib/board';
import { WeekStandings } from './WeekStandings';

/**
 * Every count is distinct, within a member and between members, so that a
 * swapped column or a cell reading the wrong field cannot look correct.
 */
function standing(login: string, index: number, over: Partial<Standing> = {}): Standing {
  const counts = {
    pullRequests: index * 10 + 1,
    reviews: index * 10 + 2,
    issues: index * 10 + 3,
    commits: index * 10 + 4,
    restricted: 0,
  };

  return {
    login,
    name: login.toUpperCase(),
    avatarUrl: `https://example.test/${login}.png`,
    overall: counts,
    points: 10 - index - 0.0256,
    place: index + 1,
    delta: 5 - index * 4,
    ...counts,
    ...over,
  };
}

function row(login: string) {
  return screen.getByRole('link', { name: login.toUpperCase() }).closest('tr')!;
}

describe('WeekStandings', () => {
  it('says the round is empty rather than rendering a headed, bodiless table', () => {
    render(<WeekStandings standings={[]} />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/nobody has been active/i)).toBeInTheDocument();
  });

  it('puts each count under its own column', () => {
    render(<WeekStandings standings={[standing('ada', 0)]} />);

    const cells = within(row('ada'))
      .getAllByRole('cell')
      .map((cell) => cell.textContent);

    // place, member, PRs, reviews, issues, commits, points, delta
    expect(cells).toEqual(['1', 'ADA', '1', '2', '3', '4', '9.97', '+5.0']);
  });

  it('keeps the rating midrank of a tie rather than rounding it to a place', () => {
    render(
      <WeekStandings
        standings={[standing('ada', 0, { place: 1.5 }), standing('bob', 1, { place: 1.5 })]}
      />,
    );

    expect(within(row('ada')).getAllByRole('cell')[0]).toHaveTextContent('1.5');
    expect(within(row('bob')).getAllByRole('cell')[0]).toHaveTextContent('1.5');
  });

  it('signs a rating change in both directions', () => {
    render(
      <WeekStandings
        standings={[standing('up', 0, { delta: 11.24 }), standing('down', 1, { delta: -11.24 })]}
      />,
    );

    expect(within(row('up')).getAllByRole('cell').at(-1)).toHaveTextContent('+11.2');
    // U+2212, not a hyphen: the column is read, not parsed.
    expect(within(row('down')).getAllByRole('cell').at(-1)).toHaveTextContent('−11.2');
  });

  it('shows a zero change as gained rather than lost', () => {
    render(<WeekStandings standings={[standing('ada', 0, { delta: 0 })]} />);

    expect(within(row('ada')).getAllByRole('cell').at(-1)).toHaveTextContent('+0.0');
  });

  // jsdom computes no colours, so the utility class is the rendered semantic here.
  it('colours a rating change by its direction, and a round that moved nothing as neither', () => {
    render(
      <WeekStandings
        standings={[
          standing('up', 0, { delta: 11.24 }),
          standing('down', 1, { delta: -11.24 }),
          standing('flat', 2, { delta: 0 }),
        ]}
      />,
    );

    const cell = (login: string) => within(row(login)).getAllByRole('cell').at(-1)!;

    expect(cell('up')).toHaveClass('text-gain');
    expect(cell('down')).toHaveClass('text-loss');
    expect(cell('flat')).toHaveClass('text-muted');
  });

  it('falls back to the login when a member has no display name', () => {
    render(<WeekStandings standings={[standing('ada', 0, { name: null })]} />);

    expect(screen.getByRole('link', { name: 'ada' })).toHaveAttribute(
      'href',
      'https://github.com/ada',
    );
  });
});
