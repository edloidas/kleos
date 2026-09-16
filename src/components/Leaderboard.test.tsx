import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ScoredMember } from '../lib/score';
import { Leaderboard } from './Leaderboard';

/**
 * Every count is distinct, within a member and between members, so that a
 * swapped column or a cell reading the wrong field cannot look correct.
 */
function member(login: string, index: number, name: string | null = null): ScoredMember {
  const counts = {
    pullRequests: index * 10 + 1,
    reviews: index * 10 + 2,
    issues: index * 10 + 3,
    commits: index * 10 + 4,
    restricted: 0,
  };

  return {
    login,
    name,
    avatarUrl: `https://example.test/${login}.png`,
    overall: counts,
    score: 100 - index - 0.0256,
    ...counts,
  };
}

const FIVE = ['a', 'b', 'c', 'd', 'e'].map((login, index) => member(login, index));

function podiumItems() {
  return within(screen.getByRole('list')).getAllByRole('listitem');
}

function bodyRows() {
  // Row 0 is the header.
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

describe('Leaderboard', () => {
  it('says so when nobody contributed', () => {
    render(<Leaderboard members={[]} />);

    expect(screen.getByText('No public contributions in this period.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('puts the first three on the podium and the rest in the table', () => {
    render(<Leaderboard members={FIVE} />);

    expect(podiumItems().map((item) => within(item).getByRole('link').textContent)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(bodyRows().map((row) => within(row).getByRole('link').textContent)).toEqual(['d', 'e']);
  });

  it('numbers the podium from one', () => {
    render(<Leaderboard members={FIVE} />);

    // The rank element specifically: '100 points' in the item's own text would
    // satisfy a substring match for rank '1'.
    const ranks = podiumItems().map((item) => item.firstElementChild?.textContent);

    expect(ranks).toEqual(['1', '2', '3']);
  });

  it('continues the ranking below the podium', () => {
    render(<Leaderboard members={FIVE} />);

    expect(within(bodyRows()[0]).getAllByRole('cell')[0]).toHaveTextContent('4');
    expect(within(bodyRows()[1]).getAllByRole('cell')[0]).toHaveTextContent('5');
  });

  it('puts each count under its own heading', () => {
    render(<Leaderboard members={FIVE} />);

    const table = within(screen.getByRole('table'));
    const headings = table.getAllByRole('columnheader').map((th) => th.textContent);
    const cells = within(bodyRows()[0])
      .getAllByRole('cell')
      .map((cell) => cell.textContent);

    // Paired, so a swapped heading cannot pass on the cell values alone.
    expect(headings.map((heading, index) => [heading, cells[index]])).toEqual([
      ['#', '4'],
      ['Member', 'd'],
      ['PRs', '31'],
      ['Reviews', '32'],
      ['Issues', '33'],
      ['Commits', '34'],
      ['Score', '97.0'],
    ]);
  });

  it('shows the score on the podium', () => {
    render(<Leaderboard members={FIVE} />);

    // 99.9744 rounds up: a whole-number fixture could not tell rounding from truncation.
    expect(podiumItems()[0]).toHaveTextContent('100.0 points');
  });

  it('prints the formula it ranks by', () => {
    render(<Leaderboard members={FIVE} />);

    expect(screen.getByText(/^Score =/).textContent?.replace(/\s+/g, ' ')).toBe(
      'Score = sum of weight × n / (n + k), over PRs (5/2), reviews (4/3), issues (2/2) and ' +
        'commits (1/8). Each category maxes out at its weight and reaches half of it at k. ' +
        'Scores are shown to one decimal; ranking uses the unrounded value.',
    );
  });

  it('prefers the name and falls back to the login, in both regions', () => {
    const members = [
      member('podium-named', 0, 'Podium Named'),
      member('podium-plain', 1),
      member('c', 2),
      member('table-named', 3, 'Table Named'),
      member('table-plain', 4),
    ];

    render(<Leaderboard members={members} />);

    expect(podiumItems().map((item) => within(item).getByRole('link').textContent)).toEqual([
      'Podium Named',
      'podium-plain',
      'c',
    ]);
    expect(bodyRows().map((row) => within(row).getByRole('link').textContent)).toEqual([
      'Table Named',
      'table-plain',
    ]);
  });

  it('links every member to their GitHub profile', () => {
    render(<Leaderboard members={[member('edloidas', 0, 'Mikita')]} />);

    expect(screen.getByRole('link', { name: 'Mikita' })).toHaveAttribute(
      'href',
      'https://github.com/edloidas',
    );
  });
});
