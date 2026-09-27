'use client';

/**
 * Convert surface — 1ZE ↔ GBP over the fixture wallet. Mirrors the mobile
 * WalletExchange flow: amount → review sheet → executing → receipt (no
 * biometric gate in fixture mode). Direction is a swap control between the
 * from and receive fields; the sheet carries the full quote disclosure.
 * The pocket breakdown mirrors WalletSubBalanceSection: flat hairline rows,
 * withdrawable emphasised. Session state lives in the walletKeys.all(userId)
 * cache, so /wallet reflects a conversion immediately.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { formatPrice } from '@/lib/utils/format';
import type { WalletLedgerEntry } from './ledgerViewModel';
import { useWalletData, type WalletData } from './useWalletData';
import { walletKeys } from './walletKeys';
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
  const { user, isGuest, sessionLoading } = useSession();

  const [direction, setDirection] = useState<'ize_to_gbp' | 'gbp_to_ize'>('ize_to_gbp');
  const [amount, setAmount] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [step, setStep] = useState<'amount' | 'executing' | 'receipt'>('amount');
  const [result, setResult] = useState<ConversionResult | null>(null);

  const numericAmount = Number(amount) || 0;
  // GBP has no hold mechanism — open orders reserve 1ZE, never fiat —
  // so the fiat withdrawable is the settled balance itself.
  const maxAmount = data
    ? direction === 'ize_to_gbp'
      ? data.ize
        ? withdrawableOf(data.ize.settled, data.ize.reserved)
        : 0
      : round2(data.available)
    : 0;
  const exceeds = numericAmount > maxAmount;

  const quote = useMemo(
    () => (exceeds ? null : buildQuote(direction, numericAmount)),
    [direction, numericAmount, exceeds],
  );

  const applyConversion = (r: ConversionResult) => {
    queryClient.setQueryData<WalletData>(walletKeys.all(user?.id), (old) => {
      if (!old?.ize) return old;
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
    setReviewing(false);
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

  if (sessionLoading || isLoading) return <ConvertSkeleton />;

  // Conversions are account-bound — guests sign in rather than play with
  // the demo identity's balances.
  if (isGuest) {
    return (
      <EmptyState
        icon="wallet"
        title="Sign in to convert"
        subtitle="Conversions move between your own GBP and 1ZE balances."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  // No quote/convert endpoint exists in this build — the fixture math
  // would fabricate a real conversion, so live mode hides the capability.
  if (DATA_MODE === 'live') {
    return (
      <EmptyState
        icon="wallet"
        title="Conversion isn't available in this build"
        subtitle="1ZE ⇄ GBP conversion ships with the wallet backend connection."
        actionLabel="Back to wallet"
        onAction={() => router.push('/wallet')}
      />
    );
  }

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

  // Everything below is fixture-only — live mode returned above. The
  // pocket is always seeded there; the fallback just satisfies strict
  // nullability without ever rendering in live.
  const ize = data.ize ?? { settled: 0, pending: 0, reserved: 0 };

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
          <ConvertSummaryRow label="New 1ZE balance" value={formatIze(ize.settled)} />
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
      ? `${formatIze(ize.settled)} 1ZE`
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
              {ize.pending > 0 ? (
                <PocketRow
                  label="Pending — unsettled Co-Own proceeds"
                  value={`${formatIze(ize.pending)} 1ZE`}
                />
              ) : null}
              {ize.reserved > 0 ? (
                <PocketRow label="Reserved for open orders" value={`${formatIze(ize.reserved)} 1ZE`} />
              ) : null}
              <PocketRow
                label="Withdrawable"
                value={`${formatIze(withdrawableOf(ize.settled, ize.reserved))} 1ZE`}
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
              <PocketRow
                label="Withdrawable"
                value={formatPrice(round2(data.available), data.currency)}
                emphasize
              />
            </>
          )}
        </div>
      </section>

      {/* Form — from field, swap control, receive estimate. The swap
          button is the direction toggle (mobile WalletExchangeScreen
          grammar), not a chip pair. */}
      <section aria-label="Convert form" className="mt-8 px-4 sm:px-6">
        <div className="rounded-lg border border-border bg-input px-4">
          <label
            htmlFor="convert-amount"
            className="block pt-3 text-meta text-text-muted"
          >
            You convert
          </label>
          <div className="flex items-center gap-3">
            <input
              id="convert-amount"
              value={amount}
              onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
              inputMode="decimal"
              placeholder="0.00"
              aria-label={direction === 'ize_to_gbp' ? 'Amount in 1ZE' : 'Amount in GBP'}
              className="tnum h-14 min-w-0 flex-1 bg-transparent text-price-hero font-bold text-input-text placeholder:text-text-muted focus:outline-none"
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
        </div>
        {exceeds ? (
          <p className="mt-2 text-caption text-danger-text">Amount exceeds your withdrawable balance.</p>
        ) : null}

        {/* Swap — flips the conversion direction; the visible button is
            compact, the hit target stays 44px. */}
        <div className="my-1 flex items-center justify-center">
          <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setDirection((d) => (d === 'ize_to_gbp' ? 'gbp_to_ize' : 'ize_to_gbp'))}
            aria-label="Swap conversion direction"
            className="pressable -my-1 flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:text-text-primary"
          >
            <Icon name="sort" size={20} />
          </button>
          <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface-alt px-4">
          <p className="pt-3 text-meta text-text-muted">You receive</p>
          <p
            className={`tnum flex h-14 items-center text-price-hero font-bold ${
              quote ? 'text-text-primary' : 'text-text-muted'
            }`}
            aria-live="polite"
          >
            {quote
              ? direction === 'ize_to_gbp'
                ? formatPrice(quote.net, data.currency)
                : `${formatIze(quote.net)} 1ZE`
              : '—'}
          </p>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-caption text-text-muted">
          <Icon name="info" size={14} className="shrink-0" />
          <span className="tnum">{rateLabel(direction)}</span>
          <span aria-hidden>·</span>
          <span>1% fee</span>
          <span aria-hidden>·</span>
          <span>rate as of {rateTimestampLabel(RATE_AS_OF)}</span>
        </p>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-6"
          onClick={() => setReviewing(true)}
          disabled={!quote || step === 'executing'}
        >
          {step === 'executing'
            ? 'Converting…'
            : quote
              ? 'Review conversion'
              : 'Enter an amount'}
        </Button>
      </section>

      {/* Confirm sheet — the full quote disclosure before anything moves,
          matching the mobile review step: source, rate, fee, receive, and
          the pocket balances after conversion. */}
      <Sheet
        open={reviewing && quote != null}
        onClose={() => setReviewing(false)}
        title="Review conversion"
      >
        {quote ? (
          <div className="px-5 pb-6">
            <div className="mt-2">
              <ConvertSummaryRow
                label="You convert"
                value={
                  direction === 'ize_to_gbp'
                    ? `${formatIze(numericAmount)} 1ZE`
                    : formatPrice(numericAmount, data.currency)
                }
              />
              <ConvertSummaryRow label="Rate" value={rateLabel(direction)} />
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
              <ConvertSummaryRow
                label="Rate as of"
                value={rateTimestampLabel(RATE_AS_OF)}
              />
            </div>
            <p className="mt-4 flex items-start gap-1.5 text-caption text-text-muted">
              <Icon name="info" size={13} className="mt-px shrink-0" />
              Fixture mode — this conversion is simulated for design review.
              No money moves.
            </p>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-5"
              onClick={execute}
              disabled={step === 'executing'}
            >
              {step === 'executing' ? 'Converting…' : 'Confirm conversion'}
            </Button>
          </div>
        ) : null}
      </Sheet>

      {/* Live mode never reaches this surface — the capability is hidden
          above, so the fixture disclosure stays unconditional here. */}
      <p className="mt-10 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6">
        <Icon name="info" size={14} className="shrink-0" />
        Fixture mode — conversions are simulated for design review. No money moves.
      </p>
    </div>
  );
}
