'use client';

/**
 * ReviewResponseSheet — the seller's public reply to a buyer review,
 * ported from native ProfileReviewRow's Respond affordance (own profile
 * only, buyer-authored reviews with no existing response).
 *
 * Posts to POST /reviews/:id/response — one response per review; the
 * route edits while the server's window is open and 409s verbatim once
 * it has closed, so the error reaches the user unchanged. Success
 * invalidates the reviews queries so the published response lands on
 * the row without a manual refresh.
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { respondToOrderReview } from '@/lib/api/services/commerce';

const MAX_RESPONSE_CHARS = 500;

interface ReviewResponseSheetProps {
  open: boolean;
  onClose: () => void;
  reviewId: string | null;
  /** Context for the title — "Respond to Marie's review". */
  reviewerName?: string;
}

export function ReviewResponseSheet({
  open,
  onClose,
  reviewId,
  reviewerName,
}: ReviewResponseSheetProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();

  const trimmed = text.trim();
  const canSubmit =
    trimmed.length > 0 && trimmed.length <= MAX_RESPONSE_CHARS && !sending && reviewId != null;

  // Fresh draft per open — a reopened sheet never carries stale text.
  useEffect(() => {
    if (!open) return;
    setText('');
    setSending(false);
  }, [open]);

  const submit = async () => {
    if (!canSubmit || !reviewId) return;
    setSending(true);
    try {
      await respondToOrderReview(reviewId, trimmed);
      void qc.invalidateQueries({ queryKey: ['reviews'] });
      toast.show('Response published', 'success');
      onClose();
    } catch (err) {
      // 409 "The response edit window has closed" et al — verbatim.
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Could not publish the response — try again.';
      toast.show(message, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={reviewerName ? `Respond to ${reviewerName}` : 'Respond to review'}
      maxWidth={560}
    >
      <div className="px-5 pb-6">
        <p className="text-meta text-text-muted">
          Public — one response per review, shown under it on your profile.
        </p>
        <div className="py-4">
          <label
            htmlFor="review-response-text"
            className="text-caption font-semibold text-text-primary"
          >
            Your response
          </label>
          <textarea
            id="review-response-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_RESPONSE_CHARS * 2}
            rows={4}
            autoFocus
            placeholder="Thank the buyer or address their feedback."
            className="mt-2 w-full resize-y rounded-md border border-border bg-input px-3 py-2.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
          />
          <p
            className={`mt-1 text-right text-meta ${
              trimmed.length > MAX_RESPONSE_CHARS ? 'text-danger-text' : 'text-text-muted'
            }`}
          >
            {trimmed.length}/{MAX_RESPONSE_CHARS}
          </p>
        </div>
        <Button
          variant="primary"
          className="mt-1 w-full"
          disabled={!canSubmit}
          onClick={submit}
        >
          {sending ? 'Publishing…' : 'Publish response'}
        </Button>
      </div>
    </Sheet>
  );
}
