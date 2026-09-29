'use client';

/**
 * SendComposer — the presentational composer for the Send money surface:
 * funded-pocket chips, the currency-aware amount field, the live FX quote
 * preview (cross-currency only), the error block, the Review CTA and the
 * review Sheet that discloses the full wire payload before POST /transfers.
 *
 * All state lives in SendMoneyView — this file only renders and reports.
 * Money figures arrive pre-formatted or as wire minor-unit strings via
 * formatMinorAmount; nothing is computed here.
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import {
  formatMinorAmount,
  formatRateValue,
  type BeneficiaryPayload,
  type FxQuotePayload,
} from '@/lib/api/services/fx';
import { ConvertSummaryRow } from '../ConvertSummaryRow';
import {
  formatTimestamp,
  maskedAccountTail,
  sanitizeAmountInput,
} from './sendModel';

export interface SendComposerProps {
  beneficiary: BeneficiaryPayload | null;
  sourceCurrency: string | null;
  onSelectSource: (code: string) => void;
  /** Funded pocket codes only — you can't send from an empty pocket. */
  fundedCodes: string[];
  pocketsLoading: boolean;
  amount: string;
  onAmountChange: (value: string) => void;
  amountMinorStr: string;
  amountMajor: number;
  sourceBalanceMinor: number;
  exceedsBalance: boolean;
  sameCurrency: boolean;
  needsQuote: boolean;
  quote: FxQuotePayload | null;
  isFetchingQuote: boolean;
  quoteError: boolean;
  isQuoteExpired: boolean;
  quoteExpiryLabel: string;
  onRetryQuote: () => void;
  canReview: boolean;
  reviewOpen: boolean;
  onReview: () => void;
  onDismissReview: () => void;
  onConfirm: () => void;
  showError: boolean;
  errorMessage: string;
  onRetrySend: () => void;
  onEditTransfer: () => void;
}

/** Quote expiry + observed-at row — identical honesty grammar to
 *  ExchangeView's FxRateTimestamp. */
function QuoteTimestamp({
  observedAt,
  expiryLabel,
  isExpired,
  onRefresh,
}: {
  observedAt: string;
  expiryLabel: string;
  isExpired: boolean;
  onRefresh: () => void;
}) {
  const observedLabel = formatTimestamp(observedAt);
  if (!observedLabel) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-meta text-text-muted">
      <Icon name="clock" size={12} className="shrink-0" />
      <span>Rate as of {observedLabel}</span>
      {isExpired ? (
        <>
          <span className="text-danger-text">· Expired</span>
          <button
            type="button"
            onClick={onRefresh}
            className="pressable font-semibold text-brand hover:text-text-primary"
          >
            Refresh
          </button>
        </>
      ) : expiryLabel ? (
        <span>· Valid for {expiryLabel}</span>
      ) : null}
    </p>
  );
}

export function SendComposer(props: SendComposerProps) {
  const {
    beneficiary,
    sourceCurrency,
    onSelectSource,
    fundedCodes,
    pocketsLoading,
    amount,
    onAmountChange,
    amountMinorStr,
    amountMajor,
    sourceBalanceMinor,
    exceedsBalance,
    sameCurrency,
    needsQuote,
    quote,
    isFetchingQuote,
    quoteError,
    isQuoteExpired,
    quoteExpiryLabel,
    onRetryQuote,
    canReview,
    reviewOpen,
    onReview,
    onDismissReview,
    onConfirm,
    showError,
    errorMessage,
    onRetrySend,
    onEditTransfer,
  } = props;

  const targetCurrency = beneficiary?.currency ?? null;
  const rateLabel =
    quote && sourceCurrency && targetCurrency
      ? `1 ${sourceCurrency} = ${formatRateValue(quote.customerRate)} ${targetCurrency}`
      : '';

  return (
    <>
      <section aria-label="Amount" className="mt-8 px-4 sm:px-6">
        <p className="text-meta uppercase tracking-[0.08em] text-text-muted">You send</p>
        {fundedCodes.length > 0 ? (
          <div role="group" aria-label="Source pocket" className="mt-2 flex flex-wrap gap-2">
            {fundedCodes.map((code) => {
              const isSelected = code === sourceCurrency;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => onSelectSource(code)}
                  aria-pressed={isSelected}
                  aria-label={`Send from ${code} pocket`}
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
        ) : (
          <p className="mt-2 text-body text-text-muted">
            {pocketsLoading
              ? 'Loading your pockets…'
              : 'No funded pockets yet — add money or exchange currency first.'}
          </p>
        )}

        <div className="mt-4 rounded-lg border border-border bg-input p-4">
          <div className="flex items-center justify-between text-meta text-text-muted">
            <span>Amount</span>
            <span className="tnum">
              Available:{' '}
              {sourceCurrency ? formatMinorAmount(sourceBalanceMinor, sourceCurrency) : '—'}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              value={amount}
              onChange={(e) =>
                onAmountChange(sanitizeAmountInput(e.target.value, sourceCurrency ?? 'GBP'))
              }
              inputMode="decimal"
              placeholder="0"
              aria-label={`Amount in ${sourceCurrency ?? 'source currency'}`}
              className="tnum h-12 min-w-0 flex-1 bg-transparent text-price-hero font-bold text-input-text placeholder:text-text-muted focus:outline-none"
            />
            <span className="shrink-0 text-body-emphasis font-bold text-text-primary">
              {sourceCurrency ?? ''}
            </span>
          </div>
        </div>
        {exceedsBalance && sourceCurrency ? (
          <p className="mt-2 text-caption text-danger-text">
            Amount exceeds your {sourceCurrency} balance.
          </p>
        ) : null}

        {/* Conversion preview — cross-currency only, straight off the wire */}
        {needsQuote && amountMajor > 0 && !exceedsBalance ? (
          <div className="mt-5">
            <div className="rounded-lg border border-border-subtle bg-surface-alt p-4">
              {isFetchingQuote ? (
                <div className="flex items-center gap-2 py-1.5">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-text-primary" />
                  <span className="text-body text-text-muted">Fetching live quote…</span>
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
                    value={formatMinorAmount(quote.sourceAmountMinor, quote.sourceCurrency)}
                  />
                  <ConvertSummaryRow
                    label={`Fee (${quote.spreadBps} bps)`}
                    value={`−${formatMinorAmount(quote.feeMinor, quote.feeCurrency)}`}
                    negative
                  />
                  <ConvertSummaryRow label="Rate" value={rateLabel} />
                  <ConvertSummaryRow
                    label="Recipient gets"
                    value={formatMinorAmount(quote.targetAmountMinor, quote.targetCurrency)}
                    total
                  />
                </>
              ) : null}
            </div>
            {quote ? (
              <QuoteTimestamp
                observedAt={quote.rateObservedAt}
                expiryLabel={quoteExpiryLabel}
                isExpired={isQuoteExpired}
                onRefresh={onRetryQuote}
              />
            ) : null}
          </div>
        ) : null}

        {sameCurrency && amountMajor > 0 && !exceedsBalance && beneficiary ? (
          <p className="mt-4 flex items-start gap-1.5 text-caption text-text-muted">
            <Icon name="info" size={13} className="mt-px shrink-0" />
            {beneficiary.displayName} receives{' '}
            {formatMinorAmount(amountMinorStr, targetCurrency as string)} — no conversion needed.
          </p>
        ) : null}

        {showError ? (
          <div
            role="alert"
            className="mt-4 rounded-md border border-danger-border bg-danger-subtle px-4 py-3"
          >
            <p className="text-caption text-danger-text">{errorMessage}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" onClick={onRetrySend}>
                Try again
              </Button>
              <Button variant="secondary" size="sm" onClick={onEditTransfer}>
                Edit transfer
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
          {needsQuote && isFetchingQuote
            ? 'Fetching quote…'
            : beneficiary === null
              ? 'Choose a recipient'
              : amountMajor <= 0
                ? 'Enter an amount'
                : 'Review transfer'}
        </Button>
      </section>

      {/* Review sheet — the full wire disclosure before the money write */}
      <Sheet open={reviewOpen} onClose={onDismissReview} title="Review transfer">
        <div className="px-5 pb-6">
          {beneficiary ? (
            <div className="mt-2">
              <ConvertSummaryRow
                label="To"
                value={`${beneficiary.displayName}${
                  maskedAccountTail(beneficiary) ? ` ${maskedAccountTail(beneficiary)}` : ''
                }`}
              />
              <ConvertSummaryRow
                label="You send"
                value={sourceCurrency ? formatMinorAmount(amountMinorStr, sourceCurrency) : '—'}
              />
              {quote && !sameCurrency ? (
                <>
                  <ConvertSummaryRow label="Exchange rate" value={rateLabel} />
                  <ConvertSummaryRow
                    label={`Fee (${quote.spreadBps} bps)`}
                    value={`−${formatMinorAmount(quote.feeMinor, quote.feeCurrency)}`}
                    negative
                  />
                </>
              ) : null}
              <ConvertSummaryRow
                label="Recipient gets"
                value={
                  sameCurrency
                    ? formatMinorAmount(amountMinorStr, targetCurrency as string)
                    : quote
                      ? formatMinorAmount(quote.targetAmountMinor, quote.targetCurrency)
                      : '—'
                }
                total
              />
            </div>
          ) : null}
          {quote && !sameCurrency ? (
            <QuoteTimestamp
              observedAt={quote.rateObservedAt}
              expiryLabel={quoteExpiryLabel}
              isExpired={isQuoteExpired}
              onRefresh={onRetryQuote}
            />
          ) : null}
          <p className="mt-4 flex items-start gap-1.5 text-caption text-text-muted">
            <Icon name="info" size={13} className="mt-px shrink-0" />
            This debits your {sourceCurrency} pocket now. The transfer is funded immediately and
            stays Processing until the payout completes.
          </p>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-5"
            onClick={onConfirm}
            disabled={(!sameCurrency && isQuoteExpired) || isFetchingQuote}
          >
            {!sameCurrency && isQuoteExpired ? 'Rate expired — refresh first' : 'Confirm send'}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
