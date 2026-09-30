'use client';

/**
 * WithdrawSuccessReceipt — success receipt for payout requests.
 * Displays reference ID, amount, destination account, timestamp, and review status.
 */

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { formatPrice } from '@/lib/utils/format';
import { ConvertSummaryRow } from '../ConvertSummaryRow';
import { formatRequestedAt, type WithdrawSuccessData } from './withdrawViewModel';

interface WithdrawSuccessReceiptProps {
  result: WithdrawSuccessData;
  isLive: boolean;
}

export function WithdrawSuccessReceipt({ result, isLive }: WithdrawSuccessReceiptProps) {
  const router = useRouter();

  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
        <h1 className="text-screen-title text-text-primary">Withdraw</h1>
      </div>

      <div className="flex flex-col items-center px-4 pt-10 text-center sm:px-6">
        <Icon name="check" filled size={56} className="text-success-text" />
        <h2 className="mt-4 text-screen-title text-text-primary">
          Withdrawal requested
        </h2>
        <p className="mt-1 text-body text-text-secondary">
          {isLive
            ? `${formatPrice(result.amountGbp, 'GBP')} requested — pending review`
            : `${formatPrice(result.amountGbp, 'GBP')} recorded on this device`}
        </p>
      </div>

      <div className="mt-8 px-4 sm:px-6">
        <ConvertSummaryRow label="Reference" value={result.reference} />
        <ConvertSummaryRow label="Amount" value={formatPrice(result.amountGbp, 'GBP')} />
        <ConvertSummaryRow label="Destination" value={result.destinationLabel} />
        <ConvertSummaryRow label="Requested" value={formatRequestedAt(result.createdAt)} />
        <ConvertSummaryRow
          label="Status"
          value={isLive ? 'Pending review' : 'Recorded locally (demo)'}
        />
      </div>

      <p className="mt-6 flex items-start gap-1.5 px-4 text-caption text-text-muted sm:px-6">
        <Icon name={isLive ? 'clock' : 'info'} size={14} className="mt-0.5 shrink-0" />
        {isLive
          ? 'Pending review — track it in payout activity.'
          : 'Demo mode — this request exists only on this device and nothing was sent.'}
      </p>

      <div className="mt-8 flex flex-col gap-2 px-4 sm:px-6">
        <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/wallet')}>
          Done
        </Button>
        <Button
          variant="secondary"
          size="md"
          fullWidth
          onClick={() => router.push('/wallet/payouts')}
        >
          View payout activity
        </Button>
      </div>
    </div>
  );
}
