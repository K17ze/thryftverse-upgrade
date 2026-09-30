'use client';

/**
 * ExchangeReviewSheet — review modal sheet before final FX execution.
 * Full wire-derived breakdown of sent minor amount, spread fee,
 * guaranteed exchange rate, and received amount with expiry protection.
 */

import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ConvertSummaryRow } from '../ConvertSummaryRow';
import { FxRateTimestamp } from './FxRateTimestamp';
import { formatMinorAmount } from '@/lib/api/services/fx';
import type { FxQuotePayload } from '@/lib/api/services/fx';
import type { SupportedCurrencyCode } from '@/lib/constants/currencies';

interface ExchangeReviewSheetProps {
  open: boolean;
  onClose: () => void;
  quote: FxQuotePayload | null;
  sourceCurrency: SupportedCurrencyCode;
  targetCurrency: SupportedCurrencyCode;
  rateValueLabel: string;
  rateObservedLabel: string;
  quoteExpiryLabel: string;
  isQuoteExpired: boolean;
  isFetchingQuote: boolean;
  isLive: boolean;
  onRetryQuote: () => void;
  onExecute: () => void;
}

export function ExchangeReviewSheet({
  open,
  onClose,
  quote,
  sourceCurrency,
  targetCurrency,
  rateValueLabel,
  rateObservedLabel,
  quoteExpiryLabel,
  isQuoteExpired,
  isFetchingQuote,
  isLive,
  onRetryQuote,
  onExecute,
}: ExchangeReviewSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Review exchange"
    >
      {quote === null ? (
        <div className="px-5 pb-6">
          <div className="flex items-center gap-2 py-1.5">
            <Icon name="alert" size={14} className="shrink-0 text-danger-text" />
            <span className="text-body text-danger-text">Quote unavailable</span>
            <button
              type="button"
              onClick={onRetryQuote}
              className="pressable text-body font-semibold text-brand hover:text-text-primary"
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 pb-6">
          <div className="mt-2">
            <ConvertSummaryRow
              label="You send"
              value={formatMinorAmount(quote.sourceAmountMinor, quote.sourceCurrency)}
            />
            <ConvertSummaryRow label="Exchange rate" value={rateValueLabel} />
            <ConvertSummaryRow
              label={`Fee (${quote.spreadBps} bps)`}
              value={`−${formatMinorAmount(quote.feeMinor, quote.feeCurrency)}`}
              negative
            />
            <ConvertSummaryRow
              label="You receive"
              value={formatMinorAmount(quote.targetAmountMinor, quote.targetCurrency)}
              total
            />
          </div>
          <FxRateTimestamp
            label={isLive ? 'Reference rate as of' : 'Demo rate as of'}
            observedLabel={rateObservedLabel}
            expiryLabel={quoteExpiryLabel}
            isExpired={isQuoteExpired}
            onRefresh={onRetryQuote}
          />
          <p className="mt-4 flex items-start gap-1.5 text-caption text-text-muted">
            <Icon name="info" size={13} className="mt-px shrink-0" />
            {isLive
              ? `This debits your ${sourceCurrency} pocket and credits the quoted ${targetCurrency} amount at the rate above.`
              : 'Fixture mode — this exchange is simulated for design review. No money moves.'}
          </p>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-5"
            onClick={onExecute}
            disabled={isQuoteExpired || isFetchingQuote}
          >
            {isQuoteExpired ? 'Rate expired — refresh above' : 'Confirm exchange'}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
