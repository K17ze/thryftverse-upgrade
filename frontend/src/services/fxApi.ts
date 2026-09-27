import { ApiRequestError, fetchJson, isRecord } from '../lib/apiClient';
import { CURRENCIES, type SupportedCurrencyCode } from '../constants/currencies';
import { formatFiatAmount } from '../utils/currency';

// ── Fiat ↔ fiat FX service ────────────────────────────────────────────
// Typed wrappers for the multi-currency wallet FX contract:
//   GET  /fx/rates?base=USD
//   GET  /fx/rates/:base/:quote
//   GET  /wallets/:userId/currency-balances
//   POST /wallet/fx/quotes
//   GET  /wallet/fx/quotes/:quoteId
//   POST /wallet/fx/quotes/:quoteId/execute
// Mirrors the walletApi.ts structure (fetchJson + buildQuery). Money is
// carried as minor-unit strings end-to-end — the client never floats a
// quoted amount back to the server.

export interface FxRateLeg {
  base: string;
  quote: string;
  rate: string;
  source: string;
  observedAt: string;
}

export interface FxRateEntry extends FxRateLeg {
  stale: boolean;
}

export interface FxRatesResponse {
  ok: true;
  rates: FxRateEntry[];
  servedAt: string;
}

export interface FxPairRateResponse {
  ok: true;
  rate: string;
  path: 'direct' | 'inverse' | 'cross';
  legs: FxRateLeg[];
  observedAt: string;
  stale: boolean;
}

export interface WalletCurrencyPocket {
  currency: string;
  balanceMinor: number;
  version: number;
}

export interface CurrencyBalancesResponse {
  ok: true;
  walletId: string;
  onezeBalanceUnits: number;
  fiatCurrency: string;
  fiatBalanceMinor: number;
  balances: WalletCurrencyPocket[];
}

export type FxQuoteFixedSide = 'source' | 'target';

export interface FxQuotePayload {
  id: string;
  sourceCurrency: string;
  targetCurrency: string;
  fixedSide: FxQuoteFixedSide;
  sourceAmountMinor: string;
  targetAmountMinor: string;
  midRate: string;
  customerRate: string;
  spreadBps: number;
  feeMinor: string;
  feeCurrency: string;
  rateSource: string;
  rateObservedAt: string;
  expiresAt: string;
  status: string;
  /** Populated once the quote is executed — the resync path rebuilds the
   *  receipt from these instead of the execute response body. */
  txId: string | null;
  executedAt: string | null;
}

export interface FxQuoteResponse {
  ok: true;
  quote: FxQuotePayload;
}

export interface FxExecutionPayload {
  txId: string;
  debitedSourceMinor: string;
  creditedTargetMinor: string;
  feeMinor: string;
}

export interface FxExecuteResponse {
  ok: true;
  quote: FxQuotePayload;
  execution: FxExecutionPayload;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    search.set(key, String(value));
  });

  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

// The FX contract signals domain failures with { ok:false, error, code,
// details } — e.g. FX_QUOTE_EXPIRED, WALLET_INSUFFICIENT_BALANCE,
// FX_RATE_UNAVAILABLE, WALLET_CAPABILITY_*. Route them through the same
// ApiRequestError channel as HTTP errors so callers can branch on `code`
// via parseApiError instead of treating a failure body as a success.
function assertFxOk<T extends { ok: true }>(payload: T): T {
  if (payload.ok !== true) {
    const body = payload as unknown;
    const message =
      isRecord(body) && typeof body.error === 'string'
        ? body.error
        : 'FX request failed';
    // fetchJson already threw on non-2xx, so an ok:false body arrived on a
    // 2xx transport. Report a concrete server status — the backend's own
    // domain-error default is 409 — so parseApiError/classifyNetworkError
    // keep this a server error instead of a phantom network drop.
    throw new ApiRequestError(message, 409, body);
  }
  return payload;
}

export async function getFxRates(base = 'USD') {
  const query = buildQuery({ base });
  const payload = await fetchJson<FxRatesResponse>(`/fx/rates${query}`);
  return assertFxOk(payload);
}

export async function getFxPairRate(base: string, quote: string) {
  const payload = await fetchJson<FxPairRateResponse>(
    `/fx/rates/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`
  );
  return assertFxOk(payload);
}

export async function getCurrencyBalances(userId: string) {
  const payload = await fetchJson<CurrencyBalancesResponse>(
    `/wallets/${encodeURIComponent(userId)}/currency-balances`
  );
  return assertFxOk(payload);
}

export async function createFxQuote(input: {
  sourceCurrency: string;
  targetCurrency: string;
  fixedSide: FxQuoteFixedSide;
  /** Minor units as a decimal string (e.g. "12345" = £123.45). */
  amountMinor: string;
  idempotencyKey?: string;
  ttlSeconds?: number;
}) {
  const payload = await fetchJson<FxQuoteResponse>('/wallet/fx/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceCurrency: input.sourceCurrency,
      targetCurrency: input.targetCurrency,
      fixedSide: input.fixedSide,
      amountMinor: input.amountMinor,
      idempotencyKey: input.idempotencyKey,
      ttlSeconds: input.ttlSeconds,
    }),
  });
  return assertFxOk(payload);
}

export async function getFxQuote(quoteId: string) {
  const payload = await fetchJson<FxQuoteResponse>(
    `/wallet/fx/quotes/${encodeURIComponent(quoteId)}`
  );
  return assertFxOk(payload);
}

export async function executeFxQuote(quoteId: string) {
  const payload = await fetchJson<FxExecuteResponse>(
    `/wallet/fx/quotes/${encodeURIComponent(quoteId)}/execute`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
  return assertFxOk(payload);
}

// ── Minor-unit helpers ────────────────────────────────────────────────
// The FX contract carries amounts as minor-unit integers (pence, cents).
// ISO-4217 minor-unit exponents: the 0-dp and 3-dp sets override the
// 2-dp default used by everything else.
const MINOR_EXPONENT_OVERRIDES: Record<string, number> = {
  // 0 decimal places
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // 3 decimal places
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};

export function currencyMinorExponent(currency: string): number {
  return MINOR_EXPONENT_OVERRIDES[currency.toUpperCase()] ?? 2;
}

/** Major units (what the user types) → minor-unit string for the API. */
export function majorToMinorUnits(majorAmount: number, currency: string): string {
  const exponent = currencyMinorExponent(currency);
  return String(Math.round(majorAmount * Math.pow(10, exponent)));
}

/** Minor-unit string/number from the API → major units for display. */
export function minorUnitsToMajor(minor: string | number, currency: string): number {
  const exponent = currencyMinorExponent(currency);
  const value = typeof minor === 'string' ? Number(minor) : minor;
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value / Math.pow(10, exponent);
}

/**
 * Format a minor-unit amount for display. Uses the CURRENCIES meta symbol
 * and locale when the currency is one of the nine supported codes; falls
 * back to "123.45 CODE" for anything the registry does not know.
 */
export function formatMinorAmount(minor: string | number, currency: string): string {
  const meta = CURRENCIES[currency.toUpperCase() as SupportedCurrencyCode];
  const major = minorUnitsToMajor(minor, currency);
  const digits = currencyMinorExponent(currency);
  if (meta) {
    return formatFiatAmount(major, meta.code, digits);
  }
  return `${major.toFixed(digits)} ${currency}`;
}
