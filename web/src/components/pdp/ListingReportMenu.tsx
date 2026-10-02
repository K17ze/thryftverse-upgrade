'use client';

/**
 * ListingReportMenu — the PDP's single ··· overflow affordance. One Sheet
 * carries every secondary listing action (Save to board, Share, …) above
 * the "Report this item" row, which opens the report composer (reason list
 * + optional note). Live mode files the report at POST /listings/:id/report
 * — the moderation intake, not a support case. Fixture mode keeps the
 * session-ticket demo path so the receipt link resolves inside the demo
 * dataset. Keyboard: Esc closes (Sheet), Up/Down rove the options, focus
 * returns to the trigger on close (Sheet restoreFocus).
 */

import { useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { useSupportActions } from '@/components/support/useSupportTickets';
import { DATA_MODE } from '@/lib/api/client';
import { reportListing } from '@/lib/api/services/listings';
import {
  MAX_REPORT_DETAILS,
  REPORT_REASONS,
  type ReportReason,
} from '@/components/report/reportModel';
import type { Listing } from '@/lib/contracts/domain';

/** A secondary action row in the options sheet. The menu closes before
 *  `onSelect` runs so a follow-up sheet (Save to board) opens cleanly and
 *  focus restoration stays correct. */
export interface ListingMenuItem {
  icon: AppIconName;
  label: string;
  onSelect: () => void;
}

interface ListingReportMenuProps {
  listing: Pick<Listing, 'id' | 'title'>;
  /** Secondary actions rendered above "Report this item". */
  items?: ListingMenuItem[];
  className?: string;
}

export function ListingReportMenu({ listing, items, className }: ListingReportMenuProps) {
  const router = useRouter();
  const { show } = useToast();
  const { createTicket } = useSupportActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const closeReport = () => {
    setReportOpen(false);
    setReason(null);
    setNote('');
    setSending(false);
  };

  // Roving focus inside the options list — Esc and focus-restore come from
  // Sheet; Up/Down completes the menu keyboard grammar.
  const onMenuKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const options = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
    );
    if (options.length === 0) return;
    e.preventDefault();
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'ArrowDown'
        ? (current + 1) % options.length
        : current <= 0
          ? options.length - 1
          : current - 1;
    options[next]?.focus();
  };

  const submit = async () => {
    if (!reason || sending) return;
    setSending(true);
    const reasonLabel =
      REPORT_REASONS.find((r) => r.key === reason)?.label ?? 'Report';
    try {
      if (DATA_MODE === 'live') {
        // The moderation write — reason travels verbatim (web's catalogue
        // is a subset of the endpoint's 14-value enum), note as details
        // (≤500 chars per the route schema).
        await reportListing(listing.id, {
          reason,
          details: note.trim() ? note.trim() : undefined,
          idempotencyKey: `webrpt_listing_${listing.id}_${Date.now()}`,
        });
        closeReport();
        show('Report sent — our team will review it', 'success');
      } else {
        // Fixture demo path — a session ticket so the follow-up link
        // resolves inside the demo dataset.
        const ticket = await createTicket({
          topicId: reason === 'counterfeit' ? 'verification' : 'other',
          orderRef: null,
          message:
            `Listing report — ${reasonLabel}: "${listing.title}" (listing ${listing.id})` +
            (note.trim() ? ` — ${note.trim()}` : ''),
        });
        closeReport();
        show('Report sent — our team will review it', 'success');
        router.push(`/support/${ticket.id}`);
      }
    } catch {
      setSending(false);
      show('Could not send the report — try again.', 'error');
    }
  };

  return (
    <>
      <IconButton
        name="more"
        aria-label={`More options for ${listing.title}`}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
        className={className}
      />
      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Listing options"
        maxWidth={400}
      >
        <div className="px-5 pb-5">
          <ul className="flex flex-col" onKeyDown={onMenuKeyDown}>
            {items?.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    item.onSelect();
                  }}
                  className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
                >
                  <Icon name={item.icon} size={20} />
                  <span className="flex-1 text-body-emphasis font-medium">
                    {item.label}
                  </span>
                </button>
              </li>
            ))}
            <li className={items?.length ? 'border-t border-border-subtle' : ''}>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name="flag" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  Report this item
                </span>
                <Icon name="forward" size={16} className="text-text-muted" />
              </button>
            </li>
          </ul>
        </div>
      </Sheet>

      <Sheet
        open={reportOpen}
        onClose={closeReport}
        title="Report listing"
        maxWidth={480}
      >
        <div className="px-5 pb-6">
          <p className="text-meta text-text-muted">
            Reports are confidential · {listing.title}
          </p>
          <h3 className="mt-3 text-section-title font-semibold text-text-primary">
            What happened?
          </h3>
          <ul className="mt-2 flex flex-col divide-y divide-border-subtle border-b border-border-subtle">
            {REPORT_REASONS.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => setReason(r.key)}
                  aria-pressed={reason === r.key}
                  className="pressable flex min-h-11 w-full items-center gap-3 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-emphasis font-medium text-text-primary">
                      {r.label}
                    </span>
                    <span className="block text-caption text-text-muted">
                      {r.description}
                    </span>
                  </span>
                  {reason === r.key ? (
                    <Icon name="check" size={16} className="shrink-0 text-text-primary" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <label
            htmlFor="report-note"
            className="mt-4 block text-caption font-medium text-text-secondary"
          >
            Note for the moderation team{' '}
            <span className="font-normal text-text-muted">— optional</span>
          </label>
          <textarea
            id="report-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={MAX_REPORT_DETAILS}
            placeholder="What should the moderator know?"
            className="mt-1.5 w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
          />
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!reason || sending}
            onClick={() => void submit()}
            className="mt-4"
          >
            {sending ? 'Sending…' : 'Send report'}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
