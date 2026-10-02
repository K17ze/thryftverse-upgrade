'use client';

/**
 * ExchangeFormSection — the core currency selection, pair swap,
 * amount input with percentage shortcuts, and debounced rate quote preview.
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { ConvertSummaryRow } from '../ConvertSummaryRow';
import { FxRateTimestamp } from './FxRateTimestamp';
import {
  formatMinorAmount,
  currencyMinorExponent,
  minorUnitsToMajor,
} from '@/lib/api/services/fx';
import type { FxQuotePayload } from '@/lib/api/services/fx';
import {
  SUPPORTED_CURRENCY_CODES,
  type SupportedCurrencyCode,
} from '@/lib/constants/currencies';

/** Currency chip row — real buttons, funded pockets first for source */
function CurrencyChipRow({
  selected,
  codes,
  onSelect,
  ariaLabel,
}: {
  selected: SupportedCurrencyCode;
  codes: SupportedCurrencyCode[];
  onSelect: (code: SupportedCurrencyCode) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="mt-2 flex flex-wrap gap-2">
      {codes.map((code) => {
        const isSelected = code === selected;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onSelect(code)}
            aria-pressed={isSelected}
            aria-label={`Select ${code}`}
            className={`pressable h-9 min-w-[52px] rounded-md border px-3 text-caption font-semibold tracking-wide transition-colors ${
              isSelected
                ? 'border-text-primary bg-text-primary text-surface'
                : 'border-border bg-transparent text-text-primary hover:border-text-muted'
            }`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}

interface ExchangeFormSectionProps {
  sourceCurrency: SupportedCurrencyCode;
  targetCurrency: SupportedCurrencyCode;
  sourceCodes: SupportedCurrencyCode[];
  sourceBalanceMinor: number;
  amount: string;
  amountMajor: number;
  amountMinorStr: string;
  exceedsBalance: boolean;
  isFetchingQuote: boolean;
  quoteError: boolean;
  quote: FxQuotePayload | null;
  rateValueLabel: string;
  rateObservedLabel: string;
  quoteExpiryLabel: string;
  isQuoteExpired: boolean;
  canReview: boolean;
  step: 'compose' | 'review' | 'executing' | 'receipt' | 'error';
  errorMessage: string;
  isLive: boolean;
  onSelectSource: (code: SupportedCurrencyCode) => void;
  onSelectTarget: (code: SupportedCurrencyCode) => void;
  onSwap: () => void;
  onChangeAmount: (value: string) => void;
  onRetryQuote: () => void;
  onReview: () => void;
  onSetStep: (step: 'compose' | 'review') => void;
}

export function ExchangeFormSection({
  sourceCurrency,
  targetCurrency,
  sourceCodes,
  sourceBalanceMinor,
  amount,
  amountMajor,
  amountMinorStr,
  exceedsBalance,
  isFetchingQuote,
  quoteError,
  quote,
  rateValueLabel,
  rateObservedLabel,
  quoteExpiryLabel,
  isQuoteExpired,
  canReview,
  step,
  errorMessage,
  isLive,
  onSelectSource,
  onSelectTarget,
  onSwap,
  onChangeAmount,
  onRetryQuote,
  onReview,
  onSetStep,
}: ExchangeFormSectionProps) {
  const handleQuickPercent = (fraction: number) => {
    if (sourceBalanceMinor <= 0) return;
    const maxMajor = minorUnitsToMajor(sourceBalanceMinor, sourceCurrency);
    const exponent = currencyMinorExponent(sourceCurrency);
    const targetMajor = fraction === 1 ? maxMajor : maxMajor * fraction;
    const formatted = exponent === 0
      ? String(Math.floor(targetMajor))
      : targetMajor.toFixed(exponent).replace(/\.?0+$/, '');
    onChangeAmount(formatted);
  };

  return (
    <section aria-label="Exchange form" className="mt-6 px-4 sm:px-6">
      {/* You send — funded pockets first */}
      <div className="flex items-center justify-between">
        <p className="text-meta uppercase tracking-[0.08em] text-text-muted">You send</p>
        <span className="tnum text-meta text-text-muted">
          Available: {formatMinorAmount(sourceBalanceMinor, sourceCurrency)}
        </span>
      </div>
      <CurrencyChipRow
        selected={sourceCurrency}
        codes={sourceCodes}
        onSelect={onSelectSource}
        ariaLabel="Source currency"
      />

      {/* Amount input — major units, currency-aware decimal entry */}
      <div className="mt-4 rounded-lg border border-border bg-input p-4">
        <div className="flex items-center justify-between text-meta text-text-muted">
          <span>Amount</span>
          {/* Quick percentage shortcuts */}
          <div className="flex items-center gap-1.5">
            {[0.25, 0.5, 0.75, 1].map((frac) => (
              <button
                key={frac}
                type="button"
                onClick={() => handleQuickPercent(frac)}
                disabled={sourceBalanceMinor <= 0}
                className="pressable rounded border border-border-subtle bg-surface-alt px-1.5 py-0.5 text-meta font-semibold text-text-secondary hover:border-border hover:text-text-primary disabled:opacity-40"
              >
                {frac === 1 ? 'Max' : `${frac * 100}%`}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="exchange-amount"
            value={amount}
            onChange={(e) => onChangeAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            aria-label={`Amount in ${sourceCurrency}`}
            className="tnum h-12 min-w-0 flex-1 bg-transparent text-price-hero font-bold text-input-text placeholder:text-text-muted focus:outline-none"
          />
          <span className="shrink-0 text-body-emphasis font-bold text-text-primary">
            {sourceCurrency}
          </span>
        </div>
      </div>
      {exceedsBalance ? (
        <p className="mt-2 text-caption text-danger-text">
          Amount exceeds your {sourceCurrency} balance.
        </p>
      ) : null}

      {/* Swap direction */}
      <div className="my-4 flex items-center justify-center">
        <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
        <button
          type="button"
          onClick={onSwap}
          aria-label="Swap currencies"
          className="pressable -my-2 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary transition-colors hover:border-brand hover:text-text-primary"
        >
          <Icon name="sort" size={18} />
        </button>
        <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
      </div>

      {/* You receive — all supported codes */}
      <p className="text-meta uppercase tracking-[0.08em] text-text-muted">You receive</p>
      <CurrencyChipRow
        selected={targetCurrency}
        codes={SUPPORTED_CURRENCY_CODES}
        onSelect={onSelectTarget}
        ariaLabel="Target currency"
      />

      {/* Live preview — debounced backend quote, full disclosure */}
      {amountMajor > 0 && !exceedsBalance && sourceCurrency !== targetCurrency ? (
        <div className="mt-5">
          <div className="rounded-lg border border-border-subtle bg-surface-alt p-4">
            {isFetchingQuote ? (
              <div className="flex items-center gap-2 py-1.5">
                <Spinner size={16} tone="neutral" />
                <span className="text-body text-text-muted">
                  {isLive ? 'Fetching live quote…' : 'Fetching demo quote…'}
                </span>
              </div>
            ) : quoteError ? (
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
            ) : quote ? (
              <>
                <ConvertSummaryRow
                  label="You send"
                  value={formatMinorAmount(amountMinorStr, sourceCurrency)}
                />
                <ConvertSummaryRow
                  label={`Fee (${quote.spreadBps} bps)`}
                  value={`−${formatMinorAmount(quote.feeMinor, quote.feeCurrency)}`}
                  negative
                />
                <ConvertSummaryRow label="Rate" value={rateValueLabel} />
                <ConvertSummaryRow
                  label="You receive"
                  value={formatMinorAmount(quote.targetAmountMinor, targetCurrency)}
                  total
                />
              </>
            ) : null}
          </div>
          {quote ? (
            <FxRateTimestamp
              label={isLive ? 'Rate as of' : 'Demo rate as of'}
              observedLabel={rateObservedLabel}
              expiryLabel={quoteExpiryLabel}
              isExpired={isQuoteExpired}
              onRefresh={onRetryQuote}
            />
          ) : null}
        </div>
      ) : null}

      {step === 'error' ? (
        <div
          role="alert"
          className="mt-4 rounded-md border border-danger-border bg-danger-subtle px-4 py-3"
        >
          <p className="text-caption text-danger-text">{errorMessage}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => onSetStep('review')}>
              Try again
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onSetStep('compose')}>
              Edit amount
            </Button>
          </div>
        </div>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        className="mt-6"
        onClick={onReview}
        disabled={!canReview}
      >
        {isFetchingQuote
          ? 'Fetching quote…'
          : isQuoteExpired && quote
            ? 'Refreshing rate…'
            : quote
              ? 'Review exchange'
              : amountMajor > 0
                ? 'Enter a valid amount'
                : 'Enter an amount'}
      </Button>
    </section>
  );
}
