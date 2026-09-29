/**
 * Fiat ↔ fiat FX service — web port of native services/fxApi.ts.
 * Typed wrappers for the multi-currency wallet contract:
 *   GET  /fx/rates?base=USD
 *   GET  /fx/rates/:base/:quote
 *   GET  /wallets/:userId/currency-balances
 *   POST /wallet/fx/quotes
 *   GET  /wallet/fx/quotes/:quoteId
 *   POST /wallet/fx/quotes/:quoteId/execute
 *
 * Money travels as minor-unit strings end-to-end — the client never
 * floats a quoted amount back to the server.
 */

import { ApiRequestError, fetchJson, isRecord } from '../http';
import { CURRENCIES, type SupportedCurrencyCode } from '@/lib/constants/currencies';

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
  /** Populated once executed — the resync path rebuilds the receipt from
   *  these instead of the execute response body. */
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

// The FX contract signals domain failures with { ok:false, error, code,
// details } — FX_QUOTE_EXPIRED, WALLET_INSUFFICIENT_BALANCE,
// FX_RATE_UNAVAILABLE, WALLET_CAPABILITY_*. An ok:false body on a 2xx
// transport must throw as a server error so parseApiError can branch on
// `code` (mirrors the backend's own 409 domain-error default).
function assertFxOk<T extends { ok: true }>(payload: T): T {
  if (payload.ok !== true) {
    const body = payload as unknown;
    const message =
      isRecord(body) && typeof body.error === 'string'
        ? body.error
        : 'FX request failed';
    throw new ApiRequestError(message, 409, body);
  }
  return payload;
}

export async function getFxRates(base = 'USD', signal?: AbortSignal) {
  const payload = await fetchJson<FxRatesResponse>(
    `/fx/rates?base=${encodeURIComponent(base)}`,
    undefined,
    { signal },
  );
  return assertFxOk(payload);
}

export async function getFxPairRate(
  base: string,
  quote: string,
  signal?: AbortSignal,
) {
  const payload = await fetchJson<FxPairRateResponse>(
    `/fx/rates/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`,
    undefined,
    { signal },
  );
  return assertFxOk(payload);
}

/** The wallet's currency pockets — the default fiat pocket plus every
 *  funded foreign-currency pocket (ledger-backed). */
export async function getCurrencyBalances(
  userId: string,
  signal?: AbortSignal,
) {
  const payload = await fetchJson<CurrencyBalancesResponse>(
    `/wallets/${encodeURIComponent(userId)}/currency-balances`,
    undefined,
    { signal },
  );
  return assertFxOk(payload);
}

export async function createFxQuote(
  input: {
    sourceCurrency: string;
    targetCurrency: string;
    fixedSide: FxQuoteFixedSide;
    /** Minor units as a decimal string (e.g. "12345" = £123.45). */
    amountMinor: string;
    idempotencyKey?: string;
    ttlSeconds?: number;
  },
  signal?: AbortSignal,
) {
  const payload = await fetchJson<FxQuoteResponse>(
    '/wallet/fx/quotes',
    {
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
    },
    { signal },
  );
  return assertFxOk(payload);
}

export async function getFxQuote(quoteId: string, signal?: AbortSignal) {
  const payload = await fetchJson<FxQuoteResponse>(
    `/wallet/fx/quotes/${encodeURIComponent(quoteId)}`,
    undefined,
    { signal },
  );
  return assertFxOk(payload);
}

/** Execute is idempotent by quote id — retrying a committed quote
 *  returns the stored execution rather than debiting the pocket twice. */
export async function executeFxQuote(quoteId: string) {
  const payload = await fetchJson<FxExecuteResponse>(
    `/wallet/fx/quotes/${encodeURIComponent(quoteId)}/execute`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    // A money write — never silently retried as a fresh attempt; the
    // quote id is the dedupe handle for a deliberate retry.
    { maxRetries: 0 },
  );
  return assertFxOk(payload);
}

// ── Beneficiaries + transfers (send money) ─────────────────────────
// Route contract (backend/api/src/routes/fxWallet.ts):
//   POST   /users/:userId/beneficiaries          → 201 {ok, beneficiary}
//   GET    /users/:userId/beneficiaries          → {ok, beneficiaries[]}
//   DELETE /users/:userId/beneficiaries/:id      → {ok, beneficiary}
//   POST   /transfers                            → 201 {ok, replayed, transfer}
//   GET    /transfers?limit                      → {ok, transfers[]} newest-first
//   GET    /transfers/:id                        → {ok, transfer}
//   POST   /transfers/:id/cancel                 → {ok, transfer}
// All money fields are minor-unit strings; all mutations here are money
// writes — maxRetries 0 so a transport failure never silently fires a
// second attempt (transfer retries go through the idempotency key).

export type BeneficiaryAccountType =
  | 'iban'
  | 'sort_code'
  | 'aba'
  | 'ifsc'
  | 'swift_code'
  | 'local_account';

export interface BeneficiaryFieldCheck {
  field: string;
  result: 'pass' | 'fail';
  detail: string;
}

/** Mirror of serializeBeneficiary — createdAt/updatedAt can be null when
 *  a timestamp can't be normalised. */
export interface BeneficiaryPayload {
  id: string;
  userId: string;
  displayName: string;
  legalName: string | null;
  countryCode: string;
  currency: string;
  accountType: string;
  fields: Record<string, unknown>;
  validation: Record<string, unknown>;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BeneficiariesResponse {
  ok: true;
  beneficiaries: BeneficiaryPayload[];
}

export interface BeneficiaryResponse {
  ok: true;
  beneficiary: BeneficiaryPayload;
}

export interface CreateBeneficiaryInput {
  displayName: string;
  legalName?: string;
  countryCode: string;
  currency: string;
  accountType: BeneficiaryAccountType;
  fields: Record<string, unknown>;
}

/** Mirror of serializeTransfer — minor units are strings end-to-end.
 *  `state` is rendered verbatim; TRANSFER_CANCELLABLE_STATES below is the
 *  server-side gate (fxWallet.ts) mirrored for the cancel affordance. */
export interface TransferPayload {
  id: string;
  userId: string;
  walletId: string;
  fxQuoteId: string | null;
  beneficiaryId: string | null;
  sourceCurrency: string;
  sourceAmountMinor: string;
  targetCurrency: string;
  targetAmountMinor: string;
  state: string;
  rail: string | null;
  railRef: string | null;
  uetr: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  idempotencyKey: string | null;
  txId: string | null;
  fundedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransfersResponse {
  ok: true;
  transfers: TransferPayload[];
}

export interface TransferResponse {
  ok: true;
  transfer: TransferPayload;
}

export interface CreateTransferResponse {
  ok: true;
  /** true when the idempotency key replayed an already-committed row —
   *  no money moved twice. */
  replayed: boolean;
  transfer: TransferPayload;
}

/** States the server accepts POST /transfers/:id/cancel for
 *  (fxWallet.ts TRANSFER_CANCELLABLE_STATES). Funded rows are refunded
 *  to the target-currency pocket on cancel. */
export const TRANSFER_CANCELLABLE_STATES: ReadonlySet<string> = new Set([
  'QUOTE',
  'AWAITING_FUNDS',
  'FUNDED',
  'PROCESSING',
]);

export async function getBeneficiaries(userId: string, signal?: AbortSignal) {
  const payload = await fetchJson<BeneficiariesResponse>(
    `/users/${encodeURIComponent(userId)}/beneficiaries`,
    undefined,
    { signal },
  );
  return assertFxOk(payload);
}

export async function createBeneficiary(
  userId: string,
  input: CreateBeneficiaryInput,
) {
  const payload = await fetchJson<BeneficiaryResponse>(
    `/users/${encodeURIComponent(userId)}/beneficiaries`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: input.displayName,
        legalName: input.legalName,
        countryCode: input.countryCode,
        currency: input.currency,
        accountType: input.accountType,
        fields: input.fields,
      }),
    },
    // The route has no idempotency key — a retry would mint a duplicate
    // recipient row, so never auto-replay this write.
    { maxRetries: 0 },
  );
  return assertFxOk(payload);
}

export async function deleteBeneficiary(userId: string, beneficiaryId: string) {
  const payload = await fetchJson<BeneficiaryResponse>(
    `/users/${encodeURIComponent(userId)}/beneficiaries/${encodeURIComponent(beneficiaryId)}`,
    { method: 'DELETE' },
    { maxRetries: 0 },
  );
  return assertFxOk(payload);
}

export async function getTransfers(limit = 50, signal?: AbortSignal) {
  const payload = await fetchJson<TransfersResponse>(
    `/transfers?limit=${encodeURIComponent(limit)}`,
    undefined,
    { signal },
  );
  return assertFxOk(payload);
}

/**
 * Create a transfer. Either `quoteId` (cross-currency — the quote's
 * targetCurrency must equal the beneficiary currency; the embedded FX
 * executes inside the transfer transaction) or `sourceCurrency` +
 * `sourceAmountMinor` (same-currency only).
 *
 * The caller owns `idempotencyKey`: retries after a dropped response MUST
 * reuse it so the server replays the committed row instead of debiting
 * twice (replayed → { replayed: true }).
 */
export async function createTransfer(input: {
  beneficiaryId: string;
  quoteId?: string;
  sourceCurrency?: string;
  /** Minor units as a decimal string. */
  sourceAmountMinor?: string;
  idempotencyKey?: string;
}) {
  const payload = await fetchJson<CreateTransferResponse>(
    '/transfers',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beneficiaryId: input.beneficiaryId,
        quoteId: input.quoteId,
        sourceCurrency: input.sourceCurrency,
        sourceAmountMinor: input.sourceAmountMinor,
        idempotencyKey: input.idempotencyKey,
      }),
    },
    // Money write — never an automatic fresh retry.
    { maxRetries: 0 },
  );
  return assertFxOk(payload);
}

export async function cancelTransfer(transferId: string) {
  const payload = await fetchJson<TransferResponse>(
    `/transfers/${encodeURIComponent(transferId)}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    { maxRetries: 0 },
  );
  return assertFxOk(payload);
}

// ── Minor-unit helpers ──────────────────────────────────────────────
// ISO-4217 minor-unit exponents: the 0-dp and 3-dp sets override the
// 2-dp default used by everything else.
const MINOR_EXPONENT_OVERRIDES: Record<string, number> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
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
export function minorUnitsToMajor(
  minor: string | number,
  currency: string,
): number {
  const exponent = currencyMinorExponent(currency);
  const value = typeof minor === 'string' ? Number(minor) : minor;
  if (!Number.isFinite(value)) return 0;
  return value / Math.pow(10, exponent);
}

/**
 * Format a minor-unit amount for display. Intl carries the symbol and
 * exponent for every ISO-4217 code; the CURRENCIES registry supplies the
 * display locale for the supported set, en-GB otherwise.
 */
export function formatMinorAmount(
  minor: string | number,
  currency: string,
): string {
  const meta = CURRENCIES[currency.toUpperCase() as SupportedCurrencyCode];
  const major = minorUnitsToMajor(minor, currency);
  const digits = currencyMinorExponent(currency);
  if (meta) {
    return new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: meta.code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(major);
  }
  return `${major.toFixed(digits)} ${currency.toUpperCase()}`;
}

/** Customer rate display — significant digits so tiny JPY-side rates
 *  stay legible (mirrors native formatRateValue). */
export function formatRateValue(rate: string): string {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) return rate;
  return value.toLocaleString('en-GB', { maximumSignificantDigits: 6 });
}

/**
 * Server timestamps arrive as ISO-8601; older rows may still come back as
 * PG text ('YYYY-MM-DD HH:MM:SS.ffffff+TZ'). Normalise the space
 * separator, expand a bare-hour offset, and assume UTC when no zone
 * designator is present. Returns epoch ms, or NaN for unparseable input.
 */
export function parseServerTimestamp(value: string | null | undefined): number {
  if (!value) return NaN;
  let normalized = value.trim().replace(' ', 'T');
  if (normalized.includes('T') && /[+-]\d{2}$/.test(normalized)) {
    normalized += ':00';
  } else if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized)) {
    normalized += 'Z';
  }
  return Date.parse(normalized);
}
