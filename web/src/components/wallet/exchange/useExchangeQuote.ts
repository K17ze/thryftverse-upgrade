import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createFxQuote,
  formatRateValue,
  parseServerTimestamp,
  type FxQuotePayload,
} from '@/lib/api/services/fx';
import type { SupportedCurrencyCode } from '@/lib/constants/currencies';
import type { User } from '@/lib/contracts/domain';
import {
  buildFixtureQuote,
  formatTimestamp,
  MAX_AUTO_REFETCHES,
  newAttemptKey,
  type ExchangeStep,
} from './exchangeModel';

export interface UseExchangeQuoteParams {
  user: User | null;
  isLive: boolean;
  amountMajor: number;
  amountMinorStr: string;
  sourceCurrency: SupportedCurrencyCode;
  targetCurrency: SupportedCurrencyCode;
  exceedsBalance: boolean;
  step: ExchangeStep;
}

export function useExchangeQuote({
  user,
  isLive,
  amountMajor,
  amountMinorStr,
  sourceCurrency,
  targetCurrency,
  exceedsBalance,
  step,
}: UseExchangeQuoteParams) {
  const [quote, setQuote] = useState<FxQuotePayload | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);

  const quoteKeyRef = useRef<string | null>(null);
  useEffect(() => {
    quoteKeyRef.current = null;
  }, [amountMinorStr, sourceCurrency, targetCurrency, quoteNonce]);

  const autoRefetchesRef = useRef(0);
  useEffect(() => {
    autoRefetchesRef.current = 0;
  }, [amountMinorStr, sourceCurrency, targetCurrency]);

  // Debounced quote fetch (400ms)
  useEffect(() => {
    if (
      amountMajor <= 0 ||
      exceedsBalance ||
      sourceCurrency === targetCurrency ||
      !user?.id
    ) {
      setQuote(null);
      setQuoteError(false);
      setIsFetchingQuote(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const debounce = window.setTimeout(() => {
      setIsFetchingQuote(true);
      setQuoteError(false);
      if (!quoteKeyRef.current) quoteKeyRef.current = newAttemptKey();
      const attemptKey = quoteKeyRef.current;
      const fetchQuote: Promise<FxQuotePayload> = isLive
        ? createFxQuote(
            {
              sourceCurrency,
              targetCurrency,
              fixedSide: 'source',
              amountMinor: amountMinorStr,
              idempotencyKey: attemptKey,
            },
            controller.signal,
          ).then((res) => res.quote)
        : new Promise((resolve) =>
            window.setTimeout(
              () =>
                resolve(
                  buildFixtureQuote(sourceCurrency, targetCurrency, amountMinorStr, attemptKey),
                ),
              300,
            ),
          );
      fetchQuote
        .then((nextQuote) => {
          if (cancelled) return;
          if (parseServerTimestamp(nextQuote.expiresAt) > Date.now()) {
            autoRefetchesRef.current = 0;
          }
          setQuote(nextQuote);
        })
        .catch(() => {
          if (!cancelled) {
            setQuote(null);
            setQuoteError(true);
          }
        })
        .finally(() => {
          if (!cancelled) setIsFetchingQuote(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(debounce);
    };
  }, [
    isLive,
    amountMinorStr,
    sourceCurrency,
    targetCurrency,
    exceedsBalance,
    user?.id,
    quoteNonce,
    amountMajor,
  ]);

  const handleRetryQuote = useCallback(() => {
    autoRefetchesRef.current = 0;
    setQuoteNonce((n) => n + 1);
  }, []);

  const expiryMs = quote ? parseServerTimestamp(quote.expiresAt) : NaN;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  useEffect(() => {
    if (!Number.isFinite(expiryMs)) {
      setRemainingMs(null);
      return;
    }
    const tick = () => setRemainingMs(Math.max(0, expiryMs - Date.now()));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [expiryMs]);

  const isQuoteExpired = remainingMs !== null && remainingMs <= 0;
  const quoteExpiryLabel = useMemo(() => {
    if (remainingMs === null || remainingMs <= 0) return '';
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, [remainingMs]);
  const rateObservedLabel = quote ? formatTimestamp(quote.rateObservedAt) : '';

  useEffect(() => {
    if (isQuoteExpired && (step === 'compose' || step === 'review')) {
      if (autoRefetchesRef.current >= MAX_AUTO_REFETCHES) return;
      autoRefetchesRef.current += 1;
      setQuoteNonce((n) => n + 1);
    }
  }, [isQuoteExpired, step]);

  const rateValueLabel = `1 ${sourceCurrency} = ${quote ? formatRateValue(quote.customerRate) : '—'} ${targetCurrency}`;

  return {
    quote,
    setQuote,
    isFetchingQuote,
    quoteError,
    quoteNonce,
    setQuoteNonce,
    handleRetryQuote,
    isQuoteExpired,
    quoteExpiryLabel,
    rateObservedLabel,
    rateValueLabel,
  };
}
