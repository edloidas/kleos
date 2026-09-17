import type { LadderRow, MonthView } from '../lib/board';
import { MIN_ROUNDS } from '../lib/rating';

function delta(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;
}

/** A round that moved nothing is not a gain, so it stays off the two meaning colours. */
function deltaColor(value: number): string {
  if (value === 0) return 'text-muted';

  return value > 0 ? 'text-gain' : 'text-loss';
}

function MemberLink({ entry }: { entry: LadderRow }) {
  return (
    <a
      href={`https://github.com/${entry.login}`}
      className="transition-colors duration-150 hover:text-ember hover:underline"
    >
      {entry.name ?? entry.login}
    </a>
  );
}

/**
 * The season's ladder. Rating and weekly points are labelled apart on purpose:
 * they are different numbers on different scales, and a reader who conflates them
 * reads the table as saying something it does not.
 */
export function MonthLadder({ month }: { month: MonthView }) {
  if (month.ranked.length === 0 && month.unranked.length === 0) {
    return <p className="text-muted">No rounds have been played this season yet.</p>;
  }

  return (
    <div className="space-y-6">
      {month.ranked.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-line-soft raised px-4 py-1">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="py-2 pr-4 font-normal">#</th>
                <th className="py-2 pr-4 font-normal">Member</th>
                <th className="py-2 pr-4 text-right font-normal">Rating</th>
                <th className="py-2 text-right font-normal">
                  {month.provisionalRound ? 'This week so far' : 'Last round'}
                </th>
              </tr>
            </thead>
            <tbody>
              {month.ranked.map((entry, index) => (
                <Row key={entry.login} entry={entry} place={index + 1} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted">
          Nobody has played {MIN_ROUNDS} rounds yet, so the ladder is not ranked.
        </p>
      )}

      {month.unranked.length > 0 && (
        <p className="text-xs text-muted">
          Unranked, under {MIN_ROUNDS} rounds played:{' '}
          {month.unranked.map((entry, index) => (
            <span key={entry.login}>
              {index > 0 && ', '}
              <MemberLink entry={entry} />
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}

function Row({ entry, place }: { entry: LadderRow; place: number }) {
  return (
    <tr className="border-b border-line-soft last:border-0">
      <td className="py-2 pr-4 text-muted">{place}</td>
      <td className="py-2 pr-4">
        <MemberLink entry={entry} />
      </td>
      <td className="py-2 pr-4 text-right text-bronze">{Math.round(entry.rating)}</td>
      <td className={`py-2 text-right ${deltaColor(entry.lastDelta)}`}>{delta(entry.lastDelta)}</td>
    </tr>
  );
}
