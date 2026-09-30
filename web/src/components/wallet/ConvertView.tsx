'use client';

/**
 * Convert surface — 1ZE ⇄ fiat. Mirrors the mobile wallet flows:
 * amount → review sheet → executing → receipt.
 *
 * Factored into domain components (<400 LOC standard):
 *  - ConvertBalanceSection
 *  - ConvertFormSection
 *  - ConvertReviewSheet
 *  - ConvertReceipt
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
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
import { ConvertReceipt } from './ConvertReceipt';
import { ConvertReviewSheet } from './ConvertReviewSheet';
import { ConvertBalanceSection } from './ConvertBalanceSection';
import { ConvertFormSection } from './ConvertFormSection';
import {
  buildQuote,
  executeQuote,
  formatIze,
  rateLabel,
  round2,
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

  const [liveQuote, setLiveQuote] = useState<payoutsService.ConvertQuotePayload | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [newIzeBalance, setNewIzeBalance] = useState<number | null>(null);

  const idempotencyKeyRef = useRef<string | null>(null);

  const [secondsRemaining, setSecondsRemaining] = useState(15);
  useEffect(() => {
    if (isLive) return;
    const timer = setInterval(() => {
      setSecondsRemaining((s) => (s <= 1 ? 15 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isLive]);

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

  const buyPairQuery = useQuery({
    queryKey: [...walletKeys.root, 'buy-pair', pocketCurrency],
    enabled: isLive && !!fiatPocket && direction === 'gbp_to_ize',
    staleTime: 60_000,
    queryFn: ({ signal }) => fxService.getFxPairRate('USD', pocketCurrency, signal),
  });
  const buyRate = buyPairQuery.data ? Number(buyPairQuery.data.rate) : NaN;

  const numericAmount = Number(amount) || 0;
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

  const directionSupported =
    !isLive ||
    direction === 'ize_to_gbp' ||
    (fiatPocket != null && !pocketsQuery.isError);

  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [direction, numericAmount]);

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
        id: '',
        gbpDelta: c.netFiatAmount,
        izeDelta: -c.izeAmount,
        rate: c.rateUsed ?? c.fxRate ?? 0,
        timestamp: new Date().toISOString(),
      };
      setResult(executed);
      setNewIzeBalance(
        typeof res.wallet?.onezeBalance === 'number' ? res.wallet.onezeBalance : null,
      );
      idempotencyKeyRef.current = null;
      setStep('receipt');
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

  if (step === 'receipt' && result) {
    return (
      <ConvertReceipt
        result={result}
        pocketCurrency={pocketCurrency}
        isLive={isLive}
        newIzeBalance={newIzeBalance}
        available={data.available}
        settledIze={ize.settled}
        onDone={() => router.push('/wallet')}
        onConvertAgain={() => {
          setResult(null);
          setAmount('');
          setStep('amount');
        }}
      />
    );
  }

  const settledLabel =
    direction === 'ize_to_gbp'
      ? `${formatIze(ize.available)} 1ZE`
      : isLive
        ? fiatPocket
          ? fxService.formatMinorAmount(fiatPocket.fiatBalanceMinor, pocketCurrency)
          : '—'
        : formatPrice(data.available, data.currency);

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

      <ConvertBalanceSection
        settledLabel={settledLabel}
        direction={direction}
        ize={ize}
        data={data}
        isLive={isLive}
        fiatPocket={fiatPocket}
        pocketCurrency={pocketCurrency}
      />

      <ConvertFormSection
        direction={direction}
        setDirection={setDirection}
        amount={amount}
        setAmount={setAmount}
        maxAmount={maxAmount}
        pocketExp={pocketExp}
        isLive={isLive}
        pocketCurrency={pocketCurrency}
        exceeds={exceeds}
        numericAmount={numericAmount}
        directionSupported={directionSupported}
        pocketsQueryError={pocketsQuery.isError}
        onRetryPockets={() => void pocketsQuery.refetch()}
        quote={quote}
        quoteLoading={quoteLoading}
        quoteError={quoteError}
        onRetryQuote={() => setQuoteNonce((n) => n + 1)}
        quoteRateLabel={quoteRateLabel}
        secondsRemaining={secondsRemaining}
        step={step}
        setStep={setStep}
        errorMessage={errorMessage}
        onReview={() => setReviewing(true)}
        onSetPercentage={setPercentage}
      />

      <ConvertReviewSheet
        open={reviewing && quote != null}
        onClose={() => setReviewing(false)}
        quote={quote}
        direction={direction}
        numericAmount={numericAmount}
        pocketCurrency={pocketCurrency}
        quoteRateLabel={quoteRateLabel}
        isLive={isLive}
        step={step}
        onExecute={execute}
      />

      {isLive ? null : (
        <p className="mt-10 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6">
          <Icon name="info" size={14} className="shrink-0" />
          Fixture mode — conversions are simulated for design review. No money moves.
        </p>
      )}
    </div>
  );
}
