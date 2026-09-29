'use client';

/**
 * BuyerProtectionSheet — port of mobile BuyerProtectionScreen condensed to
 * the order-detail sheet surface: coverage rows (fee paid, cap, eligibility
 * window), the order's claim history, and an inline claim form (reason +
 * description — the POST /orders/:id/protection/claim contract). All values
 * come from the parent — live mode reads GET /orders/:id/protection;
 * fixture mode derives the same coverage shape from the order's fee split.
 */

import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate, formatPrice } from '@/lib/utils/format';

export interface ProtectionClaimRow {
  ticketId: string;
  label: string;
  status: string;
  createdAt: string;
}

/** The resolved coverage view-model — minor units are already converted. */
export interface ProtectionCoverage {
  covered: boolean;
  feeGbp: number;
  coverageCapGbp: number;
  eligibleUntil: string | null;
  claims: ProtectionClaimRow[];
}

interface Props {
  open: boolean;
  /** Null while the protection read is in flight or unavailable. */
  coverage: ProtectionCoverage | null;
  loading?: boolean;
  /** The protection read failed — render the honest error line, not a
   *  perpetual skeleton. */
  error?: boolean;
  /** False when the claim window has closed or the order isn't claimable. */
  canClaim?: boolean;
  claimBusy?: boolean;
  onSubmitClaim: (input: { reason: string; description: string }) => void;
  onClose: () => void;
}

const CLAIM_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_review: 'In review',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function BuyerProtectionSheet({
  open,
  coverage,
  loading = false,
  error = false,
  canClaim = true,
  claimBusy = false,
  onSubmitClaim,
  onClose,
}: Props) {
  const [claimOpen, setClaimOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');

  // Fresh form per open — a submitted or dismissed claim never leaks into
  // the next visit.
  useEffect(() => {
    if (open) {
      setClaimOpen(false);
      setReason('');
      setDescription('');
    }
  }, [open]);

  const claimValid = reason.trim().length >= 2 && description.trim().length >= 10;
  const windowClosed =
    coverage?.eligibleUntil != null &&
    Date.parse(coverage.eligibleUntil) <= Date.now();

  return (
    <Sheet open={open} onClose={onClose} title="Buyer protection" maxWidth={480}>
      <div className="px-5 pb-6">
        {error ? (
          <p className="flex items-center gap-2 text-body text-text-secondary">
            <Icon name="alert" size={16} className="shrink-0 text-text-muted" />
            Couldn&apos;t load protection details — try again in a moment.
          </p>
        ) : loading || !coverage ? (
          <div aria-busy aria-label="Loading protection details">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
          </div>
        ) : (
          <>
            <p className="text-body text-text-secondary">
              {coverage.covered
                ? 'This order is covered — if the item never arrives or isn\'t as described, you can claim a refund.'
                : 'No buyer protection fee was paid on this order.'}
            </p>

            <dl className="mt-3 border-y border-border-subtle">
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-caption text-text-muted">Protection fee paid</dt>
                <dd className="tnum text-body font-medium text-text-primary">
                  {formatPrice(coverage.feeGbp)}
                </dd>
              </div>
              {coverage.covered ? (
                <>
                  <div className="flex items-center justify-between border-t border-border-subtle py-2.5">
                    <dt className="text-caption text-text-muted">Coverage</dt>
                    <dd className="tnum text-body font-medium text-text-primary">
                      Up to {formatPrice(coverage.coverageCapGbp)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-border-subtle py-2.5">
                    <dt className="text-caption text-text-muted">Eligible until</dt>
                    <dd className="text-body font-medium text-text-primary">
                      {coverage.eligibleUntil ? formatDate(coverage.eligibleUntil) : '—'}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>

            {coverage.claims.length > 0 ? (
              <>
                <p className="mt-4 text-label text-text-muted">Claims</p>
                <ul className="flex flex-col">
                  {coverage.claims.map((claim) => (
                    <li
                      key={claim.ticketId}
                      className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-0"
                    >
                      <Icon
                        name={claim.status === 'open' ? 'clock' : 'shield'}
                        size={16}
                        className={
                          claim.status === 'open' ? 'text-warning-text' : 'text-text-muted'
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-medium text-text-primary">
                          {claim.label}
                        </span>
                        <span className="block text-caption text-text-muted">
                          Opened {formatDate(claim.createdAt)}
                        </span>
                      </span>
                      <span className="shrink-0 text-caption text-text-secondary">
                        {CLAIM_STATUS_LABEL[claim.status] ?? claim.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {coverage.covered && canClaim && !windowClosed ? (
              claimOpen ? (
                <div className="mt-4">
                  <label className="block">
                    <span className="text-label text-text-muted">Reason</span>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={120}
                      aria-label="Claim reason"
                      placeholder="e.g. Item never arrived"
                      className="mt-1.5 w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className="text-label text-text-muted">What happened?</span>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      aria-label="Claim description"
                      placeholder="Describe the problem so our team can review it"
                      className="mt-1.5 w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
                    />
                  </label>
                  <div className="mt-4 flex gap-3">
                    <Button
                      variant="outline"
                      size="md"
                      fullWidth
                      onClick={() => setClaimOpen(false)}
                      disabled={claimBusy}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="md"
                      fullWidth
                      disabled={!claimValid || claimBusy}
                      onClick={() =>
                        onSubmitClaim({
                          reason: reason.trim(),
                          description: description.trim(),
                        })
                      }
                    >
                      {claimBusy ? 'Submitting…' : 'Submit claim'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  icon="shield"
                  className="mt-4"
                  onClick={() => setClaimOpen(true)}
                >
                  File a claim
                </Button>
              )
            ) : coverage.covered && windowClosed ? (
              <p className="mt-4 flex items-center gap-1.5 text-caption text-text-muted">
                <Icon name="clock" size={14} />
                The claim window for this order has closed.
              </p>
            ) : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
