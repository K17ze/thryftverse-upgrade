'use client';

import Link from 'next/link';
import type { User } from '@/lib/contracts/domain';
import { formatCount } from '@/lib/utils/format';
import { RatingStars } from '../RatingStars';

export type ProfileStatKey = 'items' | 'sold' | 'reviews';

export function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="tnum text-body-emphasis font-bold text-text-primary">
        {formatCount(value)}
      </span>
      <span className="text-body text-text-muted">{label}</span>
    </span>
  );
}

/** Quiet pressable wrapper for stats that route somewhere — same hover
 *  grammar as the followers/following links. */
export function StatPress({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className="pressable rounded-sm hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
    >
      {children}
    </button>
  );
}

interface ProfileStatsStripProps {
  user: User;
  listingCount?: number;
  forSaleCount?: number;
  soldCount?: number;
  onStatPress?: (stat: ProfileStatKey) => void;
}

export function ProfileStatsStrip({
  user,
  listingCount,
  forSaleCount,
  soldCount,
  onStatPress,
}: ProfileStatsStripProps) {
  const itemsStat = (
    <Stat
      value={forSaleCount ?? listingCount ?? user.listingCount}
      label={forSaleCount != null ? 'for sale' : 'items'}
    />
  );

  const ratingStat = (
    <span className="flex items-center gap-1.5">
      <RatingStars rating={user.rating} size={13} />
      <span className="tnum text-body font-semibold text-text-primary">
        {user.rating.toFixed(1)}
      </span>
      <span className="text-meta text-text-muted">
        ({formatCount(user.reviewCount)})
      </span>
    </span>
  );

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 lg:gap-x-7">
      {onStatPress ? (
        <StatPress onPress={() => onStatPress('items')} label="View listings">
          {itemsStat}
        </StatPress>
      ) : (
        itemsStat
      )}
      {typeof soldCount === 'number' ? (
        onStatPress ? (
          <StatPress onPress={() => onStatPress('sold')} label="View sold items">
            <Stat value={soldCount} label="sold" />
          </StatPress>
        ) : (
          <Stat value={soldCount} label="sold" />
        )
      ) : null}
      <Link
        href={`/u/${user.username}/followers`}
        className="rounded-sm hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
      >
        <Stat value={user.followers} label="followers" />
      </Link>
      <Link
        href={`/u/${user.username}/following`}
        className="rounded-sm hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
      >
        <Stat value={user.following} label="following" />
      </Link>
      {onStatPress && user.reviewCount > 0 ? (
        <StatPress onPress={() => onStatPress('reviews')} label="View reviews">
          {ratingStat}
        </StatPress>
      ) : (
        ratingStat
      )}
    </div>
  );
}
