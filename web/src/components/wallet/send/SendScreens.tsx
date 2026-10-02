'use client';

/**
 * SendScreens — the non-compose states of the Send money surface:
 * skeleton, in-flight "sending" screen, and the honest receipt.
 *
 * The receipt renders the wire transfer state verbatim (label map only
 * translates the code) — a PROCESSING transfer is funded but has no
 * external payout rail yet, so it is announced as Processing, never as
 * delivered/paid.
 */

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatMinorAmount, type TransferPayload } from '@/lib/api/services/fx';
import { ConvertSummaryRow } from '../ConvertSummaryRow';
import { transferStateDescription, transferStateLabel } from './sendModel';

export function SendSkeleton() {
  return (
    <div aria-busy aria-label="Loading send money" className="mx-auto w-full max-w-xl lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="px-4 pt-8 sm:px-6">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-3 h-12 w-52" />
        <Skeleton className="mt-6 h-24 w-full rounded-lg" />
        <Skeleton className="mt-8 h-[52px] w-full rounded-md" />
      </div>
    </div>
  );
}

export function SendingScreen({
  sourceCurrency,
  targetCurrency,
  sameCurrency,
}: {
  sourceCurrency: string | null;
  targetCurrency: string | null;
  sameCurrency: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        {/* Back is disabled while the write is in flight — the key handler
            keeps this button inert rather than a dead affordance. */}
        <IconButton name="back" aria-label="Back to wallet" disabled />
        <h1 className="text-screen-title text-text-primary">Send money</h1>
      </div>
      <div className="flex flex-col items-center px-6 pt-24 text-center">
        <Icon name="send" size={48} className="text-brand" />
        <h2 className="mt-4 text-section-title font-semibold text-text-primary">
          Sending your transfer
        </h2>
        <p className="mt-3 flex items-center gap-2 text-body text-text-secondary" role="status">
          <Spinner size={24} />
          <span>
            Debiting your {sourceCurrency} pocket
            {sameCurrency ? '' : ` and converting to ${targetCurrency}`}.
          </span>
        </p>
      </div>
    </div>
  );
}

export function SendReceipt({
  transfer,
  beneficiaryName,
  onDone,
  onSendAgain,
}: {
  transfer: TransferPayload;
  beneficiaryName: string;
  onDone: () => void;
  onSendAgain: () => void;
}) {
  const sentLabel = formatMinorAmount(transfer.sourceAmountMinor, transfer.sourceCurrency);
  const targetLabel = formatMinorAmount(transfer.targetAmountMinor, transfer.targetCurrency);
  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={onDone} />
        <h1 className="text-screen-title text-text-primary">Transfer</h1>
      </div>

      <div className="flex flex-col items-center px-4 pt-10 text-center sm:px-6">
        <Icon name="send" size={36} className="text-text-secondary" />
        <h2 className="mt-4 text-screen-title text-text-primary">
          {transferStateLabel(transfer.state)}
        </h2>
        <p className="mt-1 max-w-md text-body text-text-secondary">
          {transferStateDescription(transfer.state)}
        </p>
      </div>

      <div className="mt-8 px-4 sm:px-6">
        <ConvertSummaryRow label="To" value={beneficiaryName} />
        <ConvertSummaryRow label="You sent" value={sentLabel} />
        <ConvertSummaryRow label="Recipient gets" value={targetLabel} />
        {transfer.failureMessage ? (
          <ConvertSummaryRow label="Failure" value={transfer.failureMessage} negative />
        ) : null}
        {transfer.txId ? <ConvertSummaryRow label="Ledger tx" value={transfer.txId} /> : null}
        <ConvertSummaryRow label="Reference" value={transfer.id} />
        <ConvertSummaryRow label="Status" value={transfer.state} total />
      </div>

      <div className="mt-8 flex flex-col gap-2.5 px-4 sm:px-6">
        <Button variant="primary" size="lg" fullWidth onClick={onDone}>
          Done
        </Button>
        <Button variant="secondary" size="md" fullWidth onClick={onSendAgain}>
          Send another
        </Button>
      </div>
    </div>
  );
}
