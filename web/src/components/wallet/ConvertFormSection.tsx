'use client';

/**
 * ConvertFormSection — Polymarket-grade interactive currency conversion terminal:
 * input field, quick percentage chips (25%, 50%, 75%, Max), direction swap trigger,
 * live quote ticker / countdown, and review action button.
 */

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import {
  formatIze,
  sanitizeAmount,
  type ConvertQuote,
} from './convertViewModel';

interface ConvertFormSectionProps {
  direction: 'ize_to_gbp' | 'gbp_to_ize';
  setDirection: React.Dispatch<React.SetStateAction<'ize_to_gbp' | 'gbp_to_ize'>>;
  amount: string;
  setAmount: (amount: string) => void;
  maxAmount: number;
  pocketExp: number;
  isLive: boolean;
  pocketCurrency: string;
  exceeds: boolean;
  numericAmount: number;
  directionSupported: boolean;
  pocketsQueryError: boolean;
  onRetryPockets: () => void;
  quote: ConvertQuote | null;
  quoteLoading: boolean;
  quoteError: boolean;
  onRetryQuote: () => void;
  quoteRateLabel: string;
  secondsRemaining: number;
  step: 'amount' | 'executing' | 'receipt' | 'error';
  setStep: (step: 'amount' | 'executing' | 'receipt' | 'error') => void;
  errorMessage: string;
  onReview: () => void;
  onSetPercentage: (pct: number) => void;
}

export function ConvertFormSection({
  direction,
  setDirection,
  amount,
  setAmount,
  maxAmount,
  pocketExp,
  isLive,
  pocketCurrency,
  exceeds,
  numericAmount,
  directionSupported,
  pocketsQueryError,
  onRetryPockets,
  quote,
  quoteLoading,
  quoteError,
  onRetryQuote,
  quoteRateLabel,
  secondsRemaining,
  step,
  setStep,
  errorMessage,
  onReview,
  onSetPercentage,
}: ConvertFormSectionProps) {
  return (
    <section aria-label="Convert form" className="mt-8 px-4 sm:px-6">
      {/* From field */}
      <div className="rounded-lg border border-border bg-input p-4">
        <div className="flex items-center justify-between text-meta text-text-muted">
          <span>You convert</span>
          <span className="tnum">
            Max:{' '}
            {maxAmount.toFixed(
              direction === 'ize_to_gbp' ? 6 : isLive ? pocketExp : 2,
            )}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="convert-amount"
            value={amount}
            onChange={(e) => {
              setAmount(sanitizeAmount(e.target.value));
              if (step === 'error') setStep('amount');
            }}
            inputMode="decimal"
            placeholder="0.00"
            aria-label={
              direction === 'ize_to_gbp' ? 'Amount in 1ZE' : `Amount in ${pocketCurrency}`
            }
            className="tnum h-12 min-w-0 flex-1 bg-transparent text-price-hero font-bold text-input-text placeholder:text-text-muted focus:outline-none"
          />
          <span className="shrink-0 text-body-emphasis font-bold text-text-primary">
            {direction === 'ize_to_gbp' ? '1ZE' : pocketCurrency}
          </span>
        </div>

        {/* Quick percentage selectors (25%, 50%, 75%, Max) */}
        <div className="mt-3 flex gap-2 border-t border-border-subtle pt-3">
          {[0.25, 0.5, 0.75, 1.0].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => onSetPercentage(pct)}
              disabled={maxAmount <= 0}
              className="pressable h-8 flex-1 rounded border border-border-subtle bg-surface-alt text-caption font-medium text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors disabled:opacity-40"
            >
              {pct === 1.0 ? 'Max' : `${pct * 100}%`}
            </button>
          ))}
        </div>
      </div>

      {exceeds ? (
        <p className="mt-2 text-caption text-danger-text">Amount exceeds your withdrawable balance.</p>
      ) : null}

      {/* Direction Swap Button */}
      <div className="my-2 flex items-center justify-center">
        <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setDirection((d) => (d === 'ize_to_gbp' ? 'gbp_to_ize' : 'ize_to_gbp'))}
          aria-label="Swap conversion direction"
          className="pressable -my-2 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary hover:text-text-primary hover:border-brand transition-colors"
        >
          <Icon name="sort" size={18} />
        </button>
        <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
      </div>

      {isLive && !directionSupported ? (
        <div className="rounded-lg border border-border-subtle bg-surface-alt p-4">
          <div className="flex items-start gap-2.5">
            <Icon name="info" size={15} className="mt-0.5 shrink-0 text-text-muted" />
            <div>
              <p className="text-body font-medium text-text-primary">
                {pocketsQueryError
                  ? `Couldn't load your ${pocketCurrency} balance`
                  : 'Loading your fiat balance…'}
              </p>
              <p className="mt-1 text-caption text-text-secondary">
                {pocketsQueryError
                  ? `Buying 1ZE debits your ${pocketCurrency} pocket — we can't quote a spend limit without it.`
                  : 'Checking your fiat pocket before quoting.'}
              </p>
              <button
                type="button"
                onClick={() =>
                  pocketsQueryError
                    ? onRetryPockets()
                    : setDirection('ize_to_gbp')
                }
                className="pressable mt-2 text-caption font-semibold text-brand underline underline-offset-2"
              >
                {pocketsQueryError ? 'Try again' : 'Switch back to 1ZE → Fiat'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-input p-4">
          <div className="flex items-center justify-between text-meta text-text-muted">
            <span>You receive (net)</span>
            {isLive ? (
              quoteLoading ? (
                <span className="text-meta text-text-muted">Fetching quote…</span>
              ) : null
            ) : (
              <Badge variant="neutral" className="tnum">
                {secondsRemaining}s
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span
              className={`tnum text-price-hero font-bold ${
                quote ? 'text-text-primary' : 'text-text-muted'
              }`}
            >
              {quote
                ? direction === 'ize_to_gbp'
                  ? formatPrice(quote.net, pocketCurrency)
                  : `${formatIze(quote.net)} 1ZE`
                : '0.00'}
            </span>
            <span className="shrink-0 text-body-emphasis font-bold text-text-primary">
              {direction === 'ize_to_gbp' ? pocketCurrency : '1ZE'}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2.5 text-caption text-text-muted">
            <span>{quoteRateLabel}</span>
            {quote ? <span>Fee: {quote.feeBps} bps</span> : null}
          </div>
        </div>
      )}

      {isLive && quoteError ? (
        <div className="mt-3 flex items-center justify-between rounded-md bg-danger-subtle px-3 py-2 text-caption text-danger-text">
          <span>Couldn’t fetch a quote from the server.</span>
          <button
            type="button"
            onClick={onRetryQuote}
            className="pressable font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      {step === 'error' && errorMessage ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-danger-subtle p-3.5 text-danger-text">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium">Conversion failed</p>
            <p className="mt-0.5 text-caption">{errorMessage}</p>
          </div>
        </div>
      ) : null}

      {directionSupported ? (
        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-6"
          onClick={onReview}
          disabled={!quote || step === 'executing' || (isLive && quoteLoading)}
        >
          {step === 'executing'
            ? 'Converting…'
            : quote
              ? 'Review conversion'
              : isLive && (quoteLoading || numericAmount > 0)
                ? 'Fetching quote…'
                : 'Enter an amount'}
        </Button>
      ) : null}
    </section>
  );
}
