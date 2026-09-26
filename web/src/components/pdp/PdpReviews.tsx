'use client';

/**
 * PdpReviews — seller reviews on the PDP. Aggregate line from the seller
 * contract (rating + review count, falling back to the loaded rows), the
 * newest reviews as flat hairline rows, and a "See all reviews" link to
 * the profile's Reviews tab. Rating filter chips render only when more
 * than four reviews are loaded — a filter over three rows is chrome, not
 * utility — and only for star levels that actually occur. No review
 * content → the section omits entirely; loading keeps the geometry.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Listing, Review } from '@/lib/contracts/domain';
import { useReviews } from '@/lib/hooks/queries';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { RatingStars } from '@/components/profile/RatingStars';
import { reviewerHref as reviewerProfileHref } from '@/components/profile/profileViewModel';
import { formatCount, formatDate } from '@/lib/utils/format';

interface PdpReviewsProps {
  listing: Listing;
}

/** Newest reviews shown when the set is too shallow to filter. */
const RECENT_COUNT = 3;

function ReviewRow({ review }: { review: Review }) {
  const href = reviewerProfileHref(review);
  const avatar = (
    <Avatar src={review.reviewerAvatar} name={review.reviewerName} size={32} />
  );

  return (
    <article className="border-b border-border-subtle py-4 last:border-0">
      <div className="flex items-center gap-2.5">
        {href ? (
          <Link
            href={href}
            aria-label={`Open ${review.reviewerName}'s profile`}
            className="shrink-0 rounded-full"
          >
            {avatar}
          </Link>
        ) : (
          <span className="shrink-0">{avatar}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="clamp-1 text-caption font-semibold text-text-primary">
            {review.reviewerName}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <RatingStars rating={review.rating} size={12} />
            <time className="text-meta text-text-muted">{formatDate(review.date)}</time>
          </div>
        </div>
      </div>
      <p className="mt-2 text-body leading-relaxed text-text-secondary">
        {review.text}
      </p>
    </article>
  );
}

export function PdpReviews({ listing }: PdpReviewsProps) {
  const { data: reviews, isLoading } = useReviews(listing.sellerId);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);

  const seller = listing.seller;
  const sellerUsername = seller?.username ?? null;

  const rows = useMemo(() => {
    const list = (reviews ?? []).filter((r) => !r.isAutomatic);
    return [...list].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [reviews]);

  const average =
    seller?.rating ??
    (rows.length > 0
      ? rows.reduce((s, r) => s + r.rating, 0) / rows.length
      : null);
  const count = seller?.reviewCount ?? rows.length;

  // Filter chips — only when the loaded set is deep enough to need them,
  // and only for star levels with at least one review behind them.
  const filterable = (reviews?.length ?? 0) > 4;
  const starLevels = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of rows) {
      const star = Math.round(r.rating);
      counts.set(star, (counts.get(star) ?? 0) + 1);
    }
    return [5, 4, 3, 2, 1]
      .filter((star) => counts.has(star))
      .map((star) => ({ star, count: counts.get(star) ?? 0 }));
  }, [rows]);

  const visible =
    filterable && ratingFilter != null
      ? rows.filter((r) => Math.round(r.rating) === ratingFilter)
      : filterable
        ? rows
        : rows.slice(0, RECENT_COUNT);

  if (isLoading) {
    return (
      <section
        className="border-t border-border-subtle py-6"
        aria-labelledby="pdp-reviews"
        aria-busy
      >
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-4 h-4 w-44" />
        <Skeleton className="mt-4 h-16 w-full" />
      </section>
    );
  }

  // No real review content — the section omits rather than publishing a
  // placeholder. The seller card above still carries the contract rating.
  if (rows.length === 0) return null;

  const showAllLink = !!sellerUsername && count > rows.length;

  return (
    <section className="border-t border-border-subtle py-6" aria-labelledby="pdp-reviews">
      <h2 id="pdp-reviews" className="text-section-title font-semibold text-text-primary">
        Seller reviews
      </h2>

      {average != null ? (
        <p className="mt-2 flex items-center gap-1.5 text-body text-text-primary">
          <Icon name="star" filled size={15} className="text-rating-star" />
          <span className="tnum font-semibold">{average.toFixed(1)}</span>
          <span className="text-text-secondary">
            · {formatCount(count)} review{count === 1 ? '' : 's'}
          </span>
        </p>
      ) : null}

      {filterable ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip
            selected={ratingFilter == null}
            onClick={() => setRatingFilter(null)}
          >
            All
          </Chip>
          {starLevels.map(({ star, count: levelCount }) => (
            <Chip
              key={star}
              selected={ratingFilter === star}
              aria-label={`${star} star reviews, ${levelCount} reviews`}
              onClick={() =>
                setRatingFilter((v) => (v === star ? null : star))
              }
            >
              <Icon name="star" filled size={11} className="text-rating-star" />
              {star}
              <span className="tnum opacity-60">{levelCount}</span>
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="mt-2">
        {visible.map((r) => (
          <ReviewRow key={r.id} review={r} />
        ))}
      </div>

      {showAllLink ? (
        <Link
          href={`/u/${sellerUsername}`}
          className="pressable mt-4 inline-flex items-center gap-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          See all reviews
          <Icon name="forward" size={13} />
        </Link>
      ) : null}
    </section>
  );
}
