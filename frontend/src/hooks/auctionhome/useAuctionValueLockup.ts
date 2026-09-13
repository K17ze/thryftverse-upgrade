import { useCallback } from 'react';
import { useFormattedPrice } from '../useFormattedPrice';
import { toIze, formatIzeAmount, formatFiatAmount } from '../../utils/currency';

export interface AuctionValueLockup {
  izeText: string;
  localText: string | null;
}

export type FormatValueLockup = (amountGbp: number) => AuctionValueLockup;

/**
 * Separate 1ZE + local text for the value lockup primitive.
 * Always returns the canonical 1ZE text as izeText and local as localText.
 * In fiat-only display mode, izeText holds the local value and localText is null,
 * preserving the user's display preference.
 */
export function useAuctionValueLockup(): {
  formatValueLockup: FormatValueLockup;
  currencySymbol: string;
} {
  const { currencyCode, currencySymbol, displayMode, fxRates } = useFormattedPrice();

  const formatValueLockup = useCallback((amountGbp: number): AuctionValueLockup => {
    const izeAmount = toIze(amountGbp, 'GBP', fxRates);
    const izeText = formatIzeAmount(izeAmount, 2);
    const fiatValue = izeAmount * (fxRates?.[currencyCode] ?? 1);
    const fiatText = formatFiatAmount(fiatValue, currencyCode, 2);
    if (displayMode === 'ize') return { izeText, localText: null };
    if (displayMode === 'fiat') return { izeText: fiatText, localText: null };
    return { izeText, localText: fiatText };
  }, [fxRates, currencyCode, displayMode]);

  return { formatValueLockup, currencySymbol };
}
