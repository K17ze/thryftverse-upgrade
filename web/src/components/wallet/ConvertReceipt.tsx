'use client';

/**
 * ConvertReceipt — the completion receipt view following a successful conversion:
 * breakdown of principal, platform fee, executed rate, new balances, and reference ID.
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { formatPrice } from '@/lib/utils/format';
import { ConvertSummaryRow } from './ConvertSummaryRow';
import {
  formatIze,
  rateTimestampLabel,
  round2,
  type ConversionResult,
} from './convertViewModel';

interface ConvertReceiptProps {
  result: ConversionResult;
  pocketCurrency: string;
  isLive: boolean;
  newIzeBalance: number | null;
  available: number;
  settledIze: number;
  onDone: () => void;
  onConvertAgain: () => void;
}

export function ConvertReceipt({
  result,
  pocketCurrency,
  isLive,
  newIzeBalance,
  available,
  settledIze,
  onDone,
  onConvertAgain,
}: ConvertReceiptProps) {
  const sourceLabel =
    result.direction === 'ize_to_gbp'
      ? `${formatIze(result.sourceAmount)} 1ZE`
      : formatPrice(result.sourceAmount, pocketCurrency);
  const destinationLabel =
    result.direction === 'ize_to_gbp'
      ? formatPrice(result.net, pocketCurrency)
      : `${formatIze(result.net)} 1ZE`;

  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={onDone} />
        <h1 className="text-screen-title text-text-primary">Conversion Receipt</h1>
      </div>

      <div className="flex flex-col items-center px-4 pt-10 text-center sm:px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-subtle text-success-text">
          <Icon name="check" size={32} />
        </div>
        <h2 className="mt-4 text-screen-title text-text-primary">
          Conversion complete
        </h2>
        <p className="mt-1 text-body text-text-secondary">
          Exchanged {sourceLabel} for {destinationLabel}
        </p>
      </div>

      <div className="mt-8 px-4 sm:px-6">
        <ConvertSummaryRow label="You converted" value={sourceLabel} />
        <ConvertSummaryRow
          label={`Platform fee (${result.feeBps} bps)`}
          value={`−${formatPrice(result.fee, pocketCurrency)}`}
          negative
        />
        <ConvertSummaryRow label="You received" value={destinationLabel} total />
        {isLive ? (
          <>
            <ConvertSummaryRow
              label="Rate applied"
              value={`1 1ZE = ${formatPrice(result.rate, pocketCurrency)}`}
            />
            {newIzeBalance != null ? (
              <ConvertSummaryRow
                label="New 1ZE balance"
                value={`${formatIze(newIzeBalance)} 1ZE`}
              />
            ) : null}
          </>
        ) : (
          <>
            <ConvertSummaryRow
              label="New GBP balance"
              value={formatPrice(round2(available), 'GBP')}
            />
            <ConvertSummaryRow
              label="New 1ZE balance"
              value={`${formatIze(settledIze)} 1ZE`}
            />
          </>
        )}
        {result.id ? (
          <ConvertSummaryRow label="Reference" value={result.id.toUpperCase()} />
        ) : null}
        <ConvertSummaryRow label="Timestamp" value={rateTimestampLabel(result.timestamp)} />
      </div>

      <div className="mt-8 flex flex-col gap-2.5 px-4 sm:px-6">
        <Button variant="primary" size="lg" fullWidth onClick={onDone}>
          Done
        </Button>
        <Button
          variant="secondary"
          size="md"
          fullWidth
          onClick={onConvertAgain}
        >
          Convert again
        </Button>
      </div>
    </div>
  );
}
