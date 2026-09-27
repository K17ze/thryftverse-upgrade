import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import {
  createApiError,
  createRuntimeId,
  statusCodeForApiError,
  toJsonString,
  type ApiError,
  type DbQueryable,
  type WalletRow,
} from '../lib/workerHelpers.js';
import {
  createFxQuote,
  executeFxQuote,
  resolveExchangeRate,
  toIsoTimestamp,
  FX_QUOTE_MAX_TTL_SECONDS,
  FX_RATE_STALENESS_MS,
  type FxQuoteRecord,
} from '../lib/fxEngine.js';
import {
  applyWalletLedgerDelta,
  hashWalletIdempotencyPayload,
} from '../lib/walletMoneyPath.js';
import {
  BENEFICIARY_ACCOUNT_TYPES,
  validateBeneficiaryFields,
} from '../lib/beneficiaries.js';
import {
  currencyExponent,
  moneyFromMinor,
  moneyToMajorDecimal,
  normalizeCurrencyCode,
} from '../lib/money.js';
import type { WalletCapabilityContext } from '../lib/compliance.js';

// ─── Dependency injection ────────────────────────────────────────────────────

export type FxWalletRouteDependencies = {
  app: FastifyInstance;
  db: {
    connect(): Promise<DbQueryable & { release: () => void }>;
    query: DbQueryable['query'];
  };
  resolveAuthenticatedUserId(
    request: { authUser?: { userId: string; role: string } },
    requestedUserId?: string
  ): string;
  ensureWallet(
    client: DbQueryable,
    userId: string,
    fiatCurrency?: string,
    lock?: boolean
  ): Promise<WalletRow>;
  /**
   * Kill switch shared with the 1ze money paths — throws
   * ONEZE_OPERATIONS_HALTED while the reconciliation halt flag is set.
   * Wired to index.ts's assertOnezeMintBurnNotHalted (halt state lives in
   * Redis, so it does not need the caller's client).
   */
  assertFxOperationsNotHalted(client: DbQueryable): Promise<void>;
  evaluateWalletCapability(
    client: DbQueryable,
    userId: string,
    capability: string,
    context?: WalletCapabilityContext | Record<string, unknown>
  ): Promise<{ allowed: boolean; code?: string; reason?: string }>;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const FX_WALLET_TABLES_UNAVAILABLE_MESSAGE =
  'Wallet exchange tables unavailable. Run migrations first.';
const TRANSFER_RAIL_INTERNAL_LEDGER = 'internal_ledger';
const TRANSFER_CANCELLABLE_STATES = new Set(['QUOTE', 'AWAITING_FUNDS', 'FUNDED', 'PROCESSING']);

// ─── Row types / mappers ─────────────────────────────────────────────────────

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
  status: FxQuoteRecord['status'];
  idempotency_key: string | null;
  tx_id: string | null;
  expires_at: string;
  executed_at: string | null;
  created_at: string;
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
    sourceCurrency: row.source_currency.trim(),
    targetCurrency: row.target_currency.trim(),
    fixedSide: row.fixed_side,
    sourceAmountMinor: row.source_amount_minor,
    targetAmountMinor: row.target_amount_minor,
    midRate: row.mid_rate,
    customerRate: row.customer_rate,
    spreadBps: row.spread_bps,
    feeMinor: row.fee_minor,
    feeCurrency: row.fee_currency?.trim() ?? null,
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

function serializeQuote(quote: FxQuoteRecord): Record<string, unknown> {
  return {
    id: quote.id,
    userId: quote.userId,
    walletId: quote.walletId,
    pair: `${quote.sourceCurrency}/${quote.targetCurrency}`,
    sourceCurrency: quote.sourceCurrency,
    targetCurrency: quote.targetCurrency,
    fixedSide: quote.fixedSide,
    sourceAmountMinor: quote.sourceAmountMinor,
    targetAmountMinor: quote.targetAmountMinor,
    midRate: quote.midRate,
    customerRate: quote.customerRate,
    spreadBps: quote.spreadBps,
    feeMinor: quote.feeMinor,
    feeCurrency: quote.feeCurrency,
    rateSource: quote.rateSource,
    rateObservedAt: quote.rateObservedAt,
    rateStale: quote.rateStale,
    status: quote.status,
    idempotencyKey: quote.idempotencyKey,
    txId: quote.txId,
    expiresAt: quote.expiresAt,
    executedAt: quote.executedAt,
    createdAt: quote.createdAt,
  };
}

interface BeneficiaryRow {
  id: string;
  user_id: string;
  display_name: string;
  legal_name: string | null;
  country_code: string;
  currency: string;
  account_type: string;
  fields: Record<string, unknown>;
  validation: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

const BENEFICIARY_COLUMNS = `
  id,
  user_id,
  display_name,
  legal_name,
  country_code,
  currency,
  account_type,
  fields,
  validation,
  status,
  created_at::text AS created_at,
  updated_at::text AS updated_at
`;

function serializeBeneficiary(row: BeneficiaryRow): Record<string, unknown> {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    legalName: row.legal_name,
    countryCode: row.country_code.trim(),
    currency: row.currency.trim(),
    accountType: row.account_type,
    fields: row.fields,
    validation: row.validation,
    status: row.status,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

interface TransferRow {
  id: string;
  user_id: string;
  wallet_id: string;
  fx_quote_id: string | null;
  beneficiary_id: string | null;
  source_currency: string;
  source_amount_minor: string;
  target_currency: string;
  target_amount_minor: string;
  state: string;
  rail: string | null;
  rail_ref: string | null;
  uetr: string | null;
  failure_code: string | null;
  failure_message: string | null;
  idempotency_key: string | null;
  request_hash: string | null;
  tx_id: string | null;
  funded_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const TRANSFER_COLUMNS = `
  id,
  user_id,
  wallet_id,
  fx_quote_id,
  beneficiary_id,
  source_currency,
  source_amount_minor::text AS source_amount_minor,
  target_currency,
  target_amount_minor::text AS target_amount_minor,
  state,
  rail,
  rail_ref,
  uetr,
  failure_code,
  failure_message,
  idempotency_key,
  request_hash,
  tx_id,
  funded_at::text AS funded_at,
  completed_at::text AS completed_at,
  created_at::text AS created_at,
  updated_at::text AS updated_at
`;

function serializeTransfer(row: TransferRow): Record<string, unknown> {
  return {
    id: row.id,
    userId: row.user_id,
    walletId: row.wallet_id,
    fxQuoteId: row.fx_quote_id,
    beneficiaryId: row.beneficiary_id,
    sourceCurrency: row.source_currency.trim(),
    sourceAmountMinor: row.source_amount_minor,
    targetCurrency: row.target_currency.trim(),
    targetAmountMinor: row.target_amount_minor,
    state: row.state,
    rail: row.rail,
    railRef: row.rail_ref,
    uetr: row.uetr,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    idempotencyKey: row.idempotency_key,
    txId: row.tx_id,
    fundedAt: toIsoTimestamp(row.funded_at),
    completedAt: toIsoTimestamp(row.completed_at),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

// ─── Local helpers ───────────────────────────────────────────────────────────

function getApiError(error: unknown): ApiError | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  // Domain errors created via createApiError always carry BOTH a string code
  // and a numeric statusCode. Postgres driver errors also expose a string
  // `code` (23505, 40P01, 23514, ECONNREFUSED, ...) — requiring statusCode
  // keeps them from being mislabelled as domain errors and reported as fake
  // 409s with raw driver messages.
  const candidate = error as ApiError;
  if (typeof candidate.code === 'string' && typeof candidate.statusCode === 'number') {
    return candidate;
  }
  return null;
}

function errorResponse(error: unknown): { statusCode: number; body: Record<string, unknown> } {
  if (error instanceof z.ZodError) {
    return {
      statusCode: 400,
      body: { ok: false, error: 'Invalid request payload', details: error.issues },
    };
  }
  const apiError = getApiError(error);
  if (apiError) {
    return {
      statusCode: statusCodeForApiError(apiError.code),
      body: {
        ok: false,
        error: apiError.message,
        code: apiError.code,
        details: apiError.details,
      },
    };
  }
  // Not a domain error — rethrow so Fastify returns a real 500 and the
  // request log captures the driver/unexpected error instead of hiding it.
  throw error;
}

async function fxWalletTablesAvailable(client: DbQueryable): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT
        to_regclass('public.wallet_currency_balances') IS NOT NULL
        AND to_regclass('public.fx_quotes') IS NOT NULL
        AND to_regclass('public.beneficiaries') IS NOT NULL
        AND to_regclass('public.transfers') IS NOT NULL AS exists
    `
  );
  return Boolean(result.rows[0]?.exists);
}

// Postgres timestamptz::text ('2026-09-23 14:22:10.123456+00') is not reliably
// parsed by Date across engines — normalize to ISO first (mirrors fxEngine).
function parseDbTimestampMs(value: string): number {
  const iso = value.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  return Date.parse(iso);
}

function rateObservedAtIsStale(observedAt: string | null): boolean {
  if (!observedAt) {
    return false;
  }
  const observedMs = parseDbTimestampMs(observedAt);
  return Number.isFinite(observedMs) && Date.now() - observedMs > FX_RATE_STALENESS_MS;
}

/**
 * Minor → major units for the capability-gate amountUsd context (the field
 * name is historical — evaluateWalletCapability reads it as MAJOR units of
 * `currency`). Returns undefined when the currency isn't in the ISO
 * registry so an exotic payload can't crash the gate before validation.
 */
function capabilityAmountMajor(
  amountMinor: string | undefined,
  currency: string | undefined
): number | undefined {
  if (!amountMinor || !currency) {
    return undefined;
  }
  try {
    return Number(amountMinor) / 10 ** currencyExponent(currency);
  } catch {
    return undefined;
  }
}

function minorToSafeLedgerNumber(amountMinor: string, field: string): number {
  let parsed: bigint;
  try {
    parsed = BigInt(amountMinor.trim());
  } catch {
    throw createApiError('FX_AMOUNT_INVALID', 'Amount must be an integer minor-unit amount', {
      field,
      amountMinor,
    });
  }
  if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw createApiError('FX_AMOUNT_INVALID', 'Amount exceeds the safe-integer ledger range', {
      field,
      amountMinor,
    });
  }
  return Number(parsed);
}

// ensureLedgerAccount equivalent, scoped to the platform-owned FX accounts.
async function ensurePlatformFxLedgerAccount(
  client: DbQueryable,
  accountCode: 'revenue_fx' | 'fx_clearing',
  currency: string
): Promise<number> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO ledger_accounts (owner_type, owner_id, account_code, currency)
      VALUES ('platform', 'platform', $1, $2)
      ON CONFLICT (owner_type, owner_id, account_code, currency)
      DO UPDATE SET owner_id = EXCLUDED.owner_id
      RETURNING id
    `,
    [accountCode, currency]
  );
  return Number(result.rows[0].id);
}

// Platform spread/fee revenue leg. `amount_gbp` is a legacy GBP-named column —
// it carries the fee in MAJOR units of `feeCurrency`; the `currency` column and
// the canonical amount_base_units/asset_* columns carry the real asset.
async function postFxSpreadRevenueLeg(
  client: DbQueryable,
  input: {
    quoteId: string;
    txId: string;
    feeMinor: string;
    feeCurrency: string;
    pair: string;
  }
): Promise<void> {
  const feeMinorBigInt = BigInt(input.feeMinor);
  if (feeMinorBigInt <= 0n) {
    return;
  }

  // Idempotent: an /execute retry replays the stored execution (M5b), so the
  // revenue leg must not double-post for the same quote. The check runs on
  // the caller's transaction, keeping it atomic with the conversion.
  const alreadyPosted = await client.query<{ id: string }>(
    `
      SELECT id
      FROM ledger_entries
      WHERE source_type = 'fx_conversion'
        AND source_id = $1
        AND line_type = 'fx_spread_revenue'
      LIMIT 1
    `,
    [input.quoteId]
  );
  if (alreadyPosted.rows[0]) {
    return;
  }

  const feeMoney = moneyFromMinor(input.feeCurrency, feeMinorBigInt);
  const feeMajor = moneyToMajorDecimal(feeMoney);

  const clearingAccountId = await ensurePlatformFxLedgerAccount(client, 'fx_clearing', input.feeCurrency);
  const revenueAccountId = await ensurePlatformFxLedgerAccount(client, 'revenue_fx', input.feeCurrency);

  const metadata = toJsonString({ txId: input.txId, pair: input.pair });
  const values = (accountId: number, counterpartyAccountId: number, direction: 'debit' | 'credit') =>
    client.query(
      `
        INSERT INTO ledger_entries (
          account_id,
          counterparty_account_id,
          direction,
          amount_gbp,
          amount,
          currency,
          amount_base_units,
          asset_code,
          asset_scale,
          asset_registry_version,
          source_type,
          source_id,
          line_type,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'fx_conversion', $11, 'fx_spread_revenue', $12::jsonb)
      `,
      [
        accountId,
        counterpartyAccountId,
        direction,
        feeMajor,
        feeMajor,
        input.feeCurrency,
        feeMoney.minorAmount,
        feeMoney.currency,
        feeMoney.exponent,
        feeMoney.registryVersion,
        input.quoteId,
        metadata,
      ]
    );

  await values(clearingAccountId, revenueAccountId, 'debit');
  await values(revenueAccountId, clearingAccountId, 'credit');
}

// ─── Route registration ──────────────────────────────────────────────────────

export function registerFxWalletRoutes(deps: FxWalletRouteDependencies): void {
  const {
    app,
    db,
    resolveAuthenticatedUserId,
    ensureWallet,
    assertFxOperationsNotHalted,
    evaluateWalletCapability,
  } = deps;

  const tablesUnavailable = (reply: FastifyReply) => {
    reply.code(503);
    return { ok: false, error: FX_WALLET_TABLES_UNAVAILABLE_MESSAGE };
  };

  const isAdminRequest = (request: FastifyRequest): boolean => request.authUser?.role === 'admin';

  // ── FX rates ──

  app.get('/fx/rates', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const querySchema = z.object({
        base: z.string().trim().min(3).max(3).optional(),
      });
      const query = querySchema.parse(request.query ?? {});
      const base = (query.base ?? 'USD').toUpperCase();
      resolveAuthenticatedUserId(request);

      const result = await db.query<{
        base: string;
        quote: string;
        rate: string;
        source: string;
        observed_at: string;
      }>(
        `
          SELECT DISTINCT ON (base, quote)
            base,
            quote,
            rate::text AS rate,
            source,
            observed_at::text AS observed_at
          FROM fx_rates
          WHERE base = $1
          ORDER BY base, quote, observed_at DESC
        `,
        [base]
      );

      const rates = result.rows.map((row) => ({
        base: row.base.trim(),
        quote: row.quote.trim(),
        rate: row.rate,
        source: row.source,
        observedAt: toIsoTimestamp(row.observed_at),
        stale: rateObservedAtIsStale(row.observed_at),
      }));

      return {
        ok: true,
        base,
        rates,
        stale: rates.some((rate) => rate.stale),
        servedAt: new Date().toISOString(),
      };
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });

  app.get('/fx/rates/:base/:quote', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsSchema = z.object({
        base: z.string().trim().min(3).max(3),
        quote: z.string().trim().min(3).max(3),
      });
      const { base, quote } = paramsSchema.parse(request.params);
      resolveAuthenticatedUserId(request);

      const resolved = await resolveExchangeRate(db, base, quote);

      return {
        ok: true,
        base: resolved.baseCurrency,
        quote: resolved.targetCurrency,
        rate: resolved.rate,
        path: resolved.path,
        legs: resolved.legs,
        observedAt: resolved.observedAt,
        stale: resolved.stale,
        source: resolved.source,
      };
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });

  // ── Wallet currency balances ──

  app.get('/wallets/:userId/currency-balances', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsSchema = z.object({ userId: z.string().min(2) });
      const { userId } = paramsSchema.parse(request.params);
      const actorUserId = resolveAuthenticatedUserId(request, userId);

      if (!(await fxWalletTablesAvailable(db))) {
        return tablesUnavailable(reply);
      }

      const walletResult = await db.query<WalletRow>(
        `
          SELECT
            id,
            user_id,
            oneze_balance_units,
            fiat_balance_minor,
            fiat_currency,
            version,
            created_at::text,
            updated_at::text
          FROM wallets
          WHERE user_id = $1
          LIMIT 1
        `,
        [actorUserId]
      );
      const wallet = walletResult.rows[0];
      if (!wallet) {
        throw createApiError('WALLET_NOT_FOUND', 'Wallet not found', { userId: actorUserId });
      }

      const pockets = await db.query<{ currency: string; balance_minor: string; version: string }>(
        `
          SELECT currency, balance_minor::text AS balance_minor, version::text AS version
          FROM wallet_currency_balances
          WHERE wallet_id = $1
          ORDER BY currency
        `,
        [wallet.id]
      );

      const fiatCurrency = wallet.fiat_currency.trim().toUpperCase();
      const balances = pockets.rows.map((row) => ({
        currency: row.currency.trim(),
        balanceMinor: Number(row.balance_minor),
        version: Number(row.version),
      }));

      // The legacy single-fiat bucket is the effective balance for the
      // wallet's own currency until a pocket row is seeded on first write.
      if (!balances.some((balance) => balance.currency === fiatCurrency)) {
        balances.push({
          currency: fiatCurrency,
          balanceMinor: Number(wallet.fiat_balance_minor),
          version: 0,
        });
        balances.sort((a, b) => a.currency.localeCompare(b.currency));
      }

      return {
        ok: true,
        walletId: wallet.id,
        onezeBalanceUnits: Number(wallet.oneze_balance_units),
        fiatCurrency,
        fiatBalanceMinor: Number(wallet.fiat_balance_minor),
        balances,
      };
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });

  // ── FX quotes ──

  app.post('/wallet/fx/quotes', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const bodySchema = z.object({
        userId: z.string().min(2).optional(),
        sourceCurrency: z.string().trim().min(3).max(3),
        targetCurrency: z.string().trim().min(3).max(3),
        fixedSide: z.enum(['source', 'target']),
        amountMinor: z
          .union([z.string(), z.number()])
          .refine(
            (value) => /^\d+$/.test(String(value).trim()) && BigInt(String(value).trim()) > 0n,
            { message: 'amountMinor must be a positive integer minor-unit amount' }
          ),
        idempotencyKey: z.string().min(1).max(128).optional(),
        ttlSeconds: z.number().int().min(5).max(3600).optional(),
      });
      const payload = bodySchema.parse(request.body ?? {});
      const actorUserId = resolveAuthenticatedUserId(request, payload.userId);

      if (!(await fxWalletTablesAvailable(db))) {
        return tablesUnavailable(reply);
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        await assertFxOperationsNotHalted(client);

        // Lock-order note: createFxQuote takes the fx_quotes row lock itself
        // on the idempotent-replay path, and the engine's canonical order is
        // quote → wallet → sorted pockets. ensureWallet's default SELECT ...
        // FOR UPDATE would hold the wallet lock first (wallet → quote),
        // which can deadlock against a concurrent /execute on the same
        // quote. Quote creation never mutates the wallet row, so a
        // non-locking read is sufficient here.
        const wallet = await ensureWallet(client, actorUserId, undefined, false);
        const ttlSeconds = Math.min(
          payload.ttlSeconds ?? config.fxQuoteTtlSeconds,
          FX_QUOTE_MAX_TTL_SECONDS
        );

        const { quote, replayed } = await createFxQuote(client, {
          userId: actorUserId,
          walletId: wallet.id,
          sourceCurrency: payload.sourceCurrency,
          targetCurrency: payload.targetCurrency,
          fixedSide: payload.fixedSide,
          amountMinor: String(payload.amountMinor).trim(),
          spreadBps: config.fxSpreadBps,
          idempotencyKey: payload.idempotencyKey,
          ttlSeconds,
          allowStaleRate: config.fxAllowStaleQuotes,
        });

        await client.query('COMMIT');
        reply.code(replayed ? 200 : 201);
        return { ok: true, replayed, quote: serializeQuote(quote) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });

  app.get('/wallet/fx/quotes/:quoteId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsSchema = z.object({ quoteId: z.string().min(1) });
      const { quoteId } = paramsSchema.parse(request.params);
      const actorUserId = resolveAuthenticatedUserId(request);

      const result = await db.query<FxQuoteRow>(
        `SELECT ${FX_QUOTE_COLUMNS} FROM fx_quotes WHERE id = $1 LIMIT 1`,
        [quoteId]
      );
      const row = result.rows[0];
      if (!row) {
        throw createApiError('FX_QUOTE_NOT_FOUND', 'FX quote not found', { quoteId });
      }
      if (row.user_id !== actorUserId && !isAdminRequest(request)) {
        throw createApiError('FORBIDDEN_USER_CONTEXT', 'Forbidden: quote belongs to another user', {
          quoteId,
        });
      }

      return {
        ok: true,
        quote: { ...serializeQuote(mapFxQuoteRow(row)), unexpired: row.unexpired },
      };
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });

  app.post('/wallet/fx/quotes/:quoteId/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsSchema = z.object({ quoteId: z.string().min(1) });
      const bodySchema = z.object({ userId: z.string().min(2).optional() });
      const { quoteId } = paramsSchema.parse(request.params);
      const payload = bodySchema.parse(request.body ?? {});
      const actorUserId = resolveAuthenticatedUserId(request, payload.userId);

      if (!(await fxWalletTablesAvailable(db))) {
        return tablesUnavailable(reply);
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        await assertFxOperationsNotHalted(client);

        // Light, non-locking read for the capability-gate context —
        // executeFxQuote re-locks the row FOR UPDATE itself, and taking any
        // lock here first would invert the engine's quote → wallet order.
        const quotePreview = await client.query<{
          source_currency: string;
          source_amount_minor: string;
        }>(
          `
            SELECT source_currency, source_amount_minor::text AS source_amount_minor
            FROM fx_quotes
            WHERE id = $1
            LIMIT 1
          `,
          [quoteId]
        );
        const previewCurrency = quotePreview.rows[0]?.source_currency.trim().toUpperCase();

        const capability = await evaluateWalletCapability(client, actorUserId, 'redeem', {
          amountUsd: capabilityAmountMajor(
            quotePreview.rows[0]?.source_amount_minor,
            previewCurrency
          ),
          currency: previewCurrency,
          operation: 'fx_convert',
        });
        if (!capability.allowed) {
          throw createApiError(
            capability.code ?? 'WALLET_CAPABILITY_DENIED',
            capability.reason ?? 'Wallet capability check failed',
            { capability: 'redeem' }
          );
        }

        // Ownership is enforced atomically: executeFxQuote locks the quote row
        // and requires quote.user_id === actorUserId.
        const execution = await executeFxQuote(client, quoteId, { userId: actorUserId });

        if (BigInt(execution.feeMinor) > 0n) {
          await postFxSpreadRevenueLeg(client, {
            quoteId: execution.quote.id,
            txId: execution.txId,
            feeMinor: execution.feeMinor,
            feeCurrency: execution.feeCurrency,
            pair: `${execution.quote.sourceCurrency}/${execution.quote.targetCurrency}`,
          });
        }

        await client.query('COMMIT');
        return {
          ok: true,
          quote: serializeQuote(execution.quote),
          execution: {
            txId: execution.txId,
            debitedSourceMinor: execution.debitedSourceMinor,
            creditedTargetMinor: execution.creditedTargetMinor,
            feeMinor: execution.feeMinor,
          },
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });

  // ── Beneficiaries ──

  app.post('/users/:userId/beneficiaries', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsSchema = z.object({ userId: z.string().min(2) });
      const bodySchema = z.object({
        displayName: z.string().trim().min(1).max(80),
        legalName: z.string().trim().min(1).max(160).optional(),
        countryCode: z.string().trim().toUpperCase().length(2).regex(/^[A-Z]{2}$/),
        currency: z.string().trim().toUpperCase().length(3).regex(/^[A-Z]{3}$/),
        accountType: z.enum(BENEFICIARY_ACCOUNT_TYPES),
        fields: z.record(z.unknown()).default({}),
      });
      const { userId } = paramsSchema.parse(request.params);
      const payload = bodySchema.parse(request.body ?? {});
      const actorUserId = resolveAuthenticatedUserId(request, userId);

      if (!(await fxWalletTablesAvailable(db))) {
        return tablesUnavailable(reply);
      }

      // Regex shape alone isn't enough — the currency must be a supported
      // ISO 4217 code from the canonical registry (money.js).
      let beneficiaryCurrency: string;
      try {
        beneficiaryCurrency = normalizeCurrencyCode(payload.currency);
      } catch {
        throw createApiError('BENEFICIARY_CURRENCY_INVALID', 'Unsupported ISO 4217 currency', {
          currency: payload.currency,
        });
      }

      const validation = validateBeneficiaryFields({
        countryCode: payload.countryCode,
        currency: beneficiaryCurrency,
        accountType: payload.accountType,
        fields: payload.fields,
      });

      if (!validation.valid) {
        throw createApiError('BENEFICIARY_INVALID', 'Beneficiary fields failed validation', {
          errors: validation.errors,
          checks: validation.validationReport.checks,
        });
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        const inserted = await client.query<BeneficiaryRow>(
          `
            INSERT INTO beneficiaries (
              id,
              user_id,
              display_name,
              legal_name,
              country_code,
              currency,
              account_type,
              fields,
              validation,
              status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, 'active')
            RETURNING ${BENEFICIARY_COLUMNS}
          `,
          [
            createRuntimeId('ben'),
            actorUserId,
            payload.displayName,
            payload.legalName ?? null,
            payload.countryCode,
            beneficiaryCurrency,
            payload.accountType,
            toJsonString(validation.normalizedFields),
            toJsonString(validation.validationReport),
          ]
        );

        await client.query('COMMIT');
        reply.code(201);
        return { ok: true, beneficiary: serializeBeneficiary(inserted.rows[0]) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });

  app.get('/users/:userId/beneficiaries', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsSchema = z.object({ userId: z.string().min(2) });
      const { userId } = paramsSchema.parse(request.params);
      const actorUserId = resolveAuthenticatedUserId(request, userId);

      if (!(await fxWalletTablesAvailable(db))) {
        return tablesUnavailable(reply);
      }

      const result = await db.query<BeneficiaryRow>(
        `
          SELECT ${BENEFICIARY_COLUMNS}
          FROM beneficiaries
          WHERE user_id = $1
            AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 200
        `,
        [actorUserId]
      );

      return {
        ok: true,
        beneficiaries: result.rows.map(serializeBeneficiary),
      };
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });

  app.delete('/users/:userId/beneficiaries/:beneficiaryId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsSchema = z.object({
        userId: z.string().min(2),
        beneficiaryId: z.string().min(1),
      });
      const { userId, beneficiaryId } = paramsSchema.parse(request.params);
      const actorUserId = resolveAuthenticatedUserId(request, userId);

      if (!(await fxWalletTablesAvailable(db))) {
        return tablesUnavailable(reply);
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        const updated = await client.query<BeneficiaryRow>(
          `
            UPDATE beneficiaries
            SET status = 'disabled', updated_at = NOW()
            WHERE id = $1
              AND user_id = $2
              AND status = 'active'
            RETURNING ${BENEFICIARY_COLUMNS}
          `,
          [beneficiaryId, actorUserId]
        );

        const row = updated.rows[0];
        if (!row) {
          throw createApiError('BENEFICIARY_NOT_FOUND', 'Beneficiary not found', {
            beneficiaryId,
          });
        }

        await client.query('COMMIT');
        return { ok: true, beneficiary: serializeBeneficiary(row) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });

  // ── Transfers ──

  app.post('/transfers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const bodySchema = z.object({
        userId: z.string().min(2).optional(),
        beneficiaryId: z.string().min(1),
        quoteId: z.string().min(1).optional(),
        sourceCurrency: z.string().trim().min(3).max(3).optional(),
        sourceAmountMinor: z
          .union([z.string(), z.number()])
          .refine(
            (value) => /^\d+$/.test(String(value).trim()) && BigInt(String(value).trim()) > 0n,
            { message: 'sourceAmountMinor must be a positive integer minor-unit amount' }
          )
          .optional(),
        idempotencyKey: z.string().min(1).max(128).optional(),
      });
      const payload = bodySchema.parse(request.body ?? {});
      const actorUserId = resolveAuthenticatedUserId(request, payload.userId);

      if (!(await fxWalletTablesAvailable(db))) {
        return tablesUnavailable(reply);
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        await assertFxOperationsNotHalted(client);

        // Canonical request hash — a replay under the same idempotency key
        // is only served for a byte-identical payload; a recycled key with
        // different fields is IDEMPOTENCY_KEY_REUSED (wallet money-path rule).
        const requestHash = payload.idempotencyKey
          ? hashWalletIdempotencyPayload({
              beneficiaryId: payload.beneficiaryId,
              quoteId: payload.quoteId ?? null,
              sourceCurrency: payload.sourceCurrency?.trim().toUpperCase() ?? null,
              sourceAmountMinor:
                payload.sourceAmountMinor !== undefined
                  ? String(payload.sourceAmountMinor).trim()
                  : null,
            })
          : null;

        if (payload.idempotencyKey) {
          const existing = await client.query<TransferRow>(
            `
              SELECT ${TRANSFER_COLUMNS}
              FROM transfers
              WHERE user_id = $1
                AND idempotency_key = $2
              LIMIT 1
            `,
            [actorUserId, payload.idempotencyKey]
          );
          if (existing.rows[0]) {
            if ((existing.rows[0].request_hash?.trim() ?? null) !== requestHash) {
              throw createApiError(
                'IDEMPOTENCY_KEY_REUSED',
                'Idempotency key was already used with a different transfer payload',
                { idempotencyKey: payload.idempotencyKey }
              );
            }
            await client.query('COMMIT');
            return { ok: true, replayed: true, transfer: serializeTransfer(existing.rows[0]) };
          }
        }

        // Capability-gate context: the user spends the quote's SOURCE leg on
        // the quoteId branch, else the payload's source fields. The quote
        // read is deliberately non-locking — executeFxQuote re-locks it.
        let capabilityCurrency: string | undefined;
        let capabilityAmountMinor: string | undefined;
        if (payload.quoteId) {
          const quotePreview = await client.query<{
            source_currency: string;
            source_amount_minor: string;
          }>(
            `
              SELECT source_currency, source_amount_minor::text AS source_amount_minor
              FROM fx_quotes
              WHERE id = $1
              LIMIT 1
            `,
            [payload.quoteId]
          );
          capabilityCurrency = quotePreview.rows[0]?.source_currency.trim().toUpperCase();
          capabilityAmountMinor = quotePreview.rows[0]?.source_amount_minor;
        } else {
          capabilityCurrency = payload.sourceCurrency?.trim().toUpperCase();
          capabilityAmountMinor =
            payload.sourceAmountMinor !== undefined
              ? String(payload.sourceAmountMinor).trim()
              : undefined;
        }
        const capabilityContext = {
          amountUsd: capabilityAmountMajor(capabilityAmountMinor, capabilityCurrency),
          currency: capabilityCurrency,
          operation: 'transfer_send',
        };

        const capability = await evaluateWalletCapability(client, actorUserId, 'p2p_send', capabilityContext);
        if (!capability.allowed) {
          throw createApiError(
            capability.code ?? 'WALLET_CAPABILITY_DENIED',
            capability.reason ?? 'Wallet capability check failed',
            { capability: 'p2p_send' }
          );
        }

        const beneficiaryResult = await client.query<BeneficiaryRow>(
          `SELECT ${BENEFICIARY_COLUMNS} FROM beneficiaries WHERE id = $1 LIMIT 1`,
          [payload.beneficiaryId]
        );
        const beneficiary = beneficiaryResult.rows[0];
        if (!beneficiary || beneficiary.user_id !== actorUserId || beneficiary.status !== 'active') {
          throw createApiError('BENEFICIARY_NOT_FOUND', 'Beneficiary not found', {
            beneficiaryId: payload.beneficiaryId,
          });
        }
        const targetCurrency = beneficiary.currency.trim().toUpperCase();

        const transferId = createRuntimeId('trf');
        const transferTxId = createRuntimeId('wtx');
        let fxQuoteId: string | null = null;
        let walletId: string;
        let sourceCurrency: string;
        let sourceAmountMinor: string;
        let targetAmountMinor: string;

        if (payload.quoteId) {
          // The embedded conversion moves value out of the platform, so it
          // must pass the same 'redeem' gate as a standalone /execute.
          const redeemCapability = await evaluateWalletCapability(
            client,
            actorUserId,
            'redeem',
            capabilityContext
          );
          if (!redeemCapability.allowed) {
            throw createApiError(
              redeemCapability.code ?? 'WALLET_CAPABILITY_DENIED',
              redeemCapability.reason ?? 'Wallet capability check failed',
              { capability: 'redeem' }
            );
          }

          // Lock order: the engine's canonical order is quote → wallet →
          // sorted pockets, so the quote row lock inside executeFxQuote must
          // be taken BEFORE any wallet FOR UPDATE in this transaction —
          // ensureWallet deliberately runs only on the non-quote branch.
          // The funding leg's applyWalletLedgerDelta re-locks the wallet row
          // the engine already holds, which is a no-op.
          const execution = await executeFxQuote(client, payload.quoteId, { userId: actorUserId });
          if (execution.replayed) {
            // The quote was already consumed by a prior execution — a
            // transfer retry replays via its own idempotency key above, so
            // reaching this with a replayed quote means a different request
            // is trying to fund a second transfer off one conversion.
            throw createApiError(
              'FX_QUOTE_NOT_OPEN',
              'FX quote was already executed and cannot fund another transfer',
              { quoteId: payload.quoteId }
            );
          }
          if (execution.quote.targetCurrency !== targetCurrency) {
            throw createApiError(
              'TRANSFER_CURRENCY_MISMATCH',
              'Quote target currency does not match the beneficiary currency',
              {
                quoteTargetCurrency: execution.quote.targetCurrency,
                beneficiaryCurrency: targetCurrency,
              }
            );
          }
          fxQuoteId = execution.quote.id;
          walletId = execution.quote.walletId;
          sourceCurrency = execution.quote.sourceCurrency;
          sourceAmountMinor = execution.debitedSourceMinor;
          targetAmountMinor = execution.creditedTargetMinor;

          // Platform spread revenue rides the same transaction BEFORE the
          // funding leg — identical to /execute.
          if (BigInt(execution.feeMinor) > 0n) {
            await postFxSpreadRevenueLeg(client, {
              quoteId: execution.quote.id,
              txId: execution.txId,
              feeMinor: execution.feeMinor,
              feeCurrency: execution.feeCurrency,
              pair: `${execution.quote.sourceCurrency}/${execution.quote.targetCurrency}`,
            });
          }

          // The quote converts source → target inside this transaction; the
          // funding leg then debits the freshly credited target pocket once.
          await applyWalletLedgerDelta(client, {
            walletId,
            txId: transferTxId,
            asset: 'FIAT',
            fiatCurrency: targetCurrency,
            amount: -minorToSafeLedgerNumber(targetAmountMinor, 'target_amount_minor'),
            kind: 'TRANSFER_SEND',
            refType: 'transfer',
            refId: transferId,
            metadata: {
              beneficiaryId: beneficiary.id,
              rail: TRANSFER_RAIL_INTERNAL_LEDGER,
              fxQuoteId: execution.quote.id,
            },
          });
        } else {
          if (!payload.sourceCurrency || payload.sourceAmountMinor === undefined) {
            throw createApiError(
              'TRANSFER_AMOUNT_REQUIRED',
              'sourceCurrency and sourceAmountMinor are required when no FX quote is provided'
            );
          }
          sourceCurrency = payload.sourceCurrency.trim().toUpperCase();
          if (sourceCurrency !== targetCurrency) {
            throw createApiError(
              'TRANSFER_CURRENCY_MISMATCH',
              'Cross-currency transfers require an FX quote',
              { sourceCurrency, beneficiaryCurrency: targetCurrency }
            );
          }
          sourceAmountMinor = String(payload.sourceAmountMinor).trim();
          targetAmountMinor = sourceAmountMinor;

          // No quote row is touched on this branch — wallet-first locking is
          // the correct order here (wallet → pocket via applyWalletLedgerDelta).
          const wallet = await ensureWallet(client, actorUserId);
          walletId = wallet.id;

          await applyWalletLedgerDelta(client, {
            walletId,
            txId: transferTxId,
            asset: 'FIAT',
            fiatCurrency: sourceCurrency,
            amount: -minorToSafeLedgerNumber(sourceAmountMinor, 'source_amount_minor'),
            kind: 'TRANSFER_SEND',
            refType: 'transfer',
            refId: transferId,
            metadata: {
              beneficiaryId: beneficiary.id,
              rail: TRANSFER_RAIL_INTERNAL_LEDGER,
            },
          });
        }

        // Funded internally, but no external rail adapter exists yet — the
        // row honestly stays PROCESSING with rail_ref NULL until one does.
        const inserted = await client.query<TransferRow>(
          `
            INSERT INTO transfers (
              id,
              user_id,
              wallet_id,
              fx_quote_id,
              beneficiary_id,
              source_currency,
              source_amount_minor,
              target_currency,
              target_amount_minor,
              state,
              rail,
              idempotency_key,
              request_hash,
              tx_id,
              funded_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROCESSING', $10, $11, $12, $13, NOW())
            ON CONFLICT (user_id, idempotency_key) DO NOTHING
            RETURNING ${TRANSFER_COLUMNS}
          `,
          [
            transferId,
            actorUserId,
            walletId,
            fxQuoteId,
            beneficiary.id,
            sourceCurrency,
            sourceAmountMinor,
            targetCurrency,
            targetAmountMinor,
            TRANSFER_RAIL_INTERNAL_LEDGER,
            payload.idempotencyKey ?? null,
            requestHash,
            transferTxId,
          ]
        );

        const transfer = inserted.rows[0];
        if (!transfer) {
          // A concurrent request claimed this idempotency key after our
          // pre-check. Abort our funding legs before serving the winner.
          await client.query('ROLLBACK');
          const winner = payload.idempotencyKey
            ? await db.query<TransferRow>(
                `
                  SELECT ${TRANSFER_COLUMNS}
                  FROM transfers
                  WHERE user_id = $1
                    AND idempotency_key = $2
                  LIMIT 1
                `,
                [actorUserId, payload.idempotencyKey]
              )
            : { rows: [] as TransferRow[] };
          if (winner.rows[0]) {
            if ((winner.rows[0].request_hash?.trim() ?? null) !== requestHash) {
              throw createApiError(
                'IDEMPOTENCY_KEY_REUSED',
                'Idempotency key was already used with a different transfer payload',
                { idempotencyKey: payload.idempotencyKey }
              );
            }
            return { ok: true, replayed: true, transfer: serializeTransfer(winner.rows[0]) };
          }
          reply.code(409);
          return {
            ok: false,
            error: 'Transfer idempotency conflict could not be resolved',
            code: 'TRANSFER_IDEMPOTENCY_CONFLICT',
          };
        }

        await client.query('COMMIT');
        reply.code(201);
        return { ok: true, replayed: false, transfer: serializeTransfer(transfer) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });

  app.get('/transfers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const querySchema = z.object({
        limit: z.coerce.number().int().min(1).max(200).optional(),
      });
      const query = querySchema.parse(request.query ?? {});
      const actorUserId = resolveAuthenticatedUserId(request);
      const limit = query.limit ?? 50;

      if (!(await fxWalletTablesAvailable(db))) {
        return tablesUnavailable(reply);
      }

      const result = await db.query<TransferRow>(
        `
          SELECT ${TRANSFER_COLUMNS}
          FROM transfers
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT $2
        `,
        [actorUserId, limit]
      );

      return { ok: true, transfers: result.rows.map(serializeTransfer) };
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });

  app.get('/transfers/:transferId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsSchema = z.object({ transferId: z.string().min(1) });
      const { transferId } = paramsSchema.parse(request.params);
      const actorUserId = resolveAuthenticatedUserId(request);

      if (!(await fxWalletTablesAvailable(db))) {
        return tablesUnavailable(reply);
      }

      const result = await db.query<TransferRow>(
        `SELECT ${TRANSFER_COLUMNS} FROM transfers WHERE id = $1 LIMIT 1`,
        [transferId]
      );
      const row = result.rows[0];
      if (!row) {
        throw createApiError('TRANSFER_NOT_FOUND', 'Transfer not found', { transferId });
      }
      if (row.user_id !== actorUserId && !isAdminRequest(request)) {
        throw createApiError('FORBIDDEN_USER_CONTEXT', 'Forbidden: transfer belongs to another user', {
          transferId,
        });
      }

      return { ok: true, transfer: serializeTransfer(row) };
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });

  app.post('/transfers/:transferId/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsSchema = z.object({ transferId: z.string().min(1) });
      const { transferId } = paramsSchema.parse(request.params);
      const actorUserId = resolveAuthenticatedUserId(request);

      if (!(await fxWalletTablesAvailable(db))) {
        return tablesUnavailable(reply);
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        const result = await client.query<TransferRow>(
          `SELECT ${TRANSFER_COLUMNS} FROM transfers WHERE id = $1 LIMIT 1 FOR UPDATE`,
          [transferId]
        );
        const row = result.rows[0];
        if (!row) {
          throw createApiError('TRANSFER_NOT_FOUND', 'Transfer not found', { transferId });
        }
        if (row.user_id !== actorUserId && !isAdminRequest(request)) {
          throw createApiError('FORBIDDEN_USER_CONTEXT', 'Forbidden: transfer belongs to another user', {
            transferId,
          });
        }
        if (!TRANSFER_CANCELLABLE_STATES.has(row.state)) {
          throw createApiError('TRANSFER_NOT_CANCELLABLE', `Transfer cannot be cancelled from state ${row.state}`, {
            transferId,
            state: row.state,
          });
        }

        // Refund only when the funding leg actually ran — QUOTE /
        // AWAITING_FUNDS rows never moved money.
        if (row.funded_at) {
          await applyWalletLedgerDelta(client, {
            walletId: row.wallet_id,
            txId: createRuntimeId('wtx'),
            asset: 'FIAT',
            fiatCurrency: row.target_currency.trim().toUpperCase(),
            amount: minorToSafeLedgerNumber(row.target_amount_minor, 'target_amount_minor'),
            kind: 'TRANSFER_RECEIVE',
            refType: 'transfer',
            refId: row.id,
            metadata: { reason: 'transfer_cancelled', transferId: row.id },
          });
        }

        const updated = await client.query<TransferRow>(
          `
            UPDATE transfers
            SET state = 'CANCELLED', updated_at = NOW()
            WHERE id = $1
            RETURNING ${TRANSFER_COLUMNS}
          `,
          [transferId]
        );

        await client.query('COMMIT');
        return { ok: true, transfer: serializeTransfer(updated.rows[0] ?? { ...row, state: 'CANCELLED' }) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const { statusCode, body } = errorResponse(error);
      reply.code(statusCode);
      return body;
    }
  });
}
