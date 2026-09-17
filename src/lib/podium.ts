export const PODIUM_SIZE = 3;

export type Slot<T> = {
  member: T;
  place: number;
  /** The place is held by more than one member, whether or not the peer is shown. */
  shared: boolean;
};

export type Podium<T> = {
  slots: Slot<T>[];
  /** A place shown on the podium is shared, so the stepped shape would rank equals. */
  tied: boolean;
};

/**
 * Standard competition ranking: one plus the number of members scoring strictly
 * higher, so a tied pair reads `1, 1, 3` where the rating's midrank reads `1.5, 1.5, 3`.
 *
 * `values` must already be sorted descending, which is how both views hold them.
 */
export function competitionPlaces(values: number[]): number[] {
  const places: number[] = [];

  for (let i = 0; i < values.length; i++) {
    places[i] = values[i] === values[i - 1] ? places[i - 1]! : i + 1;
  }

  return places;
}

/**
 * The leading members and the layout to draw them in. `places` is supplied rather
 * than derived: the week ranks on points, where ties are real, the month on ladder
 * order, where they are not.
 *
 * `shared` looks one past the cutoff, so a third place tied with a fourth member
 * the podium never shows still reads as shared.
 */
export function podium<T>(members: T[], places: number[]): Podium<T> {
  const slots = members.slice(0, PODIUM_SIZE).map((member, index) => ({
    member,
    place: places[index]!,
    shared: places[index] === places[index - 1] || places[index] === places[index + 1],
  }));

  return { slots, tied: slots.some((slot) => slot.shared) };
}
