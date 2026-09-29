'use client';

/**
 * OrderReviewCard — the seller-side read of the order's review, ported
 * from mobile ProfileReviews' respond affordance onto the order detail.
 * Shows the buyer's review verbatim (rating, text, auto-feedback
 * provenance), the seller's published response when one exists, and the
 * composer for POST /reviews/:id/response — one response per review,
 * editable while the server's edit window is open (a closed window 409s
 * and the verbatim error reaches the composer — never a silent success).
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { RatingStars } from '@/components/profile/RatingStars';
import { formatDate } from '@/lib/utils/format';

/** The contract the card renders — OrderReviewRow-shaped, tolerant of the
 *  fixture enrichment projection (no id needed by the card itself; the
 *  caller owns the mutation target). */
export interface OrderReviewView {
  rating: number;
  text: string | null;
  /** Platform-generated feedback — labelled as such, never "Review". */
  isAuto: boolean;
  createdAt?: string;
  sellerResponse?: { text: string; createdAt: string } | null;
}

interface Props {
  review: OrderReviewView;
  /** Mutation in flight — the composer's submit disables on it. */
  busy?: boolean;
  onSubmit: (text: string) => void;
}

const MAX_RESPONSE_CHARS = 500;

export function OrderReviewCard({ review, busy = false, onSubmit }: Props) {
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');

  const hasResponse = !!review.sellerResponse?.text;
  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_RESPONSE_CHARS && !busy;

  return (
    <div className="flex flex-col gap-2.5">
      {/* The buyer's review — verbatim, auto-feedback labelled honestly. */}
      <div>
        <div className="flex items-center gap-2">
          <RatingStars rating={review.rating} size={14} />
          <span className="tnum text-caption font-medium text-text-primary">
            {review.rating.toFixed(1)}
          </span>
          {review.isAuto ? (
            <span className="text-meta text-text-muted">Automatic feedback</span>
          ) : null}
        </div>
        {review.text ? (
          <p className="mt-1.5 text-body text-text-secondary">{review.text}</p>
        ) : (
          <p className="mt-1.5 text-caption text-text-muted">
            {review.isAuto ? 'Recorded by Thryft — no written review.' : 'No written review.'}
          </p>
        )}
      </div>

      {/* The seller's published response — separated, quieter, a reply. */}
      {hasResponse && !composing ? (
        <div className="border-l-2 border-border-subtle pl-3">
          <p className="text-meta font-semibold text-text-primary">
            Your response
            {review.sellerResponse!.createdAt ? (
              <span className="ml-1.5 font-normal text-text-muted">
                {formatDate(review.sellerResponse!.createdAt)}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-body text-text-secondary">{review.sellerResponse!.text}</p>
          <button
            type="button"
            onClick={() => {
              setText(review.sellerResponse!.text);
              setComposing(true);
            }}
            disabled={busy}
            className="pressable mt-1.5 flex min-h-11 items-center gap-2 py-1 text-body-emphasis font-medium text-commerce-trust disabled:opacity-50"
          >
            <Icon name="edit" size={16} />
            Edit response
          </button>
        </div>
      ) : null}

      {!hasResponse && !composing ? (
        <button
          type="button"
          onClick={() => setComposing(true)}
          disabled={busy}
          className="pressable flex min-h-11 items-center gap-2.5 py-1.5 text-body-emphasis font-medium text-commerce-trust disabled:opacity-50"
        >
          <Icon name="chat" size={18} />
          Respond to this review
        </button>
      ) : null}

      {composing ? (
        <div className="flex flex-col gap-2 pt-1">
          <textarea
            className="w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
            rows={3}
            maxLength={MAX_RESPONSE_CHARS}
            aria-label="Your public response"
            placeholder="Thank the buyer or address their feedback — public, one response per review."
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <p className="tnum text-right text-meta text-text-muted">
            {trimmed.length}/{MAX_RESPONSE_CHARS}
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setComposing(false);
                setText('');
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!canSubmit}
              onClick={() => {
                onSubmit(trimmed);
                // The draft survives a rejected write — the parent toasts
                // the server's verbatim error and reopening the composer
                // restores it rather than making the seller retype.
                setComposing(false);
              }}
            >
              {busy ? 'Publishing…' : hasResponse ? 'Save response' : 'Publish response'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
