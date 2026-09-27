/**
 * FX engine — fiat↔fiat exchange-rate resolution, guaranteed-rate quotes,
 * and atomic quote execution against the multi-currency wallet pockets.
 *
 * Rate resolution order (resolveExchangeRate):
 *   a) direct pair — freshest row across fx_rates ticks and
 *      oneze_internal_fx_rates (fresh beats stale; within one staleness
 *      class the fresher observation wins, ticks break a tie)
 *   b) inverse of either store (same freshness selection)
 *   c) USD cross — base→USD × USD→target from the best legs of the above
 *   d) FX_RATE_UNAVAILABLE
 *
 * Money math is BigInt-only (lib/money.ts); exchange rates are decimal
 * strings carried at up to 12 fractional digits — never floats.
 *
 * Lock discipline for execution (mirrors walletMoneyPath.ts):
 *   1. fx_quotes row FOR UPDATE   (only this engine ever locks quote rows,
 *                                  so it cannot cycle with wallet locks)
 *   2. wallets row FOR UPDATE
 *   3. wallet_currency_balances rows FOR UPDATE in sorted currency order
 * All writes run on the caller's transaction. No function here performs
 * external fetches — callers sync fx_rates ticks out-of-band.
 */
import {
  createApiError,
  createRuntimeId,
  type DbQueryable,
} from './workerHelpers.js';
import {
  convertMoneyByDecimalRate,
  moneyFromMinor,
  normalizeCurrencyCode,
  MAX_CANONICAL_MINOR_AMOUNT,
} from './money.js';
import {
  applyWalletLedgerDelta,
  assertSpendableFiatMinor,
  hashWalletIdempotencyPayload,
  lockCurrencyBalanceRowsForUpdate,
} from './walletMoneyPath.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** A rate observation older than this is reported as stale. */
export const FX_RATE_STALENESS_MS = 30 * 60 * 1000;
/** Default guaranteed-rate window for persisted quotes. */
export const FX_QUOTE_DEFAULT_TTL_SECONDS = 60;
/** Max accepted quote TTL — guaranteed rates cannot be held open indefinitely. */
export const FX_QUOTE_MAX_TTL_SECONDS = 3600;

const FX_RATE_DECIMALS = 12;
const FX_RATE_SCALE = 10n ** BigInt(FX_RATE_DECIMALS);
const BPS_DENOMINATOR = 10_000n;
const FX_CROSS_PIVOT_CURRENCY = 'USD';

// ─── Decimal-rate helpers (BigInt, ≤12dp) ────────────────────────────────────

interface ParsedDecimalRate {
  /** rate = numerator / scale (scale is a power of 10). */
  numerator: bigint;
  scale: bigint;
}

function parseDecimalRate(raw: string, field: string): ParsedDecimalRate {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(raw).trim());
  if (!match) {
    throw createApiError('FX_RATE_INVALID', 'Stored FX rate is not a positive decimal string', {
      field,
      value: raw,
    });
  }
  const fraction = match[2] ?? '';
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(match[1]) * scale + BigInt(fraction || '0');
  if (numerator <= 0n) {
    throw createApiError('FX_RATE_INVALID', 'Stored FX rate must be positive', { field, value: raw });
  }
  return { numerator, scale };
}

/** Render `value` (an integer scaled by 10^decimals) as a trimmed decimal string. */
function scaledToDecimalString(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale)
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
}

/** 1 / rate, rounded half-up at 12 decimal places. */
export function invertDecimalRate(rate: string): string {
  const { numerator, scale } = parseDecimalRate(rate, 'rate');
  const scaledInverse = (scale * FX_RATE_SCALE + numerator / 2n) / numerator;
  if (scaledInverse <= 0n) {
    throw createApiError('FX_RATE_INVALID', 'FX rate inversion produced a non-positive rate', { rate });
  }
  return scaledToDecimalString(scaledInverse, FX_RATE_DECIMALS);
}

/** a × b for decimal-string rates, rounded half-up at 12 decimal places. */
export function multiplyDecimalRates(a: string, b: string): string {
  const left = parseDecimalRate(a, 'left');
  const right = parseDecimalRate(b, 'right');
  const numerator = left.numerator * right.numerator;
  const denominator = left.scale * right.scale;
  const scaled = (numerator * FX_RATE_SCALE + denominator / 2n) / denominator;
  if (scaled <= 0n) {
    throw createApiError('FX_RATE_INVALID', 'FX rate multiplication produced a non-positive rate', {
      left: a,
      right: b,
    });
  }
  return scaledToDecimalString(scaled, FX_RATE_DECIMALS);
}

/** rate × (1 - spreadBps/10000), rounded half-up at 12 decimal places. */
function applySpreadBpsToRate(rate: string, spreadBps: number): string {
  const { numerator, scale } = parseDecimalRate(rate, 'rate');
  const numeratorAfterSpread = numerator * (BPS_DENOMINATOR - BigInt(spreadBps));
  const denominator = scale * BPS_DENOMINATOR;
  const scaled = (numeratorAfterSpread * FX_RATE_SCALE + denominator / 2n) / denominator;
  if (scaled <= 0n) {
    throw createApiError('FX_RATE_INVALID', 'FX spread consumed the entire rate', {
      rate,
      spreadBps,
    });
  }
  return scaledToDecimalString(scaled, FX_RATE_DECIMALS);
}

/** round(amount × bps / 10000) half-up — same convention as allocateMoneyByBasisPoints. */
function feeForAmount(amountMinor: bigint, spreadBps: number): bigint {
  return (amountMinor * BigInt(spreadBps) + BPS_DENOMINATOR / 2n) / BPS_DENOMINATOR;
}

/** BigInt-safe wrapper over convertMoneyByDecimalRate; ≤0 in → 0 out. */
function convertMinorByRate(
  amountMinor: bigint,
  sourceCurrency: string,
  targetCurrency: string,
  decimalRate: string
): bigint {
  if (amountMinor <= 0n) {
    return 0n;
  }
  try {
    const converted = convertMoneyByDecimalRate(
      moneyFromMinor(sourceCurrency, amountMinor),
      targetCurrency,
      decimalRate
    );
    return BigInt(converted.minorAmount);
  } catch (error) {
    throw createApiError(
      'FX_AMOUNT_INVALID',
      'Amount cannot be represented at this rate in the target currency',
      {
        sourceCurrency,
        targetCurrency,
        rate: decimalRate,
        cause: error instanceof Error ? error.message : String(error),
      }
    );
  }
}

/**
 * normalizeCurrencyCode throws MoneyValidationError (no statusCode → the
 * global handler would 500 it). FX callers get a proper 400 code instead.
 */
function normalizeFxCurrency(raw: string, field: string): string {
  try {
    return normalizeCurrencyCode(raw);
  } catch {
    throw createApiError('FX_CURRENCY_INVALID', 'Unsupported ISO 4217 currency', {
      field,
      currency: raw,
    });
  }
}

function parseAmountMinor(raw: bigint | string): bigint {
  let parsed: bigint;
  try {
    parsed = typeof raw === 'bigint' ? raw : BigInt(String(raw).trim());
  } catch {
    throw createApiError('FX_AMOUNT_INVALID', 'amountMinor must be an integer minor-unit amount');
  }
  if (parsed <= 0n) {
    throw createApiError('FX_AMOUNT_INVALID', 'amountMinor must be positive');
  }
  return parsed;
}

function toSafeLedgerNumber(amountMinor: bigint, field: string): number {
  if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw createApiError('FX_AMOUNT_INVALID', 'Amount exceeds the safe-integer ledger range', {
      field,
      amountMinor: amountMinor.toString(),
    });
  }
  return Number(amountMinor);
}

// ─── Rate stores ─────────────────────────────────────────────────────────────

export interface FxRateLeg {
  base: string;
  quote: string;
  rate: string;
  source: string;
  observedAt: string | null;
  /** true when this leg is the stored pair used inverted. */
  usedInverse: boolean;
}

export type FxRatePath = 'direct' | 'inverse' | 'cross';

export interface ResolvedExchangeRate {
  baseCurrency: string;
  targetCurrency: string;
  /** Decimal-string mid rate: target units per 1 source unit. */
  rate: string;
  path: FxRatePath;
  legs: FxRateLeg[];
  /** Oldest leg observation — the composite is only as fresh as its stalest leg. */
  observedAt: string | null;
  stale: boolean;
  source: string;
}

interface StoredRateRow {
  rate: string;
  source: string;
  observedAt: string;
}

async function latestTickRate(
  client: DbQueryable,
  base: string,
  quote: string
): Promise<StoredRateRow | null> {
  const result = await client.query<{ rate: string; source: string; observed_at: string }>(
    `
      SELECT rate::text, source, observed_at::text
      FROM fx_rates
      WHERE base = $1
        AND quote = $2
      ORDER BY observed_at DESC, id DESC
      LIMIT 1
    `,
    [base, quote]
  );
  const row = result.rows[0];
  return row
    ? { rate: row.rate, source: row.source, observedAt: toIsoTimestamp(row.observed_at) ?? row.observed_at }
    : null;
}

async function internalRate(
  client: DbQueryable,
  base: string,
  quote: string
): Promise<StoredRateRow | null> {
  const result = await client.query<{ rate: string; source: string; updated_at: string }>(
    `
      SELECT rate::text, source, updated_at::text
      FROM oneze_internal_fx_rates
      WHERE base_currency = $1
        AND quote_currency = $2
      LIMIT 1
    `,
    [base, quote]
  );
  const row = result.rows[0];
  return row
    ? { rate: row.rate, source: row.source, observedAt: toIsoTimestamp(row.updated_at) ?? row.updated_at }
    : null;
}

/** Milliseconds since epoch for a stored observation; missing → -Infinity (never fresher). */
function observedAtMs(row: StoredRateRow): number {
  if (!row.observedAt) {
    return Number.NEGATIVE_INFINITY;
  }
  const ms = parseDbTimestampMs(row.observedAt);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/** Same staleness rule as legIsStale, applied to a stored rate row. */
function storedRateIsStale(row: StoredRateRow): boolean {
  if (row.source === 'seed') {
    return true;
  }
  const ms = observedAtMs(row);
  return Number.isFinite(ms) && Date.now() - ms > FX_RATE_STALENESS_MS;
}

/**
 * Direct lookup across the tick store and the internal store. Both stores
 * are probed and the fresher row wins: a stale tick must not mask a fresh
 * operator override (/admin/1ze/fx-rate writes the internal store), and a
 * stale internal row must not mask a fresh provider tick. When both are in
 * the same staleness class the fresher observation is preferred, with the
 * tick keeping precedence on an exact tie.
 */
async function findDirectRate(
  client: DbQueryable,
  base: string,
  quote: string
): Promise<StoredRateRow | null> {
  const tick = await latestTickRate(client, base, quote);
  const internal = await internalRate(client, base, quote);
  if (!tick || !internal) {
    return tick ?? internal;
  }

  const tickStale = storedRateIsStale(tick);
  const internalStale = storedRateIsStale(internal);
  if (tickStale !== internalStale) {
    return tickStale ? internal : tick;
  }
  return observedAtMs(internal) > observedAtMs(tick) ? internal : tick;
}

/**
 * One conversion hop: direct stored pair, else the inverted reverse pair.
 * Returns the leg in stored orientation plus the effective forward rate.
 */
async function resolveRateHop(
  client: DbQueryable,
  from: string,
  to: string
): Promise<{ leg: FxRateLeg; effectiveRate: string } | null> {
  const direct = await findDirectRate(client, from, to);
  if (direct) {
    return {
      leg: {
        base: from,
        quote: to,
        rate: direct.rate,
        source: direct.source,
        observedAt: direct.observedAt,
        usedInverse: false,
      },
      effectiveRate: direct.rate,
    };
  }

  const reverse = await findDirectRate(client, to, from);
  if (reverse) {
    return {
      leg: {
        base: to,
        quote: from,
        rate: reverse.rate,
        source: reverse.source,
        observedAt: reverse.observedAt,
        usedInverse: true,
      },
      effectiveRate: invertDecimalRate(reverse.rate),
    };
  }

  return null;
}

/**
 * Postgres timestamptz::text arrives as '2026-09-23 14:22:10.123456+00' —
 * Date.parse does not reliably accept the space separator or the 2-digit
 * offset across engines, so normalize to ISO before parsing.
 */
function parseDbTimestampMs(value: string): number {
  const iso = value.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  return Date.parse(iso);
}

/**
 * Emit a strict ISO-8601 timestamp for API consumers. Postgres
 * timestamptz::text arrives as '2026-09-23 14:22:10.123456+00' — the same
 * normalization parseDbTimestampMs applies makes it parse reliably, and
 * toISOString renders the canonical '…Z' form Hermes accepts.
 */
export function toIsoTimestamp(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return new Date(parseDbTimestampMs(value)).toISOString();
}

function legIsStale(leg: FxRateLeg): boolean {
  if (leg.source === 'seed') {
    return true;
  }
  if (!leg.observedAt) {
    return false;
  }
  const observedMs = parseDbTimestampMs(leg.observedAt);
  return Number.isFinite(observedMs) && Date.now() - observedMs > FX_RATE_STALENESS_MS;
}

function oldestObservedAt(legs: readonly FxRateLeg[]): string | null {
  let oldest: string | null = null;
  let oldestMs = Number.POSITIVE_INFINITY;
  for (const leg of legs) {
    if (!leg.observedAt) {
      continue;
    }
    const ms = parseDbTimestampMs(leg.observedAt);
    if (Number.isFinite(ms) && ms < oldestMs) {
      oldestMs = ms;
      oldest = leg.observedAt;
    }
  }
  return oldest;
}

/**
 * Resolve the mid market rate for base→target. See the module header for the
 * resolution order. `stale` is true when any contributing leg is older than
 * FX_RATE_STALENESS_MS or was seeded (source 'seed') rather than observed.
 */
export async function resolveExchangeRate(
  client: DbQueryable,
  baseCurrency: string,
  targetCurrency: string
): Promise<ResolvedExchangeRate> {
  const base = normalizeFxCurrency(baseCurrency, 'baseCurrency');
  const target = normalizeFxCurrency(targetCurrency, 'targetCurrency');

  if (base === target) {
    return {
      baseCurrency: base,
      targetCurrency: target,
      rate: '1',
      path: 'direct',
      legs: [],
      observedAt: null,
      stale: false,
      source: 'identity',
    };
  }

  // (a) — direct: freshest row across the tick and internal stores.
  const direct = await findDirectRate(client, base, target);
  if (direct) {
    const leg: FxRateLeg = {
      base,
      quote: target,
      rate: direct.rate,
      source: direct.source,
      observedAt: direct.observedAt,
      usedInverse: false,
    };
    return {
      baseCurrency: base,
      targetCurrency: target,
      rate: direct.rate,
      path: 'direct',
      legs: [leg],
      observedAt: direct.observedAt,
      stale: legIsStale(leg),
      source: direct.source,
    };
  }

  // (b) — inverse: same freshness-aware selection on the reverse pair.
  const reverse = await findDirectRate(client, target, base);
  if (reverse) {
    const leg: FxRateLeg = {
      base: target,
      quote: base,
      rate: reverse.rate,
      source: reverse.source,
      observedAt: reverse.observedAt,
      usedInverse: true,
    };
    return {
      baseCurrency: base,
      targetCurrency: target,
      rate: invertDecimalRate(reverse.rate),
      path: 'inverse',
      legs: [leg],
      observedAt: reverse.observedAt,
      stale: legIsStale(leg),
      source: `${reverse.source}:inverse`,
    };
  }

  // (c) — USD cross: base→USD × USD→target, each hop direct-then-inverse.
  if (base !== FX_CROSS_PIVOT_CURRENCY && target !== FX_CROSS_PIVOT_CURRENCY) {
    const firstHop = await resolveRateHop(client, base, FX_CROSS_PIVOT_CURRENCY);
    const secondHop = await resolveRateHop(client, FX_CROSS_PIVOT_CURRENCY, target);
    if (firstHop && secondHop) {
      const legs = [firstHop.leg, secondHop.leg];
      return {
        baseCurrency: base,
        targetCurrency: target,
        rate: multiplyDecimalRates(firstHop.effectiveRate, secondHop.effectiveRate),
        path: 'cross',
        legs,
        observedAt: oldestObservedAt(legs),
        stale: legs.some(legIsStale),
        source: `cross:${firstHop.leg.source}${firstHop.leg.usedInverse ? ':inverse' : ''}`
          + `+${secondHop.leg.source}${secondHop.leg.usedInverse ? ':inverse' : ''}`,
      };
    }
  }

  // (d) — no path.
  throw createApiError('FX_RATE_UNAVAILABLE', `No exchange rate available for ${base}/${target}`, {
    baseCurrency: base,
    targetCurrency: target,
  });
}

// ─── Conversion quote math ───────────────────────────────────────────────────

export interface FxConversionComputation {
  walletId: string | null;
  userId: string;
  sourceCurrency: string;
  targetCurrency: string;
  fixedSide: 'source' | 'target';
  /** Total source minor units the debit leg consumes (fee included). */
  sourceAmountMinor: string;
  /** Exact target minor units the credit leg delivers. */
  targetAmountMinor: string;
  midRate: string;
  /** mid × (1 - spreadBps/10000) — spend source, receive less target. */
  customerRate: string;
  spreadBps: number;
  /** Explicit fee in SOURCE currency, carved out before conversion. */
  feeMinor: string;
  feeCurrency: string;
  rate: ResolvedExchangeRate;
}

function assertValidSpreadBps(spreadBps: number): void {
  if (!Number.isInteger(spreadBps) || spreadBps < 0 || spreadBps >= 10_000) {
    throw createApiError('FX_SPREAD_INVALID', 'spreadBps must be an integer from 0 to 9999', {
      spreadBps,
    });
  }
}

/**
 * Compute a conversion quote. Pure reads + deterministic math — it never
 * writes. For fixedSide 'source' the amount is the total source spend (fee
 * carved out before conversion); for 'target' the amount is the exact target
 * credit and the minimal source gross is solved by binary search.
 */
export async function quoteConversion(
  client: DbQueryable,
  input: {
    walletId?: string;
    userId: string;
    sourceCurrency: string;
    targetCurrency: string;
    fixedSide: 'source' | 'target';
    amountMinor: bigint | string;
    spreadBps: number;
  }
): Promise<FxConversionComputation> {
  const sourceCurrency = normalizeFxCurrency(input.sourceCurrency, 'sourceCurrency');
  const targetCurrency = normalizeFxCurrency(input.targetCurrency, 'targetCurrency');

  if (sourceCurrency === targetCurrency) {
    throw createApiError('FX_SAME_CURRENCY', 'Source and target currency must differ', {
      currency: sourceCurrency,
    });
  }
  if (input.fixedSide !== 'source' && input.fixedSide !== 'target') {
    throw createApiError('FX_FIXED_SIDE_INVALID', "fixedSide must be 'source' or 'target'", {
      fixedSide: input.fixedSide,
    });
  }
  assertValidSpreadBps(input.spreadBps);
  const amount = parseAmountMinor(input.amountMinor);

  const resolved = await resolveExchangeRate(client, sourceCurrency, targetCurrency);
  const midRate = resolved.rate;
  const spreadBps = input.spreadBps;

  let sourceAmountMinor: bigint;
  let targetAmountMinor: bigint;
  let feeMinor: bigint;

  if (input.fixedSide === 'source') {
    sourceAmountMinor = amount;
    feeMinor = feeForAmount(amount, spreadBps);
    const netSource = amount - feeMinor;
    targetAmountMinor = convertMinorByRate(netSource, sourceCurrency, targetCurrency, midRate);
    if (targetAmountMinor <= 0n) {
      throw createApiError('FX_AMOUNT_INVALID', 'Conversion yields less than one target minor unit', {
        sourceCurrency,
        targetCurrency,
        amountMinor: amount.toString(),
        midRate,
      });
    }
  } else {
    targetAmountMinor = amount;
    // Minimal source gross G such that convert(G - fee(G)) ≥ target.
    // Estimate via the inverted mid rate, then bracket and binary search —
    // deterministic, BigInt-only, and immune to rate magnitude. Probes above
    // the canonical minor ceiling evaluate the ceiling instead — a valid
    // lower bound that keeps the predicate monotone without overflowing
    // moneyFromMinor.
    const convertedForGross = (gross: bigint): bigint => {
      const probe = gross > MAX_CANONICAL_MINOR_AMOUNT ? MAX_CANONICAL_MINOR_AMOUNT : gross;
      return convertMinorByRate(
        probe - feeForAmount(probe, spreadBps),
        sourceCurrency,
        targetCurrency,
        midRate
      );
    };
    const inverseMid = invertDecimalRate(midRate);
    const estimatedNet = convertMinorByRate(amount, targetCurrency, sourceCurrency, inverseMid);
    let hi = estimatedNet > 0n
      ? (estimatedNet * BPS_DENOMINATOR + (BPS_DENOMINATOR - BigInt(spreadBps) - 1n))
        / (BPS_DENOMINATOR - BigInt(spreadBps))
      : 1n;
    if (hi <= 0n) {
      hi = 1n;
    }
    const hardLimit = MAX_CANONICAL_MINOR_AMOUNT * 10n;
    while (convertedForGross(hi) < targetAmountMinor) {
      hi *= 2n;
      if (hi > hardLimit) {
        throw createApiError('FX_AMOUNT_INVALID', 'Target amount requires an out-of-range source amount', {
          sourceCurrency,
          targetCurrency,
          targetAmountMinor: amount.toString(),
          midRate,
        });
      }
    }
    let lo = 1n;
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      if (convertedForGross(mid) >= targetAmountMinor) {
        hi = mid;
      } else {
        lo = mid + 1n;
      }
    }
    sourceAmountMinor = lo;
    feeMinor = feeForAmount(sourceAmountMinor, spreadBps);
  }

  return {
    walletId: input.walletId ?? null,
    userId: input.userId,
    sourceCurrency,
    targetCurrency,
    fixedSide: input.fixedSide,
    sourceAmountMinor: sourceAmountMinor.toString(),
    targetAmountMinor: targetAmountMinor.toString(),
    midRate,
    customerRate: applySpreadBpsToRate(midRate, spreadBps),
    spreadBps,
    feeMinor: feeMinor.toString(),
    feeCurrency: sourceCurrency,
    rate: resolved,
  };
}

// ─── Persisted quotes ────────────────────────────────────────────────────────

export type FxQuoteStatus = 'open' | 'executed' | 'expired' | 'cancelled';

export interface FxQuoteRecord {
  id: string;
  userId: string;
  walletId: string;
  sourceCurrency: string;
  targetCurrency: string;
  fixedSide: 'source' | 'target';
  sourceAmountMinor: string;
  targetAmountMinor: string;
  midRate: string;
  customerRate: string;
  spreadBps: number;
  feeMinor: string;
  feeCurrency: string | null;
  rateSource: string;
  rateObservedAt: string;
  /** true when the rate resolved at quote time was stale (see createFxQuote). */
  rateStale: boolean;
  status: FxQuoteStatus;
  idempotencyKey: string | null;
  txId: string | null;
  expiresAt: string;
  executedAt: string | null;
  createdAt: string;
}

interface FxQuoteRow {
  id: string;
  user_id: string;
  wallet_id: string;
  source_currency: string;
  target_currency: string;
  fixed_side: 'source' | 'target';
  source_amount_minor: string;
  target_amount_minor: string;
  mid_rate: string;
  customer_rate: string;
  spread_bps: number;
  fee_minor: string;
  fee_currency: string | null;
  rate_source: string;
  rate_observed_at: string;
  rate_stale: boolean;
  status: FxQuoteStatus;
  idempotency_key: string | null;
  request_hash: string | null;
  tx_id: string | null;
  expires_at: string;
  executed_at: string | null;
  created_at: string;
  /** Server-clock expiry flag — avoids JS parsing of timestamptz::text. */
  unexpired: boolean;
}

const FX_QUOTE_COLUMNS = `
  id,
  user_id,
  wallet_id,
  source_currency,
  target_currency,
  fixed_side,
  source_amount_minor::text AS source_amount_minor,
  target_amount_minor::text AS target_amount_minor,
  mid_rate::text AS mid_rate,
  customer_rate::text AS customer_rate,
  spread_bps,
  fee_minor::text AS fee_minor,
  fee_currency,
  rate_source,
  rate_observed_at::text AS rate_observed_at,
  rate_stale,
  status,
  idempotency_key,
  request_hash,
  tx_id,
  expires_at::text AS expires_at,
  executed_at::text AS executed_at,
  created_at::text AS created_at,
  (expires_at > NOW()) AS unexpired
`;

function mapFxQuoteRow(row: FxQuoteRow): FxQuoteRecord {
  return {
    id: row.id,
    userId: row.user_id,
    walletId: row.wallet_id,
    sourceCurrency: row.source_currency,
    targetCurrency: row.target_currency,
    fixedSide: row.fixed_side,
    sourceAmountMinor: row.source_amount_minor,
    targetAmountMinor: row.target_amount_minor,
    midRate: row.mid_rate,
    customerRate: row.customer_rate,
    spreadBps: row.spread_bps,
    feeMinor: row.fee_minor,
    feeCurrency: row.fee_currency,
    rateSource: row.rate_source,
    rateObservedAt: toIsoTimestamp(row.rate_observed_at) ?? row.rate_observed_at,
    rateStale: row.rate_stale,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    txId: row.tx_id,
    expiresAt: toIsoTimestamp(row.expires_at) ?? row.expires_at,
    executedAt: toIsoTimestamp(row.executed_at),
    createdAt: toIsoTimestamp(row.created_at) ?? row.created_at,
  };
}

async function resolveQuoteWalletId(
  client: DbQueryable,
  userId: string,
  walletId?: string
): Promise<string> {
  const result = walletId
    ? await client.query<{ id: string }>(
        `SELECT id FROM wallets WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [walletId, userId]
      )
    : await client.query<{ id: string }>(
        `SELECT id FROM wallets WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
  const row = result.rows[0];
  if (!row) {
    throw createApiError('WALLET_NOT_FOUND', 'Wallet not found', { userId, walletId: walletId ?? null });
  }
  return row.id;
}

/**
 * Persist a guaranteed-rate quote. The insert claims (user_id,
 * idempotency_key) atomically; on conflict the stored open quote is replayed
 * while still inside its TTL, an open-but-lapsed quote is marked expired and
 * rejected, and a key bound to a terminal quote is refused.
 */
export async function createFxQuote(
  client: DbQueryable,
  input: {
    walletId?: string;
    userId: string;
    sourceCurrency: string;
    targetCurrency: string;
    fixedSide: 'source' | 'target';
    amountMinor: bigint | string;
    spreadBps: number;
    idempotencyKey?: string;
    ttlSeconds?: number;
    /**
     * Escape hatch for operator-driven flows: when false (default) a quote
     * resolved from a stale rate is rejected with FX_RATE_STALE; when true
     * the quote is still persisted and flagged rate_stale so downstream
     * consumers can see the rate was past its freshness window.
     */
    allowStaleRate?: boolean;
  }
): Promise<{ quote: FxQuoteRecord; replayed: boolean }> {
  const ttlSeconds = input.ttlSeconds ?? FX_QUOTE_DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > FX_QUOTE_MAX_TTL_SECONDS) {
    throw createApiError('FX_QUOTE_TTL_INVALID', 'ttlSeconds must be an integer in (0, 3600]', {
      ttlSeconds,
    });
  }

  const computed = await quoteConversion(client, input);
  if (computed.rate.stale && !input.allowStaleRate) {
    throw createApiError(
      'FX_RATE_STALE',
      'The resolved exchange rate is stale — refusing to guarantee a quote on it',
      {
        rateSource: computed.rate.source,
        rateObservedAt: computed.rate.observedAt,
        sourceCurrency: computed.sourceCurrency,
        targetCurrency: computed.targetCurrency,
      }
    );
  }
  const walletId = await resolveQuoteWalletId(client, input.userId, input.walletId);
  const id = createRuntimeId('fxq');

  // Canonical request hash — replay of this idempotency key is only served
  // for a byte-identical payload; a recycled key with different fields is
  // IDEMPOTENCY_KEY_REUSED (same rule as the wallet money paths).
  const requestHash = hashWalletIdempotencyPayload({
    sourceCurrency: computed.sourceCurrency,
    targetCurrency: computed.targetCurrency,
    fixedSide: computed.fixedSide,
    amountMinor: String(input.amountMinor).trim(),
  });

  const insert = await client.query<FxQuoteRow>(
    `
      INSERT INTO fx_quotes (
        id,
        user_id,
        wallet_id,
        source_currency,
        target_currency,
        fixed_side,
        source_amount_minor,
        target_amount_minor,
        mid_rate,
        customer_rate,
        spread_bps,
        fee_minor,
        fee_currency,
        rate_source,
        rate_observed_at,
        rate_stale,
        status,
        idempotency_key,
        request_hash,
        expires_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, 'open', $17, $18, NOW() + make_interval(secs => $19)
      )
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
      RETURNING ${FX_QUOTE_COLUMNS}
    `,
    [
      id,
      input.userId,
      walletId,
      computed.sourceCurrency,
      computed.targetCurrency,
      computed.fixedSide,
      computed.sourceAmountMinor,
      computed.targetAmountMinor,
      computed.midRate,
      computed.customerRate,
      computed.spreadBps,
      computed.feeMinor,
      computed.feeCurrency,
      computed.rate.source,
      computed.rate.observedAt ?? new Date().toISOString(),
      computed.rate.stale,
      input.idempotencyKey ?? null,
      requestHash,
      ttlSeconds,
    ]
  );

  if (insert.rows[0]) {
    return { quote: mapFxQuoteRow(insert.rows[0]), replayed: false };
  }

  // Idempotency-key conflict — read the winner and decide replay vs reject.
  const existing = await client.query<FxQuoteRow>(
    `
      SELECT ${FX_QUOTE_COLUMNS}
      FROM fx_quotes
      WHERE user_id = $1
        AND idempotency_key = $2
      LIMIT 1
      FOR UPDATE
    `,
    [input.userId, input.idempotencyKey ?? null]
  );

  const row = existing.rows[0];
  if (!row) {
    // The conflicting in-flight insert aborted — no committed quote exists to
    // replay. The caller may retry within its transaction.
    throw createApiError('FX_QUOTE_NOT_FOUND', 'Idempotent quote claim resolved to no stored quote', {
      userId: input.userId,
      idempotencyKey: input.idempotencyKey ?? null,
    });
  }

  // The key must be bound to the same request payload — recycling a key with
  // different quote fields is a misuse error, never a silent replay.
  if ((row.request_hash?.trim() ?? null) !== requestHash) {
    throw createApiError(
      'IDEMPOTENCY_KEY_REUSED',
      'Idempotency key was already used with a different quote payload',
      {
        quoteId: row.id,
        idempotencyKey: input.idempotencyKey ?? null,
      }
    );
  }

  if (row.status === 'open' && row.unexpired) {
    return { quote: mapFxQuoteRow(row), replayed: true };
  }

  if (row.status === 'open') {
    await client.query(
      `UPDATE fx_quotes SET status = 'expired' WHERE id = $1 AND status = 'open'`,
      [row.id]
    );
    throw createApiError('FX_QUOTE_EXPIRED', 'The stored quote for this idempotency key has expired', {
      quoteId: row.id,
      idempotencyKey: input.idempotencyKey ?? null,
    });
  }

  throw createApiError(
    'FX_QUOTE_NOT_OPEN',
    'Idempotency key is bound to a quote that is no longer open',
    { quoteId: row.id, status: row.status, idempotencyKey: input.idempotencyKey ?? null }
  );
}

// ─── Quote execution ─────────────────────────────────────────────────────────

export interface FxExecutionResult {
  quote: FxQuoteRecord;
  txId: string;
  /** Source-pocket debit (includes the fee, one leg). */
  debitedSourceMinor: string;
  /** Target-pocket credit. */
  creditedTargetMinor: string;
  /** Fee inside the spread, in source currency — metadata only; the route
   *  layer posts the platform revenue leg separately. */
  feeMinor: string;
  feeCurrency: string;
  sourceBalanceAfterMinor: number;
  targetBalanceAfterMinor: number;
  /**
   * true when this result replays a previously stored execution (no new
   * ledger legs were posted). Callers that derive further mutations from
   * the execution — e.g. a transfer funding leg — must treat a replay as
   * "quote already consumed" instead of funding a second time.
   */
  replayed: boolean;
}

/**
 * Plain (non-locking) read of a currency pocket's balance with the legacy
 * single-fiat fallback: when no pocket row exists and the currency is the
 * wallet's own fiat_currency, wallets.fiat_balance_minor is the effective
 * balance — same rule computeSpendableFiatMinor applies.
 */
async function currentPocketBalanceMinor(
  client: DbQueryable,
  walletId: string,
  currency: string
): Promise<number> {
  const normalized = currency.trim().toUpperCase();
  const pocket = await client.query<{ balance_minor: string }>(
    `
      SELECT balance_minor::text AS balance_minor
      FROM wallet_currency_balances
      WHERE wallet_id = $1
        AND currency = $2
      LIMIT 1
    `,
    [walletId, normalized]
  );
  if (pocket.rows[0]) {
    return Number(pocket.rows[0].balance_minor);
  }

  const wallet = await client.query<{ fiat_currency: string; fiat_balance_minor: string }>(
    `SELECT fiat_currency, fiat_balance_minor::text FROM wallets WHERE id = $1 LIMIT 1`,
    [walletId]
  );
  const row = wallet.rows[0];
  return row && normalized === row.fiat_currency.trim().toUpperCase()
    ? Number(row.fiat_balance_minor)
    : 0;
}

/**
 * Execute an open quote atomically: lock the quote, validate it, lock the
 * wallet + both currency pockets in deterministic order, re-check the source
 * pocket's spendable balance, then post the FX_CONVERT_DEBIT /
 * FX_CONVERT_CREDIT wallet legs on one tx_id and mark the quote executed.
 *
 * The source pocket is debited source_amount_minor ONCE — the fee is already
 * inside the spread difference, so it is recorded as metadata only. Platform
 * revenue posting (ledger_entries, source_type 'fx_conversion',
 * account 'revenue_fx') is left to the routes layer via the returned
 * feeMinor.
 *
 * Retries are safe: an already-executed quote replays its stored execution
 * instead of throwing, while expired/cancelled quotes still fail.
 */
export async function executeFxQuote(
  client: DbQueryable,
  quoteId: string,
  input: { userId: string }
): Promise<FxExecutionResult> {
  // (a) Lock the quote row — the only place quote locks are taken.
  const quoteResult = await client.query<FxQuoteRow>(
    `
      SELECT ${FX_QUOTE_COLUMNS}
      FROM fx_quotes
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [quoteId]
  );
  const row = quoteResult.rows[0];
  if (!row || row.user_id !== input.userId) {
    throw createApiError('FX_QUOTE_NOT_FOUND', 'FX quote not found', { quoteId });
  }

  if (row.status === 'open' && !row.unexpired) {
    await client.query(
      `UPDATE fx_quotes SET status = 'expired' WHERE id = $1 AND status = 'open'`,
      [row.id]
    );
    throw createApiError('FX_QUOTE_EXPIRED', 'FX quote has expired', { quoteId });
  }
  if (row.status === 'executed' && row.tx_id) {
    // Idempotent replay: the conversion already ran on the stored tx_id, so
    // a client retry must see the same execution rather than an error.
    // Balance-after fields report the pockets' CURRENT balances (plain
    // reads — the original ledger legs already recorded the execution-time
    // balances).
    const sourceBalanceAfter = await currentPocketBalanceMinor(
      client,
      row.wallet_id,
      row.source_currency
    );
    const targetBalanceAfter = await currentPocketBalanceMinor(
      client,
      row.wallet_id,
      row.target_currency
    );
    return {
      quote: mapFxQuoteRow(row),
      txId: row.tx_id,
      debitedSourceMinor: row.source_amount_minor,
      creditedTargetMinor: row.target_amount_minor,
      feeMinor: row.fee_minor,
      feeCurrency: row.fee_currency ?? row.source_currency,
      sourceBalanceAfterMinor: sourceBalanceAfter,
      targetBalanceAfterMinor: targetBalanceAfter,
      replayed: true,
    };
  }
  if (row.status !== 'open') {
    throw createApiError('FX_QUOTE_NOT_OPEN', 'FX quote is not open', {
      quoteId,
      status: row.status,
    });
  }

  // (b) Wallet row FOR UPDATE, then both currency pockets in sorted order.
  const walletResult = await client.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM wallets WHERE id = $1 LIMIT 1 FOR UPDATE`,
    [row.wallet_id]
  );
  const wallet = walletResult.rows[0];
  if (!wallet || wallet.user_id !== row.user_id) {
    throw createApiError('FX_QUOTE_NOT_FOUND', 'FX quote wallet not found', {
      quoteId,
      walletId: row.wallet_id,
    });
  }
  await lockCurrencyBalanceRowsForUpdate(client, row.wallet_id, [
    row.source_currency,
    row.target_currency,
  ]);

  // (c) Re-check spendable source balance — source_amount_minor is the full
  // debit (fee inside the spread).
  const sourceAmount = parseAmountMinor(row.source_amount_minor);
  const targetAmount = parseAmountMinor(row.target_amount_minor);
  const requiredSource = toSafeLedgerNumber(sourceAmount, 'source_amount_minor');
  const debitAmount = toSafeLedgerNumber(sourceAmount, 'source_amount_minor');
  const creditAmount = toSafeLedgerNumber(targetAmount, 'target_amount_minor');

  await assertSpendableFiatMinor(client, {
    walletId: row.wallet_id,
    currency: row.source_currency,
    requiredMinor: requiredSource,
  });

  // (d) Wallet legs on one tx_id. The fee rides inside the spread difference
  // and is recorded in metadata only — the route layer posts the platform
  // revenue leg separately.
  const txId = createRuntimeId('wtx');
  const sharedMetadata = {
    quoteId: row.id,
    fixedSide: row.fixed_side,
    sourceCurrency: row.source_currency,
    targetCurrency: row.target_currency,
    midRate: row.mid_rate,
    customerRate: row.customer_rate,
    spreadBps: row.spread_bps,
    feeMinor: row.fee_minor,
    rateSource: row.rate_source,
    rateObservedAt: row.rate_observed_at,
  };

  const sourceBalanceAfter = await applyWalletLedgerDelta(client, {
    walletId: row.wallet_id,
    txId,
    asset: 'FIAT',
    fiatCurrency: row.source_currency,
    amount: -debitAmount,
    kind: 'FX_CONVERT_DEBIT',
    refType: 'fx_quote',
    refId: row.id,
    metadata: { ...sharedMetadata, direction: 'debit' },
  });

  const targetBalanceAfter = await applyWalletLedgerDelta(client, {
    walletId: row.wallet_id,
    txId,
    asset: 'FIAT',
    fiatCurrency: row.target_currency,
    amount: creditAmount,
    kind: 'FX_CONVERT_CREDIT',
    refType: 'fx_quote',
    refId: row.id,
    metadata: { ...sharedMetadata, direction: 'credit' },
  });

  // (e) Mark the quote executed with the shared tx_id.
  const executed = await client.query<FxQuoteRow>(
    `
      UPDATE fx_quotes
      SET status = 'executed', tx_id = $2, executed_at = NOW()
      WHERE id = $1
      RETURNING ${FX_QUOTE_COLUMNS}
    `,
    [row.id, txId]
  );

  return {
    quote: mapFxQuoteRow(executed.rows[0] ?? { ...row, status: 'executed', tx_id: txId }),
    txId,
    debitedSourceMinor: sourceAmount.toString(),
    creditedTargetMinor: targetAmount.toString(),
    feeMinor: row.fee_minor,
    feeCurrency: row.fee_currency ?? row.source_currency,
    sourceBalanceAfterMinor: sourceBalanceAfter,
    targetBalanceAfterMinor: targetBalanceAfter,
    replayed: false,
  };
}

// ─── Expiry sweep ────────────────────────────────────────────────────────────

/**
 * Sweep lapsed open quotes to 'expired'. Returns the ids it closed. Safe to
 * run inside a maintenance transaction; individual executions also lazily
 * mark their own quote expired on touch.
 */
export async function expireStaleFxQuotes(client: DbQueryable): Promise<string[]> {
  const result = await client.query<{ id: string }>(
    `
      UPDATE fx_quotes
      SET status = 'expired'
      WHERE status = 'open'
        AND expires_at <= NOW()
      RETURNING id
    `
  );
  return result.rows.map((row) => row.id);
}
