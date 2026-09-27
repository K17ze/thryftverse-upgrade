'use client';

/**
 * RatingInput — the 1–5 star row, the dominant control of the composer.
 * Left-aligned with a confirming label, mirroring the mobile grammar:
 * outline stars at rest, filled stars at/below the selection.
 *
 * True radiogroup semantics: roving tabindex (the selected star — or the
 * first when nothing is chosen — is the only Tab stop) and arrow/Home/End
 * keys move and select, per the WAI-ARIA radio pattern.
 */

import { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ratingLabelFor } from './reviewModel';

interface RatingInputProps {
  rating: number;
  onChange: (rating: number) => void;
}

const STARS = [1, 2, 3, 4, 5] as const;

export function RatingInput({ rating, onChange }: RatingInputProps) {
  const label = ratingLabelFor(rating);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  /** The one tabbable star — the current rating, else the first star. */
  const focusable = rating >= 1 ? rating : 1;

  const pick = (star: number) => {
    onChange(star);
    refs.current[star - 1]?.focus();
  };

  return (
    <div>
      <div className="flex gap-2" role="radiogroup" aria-label="Rating">
        {STARS.map((star) => (
          <button
            key={star}
            ref={(el) => {
              refs.current[star - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} of 5${rating === star ? ', selected' : ''}`}
            tabIndex={star === focusable ? 0 : -1}
            onClick={() => onChange(star)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                pick(Math.min(5, star + 1));
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                pick(Math.max(1, star - 1));
              } else if (e.key === 'Home') {
                e.preventDefault();
                pick(1);
              } else if (e.key === 'End') {
                e.preventDefault();
                pick(5);
              }
            }}
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
