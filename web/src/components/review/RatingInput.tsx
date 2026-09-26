'use client';

/**
 * RatingInput — the 1–5 star row, the dominant control of the composer.
 * Left-aligned with a confirming label, mirroring the mobile grammar:
 * outline stars at rest, filled stars at/below the selection.
 */

import { Icon } from '@/components/ui/Icon';
import { ratingLabelFor } from './reviewModel';

interface RatingInputProps {
  rating: number;
  onChange: (rating: number) => void;
}

export function RatingInput({ rating, onChange }: RatingInputProps) {
  const label = ratingLabelFor(rating);

  return (
    <div>
      <div className="flex gap-2" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} of 5${rating === star ? ', selected' : ''}`}
            onClick={() => onChange(star)}
            className="pressable p-1"
          >
            <Icon
              name="star"
              filled={rating >= star}
              size={34}
              className={rating >= star ? 'text-rating-star' : 'text-text-muted'}
            />
          </button>
        ))}
      </div>
      {label ? (
        <p className="mt-2 text-body font-medium text-brand">{label}</p>
      ) : null}
    </div>
  );
}
