'use client';

/**
 * CsatPrompt — post-resolution feedback: five star targets (44px hit,
 * 24px glyph) plus an optional note. Once submitted it renders read-only.
 * Mirrors the mobile SupportStateBanner feedback flow.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { SupportTicketCsat } from '@/lib/contracts/support';

interface CsatPromptProps {
  submitted: SupportTicketCsat | null;
  onSubmit: (rating: number, note: string) => void;
}

export function CsatPrompt({ submitted, onSubmit }: CsatPromptProps) {
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');

  if (submitted) {
    return (
      <div aria-label="Your feedback">
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Icon
              key={i}
              name="star"
              filled
              size={16}
              className={i < submitted.rating ? 'text-rating-star' : 'text-text-muted'}
            />
          ))}
        </div>
        {submitted.note ? (
          <p className="mt-2 text-body text-text-secondary">“{submitted.note}”</p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setStars(n)}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            aria-pressed={stars >= n}
            className="pressable flex h-11 w-11 items-center justify-center"
          >
            <Icon
              name="star"
              filled={n <= stars}
              size={24}
              className={n <= stars ? 'text-rating-star' : 'text-text-muted'}
            />
          </button>
        ))}
      </div>
      {stars > 0 ? (
        <>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Anything to add? (optional)"
            aria-label="Feedback note"
            className="mt-3 min-h-[64px] w-full resize-y rounded-lg border border-border bg-input px-3.5 py-3 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
          />
          <Button
            variant="primary"
            size="md"
            className="mt-3"
            onClick={() => onSubmit(stars, note)}
          >
            Send feedback
          </Button>
        </>
      ) : null}
    </div>
  );
}
