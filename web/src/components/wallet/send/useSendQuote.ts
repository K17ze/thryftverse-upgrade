'use client';

/**
 * useSendQuote — the debounced live-quote lifecycle for the Send money
 * composer. Same contract as ExchangeView's quote flow:
 *
 *  - POST /wallet/fx/quotes {fixedSide: 'source'} after a 400ms debounce.
 *  - One idempotency key per (amount, pair, refetch) attempt — in-flight
 *    retries dedupe server-side; a nonce bump mints a fresh key so the
 *    server never replays a stale quote.
 *  - The countdown is driven by quote.expiresAt (server TTL, never a
 *    client-synthesized window); while the caller is composing/reviewing,
 *    expiry auto-refetches up to MAX_AUTO_REFETCHES times, then holds an
 *    honest expired state with the manual Refresh affordance.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createFxQuote,
  parseServerTimestamp,
  type FxQuotePayload,
} from '@/lib/api/services/fx';
import { newAttemptKey } from './sendModel';

/** Server-side auto-refetch budget for expired quotes (mirrors exchange). */
const MAX_AUTO_REFETCHES = 3;

export interface SendQuoteState {
  quote: FxQuotePayload | null;
  isFetchingQuote: boolean;
  quoteError: boolean;
  isQuoteExpired: boolean;
  /** 'm:ss' remaining on the server TTL, '' when expired/unknown. */
  quoteExpiryLabel: string;
  /** Manual retry — resets the auto-refetch budget and mints a new key. */
  retry: () => void;
  /** Bump the nonce without resetting the budget (internal resync). */
  refresh: () => void;
}

export function useSendQuote(input: {
  userId: string | undefined;
  sourceCurrency: string | null;
  targetCurrency: string | null;
  /** True when a quote is needed (cross-currency) — false for same-currency sends. */
  needsQuote: boolean;
  amountMinorStr: string;
  amountMajor: number;
  exceedsBalance: boolean;
  /** Auto-refetch expired quotes only while the user is composing/reviewing. */
  allowAutoRefetch: boolean;
}): SendQuoteState {
  const {
    userId,
    sourceCurrency,
    targetCurrency,
    needsQuote,
    amountMinorStr,
    amountMajor,
    exceedsBalance,
    allowAutoRefetch,
  } = input;

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

  useEffect(() => {
    if (!needsQuote || amountMajor <= 0 || exceedsBalance || !userId || !sourceCurrency || !targetCurrency) {
      setQuote(null);
      setQuoteError(false);
      setIsFetchingQuote(false);
      return;
    }
    const sc = sourceCurrency;
    const tc = targetCurrency;
    let cancelled = false;
    const controller = new AbortController();
    const debounce = window.setTimeout(() => {
      setIsFetchingQuote(true);
      setQuoteError(false);
      if (!quoteKeyRef.current) quoteKeyRef.current = newAttemptKey();
      createFxQuote(
        {
          sourceCurrency: sc,
          targetCurrency: tc,
          fixedSide: 'source',
          amountMinor: amountMinorStr,
          idempotencyKey: quoteKeyRef.current,
        },
        controller.signal,
      )
        .then((res) => {
          if (cancelled) return;
          // A live quote resets the auto-refetch budget; one that arrives
          // already expired keeps counting toward it.
          if (parseServerTimestamp(res.quote.expiresAt) > Date.now()) {
            autoRefetchesRef.current = 0;
          }
          setQuote(res.quote);
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
  }, [needsQuote, amountMinorStr, amountMajor, exceedsBalance, sourceCurrency, targetCurrency, userId, quoteNonce]);

  // Countdown off quote.expiresAt (server TTL).
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

  // Quote expired while composing/reviewing → auto-refetch a fresh rate,
  // capped; past the cap the expired state stays with manual Refresh.
  useEffect(() => {
    if (isQuoteExpired && allowAutoRefetch) {
      if (autoRefetchesRef.current >= MAX_AUTO_REFETCHES) return;
      autoRefetchesRef.current += 1;
      setQuoteNonce((n) => n + 1);
    }
  }, [isQuoteExpired, allowAutoRefetch]);

  const retry = useCallback(() => {
    autoRefetchesRef.current = 0; // manual retry is user intent — restart the budget
    setQuoteNonce((n) => n + 1);
  }, []);
  const refresh = useCallback(() => setQuoteNonce((n) => n + 1), []);

  return {
    quote,
    isFetchingQuote,
    quoteError,
    isQuoteExpired,
    quoteExpiryLabel,
    retry,
    refresh,
  };
}
