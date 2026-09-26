'use client';

/**
 * Convert surface — 1ZE ↔ GBP over the fixture wallet. Mirrors the mobile
 * ConvertAmountStep → review → executing → receipt state machine, collapsed
 * to amount → executing → receipt (no biometric gate in fixture mode).
 * The pocket breakdown mirrors WalletSubBalanceSection: flat hairline rows,
 * withdrawable emphasised. Session state lives in the ['wallet'] query
 * cache, so /wallet reflects a conversion immediately.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { formatPrice } from '@/lib/utils/format';
import type { WalletLedgerEntry } from './ledgerViewModel';
import { useWalletData, type WalletData } from './useWalletData';
import { ConvertSummaryRow } from './ConvertSummaryRow';
import {
  buildQuote,
  executeQuote,
  formatIze,
  rateLabel,
  rateTimestampLabel,
  round2,
  sanitizeAmount,
  withdrawableOf,
  GBP_RESERVED,
  RATE_AS_OF,
  type ConversionResult,
} from './convertViewModel';

function ConvertSkeleton() {
  return (
    <div aria-busy aria-label="Loading convert">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="px-4 pt-8 sm:px-6">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-3 h-12 w-52" />
        <div className="mt-6 flex flex-col gap-3">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="mt-8 px-4 sm:px-6">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="mt-6 h-24 w-full rounded-lg" />
        <Skeleton className="mt-6 h-[52px] w-full rounded-md" />
      </div>
    </div>
  );
}

/** Flat sub-balance row — muted label left, tabular value right. */
function PocketRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className={`text-body ${emphasize ? 'text-text-secondary' : 'text-text-muted'}`}>
        {label}
      </span>
      <span
        className={`tnum ${
          emphasize
            ? 'text-body-emphasis font-semibold text-text-primary'
            : 'text-body text-text-secondary'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function ConvertView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { data, isLoading, isError, refetch } = useWalletData();

  const [direction, setDirection] = useState<'ize_to_gbp' | 'gbp_to_ize'>('ize_to_gbp');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'amount' | 'executing' | 'receipt'>('amount');
  const [result, setResult] = useState<ConversionResult | null>(null);

  const numericAmount = Number(amount) || 0;
  const maxAmount = data
    ? direction === 'ize_to_gbp'
      ? withdrawableOf(data.ize.settled, data.ize.reserved)
      : withdrawableOf(data.available, GBP_RESERVED)
    : 0;
  const exceeds = numericAmount > maxAmount;

  const quote = useMemo(
    () => (exceeds ? null : buildQuote(direction, numericAmount)),
    [direction, numericAmount, exceeds],
  );

  const applyConversion = (r: ConversionResult) => {
    queryClient.setQueryData<WalletData>(['wallet'], (old) => {
      if (!old) return old;
      const entry: WalletLedgerEntry = {
        id: r.id,
        kind: 'conversion',
        amount: r.gbpDelta,
        status: 'completed',
        date: r.timestamp,
        description:
          r.direction === 'ize_to_gbp'
            ? `Conversion — ${formatIze(r.sourceAmount)} 1ZE to GBP`
            : `Conversion — ${formatPrice(r.sourceAmount, 'GBP')} to 1ZE`,
        balance: null,
      };
      return {
        ...old,
        available: round2(old.available + r.gbpDelta),
        ize: { ...old.ize, settled: round2(old.ize.settled + r.izeDelta) },
        session: [entry, ...old.session],
      };
    });
  };

  const execute = () => {
    if (!quote) return;
    setStep('executing');
    window.setTimeout(() => {
      const executed = executeQuote(quote);
      applyConversion(executed);
      setResult(executed);
      setStep('receipt');
      show(
        executed.direction === 'ize_to_gbp'
          ? `Converted ${formatIze(executed.sourceAmount)} 1ZE to ${formatPrice(executed.net, 'GBP')}`
          : `Converted ${formatPrice(executed.sourceAmount, 'GBP')} to ${formatIze(executed.net)} 1ZE`,
        'success',
      );
    }, 900);
  };

  if (isLoading) return <ConvertSkeleton />;

  if (isError || !data) {
    return (
      <EmptyState
        icon="wallet"
        title="Wallet unavailable"
        subtitle="We couldn't load your balance. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void refetch()}
      />
    );
  }

  // ── Receipt ───────────────────────────────────────────────────────────
  if (step === 'receipt' && result) {
    const sourceLabel =
      result.direction === 'ize_to_gbp'
        ? `${formatIze(result.sourceAmount)} 1ZE`
        : formatPrice(result.sourceAmount, 'GBP');
    const destinationLabel =
      result.direction === 'ize_to_gbp'
        ? formatPrice(result.net, 'GBP')
        : `${formatIze(result.net)} 1ZE`;
    return (
      <div className="mx-auto w-full max-w-xl pb-16">
        <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
          <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
          <h1 className="text-screen-title font-semibold text-text-primary">Convert</h1>
        </div>

        <div className="flex flex-col items-center px-4 pt-10 text-center sm:px-6">
          <Icon name="check" filled size={56} className="text-success-text" />
          <h2 className="mt-4 text-screen-title font-semibold text-text-primary">
            Conversion complete
          </h2>
          <p className="mt-1 text-body text-text-secondary">
            Converted {sourceLabel} to {destinationLabel}
          </p>
        </div>

        <div className="mt-8 px-4 sm:px-6">
          <ConvertSummaryRow label="You converted" value={sourceLabel} />
          <ConvertSummaryRow
            label={`Platform fee (${result.feeBps} bps)`}
            value={`−${formatPrice(result.fee, 'GBP')}`}
            negative
          />
          <ConvertSummaryRow label="You received" value={destinationLabel} total />
          <ConvertSummaryRow
            label="New GBP balance"
            value={formatPrice(round2(data.available), 'GBP')}
          />
          <ConvertSummaryRow label="New 1ZE balance" value={formatIze(data.ize.settled)} />
          <ConvertSummaryRow label="Reference" value={result.id.toUpperCase()} />
          <ConvertSummaryRow label="Timestamp" value={rateTimestampLabel(result.timestamp)} />
        </div>

        <div className="mt-8 flex flex-col gap-2 px-4 sm:px-6">
          <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/wallet')}>
            Done
          </Button>
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => {
              setResult(null);
              setAmount('');
              setStep('amount');
            }}
          >
            Convert again
          </Button>
        </div>
      </div>
    );
  }

  // ── Amount step ───────────────────────────────────────────────────────
  const settledLabel =
    direction === 'ize_to_gbp'
      ? `${formatIze(data.ize.settled)} 1ZE`
      : formatPrice(data.available, data.currency);

  return (
    <div className="mx-auto w-full max-w-xl pb-16">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
        <h1 className="text-screen-title font-semibold text-text-primary">Convert</h1>
      </div>

      {/* From-pocket hero + breakdown — flat canvas, hairline rows */}
      <section aria-label="Available balance" className="px-4 pt-6 sm:px-6">
        <p className="text-label font-semibold uppercase tracking-wider text-text-muted">
          Available balance
        </p>
        <p className="tnum mt-2 text-display-large font-bold tracking-tight text-text-primary">
          {settledLabel}
        </p>

        <div className="mt-5 border-t border-border-subtle">
          {direction === 'ize_to_gbp' ? (
            <>
              {data.ize.pending > 0 ? (
                <PocketRow
                  label="Pending — unsettled Co-Own proceeds"
                  value={`${formatIze(data.ize.pending)} 1ZE`}
                />
              ) : null}
              {data.ize.reserved > 0 ? (
                <PocketRow label="Reserved for open orders" value={`${formatIze(data.ize.reserved)} 1ZE`} />
              ) : null}
              <PocketRow
                label="Withdrawable"
                value={`${formatIze(withdrawableOf(data.ize.settled, data.ize.reserved))} 1ZE`}
                emphasize
              />
            </>
          ) : (
            <>
              {data.pending > 0 ? (
                <PocketRow
                  label="Pending — clears on delivery"
                  value={formatPrice(data.pending, data.currency)}
                />
              ) : null}
              <PocketRow label="Reserved for open orders" value={formatPrice(GBP_RESERVED, 'GBP')} />
              <PocketRow
                label="Withdrawable"
                value={formatPrice(withdrawableOf(data.available, GBP_RESERVED), data.currency)}
                emphasize
              />
            </>
          )}
        </div>
      </section>

      {/* Form */}
      <section aria-label="Convert form" className="mt-8 px-4 sm:px-6">
        <div className="flex gap-2" role="radiogroup" aria-label="Conversion direction">
          <Chip
            selected={direction === 'ize_to_gbp'}
            onClick={() => setDirection('ize_to_gbp')}
            aria-label="Convert 1ZE to GBP"
          >
            1ZE → GBP
          </Chip>
          <Chip
            selected={direction === 'gbp_to_ize'}
            onClick={() => setDirection('gbp_to_ize')}
            aria-label="Convert GBP to 1ZE"
          >
            GBP → 1ZE
          </Chip>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-input px-4">
          <input
            value={amount}
            onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
            inputMode="decimal"
            placeholder="0.00"
            aria-label={direction === 'ize_to_gbp' ? 'Amount in 1ZE' : 'Amount in GBP'}
            className="tnum h-16 min-w-0 flex-1 bg-transparent text-price-hero font-bold text-input-text placeholder:text-text-muted focus:outline-none"
          />
          <span className="shrink-0 text-body-emphasis font-semibold text-text-muted">
            {direction === 'ize_to_gbp' ? '1ZE' : data.currency}
          </span>
          <Button
            variant="quiet"
            size="sm"
            onClick={() => setAmount(maxAmount.toFixed(2))}
            disabled={maxAmount <= 0}
          >
            Max
          </Button>
        </div>
        {exceeds ? (
          <p className="mt-2 text-caption text-danger-text">Amount exceeds your withdrawable balance.</p>
        ) : null}

        <p className="mt-3 flex items-center gap-1.5 text-caption text-text-muted">
          <Icon name="info" size={14} className="shrink-0" />
          <span className="tnum">{rateLabel(direction)}</span>
          <span aria-hidden>·</span>
          <span>1% fee</span>
          <span aria-hidden>·</span>
          <span>rate as of {rateTimestampLabel(RATE_AS_OF)}</span>
        </p>

        {quote ? (
          <div className="mt-5 border-t border-border-subtle pt-3">
            <ConvertSummaryRow
              label="You convert"
              value={
                direction === 'ize_to_gbp'
                  ? `${formatIze(numericAmount)} 1ZE`
                  : formatPrice(numericAmount, data.currency)
              }
            />
            <ConvertSummaryRow
              label={`Platform fee (${quote.feeBps} bps)`}
              value={`−${formatPrice(quote.fee, data.currency)}`}
              negative
            />
            <ConvertSummaryRow
              label="You receive"
              value={
                direction === 'ize_to_gbp'
                  ? formatPrice(quote.net, data.currency)
                  : `${formatIze(quote.net)} 1ZE`
              }
              total
            />
          </div>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-6"
          onClick={execute}
          disabled={!quote || step === 'executing'}
        >
          {step === 'executing'
            ? 'Converting…'
            : quote
              ? direction === 'ize_to_gbp'
                ? `Convert ${formatIze(numericAmount)} 1ZE`
                : `Convert ${formatPrice(numericAmount, data.currency)}`
              : 'Enter an amount'}
        </Button>
      </section>

      <p className="mt-10 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6">
        <Icon name="info" size={14} className="shrink-0" />
        Fixture mode — conversions are simulated for design review. No money moves.
      </p>
    </div>
  );
}
