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
      className="pressable -mx-1.5 -my-2.5 rounded-sm px-1.5 py-2.5 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
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
  const itemsCount = forSaleCount ?? listingCount ?? user.listingCount;
  const itemsText = `${formatCount(itemsCount)} ${forSaleCount != null ? 'for sale' : 'items'}`;

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
      {/* Primary: the social signal — followers/following lead (IG/Vinted
          grammar), then the rating while reviews exist. Commerce counts
          demote to quiet trailing meta — the tab rail already carries
          the same numbers, so the strip doesn't run five metrics at one
          weight. Seams still land on the closet tabs (FRESH-06). */}
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
      {/* Rating only earns a stat once reviews exist — five empty stars
          and "0.0" on an unreviewed member read as a placeholder, not a
          reputation. */}
      {user.reviewCount > 0 ? (
        onStatPress ? (
          <StatPress onPress={() => onStatPress('reviews')} label="View reviews">
            {ratingStat}
          </StatPress>
        ) : (
          ratingStat
        )
      ) : null}
      <span className="flex items-baseline gap-1.5 text-body text-text-muted">
        {onStatPress ? (
          <StatPress onPress={() => onStatPress('items')} label="View listings">
            <span className="tnum">{itemsText}</span>
          </StatPress>
        ) : (
          <span className="tnum">{itemsText}</span>
        )}
        {/* "0 sold" is noise, not reputation — the segment only earns a
            seam once something has actually sold. */}
        {typeof soldCount === 'number' && soldCount > 0 ? (
          <>
            <span aria-hidden>·</span>
            {onStatPress ? (
              <StatPress onPress={() => onStatPress('sold')} label="View sold items">
                <span className="tnum">{`${formatCount(soldCount)} sold`}</span>
              </StatPress>
            ) : (
              <span className="tnum">{`${formatCount(soldCount)} sold`}</span>
            )}
          </>
        ) : null}
      </span>
    </div>
  );
}
