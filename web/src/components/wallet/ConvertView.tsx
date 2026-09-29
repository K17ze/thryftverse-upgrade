'use client';

/**
 * Convert surface — 1ZE ⇄ fiat. Mirrors the mobile wallet flows:
 * amount → review sheet → executing → receipt.
 *  - Live mode wires both real contracts the native app uses:
 *    1ZE→fiat via POST /wallet/convert-1ze-to-fiat (preview:true debounced
 *    quote — client never assumes a fee) and fiat→1ZE via
 *    POST /wallet/buy-1ze, which debits the wallet's DEFAULT fiat pocket
 *    (wallet_currency_balances, not the GBP projection) — the spend cap
 *    and currency come from /wallets/:id/currency-balances. buy-1ze has
 *    no preview endpoint, so its review labels fee/net an estimate built
 *    from the live USD→fiat pair rate; the receipt carries the executed
 *    fee/rate verbatim. Both executes are idempotency-keyed.
 *  - Fixture mode keeps the simulated Polymarket-grade swap UI:
 *    quick percentage selectors, rate lock countdown, seeded rate math.
 * Flat canvas, hairline borders, strictly following ANTI-AI design policy.
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as payoutsService from '@/lib/api/services/payouts';
import * as fxService from '@/lib/api/services/fx';
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
  RATE_AS_OF,
  type ConversionResult,
  type ConvertQuote,
} from './convertViewModel';

function ConvertSkeleton() {
  return (
    <div aria-busy aria-label="Loading convert" className="mx-auto w-full max-w-xl lg:max-w-2xl">
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
  const isLive = DATA_MODE === 'live';

  const [direction, setDirection] = useState<'ize_to_gbp' | 'gbp_to_ize'>('ize_to_gbp');
  const [amount, setAmount] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [step, setStep] = useState<'amount' | 'executing' | 'receipt' | 'error'>('amount');
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // ── Live quote state (POST /wallet/convert-1ze-to-fiat, preview:true) ──
  // The client never assumes a fee or rate — the backend preview returns
  // the exact principal/fee/net breakdown execution produces (MiCA EMT).
  const [liveQuote, setLiveQuote] = useState<payoutsService.ConvertQuotePayload | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);
  /** Post-execution 1ZE balance from the server's wallet payload. */
  const [newIzeBalance, setNewIzeBalance] = useState<number | null>(null);

  // One idempotency key per (direction, amount) attempt — a retried submit
  // replays the server's stored response instead of burning 1ZE twice.
  const idempotencyKeyRef = useRef<string | null>(null);

  // Rate lock countdown ticker — fixture mode only; live quotes are priced
  // at execution, not locked, so no countdown is rendered there.
  const [secondsRemaining, setSecondsRemaining] = useState(15);
  useEffect(() => {
    if (isLive) return;
    const timer = setInterval(() => {
      setSecondsRemaining((s) => (s <= 1 ? 15 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isLive]);

  // ── Default fiat pocket — the wallet_currency_balances row that
  //  POST /wallet/buy-1ze debits. The hero's ledger-backed availability is
  //  the accounting projection, NOT the spendable pocket the buy reads, so
  //  the buy direction keys its cap and currency on this query. ──
  const pocketsQuery = useQuery({
    queryKey: [...walletKeys.root, 'pockets', user?.id],
    enabled: isLive && !!user?.id,
    staleTime: 30_000,
    queryFn: ({ signal }) => fxService.getCurrencyBalances(user!.id, signal),
  });
  const fiatPocket = pocketsQuery.data;
  const pocketCurrency = fiatPocket?.fiatCurrency ?? 'GBP';
  const pocketMajor = fiatPocket
    ? fxService.minorUnitsToMajor(fiatPocket.fiatBalanceMinor, fiatPocket.fiatCurrency)
    : 0;

  // USD→fiat pair rate for the buy-side estimate (1ZE is USD-par; the
  // backend prices buy-1ze with the same internal rate). Estimate only —
  // the committed receipt carries the executed rate.
  const buyPairQuery = useQuery({
    queryKey: [...walletKeys.root, 'buy-pair', pocketCurrency],
    enabled: isLive && !!fiatPocket && direction === 'gbp_to_ize',
    staleTime: 60_000,
    queryFn: ({ signal }) => fxService.getFxPairRate('USD', pocketCurrency, signal),
  });
  const buyRate = buyPairQuery.data ? Number(buyPairQuery.data.rate) : NaN;

  const numericAmount = Number(amount) || 0;
  // The cap floors at the pocket's own minor-unit precision — a JPY
  // pocket (0dp) can't spend a fractional major, a TND pocket (3dp) can.
  const pocketExp = fxService.currencyMinorExponent(pocketCurrency);
  const roundToPocket = useCallback(
    (v: number) => {
      const f = Math.pow(10, pocketExp);
      return Math.round(v * f) / f;
    },
    [pocketExp],
  );
  const pocketCap = Math.floor(pocketMajor * Math.pow(10, pocketExp)) / Math.pow(10, pocketExp);
  const maxAmount = data
    ? direction === 'ize_to_gbp'
      ? data.ize
        ? data.ize.available
        : 0
      : isLive
        ? pocketCap
        : round2(data.available)
    : 0;
  const exceeds = numericAmount > maxAmount + 1e-9;

  // Live supports both directions: 1ZE→fiat via /wallet/convert-1ze-to-fiat
  // (preview:true quote), fiat→1ZE via /wallet/buy-1ze (no preview — the
  // review labels its fee/rate an estimate, the receipt shows the real
  // breakdown). The buy direction needs the pocket read to cap + denominate.
  const directionSupported =
    !isLive ||
    direction === 'ize_to_gbp' ||
    (fiatPocket != null && !pocketsQuery.isError);

  // Changed inputs are a different attempt — the stored request hash would
  // mismatch, so the idempotency key resets when they do.
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [direction, numericAmount]);

  // Debounced live preview quote — the same endpoint as execution with
  // preview:true, so the disclosed fee can never drift from the real one.
  useEffect(() => {
    if (
      !isLive ||
      direction !== 'ize_to_gbp' ||
      numericAmount <= 0 ||
      exceeds ||
      !user?.id
    ) {
      setLiveQuote(null);
      setQuoteError(false);
      setQuoteLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      setQuoteError(false);
      payoutsService
        .getConvertQuote(
          { userId: user.id, izeAmount: numericAmount, fiatCurrency: pocketCurrency },
          controller.signal,
        )
        .then((res) => {
          if (!cancelled) setLiveQuote(res.conversion ?? null);
        })
        .catch(() => {
          if (!cancelled) {
            setLiveQuote(null);
            setQuoteError(true);
          }
        })
        .finally(() => {
          if (!cancelled) setQuoteLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [isLive, direction, numericAmount, exceeds, user?.id, quoteNonce, pocketCurrency]);

  // Server-side load fee (backend PLATFORM_LOAD_FEE_BPS = 200) mirrored
  // for the buy-side ESTIMATE — buy-1ze has no preview endpoint, so the
  // review marks fee/net as estimated; the receipt shows the real values.
  const BUY_IZE_FEE_BPS_ESTIMATE = 200;

  const quote: ConvertQuote | null = useMemo(() => {
    if (exceeds || numericAmount <= 0 || !directionSupported) return null;
    if (!isLive) return buildQuote(direction, numericAmount);
    if (direction === 'gbp_to_ize') {
      if (!Number.isFinite(buyRate) || buyRate <= 0) return null;
      const principal = roundToPocket(numericAmount / (1 + BUY_IZE_FEE_BPS_ESTIMATE / 10_000));
      return {
        direction,
        sourceAmount: roundToPocket(numericAmount),
        principal,
        fee: roundToPocket(numericAmount - principal),
        feeBps: BUY_IZE_FEE_BPS_ESTIMATE,
        net: round2(principal / buyRate),
      };
    }
    // A quote is only shown for the amount it was fetched for — the fee
    // the user reviews must be the fee execution would charge.
    if (!liveQuote || Math.abs(liveQuote.izeAmount - numericAmount) > 1e-6) {
      return null;
    }
    return {
      direction,
      sourceAmount: liveQuote.izeAmount,
      principal: liveQuote.principalAmount,
      fee: liveQuote.feeAmount,
      feeBps: liveQuote.feeBps,
      net: liveQuote.netFiatAmount,
    };
  }, [exceeds, numericAmount, directionSupported, isLive, direction, liveQuote, buyRate, roundToPocket]);

  const liveRatePerIze = liveQuote?.rateUsed ?? liveQuote?.fxRate ?? null;
  const quoteRateLabel =
    isLive && direction === 'gbp_to_ize'
      ? Number.isFinite(buyRate)
        ? `≈ 1 1ZE = ${formatPrice(buyRate, pocketCurrency)} (estimate)`
        : 'Fetching estimate…'
      : isLive && liveRatePerIze != null
        ? `1 1ZE = ${formatPrice(liveRatePerIze, pocketCurrency)}`
        : rateLabel(direction);

  const setPercentage = (pct: number) => {
    if (maxAmount <= 0) return;
    const computed =
      direction === 'gbp_to_ize' && isLive
        ? roundToPocket(maxAmount * pct)
        : round2(maxAmount * pct);
    setAmount(computed.toFixed(direction === 'gbp_to_ize' && isLive ? pocketExp : 2));
  };

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

  /** Live execution — /wallet/convert-1ze-to-fiat for 1ZE→fiat,
   *  /wallet/buy-1ze for fiat→1ZE (debits the default fiat pocket). Both
   *  carry the attempt's idempotency key: the server only persists it on
   *  commit, so a retry either replays the stored result (a lost
   *  response) or re-executes the identical request safely. */
  const executeLive = async () => {
    if (!user?.id || numericAmount <= 0) return;
    if (direction === 'gbp_to_ize' && !fiatPocket) return;
    setReviewing(false);
    setErrorMessage('');
    setStep('executing');
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = payoutsService.newConvertAttemptKey();
    }
    try {
      if (direction === 'gbp_to_ize') {
        const res = await payoutsService.buyIze({
          userId: user.id,
          fiatAmount: numericAmount,
          fiatCurrency: pocketCurrency,
          idempotencyKey: idempotencyKeyRef.current,
        });
        const p = res.purchase;
        const executed: ConversionResult = {
          direction: 'gbp_to_ize',
          sourceAmount: p.fiatAmount,
          principal: p.principalFiat,
          fee: p.feeFiat,
          feeBps: p.feeBps,
          net: p.izeAmount,
          // The contract returns no client-facing reference — the
          // receipt's Reference row renders only when one exists.
          id: '',
          gbpDelta: -p.fiatAmount,
          izeDelta: p.izeAmount,
          rate: p.rateUsed,
          timestamp: new Date().toISOString(),
        };
        setResult(executed);
        setNewIzeBalance(
          typeof res.wallet?.onezeBalance === 'number' ? res.wallet.onezeBalance : null,
        );
        idempotencyKeyRef.current = null;
        setStep('receipt');
        // Pocket + ledger both moved — re-read every wallet surface.
        void queryClient.invalidateQueries({ queryKey: walletKeys.root });
        show(
          `Bought ${formatIze(executed.net)} 1ZE for ${formatPrice(executed.sourceAmount, pocketCurrency)}`,
          'success',
        );
        return;
      }
      const res = await payoutsService.convertIzeToFiat({
        userId: user.id,
        izeAmount: numericAmount,
        fiatCurrency: pocketCurrency,
        idempotencyKey: idempotencyKeyRef.current,
      });
      const c = res.conversion;
      const executed: ConversionResult = {
        direction: 'ize_to_gbp',
        sourceAmount: c.izeAmount,
        principal: c.principalAmount,
        fee: c.feeAmount,
        feeBps: c.feeBps,
        net: c.netFiatAmount,
        // The contract returns no client-facing reference — the receipt's
        // Reference row renders only when one exists.
        id: '',
        gbpDelta: c.netFiatAmount,
        izeDelta: -c.izeAmount,
        rate: c.rateUsed ?? c.fxRate ?? 0,
        timestamp: new Date().toISOString(),
      };
      setResult(executed);
      // Server-computed post-conversion 1ZE balance — the receipt's only
      // post-state figure that doesn't need a refetch.
      setNewIzeBalance(
        typeof res.wallet?.onezeBalance === 'number' ? res.wallet.onezeBalance : null,
      );
      idempotencyKeyRef.current = null;
      setStep('receipt');
      // Real ledger moved — re-read every wallet surface rather than
      // writing optimistic deltas onto a ledger-backed balance.
      void queryClient.invalidateQueries({ queryKey: walletKeys.root });
      show(
        `Converted ${formatIze(executed.sourceAmount)} 1ZE to ${formatPrice(executed.net, pocketCurrency)}`,
        'success',
      );
    } catch (e) {
      setErrorMessage(parseApiError(e, 'Unable to convert right now.').message);
      setStep('error');
    }
  };

  const execute = () => {
    if (!quote) return;
    if (isLive) {
      void executeLive();
      return;
    }
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

  if (isGuest) {
    return (
      <EmptyState
        icon="wallet"
        title="Sign in to convert"
        subtitle="Conversions move between your fiat balance and 1ZE."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
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

  // Live mode needs the real 1ZE position to gate spendable — a failed
  // read renders unavailable + retry, never a fabricated 0 balance.
  if (isLive && !data.ize) {
    return (
      <EmptyState
        icon="wallet"
        title="1ZE balance unavailable"
        subtitle="We couldn't load your 1ZE position. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void refetch()}
      />
    );
  }

  const ize = data.ize ?? { settled: 0, pending: 0, reserved: 0, available: 0 };

  // ── Receipt step ──
  if (step === 'receipt' && result) {
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
          <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
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
                value={formatPrice(round2(data.available), 'GBP')}
              />
              <ConvertSummaryRow
                label="New 1ZE balance"
                value={`${formatIze(ize.settled)} 1ZE`}
              />
            </>
          )}
          {result.id ? (
            <ConvertSummaryRow label="Reference" value={result.id.toUpperCase()} />
          ) : null}
          <ConvertSummaryRow label="Timestamp" value={rateTimestampLabel(result.timestamp)} />
        </div>

        <div className="mt-8 flex flex-col gap-2.5 px-4 sm:px-6">
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

  // ── Amount step ──
  const settledLabel =
    direction === 'ize_to_gbp'
      ? `${formatIze(ize.available)} 1ZE`
      : isLive
        ? fiatPocket
          ? fxService.formatMinorAmount(fiatPocket.fiatBalanceMinor, pocketCurrency)
          : '—'
        : formatPrice(data.available, data.currency);

  // Fixture-only display rate; live quotes carry their own rateUsed.
  const inverseRate =
    direction === 'ize_to_gbp'
      ? '1 1ZE = £0.79 GBP (1 GBP = 1.2658 1ZE)'
      : '1 GBP = 1.2658 1ZE (1 1ZE = £0.79 GBP)';

  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
        <div>
          <h1 className="text-screen-title text-text-primary">Instant Convert</h1>
          <p className="text-caption text-text-secondary">
            {isLive
              ? `Between your ${pocketCurrency} balance and 1ZE`
              : 'Real-time zero-slippage liquidity exchange'}
          </p>
        </div>
      </div>

      {/* Available balance header */}
      <section aria-label="Available balance" className="px-4 pt-6 sm:px-6">
        <p className="text-label text-text-muted">Available to convert</p>
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
                label="Withdrawable / Convertible"
                value={`${formatIze(ize.available)} 1ZE`}
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
                label="Withdrawable / Convertible"
                value={
                  isLive && fiatPocket
                    ? fxService.formatMinorAmount(fiatPocket.fiatBalanceMinor, pocketCurrency)
                    : formatPrice(round2(data.available), data.currency)
                }
                emphasize
              />
            </>
          )}
        </div>
      </section>

      {/* Polymarket-grade Swap Terminal */}
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
                onClick={() => setPercentage(pct)}
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
          /* The buy direction needs the fiat pocket read (cap + currency)
             — a failed pocket fetch gets retry, never a guessed balance. */
          <div className="rounded-lg border border-border-subtle bg-surface-alt p-4">
            <div className="flex items-start gap-2.5">
              <Icon name="info" size={15} className="mt-0.5 shrink-0 text-text-muted" />
              <div>
                <p className="text-body font-medium text-text-primary">
                  {pocketsQuery.isError
                    ? `Couldn't load your ${pocketCurrency} balance`
                    : 'Loading your fiat balance…'}
                </p>
                <p className="mt-1 text-caption text-text-secondary">
                  {pocketsQuery.isError
                    ? `Buying 1ZE debits your ${pocketCurrency} pocket — we can't quote a spend limit without it.`
                    : 'Checking your fiat pocket before quoting.'}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    pocketsQuery.isError
                      ? void pocketsQuery.refetch()
                      : setDirection('ize_to_gbp')
                  }
                  className="pressable mt-2.5 text-caption font-semibold text-text-primary underline underline-offset-2 hover:text-text-secondary"
                >
                  {pocketsQuery.isError ? 'Try again' : `Convert 1ZE to ${pocketCurrency} instead`}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* You receive preview */
          <div className="rounded-lg border border-border-subtle bg-surface-alt p-4">
            <div className="flex items-center justify-between text-meta text-text-muted">
              <span>{isLive ? 'You receive' : 'You receive (guaranteed minimum)'}</span>
              {!isLive ? (
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-text" />
                  <span className="text-meta text-text-muted">0% slippage</span>
                </div>
              ) : null}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p
                className={`tnum flex h-12 items-center text-price-hero font-bold ${
                  quote ? 'text-text-primary' : 'text-text-muted'
                }`}
                aria-live="polite"
              >
                {quote
                  ? direction === 'ize_to_gbp'
                    ? formatPrice(quote.net, pocketCurrency)
                    : `${formatIze(quote.net)} 1ZE`
                  : '—'}
              </p>
              <span className="shrink-0 text-body-emphasis font-bold text-text-primary">
                {direction === 'ize_to_gbp' ? pocketCurrency : '1ZE'}
              </span>
            </div>
          </div>
        )}

        {/* Quote line — fixture shows the seeded rate + lock ticker; live
            shows the backend preview's own rate or its honest state. */}
        {directionSupported ? (
          <div className="mt-3 flex items-center justify-between text-caption text-text-muted">
            <div className="flex items-center gap-1.5">
              <Icon name="info" size={14} className="shrink-0" />
              <span className="tnum font-medium text-text-secondary">
                {isLive
                  ? direction === 'gbp_to_ize'
                    ? numericAmount <= 0
                      ? 'Enter an amount for an estimate'
                      : !quote
                        ? 'Fetching estimate…'
                        : quoteRateLabel
                    : numericAmount <= 0
                      ? 'Enter an amount for a live quote'
                      : quoteError
                        ? 'Quote unavailable'
                        : quoteLoading || !quote
                          ? 'Fetching live quote…'
                          : quoteRateLabel
                  : inverseRate}
              </span>
            </div>
            {isLive ? (
              direction === 'gbp_to_ize' ? (
                <span className="text-meta text-text-muted">Estimate — settled at execution</span>
              ) : quoteError ? (
                <button
                  type="button"
                  onClick={() => setQuoteNonce((n) => n + 1)}
                  className="pressable text-caption font-semibold text-text-primary hover:text-text-secondary"
                >
                  Retry quote
                </button>
              ) : (
                <span className="text-meta text-text-muted">Live quote</span>
              )
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-meta text-text-muted">Locked:</span>
                <Badge variant="neutral" className="py-0 font-mono text-[10px]">
                  {secondsRemaining}s
                </Badge>
              </div>
            )}
          </div>
        ) : null}

        {step === 'error' ? (
          <div
            role="alert"
            className="mt-4 rounded-md border border-danger-border bg-danger-subtle px-4 py-3"
          >
            <p className="text-caption text-danger-text">{errorMessage}</p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setStep('amount');
                  setReviewing(true);
                }}
              >
                Try again
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setStep('amount')}>
                Edit amount
              </Button>
            </div>
          </div>
        ) : null}

        {directionSupported ? (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-6"
            onClick={() => setReviewing(true)}
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

      {/* Confirmation sheet modal */}
      <Sheet
        open={reviewing && quote != null}
        onClose={() => setReviewing(false)}
        title="Confirm Conversion"
      >
        {quote ? (
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
              onClick={execute}
              disabled={step === 'executing'}
            >
              {step === 'executing' ? 'Converting…' : 'Confirm & Execute'}
            </Button>
          </div>
        ) : null}
      </Sheet>

      {isLive ? null : (
        <p className="mt-10 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6">
          <Icon name="info" size={14} className="shrink-0" />
          Fixture mode — conversions are simulated for design review. No money moves.
        </p>
      )}
    </div>
  );
}
