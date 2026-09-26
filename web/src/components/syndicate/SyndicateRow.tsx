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
import { SyndicateStatusTag } from './SyndicateStatusTag';

const MAX_FACES = 4;

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
export function SyndicateRow({
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
        href={`/co-own/syndicate/${syndicate.id}`}
        className="absolute inset-0 z-0"
        aria-label={`View ${syndicate.name}`}
      />
      <div className="relative flex items-start gap-3.5 px-1 py-4">
        <AssetThumb src={asset.imageUrl} alt={asset.title} className="w-14 sm:w-16" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <p className="truncate text-body font-semibold text-text-primary">{syndicate.name}</p>
            <SyndicateStatusTag syndicate={syndicate} asset={asset} viewerIsMember={member != null} />
          </div>
          <p className="mt-0.5 truncate text-meta text-text-secondary">
            {asset.title} · {syndicate.unitsTarget} units at {gbp(asset.unitPriceGbp)}
          </p>
          <div className="mt-2.5 max-w-md">
            <PoolMeter pct={pct} />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5">
            <MemberAvatarStack members={syndicate.members} />
            <p className="min-w-0 truncate text-meta text-text-muted tnum">
              {gbp(pooledGbp(syndicate))} of {gbp(target)} · {syndicate.members.length}/
              {syndicate.memberCap} members
              {member ? ` · Your share ${sharePct!.toFixed(1)}%` : ''}
            </p>
          </div>
        </div>
        <Icon
          name="forward"
          size={18}
          className="mt-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </li>
  );
}
