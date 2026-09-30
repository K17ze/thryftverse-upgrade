'use client';

/**
 * ReviewReportSheet — the review-report flow native exposes on
 * ProfileReviewRow. Reviews have their own reason enum
 * (routes/supportReviews.ts), so this is a separate small sheet rather
 * than the shared ReportSheet — same primitives (Sheet, ReportReasonList,
 * ReportSuccessView), no evidence capture (native doesn't collect it
 * here either).
 *
 * Live-only: callers gate the Report affordance on DATA_MODE === 'live'
 * because fixture mode has no report endpoint.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { ReportReasonList } from '@/components/report/ReportReasonList';
import { ReportSuccessView } from '@/components/report/ReportSuccessView';
import type { ReportReasonOption } from '@/components/report/reportModel';
import {
  reportReview,
  type ReviewReportReason,
} from '@/lib/api/services/users';

const REVIEW_REPORT_REASONS: ReportReasonOption<ReviewReportReason>[] = [
  {
    key: 'fake_or_incentivized',
    label: 'Fake or incentivized review',
    description: 'The reviewer was paid or otherwise rewarded for it.',
    icon: 'warning',
  },
  {
    key: 'harmful_or_abusive',
    label: 'Harmful or abusive content',
    description: 'Harassment, hate speech, or threats in the review.',
    icon: 'shield',
  },
  {
    key: 'personal_data',
    label: 'Contains personal data',
    description: 'Names, addresses, contact details, or other private info.',
    icon: 'lock',
  },
  {
    key: 'spam',
    label: 'Spam or irrelevant',
    description: 'Advertising or content unrelated to the transaction.',
    icon: 'mailUnread',
  },
  {
    key: 'off_topic',
    label: 'Off topic',
    description: 'About something other than this order or seller.',
    icon: 'info',
  },
  {
    key: 'other',
    label: 'Other reason',
    description: 'Something else that should be looked at.',
    icon: 'help',
  },
];

interface ReviewReportSheetProps {
  open: boolean;
  onClose: () => void;
  reviewId: string | null;
}

export function ReviewReportSheet({ open, onClose, reviewId }: ReviewReportSheetProps) {
  const [reason, setReason] = useState<ReviewReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const toast = useToast();

  const done = reportId != null;
  const canSubmit = reason != null && !sending && reviewId != null;

  // Fresh report per open — reopening after Done starts a clean form.
  useEffect(() => {
    if (!open) return;
    setReason(null);
    setDetails('');
    setSending(false);
    setReportId(null);
    setSubmittedAt(null);
  }, [open]);

  const submit = async () => {
    if (!canSubmit || !reason || !reviewId) return;
    setSending(true);
    try {
      const result = await reportReview(reviewId, {
        reason,
        details: details.trim() ? details.trim() : undefined,
      });
      setReportId(result.reportId);
      setSubmittedAt(
        new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      );
    } catch (err) {
      // A repeat report from the same account is a 409 — the endpoint
      // message travels verbatim so the user sees the real reason.
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Could not send the report — try again.';
      toast.show(message, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Report review" maxWidth={560}>
      {done ? (
        <ReportSuccessView
          reportId={reportId}
          submittedAt={submittedAt}
          evidenceItems={[]}
          onDone={onClose}
        />
      ) : (
        <div className="px-5 pb-6">
          <p className="text-meta text-text-muted">Reports are confidential</p>

          <div className="py-4">
            <h3 className="text-section-title font-semibold text-text-primary">
              What&apos;s wrong with this review?
            </h3>
            <p className="mt-1 max-w-[340px] text-caption leading-relaxed text-text-muted">
              Choose the reason that best describes the issue. The review&apos;s
              author won&apos;t see who reported it.
            </p>
          </div>

          <ReportReasonList<ReviewReportReason>
            selected={reason}
            onSelect={setReason}
            reasons={REVIEW_REPORT_REASONS}
            ariaLabel="Review report reason"
          />

          {reason ? (
            <div className="py-4">
              <label
                htmlFor="review-report-details"
                className="text-caption font-semibold text-text-primary"
              >
                Anything else we should know? <span className="text-text-muted">(optional)</span>
              </label>
              <textarea
                id="review-report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Add context that helps the moderation team."
                className="mt-2 w-full resize-y rounded-md border border-border bg-input px-3 py-2.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
              />
            </div>
          ) : null}

          <Button
            variant="primary"
            className="mt-2 w-full"
            disabled={!canSubmit}
            onClick={submit}
          >
            {sending ? 'Sending…' : 'Send report'}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
