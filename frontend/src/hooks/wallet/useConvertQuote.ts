import { useEffect, useState } from 'react';

import {
  getConvertQuote,
  type ConvertQuotePayload } from '../../services/walletApi';
import type { SupportedCurrencyCode } from '../../constants/currencies';

export interface UseConvertQuoteOptions {
  userId: string | undefined;
  izeValue: number;
  currencyCode: SupportedCurrencyCode;
  exceedsBalance: boolean;
}

/**
 * useConvertQuote — owns the backend fee-quote lifecycle for the convert
 * surface: the debounced preview fetch, loading/error flags and the
 * nonce-based retry. The fee is transparent — fetched from the backend,
 * never hardcoded — so the breakdown matches exactly what execution
 * returns (MiCA EMT transparent-fee requirement).
 */
export function useConvertQuote({
  userId,
  izeValue,
  currencyCode,
  exceedsBalance,
}: UseConvertQuoteOptions) {
  // -- Fee quote from backend (transparent, not hardcoded) --
  // The full principal/fee/net breakdown comes from the backend preview
  // quote. The client never assumes a fee rate -- it discloses what the
  // backend returns (MiCA EMT transparent-fee requirement).
  const [quote, setQuote] = useState<ConvertQuotePayload | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);

  // -- Fetch fee quote from backend (debounced) --
  // The fee is transparent -- fetched from the backend, never hardcoded.
  // We call the same convert endpoint with a preview flag so the breakdown
  // matches exactly what execution will return.
  useEffect(() => {
    if (izeValue <= 0 || exceedsBalance || !userId) {
      setQuote(null);
      setQuoteError(false);
      return;
    }
    let isCancelled = false;
    const debounce = setTimeout(async () => {
      setIsFetchingQuote(true);
      setQuoteError(false);
      try {
        const response = await getConvertQuote({
          userId,
          izeAmount: izeValue,
          fiatCurrency: currencyCode });
        if (!isCancelled) {
          setQuote(response.conversion);
        }
      } catch {
        if (!isCancelled) {
          setQuote(null);
          setQuoteError(true);
        }
      } finally {
        if (!isCancelled) {
          setIsFetchingQuote(false);
        }
      }
    }, 400);
    return () => {
      isCancelled = true;
      clearTimeout(debounce);
    };
  }, [izeValue, currencyCode, exceedsBalance, userId, quoteNonce]);

  const handleRetryQuote = () => {
    setQuoteNonce((n) => n + 1);
  };

  return {
    quote,
    isFetchingQuote,
    quoteError,
    handleRetryQuote,
  };
}
