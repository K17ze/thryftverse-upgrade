'use client';

/**
 * ReviewPublishedView — the terminal review state: what the buyer already
 * submitted (or just published), read-only. Flat, icon-led like the mobile
 * existing-review block; the back action returns to the order.
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { RatingStars } from '@/components/profile/RatingStars';
import { formatDate } from '@/lib/utils/format';
import { tagLabelFor } from './reviewModel';

interface ReviewPublishedViewProps {
  /** 'published' — just submitted this session (check + thanks copy);
   *  'existing' — a review that predates the visit. */
  variant: 'published' | 'existing';
  rating: number;
  text?: string;
  date?: string | null;
  tags?: string[];
  photoUrls?: string[];
  onBack: () => void;
}

export function ReviewPublishedView({
  variant,
  rating,
  text,
  date,
  tags,
  photoUrls,
  onBack,
}: ReviewPublishedViewProps) {
  const justPublished = variant === 'published';

  return (
    <div className="flex flex-col gap-4 py-2">
      {justPublished ? (
        <Icon name="check" filled size={30} className="text-success-text" />
      ) : null}
      <h2 className="text-item-title font-semibold text-text-primary sm:text-screen-title">
        {justPublished ? 'Review published' : 'Your review'}
      </h2>
      <div className="flex items-center gap-2.5">
        <RatingStars rating={rating} size={16} />
        <span className="text-body text-text-secondary">
          {rating} star{rating === 1 ? '' : 's'}
          {date ? ` · ${formatDate(date)}` : ''}
        </span>
      </div>
      {text ? (
        <p className="whitespace-pre-line text-body leading-relaxed text-text-primary">
          {text}
        </p>
      ) : null}
      {tags && tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {tags.map((key) => (
            <span
              key={key}
              className="inline-flex h-8 items-center rounded-full bg-surface-alt px-3.5 text-caption font-medium text-text-primary"
            >
              {tagLabelFor(key)}
            </span>
          ))}
        </div>
      ) : null}
      {photoUrls && photoUrls.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {photoUrls.map((uri, i) => (
            <span key={uri} className="h-16 w-16 shrink-0 overflow-hidden rounded-md">
              {/* eslint-disable-next-line @next/next/no-img-element -- object-URL previews cannot go through next/image */}
              <img
                src={uri}
                alt={`Review photo ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </span>
          ))}
        </div>
      ) : null}
      {justPublished ? (
        <p className="text-caption leading-relaxed text-text-muted">
          Thanks — your review helps other buyers and supports the seller.
        </p>
      ) : null}
      <Button variant="primary" size="lg" fullWidth onClick={onBack} className="mt-2">
        Back to the order
      </Button>
    </div>
  );
}
