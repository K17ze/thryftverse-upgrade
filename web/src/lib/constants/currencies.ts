/**
 * Supported wallet/display currencies — ported from native
 * frontend/src/constants/currencies.ts. The registry drives currency
 * pickers (name/locale) and formatting; live FX rates always come from
 * the server (GET /fx/rates, /wallet/fx/quotes) — fxRatePerUnit exists
 * only so fixture-mode surfaces can render a stable demo conversion.
 */

export type SupportedCurrencyCode =
  | 'GBP'
  | 'USD'
  | 'EUR'
  | 'NGN'
  | 'JPY'
  | 'CAD'
  | 'AUD'
  | 'AED'
  | 'INR';

export interface CurrencyMeta {
  code: SupportedCurrencyCode;
  name: string;
  symbol: string;
  locale: string;
  /** Static fixture-only rate (per USD) — never a live quote. */
  fxRatePerUnit: number;
}

export const DEFAULT_CURRENCY_CODE: SupportedCurrencyCode = 'GBP';

export const CURRENCIES: Record<SupportedCurrencyCode, CurrencyMeta> = {
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    locale: 'en-GB',
    fxRatePerUnit: 0.79,
  },
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    locale: 'en-US',
    fxRatePerUnit: 1.0,
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    locale: 'de-DE',
    fxRatePerUnit: 0.92,
  },
  NGN: {
    code: 'NGN',
    name: 'Nigerian Naira',
    symbol: '₦',
    locale: 'en-NG',
    fxRatePerUnit: 760,
  },
  JPY: {
    code: 'JPY',
    name: 'Japanese Yen',
    symbol: '¥',
    locale: 'ja-JP',
    fxRatePerUnit: 151,
  },
  CAD: {
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: '$',
    locale: 'en-CA',
    fxRatePerUnit: 1.36,
  },
  AUD: {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: '$',
    locale: 'en-AU',
    fxRatePerUnit: 1.53,
  },
  AED: {
    code: 'AED',
    name: 'UAE Dirham',
    symbol: 'د.إ',
    locale: 'ar-AE',
    fxRatePerUnit: 3.67,
  },
  INR: {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    locale: 'en-IN',
    fxRatePerUnit: 83.3,
  },
};

export const SUPPORTED_CURRENCY_CODES = Object.keys(
  CURRENCIES,
) as SupportedCurrencyCode[];

export function toSupportedCurrency(code: string): SupportedCurrencyCode | null {
  const upper = code.toUpperCase() as SupportedCurrencyCode;
  return SUPPORTED_CURRENCY_CODES.includes(upper) ? upper : null;
}
