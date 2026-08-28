import { fetchJson } from '../lib/apiClient';
import { DEFAULT_FX_RATES, FxRates } from '../utils/currency';
import { SupportedCurrencyCode } from '../constants/currencies';

export interface OnezeRateEntry {
  rate: number;
  source: string;
  updatedAt: string;
  settlementSupported: boolean;
}

export interface OnezeRatesResponse {
  ok: true;
  anchorCurrency: string;
  anchorValue: number;
  rates: Record<string, OnezeRateEntry>;
  source: string;
  updatedAt: string;
}

export interface OnezeDisplayRates {
  fxRates: FxRates;
  rateSource: string;
  rateUpdatedAt: number;
  settlementCurrencies: Set<string>;
}

export async function fetchOnezeDisplayRates(): Promise<OnezeDisplayRates> {
  try {
    const payload = await fetchJson<OnezeRatesResponse>('/auctions/1ze-rates');

    const fxRates = { ...DEFAULT_FX_RATES };
    const settlementCurrencies = new Set<string>();

    for (const [currency, entry] of Object.entries(payload.rates)) {
      const code = currency as SupportedCurrencyCode;
      if (code in DEFAULT_FX_RATES && Number.isFinite(entry.rate) && entry.rate > 0) {
        fxRates[code] = entry.rate;
        if (entry.settlementSupported) {
          settlementCurrencies.add(code);
        }
      }
    }

    return {
      fxRates,
      rateSource: payload.source,
      rateUpdatedAt: Date.now(),
      settlementCurrencies,
    };
  } catch {
    return {
      fxRates: { ...DEFAULT_FX_RATES },
      rateSource: 'fallback:static',
      rateUpdatedAt: Date.now(),
      settlementCurrencies: new Set(['GBP']),
    };
  }
}
