'use client';

/**
 * TransfersSection — "Recent transfers" on the Send money surface.
 *
 * Renders GET /transfers newest-first, verbatim: state (label map is
 * cosmetic — unknown states render the raw code), beneficiary display
 * name resolved from the live beneficiary list (a removed recipient is
 * labelled as such, never guessed), source → target amounts via
 * formatMinorAmount, and createdAt.
 *
 * Rows expand in place for the full wire detail (rail, refs, timestamps,
 * failureMessage). Cancel is only offered for the server-declared
 * cancellable states (QUOTE/AWAITING_FUNDS/FUNDED/PROCESSING) behind an
 * inline Keep/Cancel confirm — funded rows are refunded pocket-side by
 * the server. Cancel errors surface verbatim.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { parseApiError } from '@/lib/api/http';
import {
  cancelTransfer,
  formatMinorAmount,
  TRANSFER_CANCELLABLE_STATES,
  type BeneficiaryPayload,
  type TransferPayload,
} from '@/lib/api/services/fx';
import { walletKeys } from '../walletKeys';
import {
  formatTimestamp,
  transferAmountsLabel,
  transferStateDescription,
  transferStateLabel,
  transferStateTone,
} from './sendModel';

const STATE_TONE_CLASSES: Record<string, string> = {
  progress: 'text-text-secondary',
  success: 'text-success-text',
  danger: 'text-danger-text',
  neutral: 'text-text-muted',
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-body text-text-secondary">{label}</span>
      <span className="tnum break-all text-right text-body text-text-primary">{value}</span>
    </div>
  );
}

interface TransfersSectionProps {
  transfers: TransferPayload[];
  beneficiaries: BeneficiaryPayload[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function TransfersSection({
  transfers,
  beneficiaries,
  isLoading,
  isError,
  onRetry,
}: TransfersSectionProps) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<Record<string, string>>({});

  const beneficiaryName = (id: string | null): string => {
    if (!id) return 'Direct transfer';
    const beneficiary = beneficiaries.find((b) => b.id === id);
    // A soft-deleted recipient disappears from the active list — say so
    // rather than guessing a name or fabricating one.
    return beneficiary?.displayName ?? 'Removed recipient';
  };

  const handleCancel = async (transfer: TransferPayload) => {
    setBusyId(transfer.id);
    setCancelError((prev) => ({ ...prev, [transfer.id]: '' }));
    try {
      await cancelTransfer(transfer.id);
      // Cancel refunds funded rows pocket-side — invalidate the wallet
      // root so pockets, recipients and the feed all re-read.
      void queryClient.invalidateQueries({ queryKey: walletKeys.root });
      setConfirmingId(null);
    } catch (error) {
      setCancelError((prev) => ({
        ...prev,
        [transfer.id]: parseApiError(error, 'Couldn’t cancel this transfer.').message,
      }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="Recent transfers" className="mt-10 px-4 sm:px-6">
      <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
        Recent transfers
      </h2>

      {isLoading ? (
        <div aria-busy className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-baseline justify-between py-3">
              <Skeleton className="h-4 w-[45%]" />
              <Skeleton className="h-4 w-[25%]" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="mt-2 flex items-baseline justify-between border-y border-border-subtle py-3">
          <span className="text-body text-danger-text">Couldn&apos;t load transfers.</span>
          <button
            type="button"
            onClick={onRetry}
            className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Try again
          </button>
        </div>
      ) : transfers.length === 0 ? (
        <p className="mt-2 border-y border-border-subtle py-4 text-body text-text-muted">
          No transfers yet.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
          {transfers.map((transfer) => {
            const expanded = expandedId === transfer.id;
            const confirming = confirmingId === transfer.id;
            const cancellable = TRANSFER_CANCELLABLE_STATES.has(transfer.state);
            const tone = STATE_TONE_CLASSES[transferStateTone(transfer.state)];
            return (
              <li key={transfer.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : transfer.id)}
                  aria-expanded={expanded}
                  className="pressable flex w-full items-baseline justify-between gap-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="clamp-1 block text-body font-medium text-text-primary">
                      {beneficiaryName(transfer.beneficiaryId)}
                    </span>
                    <span className="mt-0.5 block text-meta text-text-muted">
                      <span className={tone}>{transferStateLabel(transfer.state)}</span>
                      {' · '}
                      {formatTimestamp(transfer.createdAt)}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-body font-medium text-text-secondary">
                    {transferAmountsLabel(transfer)}
                  </span>
                </button>

                {expanded ? (
                  <div className="border-l-2 border-border-subtle pb-4 pl-3">
                    <p className="py-1.5 text-meta text-text-secondary">
                      {transferStateDescription(transfer.state)}
                    </p>
                    {transfer.failureMessage ? (
                      <p role="alert" className="py-1.5 text-meta text-danger-text">
                        {transfer.failureMessage}
                      </p>
                    ) : null}
                    <DetailRow
                      label="You sent"
                      value={formatMinorAmount(transfer.sourceAmountMinor, transfer.sourceCurrency)}
                    />
                    <DetailRow
                      label="Recipient gets"
                      value={formatMinorAmount(transfer.targetAmountMinor, transfer.targetCurrency)}
                    />
                    <DetailRow label="Reference" value={transfer.id} />
                    {transfer.txId ? <DetailRow label="Ledger tx" value={transfer.txId} /> : null}
                    {transfer.rail ? <DetailRow label="Rail" value={transfer.rail} /> : null}
                    {transfer.railRef ? <DetailRow label="Rail ref" value={transfer.railRef} /> : null}
                    {transfer.uetr ? <DetailRow label="UETR" value={transfer.uetr} /> : null}
                    {transfer.fxQuoteId ? (
                      <DetailRow label="FX quote" value={transfer.fxQuoteId} />
                    ) : null}
                    {transfer.fundedAt ? (
                      <DetailRow label="Funded" value={formatTimestamp(transfer.fundedAt)} />
                    ) : null}
                    {transfer.completedAt ? (
                      <DetailRow label="Completed" value={formatTimestamp(transfer.completedAt)} />
                    ) : null}
                    <DetailRow label="Created" value={formatTimestamp(transfer.createdAt)} />

                    {cancellable ? (
                      confirming ? (
                        <div className="mt-3 flex items-center justify-between gap-3 border-l-2 border-danger-border py-1 pl-3">
                          <p className="text-meta text-text-secondary">
                            {transfer.fundedAt
                              ? 'Cancel this transfer? The funded amount returns to your pocket.'
                              : 'Cancel this transfer?'}
                          </p>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              size="sm"
                              variant="quiet"
                              onClick={() => setConfirmingId(null)}
                              disabled={busyId === transfer.id}
                            >
                              Keep
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => void handleCancel(transfer)}
                              disabled={busyId === transfer.id}
                            >
                              {busyId === transfer.id ? 'Cancelling…' : 'Cancel transfer'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmingId(transfer.id)}
                          >
                            Cancel transfer
                          </Button>
                        </div>
                      )
                    ) : null}
                    {cancelError[transfer.id] ? (
                      <p role="alert" className="mt-2 text-meta text-danger-text">
                        {cancelError[transfer.id]}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
