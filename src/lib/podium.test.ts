import { describe, expect, it } from 'vitest';

import { competitionPlaces, podium } from './podium';

/** Points, highest first, as both views hold their rows. */
function places(...points: number[]): number[] {
  return competitionPlaces(points);
}

function board(...points: number[]) {
  const members = points.map((_, index) => `m${index}`);

  return podium(members, competitionPlaces(points));
}

describe('competitionPlaces', () => {
  it('numbers a clean board one to N', () => {
    expect(places(9, 6, 4, 1)).toEqual([1, 2, 3, 4]);
  });

  it('gives tied members one place and skips the ones they cover', () => {
    expect(places(9, 9, 4)).toEqual([1, 1, 3]);
    expect(places(9, 9, 9, 4)).toEqual([1, 1, 1, 4]);
    expect(places(9, 6, 6, 4)).toEqual([1, 2, 2, 4]);
    expect(places(9, 6, 4, 4)).toEqual([1, 2, 3, 3]);
  });

  it('never prints the half place the rating computes', () => {
    // `rating.ts` midranks the same board to 1.5, 1.5, 3.
    expect(places(9, 9, 4)).not.toContain(1.5);
  });

  it('handles an empty board and a lone member', () => {
    expect(places()).toEqual([]);
    expect(places(9)).toEqual([1]);
  });
});

describe('podium', () => {
  it('takes the leading three and leaves the rest to the table', () => {
    const { slots, tied } = board(9, 6, 4, 1);

    expect(slots.map((slot) => slot.member)).toEqual(['m0', 'm1', 'm2']);
    expect(slots.map((slot) => slot.place)).toEqual([1, 2, 3]);
    expect(tied).toBe(false);
  });

  it('marks a shared lead and drops the stepped shape', () => {
    const { slots, tied } = board(9, 9, 4);

    expect(slots.map((slot) => slot.place)).toEqual([1, 1, 3]);
    expect(slots.map((slot) => slot.shared)).toEqual([true, true, false]);
    expect(tied).toBe(true);
  });

  it('shows a three-way lead as three equal firsts', () => {
    const { slots, tied } = board(9, 9, 9, 4);

    expect(slots.map((slot) => slot.place)).toEqual([1, 1, 1]);
    expect(slots.every((slot) => slot.shared)).toBe(true);
    expect(tied).toBe(true);
  });

  it('marks a shared second', () => {
    const { slots, tied } = board(9, 6, 6, 4);

    expect(slots.map((slot) => slot.place)).toEqual([1, 2, 2]);
    expect(slots.map((slot) => slot.shared)).toEqual([false, true, true]);
    expect(tied).toBe(true);
  });

  it('sees a third place shared with the member it does not show', () => {
    const { slots, tied } = board(9, 6, 4, 4);

    expect(slots).toHaveLength(3);
    expect(slots.at(-1)!.shared).toBe(true);
    expect(tied).toBe(true);
  });

  it('does not call third shared when the fourth member merely trails it', () => {
    expect(board(9, 6, 4, 3.999).tied).toBe(false);
  });

  it('renders only the slots that exist on a short board', () => {
    expect(board().slots).toEqual([]);
    expect(board(9).slots.map((slot) => slot.place)).toEqual([1]);
    expect(board(9, 6).slots.map((slot) => slot.place)).toEqual([1, 2]);
  });

  it('marks a tie that is the whole board', () => {
    const { slots, tied } = board(9, 9);

    expect(slots.map((slot) => slot.place)).toEqual([1, 1]);
    expect(tied).toBe(true);
  });

  it('takes places as given, so a view without ties keeps ladder order', () => {
    const { slots, tied } = podium(['a', 'b', 'c'], [1, 2, 3]);

    expect(slots.map((slot) => slot.place)).toEqual([1, 2, 3]);
    expect(tied).toBe(false);
  });
});
