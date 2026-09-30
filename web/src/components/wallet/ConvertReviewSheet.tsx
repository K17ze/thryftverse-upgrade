'use client';

/**
 * ConvertReviewSheet — slide-up confirmation sheet for the conversion:
 * principal amount, exchange rate, platform fee, guaranteed net receive,
 * MiCA/FCA regulatory notice, and confirm action.
 */

import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { ConvertSummaryRow } from './ConvertSummaryRow';
import {
  formatIze,
  rateTimestampLabel,
  RATE_AS_OF,
  type ConvertQuote,
} from './convertViewModel';

interface ConvertReviewSheetProps {
  open: boolean;
  onClose: () => void;
  quote: ConvertQuote | null;
  direction: 'ize_to_gbp' | 'gbp_to_ize';
  numericAmount: number;
  pocketCurrency: string;
  quoteRateLabel: string;
  isLive: boolean;
  step: 'amount' | 'executing' | 'receipt' | 'error';
  onExecute: () => void;
}

export function ConvertReviewSheet({
  open,
  onClose,
  quote,
  direction,
  numericAmount,
  pocketCurrency,
  quoteRateLabel,
  isLive,
  step,
  onExecute,
}: ConvertReviewSheetProps) {
  if (!quote) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Confirm Conversion"
    >
      <div className="px-5 pb-6">
        <div className="mt-2">
          <ConvertSummaryRow
            label="You convert"
            value={
              direction === 'ize_to_gbp'
                ? `${formatIze(numericAmount)} 1ZE`
                : formatPrice(numericAmount, pocketCurrency)
            }
          />
          <ConvertSummaryRow label="Exchange rate" value={quoteRateLabel} />
          <ConvertSummaryRow
            label={`Platform fee (${quote.feeBps} bps)`}
            value={`−${formatPrice(quote.fee, pocketCurrency)}`}
            negative
          />
          <ConvertSummaryRow
            label={
              isLive
                ? direction === 'gbp_to_ize'
                  ? 'Est. you receive'
                  : 'Net you receive'
                : 'Guaranteed net receive'
            }
            value={
              direction === 'ize_to_gbp'
                ? formatPrice(quote.net, pocketCurrency)
                : `${formatIze(quote.net)} 1ZE`
            }
            total
          />
          {isLive ? null : (
            <ConvertSummaryRow
              label="Quote reference time"
              value={rateTimestampLabel(RATE_AS_OF)}
            />
          )}
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-caption text-text-muted">
          <Icon name="info" size={13} className="mt-px shrink-0" />
          {isLive
            ? direction === 'gbp_to_ize'
              ? `This debits your ${pocketCurrency} balance and mints 1ZE. Fee and rate are estimates — the receipt shows the executed breakdown.`
              : `This debits your 1ZE balance and credits the quoted ${pocketCurrency} amount to your fiat wallet. The fee above is the fee execution charges.`
            : 'Fixture mode — this conversion is simulated for design review. No money moves.'}
        </p>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-5"
          onClick={onExecute}
          disabled={step === 'executing'}
        >
          {step === 'executing' ? 'Converting…' : 'Confirm & Execute'}
        </Button>
      </div>
    </Sheet>
  );
}
