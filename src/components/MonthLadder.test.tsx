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

  it('numbers the rows and formats the rating and the delta for display', () => {
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

  it('names the unranked in a note rather than a second table', () => {
    render(
      <MonthLadder
        month={view({
          ranked: [entry('ada')],
          unranked: [entry('new', { roundsPlayed: 2 }), entry('idle', { roundsPlayed: 1 })],
        })}
      />,
    );

    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.getByText(/rounds played:/).textContent).toBe(
      'Unranked, under 3 rounds played: NEW, IDLE.',
    );
    expect(screen.getByRole('link', { name: 'NEW' })).toHaveAttribute(
      'href',
      'https://github.com/new',
    );
  });

  it('says the ladder is unranked when nobody has played enough rounds', () => {
    render(<MonthLadder month={view({ unranked: [entry('new', { roundsPlayed: 1 })] })} />);

    expect(screen.getByText(/nobody has played 3 rounds yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // jsdom computes no colours, so the utility class is the rendered semantic here.
  it('colours a rating change by its direction, and a round that moved nothing as neither', () => {
    render(
      <MonthLadder
        month={view({
          ranked: [
            entry('up', { lastDelta: 11.24 }),
            entry('down', { lastDelta: -11.24 }),
            entry('flat', { lastDelta: 0 }),
          ],
        })}
      />,
    );

    const cell = (login: string) => within(row(login)).getAllByRole('cell')[3]!;

    expect(cell('up')).toHaveClass('text-gain');
    expect(cell('down')).toHaveClass('text-loss');
    expect(cell('flat')).toHaveTextContent('+0.0');
    expect(cell('flat')).toHaveClass('text-muted');
  });
});
