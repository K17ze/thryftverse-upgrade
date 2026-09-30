'use client';

/**
 * ExchangeReceipt — completion receipt for fiat currency exchange.
 * Displays executed amounts, customer rate, minor-unit derived fee,
 * unique transaction reference ID, and audit timestamp.
 */

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { ConvertSummaryRow } from '../ConvertSummaryRow';
import { formatMinorAmount, formatRateValue } from '@/lib/api/services/fx';

export interface FxReceipt {
  txId: string;
  sentMinor: string;
  receivedMinor: string;
  feeMinor: string;
  feeCurrency: string;
  rate: string;
  sourceCurrency: string;
  targetCurrency: string;
  timestamp: string;
}

interface ExchangeReceiptProps {
  result: FxReceipt;
  isLive: boolean;
  onExchangeAgain: () => void;
}

export function ExchangeReceipt({ result, isLive, onExchangeAgain }: ExchangeReceiptProps) {
  const router = useRouter();
  const sentLabel = formatMinorAmount(result.sentMinor, result.sourceCurrency);
  const receivedLabel = formatMinorAmount(result.receivedMinor, result.targetCurrency);

  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
        <h1 className="text-screen-title text-text-primary">Exchange Receipt</h1>
      </div>

      <div className="flex flex-col items-center px-4 pt-10 text-center sm:px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-subtle text-success-text">
          <Icon name="check" size={32} />
        </div>
        <h2 className="mt-4 text-screen-title text-text-primary">Exchange complete</h2>
        <p className="mt-1 text-body text-text-secondary">
          Exchanged {sentLabel} for {receivedLabel}
        </p>
      </div>

      <div className="mt-8 px-4 sm:px-6">
        <ConvertSummaryRow label="You sent" value={sentLabel} />
        <ConvertSummaryRow label="You received" value={receivedLabel} />
        <ConvertSummaryRow
          label="Rate applied"
          value={`1 ${result.sourceCurrency} = ${formatRateValue(result.rate)} ${result.targetCurrency}`}
        />
        <ConvertSummaryRow
          label="Fee"
          value={formatMinorAmount(result.feeMinor, result.feeCurrency)}
          negative
        />
        <ConvertSummaryRow label="Reference" value={result.txId} />
        <ConvertSummaryRow
          label="Timestamp"
          value={new Date(result.timestamp).toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          total
        />
      </div>

      <div className="mt-8 flex flex-col gap-2.5 px-4 sm:px-6">
        <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/wallet')}>
          Done
        </Button>
        <Button
          variant="secondary"
          size="md"
          fullWidth
          onClick={onExchangeAgain}
        >
          Exchange again
        </Button>
      </div>
      {!isLive && (
        <p className="mt-8 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6">
          <Icon name="info" size={14} className="shrink-0" />
          Fixture mode — this exchange was simulated for design review. No money moved.
        </p>
      )}
    </div>
  );
}
