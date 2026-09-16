import type { Standing } from '../lib/board';

/** Midranks are halves on a tie, so 2.5 has to survive to the page as "2.5". */
function place(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function delta(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;
}

/**
 * The round's table. Server-rendered like `Leaderboard`, and a React component for
 * the same reason: sorting is a `client:load` away rather than a rewrite.
 */
export function WeekStandings({ standings }: { standings: Standing[] }) {
  if (standings.length === 0) {
    return <p className="text-muted">Nobody has been active in this round yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-muted">
          <tr>
            <th className="py-2 pr-4 font-normal">#</th>
            <th className="py-2 pr-4 font-normal">Member</th>
            <th className="py-2 pr-4 text-right font-normal">PRs</th>
            <th className="py-2 pr-4 text-right font-normal">Reviews</th>
            <th className="py-2 pr-4 text-right font-normal">Issues</th>
            <th className="py-2 pr-4 text-right font-normal">Commits</th>
            <th className="py-2 pr-4 text-right font-normal">Weekly points</th>
            <th className="py-2 text-right font-normal">Rating change</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((member) => (
            <tr key={member.login} className="border-b border-line/60">
              <td className="py-2 pr-4 text-muted">{place(member.place)}</td>
              <td className="py-2 pr-4">
                <a href={`https://github.com/${member.login}`} className="hover:underline">
                  {member.name ?? member.login}
                </a>
              </td>
              <td className="py-2 pr-4 text-right">{member.pullRequests}</td>
              <td className="py-2 pr-4 text-right">{member.reviews}</td>
              <td className="py-2 pr-4 text-right">{member.issues}</td>
              <td className="py-2 pr-4 text-right">{member.commits}</td>
              <td className="py-2 pr-4 text-right text-laurel">{member.points.toFixed(2)}</td>
              <td
                className={`py-2 text-right ${member.delta >= 0 ? 'text-parchment' : 'text-muted'}`}
              >
                {delta(member.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
