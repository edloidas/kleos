import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { LadderRow, MonthView } from '../lib/board';
import { MonthLadder } from './MonthLadder';

function entry(login: string, over: Partial<LadderRow> = {}): LadderRow {
  return {
    login,
    name: login.toUpperCase(),
    avatarUrl: `https://example.test/${login}.png`,
    rating: 1000,
    provisionalDelta: 0,
    lastDelta: 0,
    roundsPlayed: 3,
    lastActiveWeek: '2026-W38',
    results: [],
    ...over,
  };
}

function view(over: Partial<MonthView> = {}): MonthView {
  return {
    start: '2026-09-01T00:00:00.000Z',
    rounds: 3,
    ranked: [],
    unranked: [],
    provisionalRound: '2026-W38',
    ...over,
  };
}

function row(login: string) {
  return screen.getByRole('link', { name: login.toUpperCase() }).closest('tr')!;
}

describe('MonthLadder', () => {
  it('says the season is empty rather than rendering two bodiless tables', () => {
    render(<MonthLadder month={view()} />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/no rounds have been played/i)).toBeInTheDocument();
  });

  it('rounds the rating for display and places by ladder order', () => {
    render(
      <MonthLadder
        month={view({
          ranked: [
            entry('ada', { rating: 1034.6, lastDelta: 11.24 }),
            entry('bob', { rating: 1019.4, lastDelta: -11.24 }),
          ],
        })}
      />,
    );

    expect(
      within(row('ada'))
        .getAllByRole('cell')
        .slice(0, 4)
        .map((c) => c.textContent),
    ).toEqual(['1', 'ADA', '1035', '+11.2']);
    expect(within(row('bob')).getAllByRole('cell')[2]).toHaveTextContent('1019');
    expect(within(row('bob')).getAllByRole('cell')[3]).toHaveTextContent('−11.2');
  });

  // The column means two different things, and saying the wrong one is the bug:
  // on a Monday the delta shown belongs to a week that has finished.
  it('names the delta column for a running round', () => {
    render(<MonthLadder month={view({ ranked: [entry('ada')] })} />);

    expect(screen.getByRole('columnheader', { name: /this week so far/i })).toBeInTheDocument();
  });

  it('names the delta column for a finished round', () => {
    render(<MonthLadder month={view({ ranked: [entry('ada')], provisionalRound: null })} />);

    expect(screen.getByRole('columnheader', { name: /last round/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: /this week so far/i }),
    ).not.toBeInTheDocument();
  });

  it('separates the unranked from the ladder and shows what they are short of', () => {
    render(
      <MonthLadder
        month={view({
          ranked: [entry('ada')],
          unranked: [entry('new', { roundsPlayed: 2, lastActiveWeek: '2026-W37' })],
        })}
      />,
    );

    expect(screen.getByText(/unranked/i)).toBeInTheDocument();

    const cells = within(row('new'))
      .getAllByRole('cell')
      .map((cell) => cell.textContent);

    expect(cells).toEqual(['NEW', '2', 'Week 37']);
  });

  it('says the ladder is unranked when nobody has played enough rounds', () => {
    render(<MonthLadder month={view({ unranked: [entry('new', { roundsPlayed: 1 })] })} />);

    expect(screen.getByText(/nobody has played 3 rounds yet/i)).toBeInTheDocument();
  });

  it('dashes a last-active week that does not exist', () => {
    render(
      <MonthLadder
        month={view({ unranked: [entry('idle', { roundsPlayed: 0, lastActiveWeek: null })] })}
      />,
    );

    expect(within(row('idle')).getAllByRole('cell').at(-1)).toHaveTextContent('—');
  });
});
