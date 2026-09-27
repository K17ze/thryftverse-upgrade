'use client';

/**
 * DsaReportSheet — the DSA Art. 16 notice-and-action flow, distinct from
 * the standard report: a notice must name the content's location, explain
 * why it is illegal (own reason taxonomy), carry the reporter's contact
 * email, and include a good-faith declaration. Submits as a real support
 * case — the receipt links to the case thread.
 *
 * Reuses the report suite's reason list, evidence grid and success receipt
 * so the two flows share one grammar.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { useSupportActions } from '@/components/support/useSupportTickets';
import { useSession } from '@/lib/session/SessionProvider';
import {
  DSA_REPORT_REASONS,
  MAX_DSA_DETAILS,
  MAX_REPORT_EVIDENCE,
  type DsaReportReason,
  type EvidenceItem,
} from './reportModel';
import { ReportEvidenceGrid } from './ReportEvidenceGrid';
import { ReportReasonList } from './ReportReasonList';
import { ReportSuccessView } from './ReportSuccessView';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface DsaReportSheetProps {
  open: boolean;
  onClose: () => void;
}

export function DsaReportSheet({ open, onClose }: DsaReportSheetProps) {
  const { accountIdentity } = useSession();
  const { createTicket } = useSupportActions();
  const toast = useToast();

  const [location, setLocation] = useState('');
  const [reason, setReason] = useState<DsaReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [goodFaith, setGoodFaith] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [sending, setSending] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const done = reportId != null;
  const emailError =
    emailTouched && email.trim() && !EMAIL_PATTERN.test(email.trim())
      ? 'Enter a valid email address'
      : null;
  const canSubmit =
    location.trim().length > 0 &&
    reason != null &&
    details.trim().length > 0 &&
    EMAIL_PATTERN.test(email.trim()) &&
    goodFaith &&
    !sending;

  // Fresh notice per open.
  useEffect(() => {
    if (!open) return;
    setLocation('');
    setReason(null);
    setDetails('');
    setEmail(accountIdentity?.email ?? '');
    setEmailTouched(false);
    setGoodFaith(false);
    setEvidence([]);
    setSending(false);
    setReportId(null);
    setTicketId(null);
    setSubmittedAt(null);
  }, [open, accountIdentity?.email]);

  // Object-URL previews die with the sheet.
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
      return { id: `ev-${Date.now()}-${i}`, uri, state: 'attached' as const };
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
      DSA_REPORT_REASONS.find((r) => r.key === reason)?.label ?? reason;
    try {
      const ticket = await createTicket({
        topicId: 'other',
        orderRef: null,
        message:
          `DSA notice — ${reasonLabel}` +
          `\nContent: ${location.trim()}` +
          `\nReporter email: ${email.trim()}` +
          `\n\n${details.trim()}` +
          `\n\nGood-faith declaration: confirmed` +
          (evidence.length
            ? ` [${evidence.length} attachment(s) uploaded by reporter]`
            : ''),
      });
      setReportId(ticket.ref ?? ticket.id.toUpperCase());
      setTicketId(ticket.id);
      setSubmittedAt(
        new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      );
      setEvidence((prev) => prev.map((e) => ({ ...e, state: 'submitted' })));
    } catch {
      toast.show('Could not send the notice — try again.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Report illegal content" maxWidth={560}>
      {done ? (
        <ReportSuccessView
          kind="dsa"
          reportId={reportId}
          submittedAt={submittedAt}
          evidenceItems={evidence}
          caseHref={ticketId ? `/support/${ticketId}` : undefined}
          onDone={onClose}
        />
      ) : (
        <div className="px-5 pb-6">
          <p className="text-meta text-text-muted">
            Notice under the Digital Services Act · confidential
          </p>

          {/* Where the content is — required by Art. 16. */}
          <div className="py-4">
            <h3 className="text-section-title font-semibold text-text-primary">
              Where is the content?
            </h3>
            <p className="mt-1 max-w-[340px] text-caption leading-relaxed text-text-muted">
              Paste the link, or describe exactly where on ThryftVerse the
              content appears — a listing, profile, post or message.
            </p>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. https://thryftverse.com/item/… or @username"
              aria-label="Location of the content"
              className="mt-3 h-11 w-full rounded-md border border-border bg-input px-3 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
            />
          </div>

          <h3 className="pb-2 text-caption font-semibold text-text-primary">
            Why is it illegal?
          </h3>
          <ReportReasonList<DsaReportReason>
            reasons={DSA_REPORT_REASONS}
            selected={reason}
            onSelect={setReason}
            ariaLabel="Why the content is illegal"
          />

          {reason ? (
            <div className="mt-5">
              <label
                htmlFor="dsa-details"
                className="mb-1.5 block text-caption font-semibold text-text-primary"
              >
                Explain why you believe it is illegal
              </label>
              <textarea
                id="dsa-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={MAX_DSA_DETAILS}
                rows={4}
                placeholder="Be as precise as you can — what the content is, which law or right it breaks, and how you found it."
                className="w-full resize-y rounded-md border border-border bg-input px-3 py-2.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
              />
              <p className="mt-1 text-right text-meta text-text-muted">
                {details.length}/{MAX_DSA_DETAILS}
              </p>

              <label
                htmlFor="dsa-email"
                className="mb-1.5 mt-3 block text-caption font-semibold text-text-primary"
              >
                Your email
              </label>
              <input
                id="dsa-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                onInvalid={() => setEmailTouched(true)}
                placeholder="name@example.com"
                aria-invalid={emailError != null}
                aria-describedby={emailError ? 'dsa-email-error' : undefined}
                className="h-11 w-full rounded-md border border-border bg-input px-3 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
              />
              {emailError ? (
                <p id="dsa-email-error" className="mt-1 text-meta text-danger-text">
                  {emailError}
                </p>
              ) : null}

              <p className="mb-1.5 mt-4 text-caption font-semibold text-text-primary">
                Evidence photos (optional)
              </p>
              {evidence.length > 0 ? (
                <div className="mb-2">
                  <ReportEvidenceGrid
                    items={evidence}
                    mode="editable"
                    onRemove={removeEvidence}
                  />
                </div>
              ) : null}
              {evidence.length < MAX_REPORT_EVIDENCE ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      attachFiles(Array.from(e.target.files ?? []));
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="pressable flex min-h-11 w-full items-center gap-2 rounded-md border border-border px-3 py-2.5 text-left hover:bg-brand-subtle"
                  >
                    <Icon name="camera" size={18} className="shrink-0 text-text-secondary" />
                    <span className="flex-1 text-body text-text-primary">
                      {evidence.length > 0 ? 'Add more' : 'Add photos'}
                    </span>
                    <span className="text-meta text-text-muted">
                      {evidence.length}/{MAX_REPORT_EVIDENCE}
                    </span>
                  </button>
                </>
              ) : null}

              <button
                type="button"
                role="checkbox"
                aria-checked={goodFaith}
                onClick={() => setGoodFaith((v) => !v)}
                className="pressable mt-5 flex min-h-11 w-full items-start gap-3 rounded-md py-2 text-left"
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${
                    goodFaith ? 'border-brand bg-brand' : 'border-border'
                  }`}
                  aria-hidden
                >
                  {goodFaith ? (
                    <Icon name="check" size={14} className="text-text-inverse" />
                  ) : null}
                </span>
                <span className="flex-1 text-caption leading-relaxed text-text-secondary">
                  I believe in good faith that the information in this notice is
                  accurate and complete.
                </span>
              </button>
            </div>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="mt-5"
          >
            {sending ? 'Sending…' : 'Submit notice'}
          </Button>
          <p className="mt-3 text-meta leading-relaxed text-text-muted">
            Submitting a notice you know to be false can itself be unlawful.
            To appeal a decision on your own content instead, use Support.
          </p>
        </div>
      )}
    </Sheet>
  );
}
