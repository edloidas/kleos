import type { ScoredMember } from '../lib/score';
import { WEIGHTS } from '../lib/score';

/**
 * Rendered on the server for now — no client directive, so the page ships zero JS.
 * It is a React component so the first interactive feature (sorting, filters) is a
 * `client:load` away rather than a rewrite.
 */
export function Leaderboard({ members }: { members: ScoredMember[] }) {
  if (members.length === 0) {
    return <p className="text-muted">No public contributions in this period.</p>;
  }

  const [top, rest] = [members.slice(0, 3), members.slice(3)];

  return (
    <div className="space-y-10">
      <ol className="grid gap-3 sm:grid-cols-3">
        {top.map((member, index) => (
          <li
            key={member.login}
            className="rounded-lg border border-line bg-surface p-4 text-center"
          >
            <div className="font-display text-3xl text-laurel">{index + 1}</div>
            <img
              src={member.avatarUrl}
              alt=""
              width={56}
              height={56}
              className="mx-auto my-3 rounded-full"
            />
            <a href={`https://github.com/${member.login}`} className="font-medium hover:underline">
              {member.name ?? member.login}
            </a>
            <div className="mt-1 text-sm text-muted">{member.score} points</div>
          </li>
        ))}
      </ol>

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
              <th className="py-2 text-right font-normal">Score</th>
            </tr>
          </thead>
          <tbody>
            {rest.map((member, index) => (
              <tr key={member.login} className="border-b border-line/60">
                <td className="py-2 pr-4 text-muted">{index + 4}</td>
                <td className="py-2 pr-4">
                  <a href={`https://github.com/${member.login}`} className="hover:underline">
                    {member.name ?? member.login}
                  </a>
                </td>
                <td className="py-2 pr-4 text-right">{member.pullRequests}</td>
                <td className="py-2 pr-4 text-right">{member.reviews}</td>
                <td className="py-2 pr-4 text-right">{member.issues}</td>
                <td className="py-2 pr-4 text-right">{member.commits}</td>
                <td className="py-2 text-right text-laurel">{member.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Score = {WEIGHTS.pullRequests}×PR + {WEIGHTS.reviews}×review + {WEIGHTS.issues}×issue +{' '}
        {WEIGHTS.commits}×commit.
      </p>
    </div>
  );
}
