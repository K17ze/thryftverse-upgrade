'use client';

/**
 * CsatPrompt — post-resolution feedback in the server's own vocabulary:
 * POST /support/conversations/:id/feedback takes rating
 * 'helpful'|'unhelpful' plus an optional reason. Once submitted it renders
 * read-only. Mirrors the mobile support feedback flow.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { SupportTicketCsat } from '@/lib/contracts/support';

interface CsatPromptProps {
  submitted: SupportTicketCsat | null;
  onSubmit: (rating: 'helpful' | 'unhelpful', note: string) => void;
}

export function CsatPrompt({ submitted, onSubmit }: CsatPromptProps) {
  const [rating, setRating] = useState<'helpful' | 'unhelpful' | null>(null);
  const [note, setNote] = useState('');

  if (submitted) {
    return (
      <div aria-label="Your feedback">
        <p className="flex items-center gap-1.5 text-body text-text-primary">
          <Icon
            name={submitted.rating === 'helpful' ? 'check' : 'close'}
            size={16}
            className={
              submitted.rating === 'helpful' ? 'text-success-text' : 'text-text-muted'
            }
          />
          {submitted.rating === 'helpful'
            ? 'You found this helpful'
            : 'You marked this as not helpful'}
        </p>
        {submitted.note ? (
          <p className="mt-2 text-body text-text-secondary">“{submitted.note}”</p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        {(
          [
            { value: 'helpful' as const, label: 'Yes, helpful' },
            { value: 'unhelpful' as const, label: 'Not helpful' },
          ]
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRating(opt.value)}
            aria-pressed={rating === opt.value}
            className={`pressable inline-flex min-h-11 items-center rounded-full border px-4 text-body font-medium ${
              rating === opt.value
                ? 'border-text-primary bg-surface-alt text-text-primary'
                : 'border-border text-text-secondary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {rating ? (
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
            onClick={() => onSubmit(rating, note)}
          >
            Send feedback
          </Button>
        </>
      ) : null}
    </div>
  );
}
