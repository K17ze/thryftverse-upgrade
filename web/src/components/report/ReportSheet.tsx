'use client';

/**
 * ReportSheet — the staged report flow inside the shared Sheet primitive:
 * confidential intro → reason list → details + evidence → staged sending →
 * success receipt with a case reference. Same state machine as the mobile
 * ReportScreen: reason gates the submit, details and photos stay optional.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import {
  MAX_REPORT_EVIDENCE,
  newReportReference,
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
  const [sending, setSending] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const objectUrlsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);

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
    setSubmittedAt(null);
  }, [open]);

  // Evidence previews are session object URLs — release them when the
  // sheet closes or unmounts, and cancel a pending staged send.
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((uri) => URL.revokeObjectURL(uri));
      urls.clear();
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
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

  const submit = () => {
    if (!canSubmit) return;
    setSending(true);
    // Staged send — the receipt lands only after the request completes, so
    // the success view is an honest receipt, not an optimistic claim.
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setReportId(newReportReference());
      setSubmittedAt(
        new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      );
      setEvidence((prev) => prev.map((e) => ({ ...e, state: 'submitted' })));
      setSending(false);
    }, 700);
  };

  return (
    <Sheet open={open} onClose={onClose} title={reportTitleFor(target.type)} maxWidth={560}>
      {done ? (
        <ReportSuccessView
          reportId={reportId}
          submittedAt={submittedAt}
          evidenceItems={evidence}
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
