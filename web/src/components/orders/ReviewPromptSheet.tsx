'use client';

/**
 * ReviewPromptSheet — port of mobile ReviewPromptSheet. Item context, a
 * 5-star quick rating with honest labels, a note field, then submit.
 * Pass `existing` to render the submitted review read-only (view_review).
 */

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { AppImage } from '@/components/ui/AppImage';

const RATING_LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

interface Props {
  open: boolean;
  itemTitle?: string;
  itemImage?: string | null;
  sellerName?: string;
  /** When set, renders the submitted review — no editing. */
  existing?: { rating: number; text: string; isAuto?: boolean } | null;
  onSubmit: (rating: number, text: string) => void;
  onClose: () => void;
}

export function ReviewPromptSheet({
  open,
  itemTitle,
  itemImage,
  sellerName,
  existing,
  onSubmit,
  onClose,
}: Props) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');

  const handleClose = () => {
    setRating(0);
    setText('');
    onClose();
  };

  const readOnly = existing != null;
  const shownRating = readOnly ? existing.rating : rating;
  const ratingLabel =
    shownRating > 0 ? RATING_LABELS[Math.min(5, Math.max(1, shownRating)) - 1] : null;

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title={readOnly ? 'Your review' : 'How was your order?'}
      maxWidth={480}
    >
      <div className="px-5 pb-6">
        {!readOnly ? (
          <p className="mb-4 text-body text-text-secondary">
            Your review helps other buyers and supports {sellerName ?? 'the seller'}.
          </p>
        ) : existing.isAuto ? (
          <p className="mb-4 text-body text-text-secondary">
            Automatic feedback — recorded when the order completed without a review.
          </p>
        ) : null}

        {/* Item context */}
        {itemTitle || itemImage ? (
          <div className="mb-4 flex items-center gap-3 rounded-lg bg-surface-alt p-3">
            <span className="w-12 shrink-0 overflow-hidden rounded-md">
              <AppImage src={itemImage} alt={itemTitle ?? 'Order item'} aspectRatio={1} sizes="48px" />
            </span>
            <p className="clamp-2 text-body font-medium text-text-primary">
              {itemTitle ?? 'Your item'}
            </p>
          </div>
        ) : null}

        {/* Stars */}
        <div className="flex justify-center gap-2.5" role={readOnly ? undefined : 'radiogroup'} aria-label="Rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              disabled={readOnly}
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
              aria-pressed={shownRating === star}
              onClick={() => setRating(star)}
              className={`pressable p-1 ${readOnly ? 'cursor-default' : ''}`}
            >
              <Icon
                name="star"
                filled={shownRating >= star}
                size={34}
                className={shownRating >= star ? 'text-rating-star' : 'text-text-muted'}
              />
            </button>
          ))}
        </div>
        {ratingLabel ? (
          <p className="mt-2 text-center text-body font-medium text-text-primary">{ratingLabel}</p>
        ) : null}

        {readOnly ? (
          <p className="mt-4 rounded-lg bg-surface-alt p-3 text-body text-text-secondary">
            {existing.text}
          </p>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="How was the item, the packaging, the dispatch time?"
              className="mt-4 w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
            />
            <div className="mt-4 flex flex-col items-center gap-1">
              <Button
                variant="primary"
                size="md"
                fullWidth
                disabled={rating === 0}
                onClick={() => {
                  onSubmit(rating, text.trim());
                  handleClose();
                }}
              >
                Submit review
              </Button>
              <button
                type="button"
                onClick={handleClose}
                className="pressable py-2 text-body text-text-muted"
              >
                Maybe later
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
