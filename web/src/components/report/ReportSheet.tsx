'use client';

/**
 * ReportSheet — the staged report flow inside the shared Sheet primitive:
 * confidential intro → reason list → details + evidence → staged sending →
 * success receipt with a case reference. Same state machine as the mobile
 * ReportScreen: reason gates the submit, details and photos stay optional.
 *
 * Live mode posts to the moderation endpoints the report targets —
 * POST /users/:id/report for accounts, POST /listings/:id/report for
 * listings — so the report enters the safety case graph, not the support
 * queue. Fixture mode keeps the session-ticket demo path.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { useSupportActions } from '@/components/support/useSupportTickets';
import { DATA_MODE } from '@/lib/api/client';
import { reportListing } from '@/lib/api/services/listings';
import { reportUser } from '@/lib/api/services/users';
import {
  MAX_REPORT_EVIDENCE,
  REPORT_REASONS,
  reportTitleFor,
  type EvidenceItem,
  type ReportReason,
  type ReportTarget,
} from './reportModel';
import { ReportDetailsSection } from './ReportDetailsSection';
import { ReportReasonList } from './ReportReasonList';
import { ReportSuccessView } from './ReportSuccessView';

interface ReportSheetProps {
  open: boolean;
  onClose: () => void;
  target: ReportTarget;
}

export function ReportSheet({ open, onClose, target }: ReportSheetProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const { createTicket } = useSupportActions();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const objectUrlsRef = useRef<Set<string>>(new Set());

  const done = reportId != null;
  const canSubmit = reason != null && !sending;

  // Fresh report per open — reopening after Done starts a clean form.
  useEffect(() => {
    if (!open) return;
    setReason(null);
    setDetails('');
    setEvidence([]);
    setSending(false);
    setReportId(null);
    setTicketId(null);
    setSubmittedAt(null);
  }, [open]);

  // Evidence previews are session object URLs — release them when the
  // sheet closes or unmounts.
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((uri) => URL.revokeObjectURL(uri));
      urls.clear();
    };
  }, [open]);

  const attachFiles = (files: File[]) => {
    const room = MAX_REPORT_EVIDENCE - evidence.length;
    if (room <= 0 || files.length === 0) return;
    const items = files.slice(0, room).map((file, i) => {
      const uri = URL.createObjectURL(file);
      objectUrlsRef.current.add(uri);
      return {
        id: `ev-${Date.now()}-${i}`,
        uri,
        state: 'attached' as const,
      };
    });
    setEvidence((prev) => [...prev, ...items]);
  };

  const removeEvidence = (id: string) => {
    setEvidence((prev) => {
      const item = prev.find((e) => e.id === id);
      if (item) {
        URL.revokeObjectURL(item.uri);
        objectUrlsRef.current.delete(item.uri);
      }
      return prev.filter((e) => e.id !== id);
    });
  };

  const submit = async () => {
    if (!canSubmit || !reason) return;
    setSending(true);
    const reasonLabel =
      REPORT_REASONS.find((r) => r.key === reason)?.label ?? 'Report';
    try {
      if (DATA_MODE === 'live') {
        // The moderation write — a report row + safety notice, not a
        // support case. The shared web reason vocabulary is a subset of
        // the endpoint's 14-value enum, so `reason` travels verbatim.
        const detailsParam = details.trim() ? details.trim() : undefined;
        const idempotencyKey = `webrpt_${target.type}_${target.id}_${Date.now()}`;
        const result =
          target.type === 'user'
            ? await reportUser(target.id, {
                reason,
                details: detailsParam,
                idempotencyKey,
              })
            : await reportListing(target.id, {
                reason,
                details: detailsParam,
                idempotencyKey,
              });
        // Moderation reports have no case thread — the receipt shows the
        // report id and no follow-up link.
        setReportId(result.reportId);
        setTicketId(null);
      } else {
        // Fixture demo path — a session-scoped case so the receipt's
        // "View your case" link resolves within the demo dataset.
        const ticket = await createTicket({
          topicId: reason === 'counterfeit' ? 'verification' : 'other',
          orderRef: null,
          message:
            `${reportTitleFor(target.type)} — ${reasonLabel}` +
            (target.label ? ` · ${target.label}` : '') +
            ` (${target.type} ${target.id})` +
            (details.trim() ? ` — ${details.trim()}` : '') +
            (evidence.length
              ? ` [${evidence.length} attachment(s) uploaded by reporter]`
              : ''),
        });
        setReportId(ticket.ref ?? ticket.id.toUpperCase());
        setTicketId(ticket.id);
      }
      setSubmittedAt(
        new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      );
      setEvidence((prev) => prev.map((e) => ({ ...e, state: 'submitted' })));
    } catch {
      toast.show('Could not send the report — try again.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={reportTitleFor(target.type)} maxWidth={560}>
      {done ? (
        <ReportSuccessView
          reportId={reportId}
          submittedAt={submittedAt}
          evidenceItems={evidence}
          caseHref={ticketId ? `/support/${ticketId}` : undefined}
          onDone={onClose}
        />
      ) : (
        <div className="px-5 pb-6">
          <p className="text-meta text-text-muted">
            Reports are confidential{target.label ? ` · ${target.label}` : ''}
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

          {reason ? (
            <ReportDetailsSection
              details={details}
              onChangeDetails={setDetails}
              evidenceItems={evidence}
              onAttachFiles={attachFiles}
              onRemoveEvidence={removeEvidence}
            />
          ) : null}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="mt-5"
          >
            {sending ? 'Sending…' : 'Send report'}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
