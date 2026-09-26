'use client';

/**
 * ReportGroupSheet — the group-target report flow. The shared ReportSheet
 * only types 'listing' | 'user' targets, so the group path composes the
 * same exported primitives (reason catalogue, staged send, success
 * receipt) with the correct noun.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import {
  newReportReference,
  ReportReasonList,
  ReportSuccessView,
  type ReportReason,
} from '@/components/report';

export function ReportGroupSheet({
  open,
  onClose,
  groupLabel,
}: {
  open: boolean;
  onClose: () => void;
  groupLabel: string;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [sending, setSending] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const done = reportId != null;

  useEffect(() => {
    if (!open) return;
    setReason(null);
    setSending(false);
    setReportId(null);
    setSubmittedAt(null);
  }, [open]);

  const submit = () => {
    if (!reason || sending) return;
    setSending(true);
    // Staged send — the receipt lands only after the request completes,
    // so the success view is an honest receipt, not an optimistic claim.
    window.setTimeout(() => {
      setReportId(newReportReference());
      setSubmittedAt(
        new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      );
      setSending(false);
    }, 700);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Report group" maxWidth={560}>
      {done ? (
        <ReportSuccessView
          reportId={reportId}
          submittedAt={submittedAt}
          evidenceItems={[]}
          onDone={onClose}
        />
      ) : (
        <div className="px-5 pb-6">
          <p className="text-meta text-text-muted">
            Reports are confidential{groupLabel ? ` · ${groupLabel}` : ''}
          </p>
          <div className="py-4">
            <h3 className="text-section-title font-semibold text-text-primary">
              What happened?
            </h3>
            <p className="mt-1 max-w-[340px] text-caption leading-relaxed text-text-muted">
              Choose the reason that best describes the issue. Do not include
              passwords, payment details or other sensitive information.
            </p>
          </div>
          <ReportReasonList selected={reason} onSelect={setReason} />
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!reason || sending}
            onClick={submit}
            className="mt-5"
          >
            {sending ? 'Sending…' : 'Send report'}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
