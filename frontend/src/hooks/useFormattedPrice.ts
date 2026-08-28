import React from 'react';
import { CURRENCIES, DEFAULT_CURRENCY_CODE, SupportedCurrencyCode } from '../constants/currencies';
import { useCurrencyContext } from '../context/CurrencyContext';
import { CurrencyDisplayMode, formatFiatAmount, formatPrice, toIze } from '../utils/currency';

interface FormatOptions {
  displayMode?: CurrencyDisplayMode;
  fiatFractionDigits?: number;
  izeFractionDigits?: number;
}

export function useFormattedPrice() {
  const { currencyCode, displayMode, fxRates, rateSource, rateUpdatedAt, settlementCurrencies } = useCurrencyContext();

  const formatFromIze = React.useCallback(
    (izeAmount: number, options: FormatOptions = {}) => {
      return formatPrice({
        izeAmount,
        displayMode: options.displayMode ?? displayMode,
        currencyCode,
        fxRates,
        fiatFractionDigits: options.fiatFractionDigits,
        izeFractionDigits: options.izeFractionDigits,
      });
    },
    [currencyCode, displayMode, fxRates]
  );

  /**
   * Convert a fiat amount from a source currency to the user's display
   * currency via the 1ZE FX bridge, then format.
   *
   * Use this when the amount is denominated in a known source currency
   * (e.g. listing data stored in GBP). The display currency is always
   * the user's chosen `currencyCode` from context — never a literal.
   *
   * @example
   * formatFromFiat(item.price, 'GBP')   // listing price in GBP → user's currency
   * formatFromFiat(amount, currencyCode) // amount already in user's currency
   */
  const formatFromFiat = React.useCallback(
    (
      fiatAmount: number,
      // Default to GBP — the canonical storage currency. Callers should
      // pass the explicit source currency; this default bridges legacy
      // call sites until full migration completes.
      sourceCurrency: SupportedCurrencyCode = DEFAULT_CURRENCY_CODE,
      options: FormatOptions = {}
    ) => {
      const izeAmount = toIze(fiatAmount, sourceCurrency, fxRates);
      return formatFromIze(izeAmount, options);
    },
    [formatFromIze, fxRates]
  );

  /**
   * Format a fiat amount that is already in the user's display currency.
   * No conversion is applied — use this for amounts that come from the
   * context currency directly (e.g. wallet balance in display currency).
   *
   * @example
   * formatFiat(walletBalance) // → "$127.00" if user selected USD
   */
  const formatFiat = React.useCallback(
    (fiatAmount: number, options: Pick<FormatOptions, 'fiatFractionDigits'> = {}) => {
      return formatFiatAmount(fiatAmount, currencyCode, options.fiatFractionDigits);
    },
    [currencyCode]
  );

  /**
   * The symbol for the user's active display currency.
   * Use for filter presets and inline labels that need the raw symbol.
   *
   * @example
   * `Under ${currencySymbol}50`
   */
  const currencySymbol = React.useMemo(() => CURRENCIES[currencyCode].symbol, [currencyCode]);

  return {
    currencyCode,
    currencySymbol,
    displayMode,
    fxRates,
    rateSource,
    rateUpdatedAt,
    settlementCurrencies,
    formatFromIze,
    formatFromFiat,
    formatFiat,
  };
}