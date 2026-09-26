/**
 * ReviewList — the member's review ledger: an aggregate summary block
 * (average + 5→1 distribution of the loaded reviews, mirrors mobile's
 * ReviewSummaryBlock) over flat review rows. Reviewer identity links to
 * their profile when the id resolves; "Automatic review" rows render
 * quiet — no reviewer identity, muted text, no verified marker.
 */

import Link from 'next/link';
import type { Review } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate } from '@/lib/utils/format';
import { RatingStars } from './RatingStars';
import { reviewerHref } from './profileViewModel';

/**
 * Aggregate header for the ledger — dominant average, stars, count, and
 * per-star bars proportional to the loaded reviews (count / total).
 */
export function ReviewSummary({ reviews }: { reviews: Review[] }) {
  const total = reviews.length;
  const avg = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  const buckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.rating) === star).length,
  }));

  return (
    <div className="flex items-center gap-6 border-b border-border-subtle pb-5 sm:gap-10">
      <div className="shrink-0">
        <p className="tnum text-[34px] font-bold leading-none text-text-primary">
          {avg.toFixed(1)}
        </p>
        <RatingStars rating={avg} size={13} className="mt-2" />
        <p className="mt-1.5 text-meta text-text-muted">
          {total} review{total === 1 ? '' : 's'}
        </p>
      </div>
      <div className="max-w-xs flex-1 space-y-1.5" aria-label="Rating distribution">
        {buckets.map(({ star, count }) => (
          <div key={star} className="flex items-center gap-2">
            <span className="tnum w-3 text-right text-meta text-text-secondary">{star}</span>
            <Icon name="star" filled size={11} className="text-rating-star" aria-hidden />
            <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-surface-alt">
              <span
                className="block h-full rounded-full bg-brand"
                style={{ width: `${total > 0 ? Math.round((count / total) * 100) : 0}%` }}
              />
            </span>
            <span className="tnum w-6 text-right text-meta text-text-muted">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewRow({ review }: { review: Review }) {
  const href = reviewerHref(review);
  const nameClass = 'clamp-1 text-body-emphasis font-semibold text-text-primary';

  return (
    <article className="flex gap-3 border-b border-border-subtle py-4 last:border-0">
      {review.isAutomatic ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-alt text-text-muted">
          <Icon name="check" size={18} />
        </span>
      ) : href ? (
        <Link href={href} className="shrink-0 self-start rounded-full" aria-label={`Open ${review.reviewerName}'s profile`}>
          <Avatar src={review.reviewerAvatar} name={review.reviewerName} size={40} />
        </Link>
      ) : (
        <Avatar src={review.reviewerAvatar} name={review.reviewerName} size={40} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          {review.isAutomatic ? (
            <span className="text-body text-text-muted">
              Automatic review
              <span className="text-meta"> · order completed</span>
            </span>
          ) : href ? (
            <Link href={href} className={nameClass}>
              {review.reviewerName}
            </Link>
          ) : (
            <span className={nameClass}>{review.reviewerName}</span>
          )}
          <time className="shrink-0 text-meta text-text-muted">{formatDate(review.date)}</time>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <RatingStars rating={review.rating} size={13} />
          {!review.isAutomatic ? (
            <span className="flex items-center gap-1 text-meta text-success-text">
              <Icon name="shieldCheck" size={12} aria-hidden />
              Verified buyer
            </span>
          ) : null}
        </div>
        <p
          className={`mt-1.5 text-body ${
            review.isAutomatic ? 'text-text-muted' : 'text-text-secondary'
          }`}
        >
          {review.text}
        </p>
      </div>
    </article>
  );
}

export function ReviewListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="px-4 sm:px-6" aria-busy aria-label="Loading reviews">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b border-border-subtle py-4 last:border-0">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReviewList({ reviews }: { reviews: Review[] }) {
  return (
    <div>
      {reviews.map((r) => (
        <ReviewRow key={r.id} review={r} />
      ))}
    </div>
  );
}
