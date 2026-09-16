import type { LadderRow, MonthView } from '../lib/board';
import { MIN_ROUNDS } from '../lib/rating';

function delta(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;
}

/** A week id reads as `2026-W38`; the table only has room for the number. */
function weekNumber(week: string): string {
  return `Week ${Number(week.slice(-2))}`;
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
    <div className="space-y-10">
      {month.ranked.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-line-soft raised px-4 py-1">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="py-2 pr-4 font-normal">#</th>
                <th className="py-2 pr-4 font-normal">Member</th>
                <th className="py-2 pr-4 text-right font-normal">Rating</th>
                <th className="py-2 pr-4 text-right font-normal">
                  {month.provisionalRound ? 'This week so far' : 'Last round'}
                </th>
                <th className="py-2 text-right font-normal">Rounds</th>
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
        <div>
          <h3 className="text-sm text-muted">Unranked — fewer than {MIN_ROUNDS} rounds played</h3>

          <div className="mt-3 overflow-x-auto rounded-2xl border border-line-soft raised px-4 py-1">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="py-2 pr-4 font-normal">Member</th>
                  <th className="py-2 pr-4 text-right font-normal">Rounds</th>
                  <th className="py-2 text-right font-normal">Last active</th>
                </tr>
              </thead>
              <tbody>
                {month.unranked.map((entry) => (
                  <tr key={entry.login} className="border-b border-line-soft">
                    <td className="py-2 pr-4">
                      <a href={`https://github.com/${entry.login}`} className="hover:underline">
                        {entry.name ?? entry.login}
                      </a>
                    </td>
                    <td className="py-2 pr-4 text-right">{entry.roundsPlayed}</td>
                    <td className="py-2 text-right text-muted">
                      {entry.lastActiveWeek ? weekNumber(entry.lastActiveWeek) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ entry, place }: { entry: LadderRow; place: number }) {
  return (
    <tr className="border-b border-line-soft">
      <td className="py-2 pr-4 text-muted">{place}</td>
      <td className="py-2 pr-4">
        <a href={`https://github.com/${entry.login}`} className="hover:underline">
          {entry.name ?? entry.login}
        </a>
      </td>
      <td className="py-2 pr-4 text-right text-bronze">{Math.round(entry.rating)}</td>
      <td className="py-2 pr-4 text-right text-muted">{delta(entry.lastDelta)}</td>
      <td className="py-2 text-right">{entry.roundsPlayed}</td>
    </tr>
  );
}
