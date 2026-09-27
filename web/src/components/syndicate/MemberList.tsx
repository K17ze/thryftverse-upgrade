'use client';

import { Avatar } from '@/components/ui/Avatar';
import { gbp } from '@/components/coown/format';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import type { Syndicate } from '@/lib/contracts/syndicate';
import { sharePctOfPool, unitsForContribution } from '@/lib/contracts/syndicate';
import { formatDate } from '@/lib/utils/format';

/** Pool members — avatar, name, commitment and share of the pooled buy.
 * Organizer first, then by contribution size. Once the pool settles the
 * share line earns its pro-rata units — the same arithmetic the settle
 * action writes into positions. */
export function MemberList({
  syndicate,
  asset,
  viewerId,
}: {
  syndicate: Syndicate;
  asset: CoOwnAsset;
  viewerId: string | null;
}) {
  const executed = syndicate.status === 'executed';
  const sorted = [...syndicate.members].sort(
    (a, b) =>
      (a.role === 'organizer' ? 0 : 1) - (b.role === 'organizer' ? 0 : 1) ||
      b.contributionGbp - a.contributionGbp,
  );

  if (sorted.length === 0) {
    return (
      <p className="py-6 text-body text-text-secondary">
        No members yet — the first contribution opens the pool.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {sorted.map((m) => {
        const isYou = viewerId != null && m.userId === viewerId;
        return (
          <li key={m.id} className="flex items-center gap-3 py-3">
            <Avatar src={m.avatar} name={m.displayName ?? m.username} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body text-text-primary">
                <span className="font-semibold">{isYou ? 'You' : (m.displayName ?? `@${m.username}`)}</span>
                {m.role === 'organizer' ? (
                  <span className="text-text-muted"> · Organizer</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-meta text-text-muted">
                @{m.username} · joined {formatDate(m.joinedAt)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-body font-semibold text-text-primary tnum">{gbp(m.contributionGbp)}</p>
              <p className="mt-0.5 text-meta text-text-muted tnum">
                {sharePctOfPool(m.contributionGbp, syndicate, asset).toFixed(1)}% of pool
                {executed
                  ? ` · ${(Math.round(unitsForContribution(m.contributionGbp, asset) * 100) / 100)} units`
                  : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
