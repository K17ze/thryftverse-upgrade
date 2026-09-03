import {
  CURRENCIES,
  DEFAULT_CURRENCY_CODE,
  SupportedCurrencyCode,
} from '../constants/currencies';

export type CurrencyDisplayMode = 'ize' | 'fiat' | 'both';

export const IZE_DECIMALS = 6;
export const IZE_SYMBOL = '1ze';

// ── At-par model ──────────────────────────────────────────────────────
// 1 1ZE = $1.00 USD — always, at par. The platform fee is a transparent
// separate line item on load and withdraw, never hidden in the rate.
export const IZE_PER_USD = 1;

/** Convert a 1ZE amount to its USD equivalent at par (1 1ZE = $1). */
export function izeToUsd(izeAmount: number): number {
  return izeAmount / IZE_PER_USD;
}

/** Convert a USD amount to its 1ZE equivalent at par (1 1ZE = $1). */
export function usdToIze(usdAmount: number): number {
  return usdAmount * IZE_PER_USD;
}

/** Format a USD amount as a currency string (e.g. "$100.00"). */
export function formatUsd(amount: number, fractionDigits: number = 2): string {
  if (!Number.isFinite(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

export type FxRates = Record<SupportedCurrencyCode, number>;

export const DEFAULT_FX_RATES: FxRates = {
  GBP: CURRENCIES.GBP.fxRatePerUnit,
  USD: CURRENCIES.USD.fxRatePerUnit,
  EUR: CURRENCIES.EUR.fxRatePerUnit,
  NGN: CURRENCIES.NGN.fxRatePerUnit,
  JPY: CURRENCIES.JPY.fxRatePerUnit,
  CAD: CURRENCIES.CAD.fxRatePerUnit,
  AUD: CURRENCIES.AUD.fxRatePerUnit,
  AED: CURRENCIES.AED.fxRatePerUnit,
  INR: CURRENCIES.INR.fxRatePerUnit,
};

const FALLBACK_CURRENCY = DEFAULT_CURRENCY_CODE;

function getRate(currencyCode: SupportedCurrencyCode, fxRates?: Partial<FxRates>) {
  return fxRates?.[currencyCode] ?? DEFAULT_FX_RATES[currencyCode];
}

export function toFiat(
  izeAmount: number,
  currencyCode: SupportedCurrencyCode = FALLBACK_CURRENCY,
  fxRates?: Partial<FxRates>
): number {
  return izeAmount * getRate(currencyCode, fxRates);
}

export function toIze(
  fiatAmount: number,
  currencyCode: SupportedCurrencyCode = FALLBACK_CURRENCY,
  fxRates?: Partial<FxRates>
): number {
  const rate = getRate(currencyCode, fxRates);
  if (!rate) {
    return 0;
  }

  return fiatAmount / rate;
}

export function formatIzeAmount(value: number, fractionDigits: number = IZE_DECIMALS): string {
  return `${value.toFixed(fractionDigits)} ${IZE_SYMBOL}`;
}

// Auction display helper: produces exactly "24.60 1ZE".
// Uppercase suffix, two display decimals, one suffix only.
// Full calculation precision preserved; caller passes the 1ZE amount.
// Stored values, bidding calculations, settlement, and API payloads unchanged.
export function formatAuctionIze(izeAmount: number): string {
  return `${izeAmount.toFixed(2)} 1ZE`;
}

export function formatCoOwnIze(izeAmount: number, fractionDigits: number = 2, locale: string = 'en-GB'): string {
  if (!Number.isFinite(izeAmount)) return `— 1ZE`;
  const sign = izeAmount < 0 ? '−' : '';
  const value = Math.abs(izeAmount).toLocaleString(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${sign}${value} 1ZE`;
}

export function formatFiatAmount(
  value: number,
  currencyCode: SupportedCurrencyCode,
  fractionDigits: number = 2
): string {
  const meta = CURRENCIES[currencyCode];

  try {
    return new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return `${meta.symbol}${value.toFixed(fractionDigits)}`;
  }
}

export interface FormatPriceParams {
  izeAmount: number;
  displayMode: CurrencyDisplayMode;
  currencyCode: SupportedCurrencyCode;
  fxRates?: Partial<FxRates>;
  fiatFractionDigits?: number;
  izeFractionDigits?: number;
}

export function formatPrice({
  izeAmount,
  displayMode,
  currencyCode,
  fxRates,
  fiatFractionDigits = 2,
  izeFractionDigits = IZE_DECIMALS,
}: FormatPriceParams): string {
  if (displayMode === 'ize') {
    return formatIzeAmount(izeAmount, izeFractionDigits);
  }

  const fiatValue = toFiat(izeAmount, currencyCode, fxRates);
  const fiatFormatted = formatFiatAmount(fiatValue, currencyCode, fiatFractionDigits);

  if (displayMode === 'fiat') {
    return fiatFormatted;
  }

  return `${formatIzeAmount(izeAmount, izeFractionDigits)} · ${fiatFormatted}`;
}
