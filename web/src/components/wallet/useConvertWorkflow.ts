import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { parseApiError } from '@/lib/api/http';
import * as payoutsService from '@/lib/api/services/payouts';
import * as fxService from '@/lib/api/services/fx';
import { formatPrice } from '@/lib/utils/format';
import type { User } from '@/lib/contracts/domain';
import type { WalletData } from './useWalletData';
import { walletKeys } from './walletKeys';
import type { WalletLedgerEntry } from './ledgerViewModel';
import {
  buildQuote,
  executeQuote,
  formatIze,
  rateLabel,
  round2,
  type ConversionResult,
  type ConvertQuote,
} from './convertViewModel';

interface UseConvertWorkflowOptions {
  data: WalletData | undefined;
  user: User | null;
  isLive: boolean;
}

export function useConvertWorkflow({ data, user, isLive }: UseConvertWorkflowOptions) {
  const queryClient = useQueryClient();
  const { show } = useToast();

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

  const ize = data?.ize ?? { settled: 0, pending: 0, reserved: 0, available: 0 };
  const settledLabel =
    direction === 'ize_to_gbp'
      ? `${formatIze(ize.available)} 1ZE`
      : isLive
        ? fiatPocket
          ? fxService.formatMinorAmount(fiatPocket.fiatBalanceMinor, pocketCurrency)
          : '—'
        : data
          ? formatPrice(data.available, data.currency)
          : '—';

  const resetFlow = () => {
    setResult(null);
    setAmount('');
    setStep('amount');
  };

  return {
    direction,
    setDirection,
    amount,
    setAmount,
    reviewing,
    setReviewing,
    step,
    setStep,
    result,
    errorMessage,
    quoteNonce,
    setQuoteNonce,
    newIzeBalance,
    pocketCurrency,
    fiatPocket,
    pocketsQuery,
    pocketExp,
    numericAmount,
    maxAmount,
    exceeds,
    directionSupported,
    quote,
    quoteLoading,
    quoteError,
    quoteRateLabel,
    secondsRemaining,
    settledLabel,
    setPercentage,
    execute,
    resetFlow,
    ize,
  };
}
