'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { AssetThumb } from '@/components/coown/AssetThumb';
import { gbp } from '@/components/coown/format';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import type { Syndicate, SyndicateMember } from '@/lib/contracts/syndicate';
import {
  memberByUserId,
  poolProgressPct,
  pooledGbp,
  sharePctOfPool,
  targetTotalGbp,
} from '@/lib/contracts/syndicate';
import { PoolMeter } from './PoolMeter';
import { PoolStatusTag } from './PoolStatusTag';

const MAX_FACES = 4;

/** Shared lg column template — pool | members | pooled | your share |
 *  chevron. The hub's header row and skeleton ride the same template. */
export const POOL_ROW_GRID =
  'lg:grid-cols-[minmax(0,1.5fr)_9rem_minmax(0,11rem)_6rem_1.5rem]';

/** Overlapping member faces — organizer first, then join order; the rest
 * fold into a quiet +N. Faces only, no chrome circles. */
function MemberAvatarStack({ members }: { members: SyndicateMember[] }) {
  if (members.length === 0) return null;
  const faces = [...members]
    .sort((a, b) => (a.role === 'organizer' ? 0 : 1) - (b.role === 'organizer' ? 0 : 1))
    .slice(0, MAX_FACES);
  const overflow = members.length - faces.length;

  return (
    <span className="flex shrink-0 items-center" aria-hidden="true">
      {faces.map((m, i) => (
        <span key={m.id} className={i > 0 ? '-ml-1.5' : ''}>
          <Avatar src={m.avatar} name={m.displayName ?? m.username} size={20} ring />
        </span>
      ))}
      {overflow > 0 ? (
        <span className="-ml-1.5 tnum text-meta font-semibold text-text-muted">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

/** One pool in a list — stretched link, media thumb, name + target, the
 * funding meter, and the member/pooled facts on the right. */
export function PoolRow({
  syndicate,
  asset,
  viewerId,
}: {
  syndicate: Syndicate;
  asset: CoOwnAsset;
  viewerId: string | null;
}) {
  const member = viewerId ? memberByUserId(syndicate, viewerId) : undefined;
  const target = targetTotalGbp(syndicate, asset);
  const pct = poolProgressPct(syndicate, asset);
  const sharePct = member ? sharePctOfPool(member.contributionGbp, syndicate, asset) : null;

  return (
    <li className="group relative transition-colors hover:bg-row">
      <Link
        href={`/co-own/pools/${syndicate.id}`}
        className="absolute inset-0 z-0"
        aria-label={`View ${syndicate.name} pool`}
      />
      <div
        className={`relative flex items-start gap-3.5 px-1 py-4 lg:grid ${POOL_ROW_GRID} lg:items-center lg:gap-x-6 lg:py-3.5`}
      >
        {/* Pool cell — thumb, name, status, target line. Mobile keeps the
            meter + member facts nested under it; desktop splits them into
            their own columns. */}
        <div className="flex min-w-0 flex-1 items-start gap-3.5 lg:items-center">
          <AssetThumb
            src={asset.imageUrl}
            alt={asset.title}
            className="w-14 shrink-0 sm:w-16 lg:w-11"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <p className="truncate text-body font-semibold text-text-primary">{syndicate.name}</p>
              <PoolStatusTag syndicate={syndicate} asset={asset} viewerIsMember={member != null} />
            </div>
            <p className="mt-0.5 truncate text-meta text-text-secondary">
              {asset.title} · {syndicate.unitsTarget} units at {gbp(asset.unitPriceGbp)}
            </p>
            <div className="mt-2.5 max-w-md lg:hidden">
              <PoolMeter pct={pct} />
            </div>
            <div className="mt-1.5 flex items-center gap-2.5 lg:hidden">
              <MemberAvatarStack members={syndicate.members} />
              <p className="min-w-0 truncate text-meta text-text-muted tnum">
                {gbp(pooledGbp(syndicate))} of {gbp(target)} · {syndicate.members.length}/
                {syndicate.memberCap} members
                {member ? ` · Your share ${sharePct!.toFixed(1)}%` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Members */}
        <div className="hidden items-center gap-2.5 lg:flex">
          <MemberAvatarStack members={syndicate.members} />
          <span className="text-meta text-text-muted tnum">
            {syndicate.members.length}/{syndicate.memberCap}
          </span>
        </div>

        {/* Pooled — meter under the figures, dense ledger column */}
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-meta text-text-secondary tnum">
            <span className="font-semibold text-text-primary">{gbp(pooledGbp(syndicate))}</span>
            {' of '}
            {gbp(target)}
          </p>
          <div className="mt-1.5">
            <PoolMeter pct={pct} />
          </div>
        </div>

        {/* Your share */}
        <div className="hidden text-right lg:block">
          <span className="text-body tnum text-text-primary">
            {member ? `${sharePct!.toFixed(1)}%` : '—'}
          </span>
        </div>

        <Icon
          name="forward"
          size={18}
          className="mt-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 lg:mt-0 lg:justify-self-end"
        />
      </div>
    </li>
  );
}
