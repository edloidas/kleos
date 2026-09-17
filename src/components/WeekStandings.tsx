import type { Award, BadgeKind } from '../lib/badges';
import type { Standing } from '../lib/board';
import { competitionPlaces } from '../lib/podium';
import { Badge } from './Badges';

const NO_BADGES: Award[] = [];

function delta(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;
}

/** A round that moved nothing is not a gain, so it stays off the two meaning colours. */
function deltaColor(value: number): string {
  if (value === 0) return 'text-muted';

  return value > 0 ? 'text-gain' : 'text-loss';
}

/**
 * The round's table. Server-rendered like `Leaderboard`, and a React component for
 * the same reason: sorting is a `client:load` away rather than a rewrite.
 */
export function WeekStandings({
  standings,
  badges = NO_BADGES,
}: {
  standings: Standing[];
  badges?: Award[];
}) {
  if (standings.length === 0) {
    return <p className="text-muted">Nobody has been active in this round yet.</p>;
  }

  // The podium derives its places the same way from the same points, so the two cannot
  // disagree. `Standing.place` stays the midrank the rating is scored on.
  const places = competitionPlaces(standings.map((member) => member.points));
  // At most one each, since a badge is never awarded twice in a round.
  const held = new Map<string, BadgeKind>(badges.map((award) => [award.login, award.kind]));

  return (
    <div className="overflow-x-auto rounded-2xl border border-line-soft raised px-4 py-1">
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
          {standings.map((member, index) => (
            <tr key={member.login} className="border-b border-line-soft last:border-0">
              <td className="py-2 pr-4 text-muted">{places[index]}</td>
              <td className="py-2 pr-4">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <a
                    href={`https://github.com/${member.login}`}
                    className="transition-colors duration-150 hover:text-ember hover:underline"
                  >
                    {member.name ?? member.login}
                  </a>
                  {held.has(member.login) && <Badge kind={held.get(member.login)!} />}
                </span>
              </td>
              <td className="py-2 pr-4 text-right">{member.pullRequests}</td>
              <td className="py-2 pr-4 text-right">{member.reviews}</td>
              <td className="py-2 pr-4 text-right">{member.issues}</td>
              <td className="py-2 pr-4 text-right">{member.commits}</td>
              <td className="py-2 pr-4 text-right text-bronze">{member.points.toFixed(2)}</td>
              <td className={`py-2 text-right ${deltaColor(member.delta)}`}>
                {delta(member.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
