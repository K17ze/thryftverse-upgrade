import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import crypto from 'node:crypto';
import { z } from 'zod';
import type { AuthRole, AuthenticatedUser } from '../lib/auth.js';
import { COOWN_POLICY, COMMERCE_POLICY_VERSION } from '../lib/commercePolicies.js';
import { formatGbp } from '../lib/moneyFormat.js';
import { publishRealtimeEvent } from '../lib/realtime.js';
import {
  createAmlAlert,
  evaluateAmlRisk,
  evaluateMarketEligibility,
  evaluateWalletCapability,
} from '../lib/compliance.js';

// ── Local types ──

interface ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

type DbQueryable = Pick<PoolClient, 'query'>;

type LedgerOwnerType = 'platform' | 'user';

type LedgerAccountCode =
  | 'escrow_liability'
  | 'platform_revenue'
  | 'platform_operating'
  | 'seller_payable'
  | 'buyer_spend'
  | 'withdrawal_pending'
  | 'withdrawable_balance'
  | 'ize_wallet'
  | 'ize_pending_redemption'
  | 'ize_outstanding'
  | 'ize_fiat_received'
  | 'reserve_hold'
  | 'provider_cash_clearing'
  | 'revenue_fx';

type CoOwnOrderStatus = 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';
type CoOwnOrderType = 'market' | 'limit';

interface CoOwnHoldingRow {
  user_id: string;
  asset_id: string;
  units_owned: number;
  avg_entry_price_gbp: number | string;
  realized_pnl_gbp: number | string;
}

// ── Constants ──

const CO_OWN_TRADE_FEE_RATE = 0.01;
const CO_OWN_ELIGIBILITY_TTL_MS = 5 * 60_000; // 5 minutes
const CO_OWN_RESERVATION_TTL_MS = 60_000; // 60 seconds

// ── Dependency injection ──

type CoOwnRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: { authUser?: AuthenticatedUser }, requestedUserId?: string) => string;
  ensureUserExists: (userId: string) => Promise<void>;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => ApiError;
  getApiError: (error: unknown) => ApiError | null;
  createRuntimeId: (prefix: string) => string;
  toJsonString: (value: unknown) => string;
  roundTo: (value: number, decimals: number) => number;
  parseQueryBoolean: (value: unknown, fallback?: boolean) => boolean;
  appendComplianceAuditSafe: (
    request: {
      id: string;
      ip: string;
      headers: Record<string, string | string[] | undefined>;
      authUser?: AuthenticatedUser;
      log: { error: (payload: unknown, message: string) => void };
    },
    input: {
      eventType: string;
      actorUserId?: string | null;
      subjectUserId?: string | null;
      payload?: Record<string, unknown>;
    }
  ) => Promise<void>;
  queueUserNotification: (input: {
    userId: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    eventType?: string;
    actorUserId?: string;
    imageUrl?: string;
    route?: Record<string, unknown>;
    idempotencyKey?: string;
  }) => Promise<string | null>;
  getOnezeMintBurnHaltState: () => Promise<{
    halted: boolean;
    reason?: string;
    reconciliationId?: string | null;
  }>;
  ledgerTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  ensureLedgerAccount: (
    client: DbQueryable,
    ownerType: LedgerOwnerType,
    ownerId: string,
    accountCode: LedgerAccountCode,
    currency?: string
  ) => Promise<number>;
  appendLedgerEntry: (
    client: DbQueryable,
    input: {
      accountId: number;
      counterpartyAccountId: number;
      direction: 'debit' | 'credit';
      amountGbp?: number;
      amount?: number;
      currency?: string;
      sourceType: string;
      sourceId: string;
      lineType: string;
      metadata?: Record<string, unknown>;
    }
  ) => Promise<void>;
};

export const registerCoOwnRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
  ensureUserExists,
  createApiError,
  getApiError,
  createRuntimeId,
  toJsonString,
  roundTo,
  parseQueryBoolean,
  appendComplianceAuditSafe,
  queueUserNotification,
  getOnezeMintBurnHaltState,
  ledgerTablesAvailable,
  ensureLedgerAccount,
  appendLedgerEntry,
}: CoOwnRouteDependencies): void => {

// ── Co-Own helper functions (moved from index.ts, co-own only) ──

async function allocateMarketSequence(
  client: DbQueryable,
  assetId: string
): Promise<number> {
  const result = await client.query<{ next_sequence: string }>(
    `
      INSERT INTO coown_market_sequences (asset_id, next_sequence)
      VALUES ($1, 1)
      ON CONFLICT (asset_id)
      DO UPDATE SET next_sequence = coown_market_sequences.next_sequence + 1
      RETURNING next_sequence::text
    `,
    [assetId]
  );
  return Number(result.rows[0].next_sequence);
}

async function getCoOwnReservationIdempotentResponse(
  client: DbQueryable,
  input: {
    assetId: string;
    userId: string;
    idempotencyKey: string;
    requestHash: string;
  }
): Promise<Record<string, unknown> | null> {
  const result = await client.query<{
    request_hash: string;
    response_body: Record<string, unknown>;
  }>(
    `
      SELECT request_hash, response_body
      FROM coown_reservation_idempotency
      WHERE asset_id = $1
        AND user_id = $2
        AND idempotency_key = $3
      LIMIT 1
    `,
    [input.assetId, input.userId, input.idempotencyKey]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  if (row.request_hash !== input.requestHash) {
    throw createApiError(
      'IDEMPOTENCY_KEY_REUSED',
      'Idempotency key was already used with a different reservation payload'
    );
  }

  return row.response_body;
}

async function saveCoOwnReservationIdempotentResponse(
  client: DbQueryable,
  input: {
    assetId: string;
    userId: string;
    idempotencyKey: string;
    requestHash: string;
    responseStatus: number;
    responseBody: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO coown_reservation_idempotency (
        idempotency_key, asset_id, user_id, request_hash,
        response_status, response_body
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (asset_id, user_id, idempotency_key)
      DO NOTHING
    `,
    [
      input.idempotencyKey,
      input.assetId,
      input.userId,
      input.requestHash,
      input.responseStatus,
      toJsonString(input.responseBody),
    ]
  );
}

function hashCoOwnReservationPayload(payload: {
  side: string;
  units: number;
  orderType: string;
  limitPriceGbp?: number | null;
  maxPriceGbp?: number | null;
  minPriceGbp?: number | null;
}): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      side: payload.side,
      units: payload.units,
      orderType: payload.orderType,
      limitPriceGbp: payload.limitPriceGbp ?? null,
      maxPriceGbp: payload.maxPriceGbp ?? null,
      minPriceGbp: payload.minPriceGbp ?? null,
    }))
    .digest('hex');
}

async function getCoOwnOrderIdempotentResponse(
  client: DbQueryable,
  input: {
    assetId: string;
    userId: string;
    idempotencyKey: string;
    requestHash: string;
  }
): Promise<Record<string, unknown> | null> {
  const result = await client.query<{
    request_hash: string;
    response_body: Record<string, unknown>;
  }>(
    `
      SELECT request_hash, response_body
      FROM coown_order_idempotency
      WHERE asset_id = $1
        AND user_id = $2
        AND idempotency_key = $3
      LIMIT 1
    `,
    [input.assetId, input.userId, input.idempotencyKey]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  if (row.request_hash !== input.requestHash) {
    throw createApiError(
      'IDEMPOTENCY_KEY_REUSED',
      'Idempotency key was already used with a different order payload'
    );
  }

  return row.response_body;
}

async function saveCoOwnOrderIdempotentResponse(
  client: DbQueryable,
  input: {
    assetId: string;
    userId: string;
    idempotencyKey: string;
    requestHash: string;
    responseStatus: number;
    responseBody: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO coown_order_idempotency (
        idempotency_key, asset_id, user_id, request_hash,
        response_status, response_body
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (asset_id, user_id, idempotency_key)
      DO NOTHING
    `,
    [
      input.idempotencyKey,
      input.assetId,
      input.userId,
      input.requestHash,
      input.responseStatus,
      toJsonString(input.responseBody),
    ]
  );
}

function hashCoOwnOrderPayload(payload: {
  side: string;
  units: number;
  orderType: string;
  limitPriceGbp?: number | null;
  maxPriceGbp?: number | null;
  minPriceGbp?: number | null;
  reservationId?: string | null;
}): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      side: payload.side,
      units: payload.units,
      orderType: payload.orderType,
      limitPriceGbp: payload.limitPriceGbp ?? null,
      maxPriceGbp: payload.maxPriceGbp ?? null,
      minPriceGbp: payload.minPriceGbp ?? null,
      reservationId: payload.reservationId ?? null,
    }))
    .digest('hex');
}

async function getCoOwnHoldingForUpdate(
  client: PoolClient,
  userId: string,
  assetId: string
): Promise<CoOwnHoldingRow | null> {
  const result = await client.query<CoOwnHoldingRow>(
    `
      SELECT
        user_id,
        asset_id,
        units_owned,
        avg_entry_price_gbp,
        realized_pnl_gbp
      FROM coOwn_holdings
      WHERE user_id = $1
        AND asset_id = $2
      LIMIT 1
      FOR UPDATE
    `,
    [userId, assetId]
  );

  return result.rows[0] ?? null;
}

async function saveCoOwnHolding(
  client: PoolClient,
  input: {
    userId: string;
    assetId: string;
    unitsOwned: number;
    avgEntryPriceGbp: number;
    realizedPnlGbp: number;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO coOwn_holdings (
        user_id,
        asset_id,
        units_owned,
        avg_entry_price_gbp,
        realized_pnl_gbp,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, asset_id)
      DO UPDATE
        SET
          units_owned = EXCLUDED.units_owned,
          avg_entry_price_gbp = EXCLUDED.avg_entry_price_gbp,
          realized_pnl_gbp = EXCLUDED.realized_pnl_gbp,
          updated_at = NOW()
    `,
    [
      input.userId,
      input.assetId,
      Math.max(0, Math.floor(input.unitsOwned)),
      roundTo(Math.max(0, input.avgEntryPriceGbp), 4),
      roundTo(input.realizedPnlGbp, 4),
    ]
  );
}

async function applyCoOwnTransfer(
  client: PoolClient,
  input: {
    assetId: string;
    buyerId: string;
    sellerId: string;
    units: number;
    unitPriceGbp: number;
    feeGbp: number;
    sourceType: 'coOwn_trade' | 'buyout';
    buyOrderId?: number | null;
    sellOrderId?: number | null;
    enforceSellerHolding: boolean;
  }
): Promise<{ notionalGbp: number; feeGbp: number }> {
  const units = Math.max(0, Math.floor(input.units));
  if (units <= 0) {
    return {
      notionalGbp: 0,
      feeGbp: 0,
    };
  }

  const buyerHolding = await getCoOwnHoldingForUpdate(client, input.buyerId, input.assetId);
  const sellerHolding = await getCoOwnHoldingForUpdate(client, input.sellerId, input.assetId);

  if (input.enforceSellerHolding) {
    const sellerUnits = sellerHolding?.units_owned ?? 0;
    if (sellerUnits < units) {
      throw createApiError('CO_OWN_SELLER_UNITS_INSUFFICIENT', 'Seller does not have enough units', {
        sellerId: input.sellerId,
        availableUnits: sellerUnits,
        requestedUnits: units,
      });
    }
  }

  const buyerUnitsBefore = buyerHolding?.units_owned ?? 0;
  const buyerAvgBefore = Number(buyerHolding?.avg_entry_price_gbp ?? 0);
  const buyerRealizedBefore = Number(buyerHolding?.realized_pnl_gbp ?? 0);
  const buyerUnitsAfter = buyerUnitsBefore + units;
  const buyerAvgAfter =
    buyerUnitsAfter > 0
      ? (buyerAvgBefore * buyerUnitsBefore + input.unitPriceGbp * units) / buyerUnitsAfter
      : input.unitPriceGbp;

  await saveCoOwnHolding(client, {
    userId: input.buyerId,
    assetId: input.assetId,
    unitsOwned: buyerUnitsAfter,
    avgEntryPriceGbp: buyerAvgAfter,
    realizedPnlGbp: buyerRealizedBefore,
  });

  if (input.enforceSellerHolding) {
    const sellerUnitsBefore = sellerHolding?.units_owned ?? 0;
    const sellerAvgBefore = Number(sellerHolding?.avg_entry_price_gbp ?? 0);
    const sellerRealizedBefore = Number(sellerHolding?.realized_pnl_gbp ?? 0);
    const sellerUnitsAfter = sellerUnitsBefore - units;
    const realizedDelta = (input.unitPriceGbp - sellerAvgBefore) * units;

    await saveCoOwnHolding(client, {
      userId: input.sellerId,
      assetId: input.assetId,
      unitsOwned: sellerUnitsAfter,
      avgEntryPriceGbp: sellerUnitsAfter > 0 ? sellerAvgBefore : 0,
      realizedPnlGbp: sellerRealizedBefore + realizedDelta,
    });
  }

  const notionalGbp = roundTo(units * input.unitPriceGbp, 4);

  await client.query(
    `
      INSERT INTO coOwn_trades (
        asset_id,
        buy_order_id,
        sell_order_id,
        buyer_id,
        seller_id,
        units,
        unit_price_gbp,
        notional_gbp,
        fee_gbp,
        settlement_status,
        settled_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'settled', NOW())
    `,
    [
      input.assetId,
      input.buyOrderId ?? null,
      input.sellOrderId ?? null,
      input.buyerId,
      input.sellerId,
      units,
      input.unitPriceGbp,
      notionalGbp,
      input.feeGbp,
    ]
  );

  // ── Atomic DvP settlement (1ZE payment side) ──
  const buyerPays1zeUnits = Math.ceil(roundTo(notionalGbp + input.feeGbp, 4) * 1000);
  const sellerReceives1zeUnits = Math.floor(roundTo(Math.max(0, notionalGbp - input.feeGbp), 4) * 1000);

  if (buyerPays1zeUnits > 0) {
    const buyerWalletResult = await client.query<{ id: string; oneze_balance_units: string }>(
      `SELECT id, oneze_balance_units::text FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [input.buyerId]
    );
    const buyerWallet = buyerWalletResult.rows[0];
    if (!buyerWallet) {
      throw createApiError('WALLET_NOT_FOUND', 'Buyer wallet not found', { buyerId: input.buyerId });
    }
    const buyerBalanceUnits = Number(buyerWallet.oneze_balance_units);
    const otherBuyReservationsResult = await client.query<{ total: string }>(
      `
        SELECT COALESCE(SUM(reserved_1ze_units), 0)::text AS total
        FROM coown_order_reservations
        WHERE user_id = $1
          AND status IN ('active', 'placed')
          AND ($2::bigint IS NULL OR placed_order_id IS DISTINCT FROM $2)
      `,
      [input.buyerId, input.buyOrderId ?? null]
    );
    const protectedForOtherOrdersUnits = Number(otherBuyReservationsResult.rows[0]?.total ?? 0);
    const buyerAvailableUnits = buyerBalanceUnits - protectedForOtherOrdersUnits;
    if (buyerAvailableUnits < buyerPays1zeUnits) {
      throw createApiError(
        'INSUFFICIENT_1ZE_BALANCE',
        'Buyer has insufficient 1ZE balance for settlement',
        {
          buyerId: input.buyerId,
          required1zeUnits: buyerPays1zeUnits,
          available1zeUnits: buyerAvailableUnits,
        }
      );
    }

    const buyerBalanceAfter = buyerBalanceUnits - buyerPays1zeUnits;
    const tradeTxId = `coown_trade_${input.buyOrderId ?? 'x'}_${input.sellOrderId ?? 'x'}_${Date.now()}`;

    await client.query(
      `UPDATE wallets SET oneze_balance_units = $2, version = version + 1, updated_at = NOW() WHERE id = $1`,
      [buyerWallet.id, buyerBalanceAfter]
    );

    await client.query(
      `
        INSERT INTO wallet_ledger (wallet_id, tx_id, asset, amount, balance_after, kind, ref_type, ref_id, metadata)
        VALUES ($1, $2, '1ZE', $3, $4, 'CO_OWN_TRADE', 'coOwn_trade', $5, $6::jsonb)
      `,
      [
        buyerWallet.id,
        tradeTxId,
        -buyerPays1zeUnits,
        buyerBalanceAfter,
        String(input.buyOrderId ?? ''),
        JSON.stringify({ assetId: input.assetId, units, side: 'buy', notionalGbp, feeGbp: input.feeGbp }),
      ]
    );

    if (sellerReceives1zeUnits > 0) {
      const sellerWalletResult = await client.query<{ id: string; oneze_balance_units: string }>(
        `SELECT id, oneze_balance_units::text FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [input.sellerId]
      );
      const sellerWallet = sellerWalletResult.rows[0];
      if (!sellerWallet) {
        throw createApiError('WALLET_NOT_FOUND', 'Seller or issuing vehicle wallet not found', {
          sellerId: input.sellerId,
        });
      }
      const sellerBalanceAfter = Number(sellerWallet.oneze_balance_units) + sellerReceives1zeUnits;
      await client.query(
        `UPDATE wallets SET oneze_balance_units = $2, version = version + 1, updated_at = NOW() WHERE id = $1`,
        [sellerWallet.id, sellerBalanceAfter]
      );

      await client.query(
        `
          INSERT INTO wallet_ledger (wallet_id, tx_id, asset, amount, balance_after, kind, ref_type, ref_id, metadata)
          VALUES ($1, $2, '1ZE', $3, $4, 'CO_OWN_TRADE', 'coOwn_trade', $5, $6::jsonb)
        `,
        [
          sellerWallet.id,
          tradeTxId,
          sellerReceives1zeUnits,
          sellerBalanceAfter,
          String(input.sellOrderId ?? ''),
          JSON.stringify({ assetId: input.assetId, units, side: 'sell', notionalGbp, feeGbp: input.feeGbp }),
        ]
      );
    }
  }

  if (input.feeGbp > 0 && await ledgerTablesAvailable(client)) {
    const platformRevenueAccountId = await ensureLedgerAccount(
      client,
      'platform',
      'platform',
      'platform_revenue'
    );
    const buyerSpendAccountId = await ensureLedgerAccount(
      client,
      'user',
      input.buyerId,
      'buyer_spend'
    );
    const sellerFeeAccountId = await ensureLedgerAccount(
      client,
      'user',
      input.sellerId,
      'seller_payable'
    );

    await appendLedgerEntry(client, {
      accountId: buyerSpendAccountId,
      counterpartyAccountId: platformRevenueAccountId,
      direction: 'debit',
      amountGbp: input.feeGbp,
      sourceType: 'coOwn_trade',
      sourceId: input.buyOrderId ? `buy_${input.buyOrderId}` : `trade_${input.assetId}`,
      lineType: 'coOwn_trade_fee_credit',
    });

    await appendLedgerEntry(client, {
      accountId: sellerFeeAccountId,
      counterpartyAccountId: platformRevenueAccountId,
      direction: 'debit',
      amountGbp: input.feeGbp,
      sourceType: 'coOwn_trade',
      sourceId: input.sellOrderId ? `sell_${input.sellOrderId}` : `issuance_${input.assetId}`,
      lineType: 'coOwn_trade_seller_fee_debit',
    });

    await appendLedgerEntry(client, {
      accountId: platformRevenueAccountId,
      counterpartyAccountId: sellerFeeAccountId,
      direction: 'credit',
      amountGbp: input.feeGbp,
      sourceType: 'coOwn_trade',
      sourceId: input.sellOrderId ? `sell_${input.sellOrderId}` : `issuance_${input.assetId}`,
      lineType: 'coOwn_trade_seller_fee_credit',
    });

    await appendLedgerEntry(client, {
      accountId: platformRevenueAccountId,
      counterpartyAccountId: buyerSpendAccountId,
      direction: 'credit',
      amountGbp: input.feeGbp,
      sourceType: 'coOwn_trade',
      sourceId: input.buyOrderId ? `buy_${input.buyOrderId}` : `trade_${input.assetId}`,
      lineType: 'coOwn_trade_fee_credit',
    });
  }

  // ── Track total traded value for recourse liability ──
  await client.query(
    `UPDATE coOwn_assets
     SET total_traded_value_gbp = total_traded_value_gbp + $2,
         updated_at = NOW()
     WHERE id = $1`,
    [input.assetId, notionalGbp]
  );

  return {
    notionalGbp,
    feeGbp: input.feeGbp,
  };
}

async function recalcCoOwnHolders(client: PoolClient, assetId: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM coOwn_holdings
      WHERE asset_id = $1
        AND units_owned > 0
    `,
    [assetId]
  );

  return Number(result.rows[0]?.count ?? '0');
}

// ── Co-Own route handlers ──

/* ── Co-Own Price Alerts ── */

// GET /co-own/price-alerts — list user's Co-Own price alerts
app.get('/co-own/price-alerts', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const result = await db.query<{
    id: string;
    asset_id: string;
    condition: string;
    target_price_gbp_minor: string | number;
    active: boolean;
    triggered_at: string | null;
    created_at: string;
  }>(
    `SELECT id, asset_id, condition, target_price_gbp_minor, active, triggered_at, created_at
     FROM coown_price_alerts WHERE user_id = $1 ORDER BY created_at DESC`,
    [request.authUser.userId]
  );

  return {
    ok: true,
    alerts: result.rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      condition: row.condition,
      targetPriceGbpMinor: Number(row.target_price_gbp_minor),
      active: row.active,
      triggeredAt: row.triggered_at,
      createdAt: row.created_at,
    })),
  };
});

// POST /co-own/price-alerts — create a Co-Own price alert
app.post('/co-own/price-alerts', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({
    assetId: z.string().min(2).max(128),
    condition: z.enum(['above', 'below']),
    targetPriceGbpMinor: z.number().int().positive(),
  });

  const { assetId, condition, targetPriceGbpMinor } = bodySchema.parse(request.body ?? {});

  const result = await db.query<{
    id: string;
    created_at: string;
  }>(
    `INSERT INTO coown_price_alerts (user_id, asset_id, condition, target_price_gbp_minor)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, asset_id, condition, target_price_gbp_minor) WHERE active = TRUE
     DO UPDATE SET active = TRUE, updated_at = NOW()
     RETURNING id, created_at`,
    [request.authUser.userId, assetId, condition, targetPriceGbpMinor]
  );

  reply.code(201);
  return {
    ok: true,
    alert: {
      id: result.rows[0].id,
      assetId,
      condition,
      targetPriceGbpMinor,
      active: true,
      createdAt: result.rows[0].created_at,
    },
  };
});

// DELETE /co-own/price-alerts/:id — delete a Co-Own price alert
app.delete('/co-own/price-alerts/:id', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ id: z.string().min(1) });
  const { id } = paramsSchema.parse(request.params);

  await db.query(
    `DELETE FROM coown_price_alerts WHERE id = $1 AND user_id = $2`,
    [id, request.authUser.userId]
  );

  return { ok: true };
});

// PATCH /co-own/price-alerts/:id — toggle active state of a Co-Own price alert
app.patch('/co-own/price-alerts/:id', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ id: z.string().min(1) });
  const { id } = paramsSchema.parse(request.params);

  const bodySchema = z.object({
    active: z.boolean(),
  });
  const { active } = bodySchema.parse(request.body ?? {});

  const result = await db.query<{
    id: string;
    asset_id: string;
    condition: string;
    target_price_gbp_minor: string | number;
    active: boolean;
    triggered_at: string | null;
    created_at: string;
  }>(
    `UPDATE coown_price_alerts
     SET active = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, asset_id, condition, target_price_gbp_minor, active, triggered_at, created_at`,
    [id, request.authUser.userId, active]
  );

  if (result.rows.length === 0) {
    reply.code(404);
    return { ok: false, error: 'Alert not found' };
  }

  const row = result.rows[0];
  return {
    ok: true,
    alert: {
      id: row.id,
      assetId: row.asset_id,
      condition: row.condition,
      targetPriceGbpMinor: Number(row.target_price_gbp_minor),
      active: row.active,
      triggeredAt: row.triggered_at,
      createdAt: row.created_at,
    },
  };
});

/* ── Co-Own Price History (OHLCV) ── */

// GET /co-own/assets/:assetId/price-history — aggregated OHLCV candles
app.get('/co-own/assets/:assetId/price-history', async (request) => {
  const paramsSchema = z.object({ assetId: z.string().min(2).max(128) });
  const { assetId } = paramsSchema.parse(request.params);

  const querySchema = z.object({
    interval: z.enum(['1h', '4h', '1d', '1w']).default('1d'),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  });
  const { interval, limit } = querySchema.parse(request.query);

  // First try the pre-aggregated table
  const cached = await db.query<{
    bucket_start: string;
    open_gbp_minor: string | number;
    high_gbp_minor: string | number;
    low_gbp_minor: string | number;
    close_gbp_minor: string | number;
    volume_units: string | number;
    trade_count: string | number;
  }>(
    `SELECT bucket_start, open_gbp_minor, high_gbp_minor, low_gbp_minor, close_gbp_minor,
            volume_units, trade_count
     FROM coown_price_history
     WHERE asset_id = $1 AND interval = $2
     ORDER BY bucket_start DESC
     LIMIT $3`,
    [assetId, interval, limit]
  );

  if (cached.rows.length > 0) {
    return {
      ok: true,
      interval,
      candles: cached.rows.reverse().map((row) => ({
        timestamp: row.bucket_start,
        openGbpMinor: Number(row.open_gbp_minor),
        highGbpMinor: Number(row.high_gbp_minor),
        lowGbpMinor: Number(row.low_gbp_minor),
        closeGbpMinor: Number(row.close_gbp_minor),
        volumeUnits: Number(row.volume_units),
        tradeCount: Number(row.trade_count),
      })),
    };
  }

  // Fallback: aggregate from executions in real-time
  const intervalClause: Record<string, string> = {
    '1h': "date_trunc('hour', executed_at)",
    '4h': "date_trunc('hour', executed_at) - (EXTRACT(HOUR FROM executed_at)::int % 4) * INTERVAL '1 hour'",
    '1d': "date_trunc('day', executed_at)",
    '1w': "date_trunc('week', executed_at)",
  };

  const result = await db.query<{
    bucket_start: string;
    open_gbp_minor: string | number;
    high_gbp_minor: string | number;
    low_gbp_minor: string | number;
    close_gbp_minor: string | number;
    volume_units: string | number;
    trade_count: string | number;
  }>(
    `SELECT
       ${intervalClause[interval]} AS bucket_start,
       (array_agg(price_gbp_minor ORDER BY executed_at ASC))[1] AS open_gbp_minor,
       MAX(price_gbp_minor) AS high_gbp_minor,
       MIN(price_gbp_minor) AS low_gbp_minor,
       (array_agg(price_gbp_minor ORDER BY executed_at DESC))[1] AS close_gbp_minor,
       SUM(units)::int AS volume_units,
       COUNT(*)::int AS trade_count
     FROM coown_executions
     WHERE asset_id = $1
     GROUP BY 1
     ORDER BY bucket_start DESC
     LIMIT $2`,
    [assetId, limit]
  );

  return {
    ok: true,
    interval,
    candles: result.rows.reverse().map((row) => ({
      timestamp: row.bucket_start,
      openGbpMinor: Number(row.open_gbp_minor),
      highGbpMinor: Number(row.high_gbp_minor),
      lowGbpMinor: Number(row.low_gbp_minor),
      closeGbpMinor: Number(row.close_gbp_minor),
      volumeUnits: Number(row.volume_units),
      tradeCount: Number(row.trade_count),
    })),
  };
});

/* ── Co-Own Governance Voting ── */

// GET /co-own/corporate-actions/:actionId/votes — list votes for a governance action
app.get('/co-own/corporate-actions/:actionId/votes', async (request) => {
  const paramsSchema = z.object({ actionId: z.string().min(2).max(128) });
  const { actionId } = paramsSchema.parse(request.params);

  const result = await db.query<{
    vote: string;
    voting_power_units: string | number;
    count: string | number;
    total_power: string | number;
  }>(
    `SELECT vote, SUM(voting_power_units)::bigint AS voting_power_units,
            COUNT(*)::int AS count,
            SUM(SUM(voting_power_units)) OVER ()::bigint AS total_power
     FROM coown_governance_votes
     WHERE corporate_action_id = $1
     GROUP BY vote
     ORDER BY vote`,
    [actionId]
  );

  const summary = result.rows.map((row) => ({
    vote: row.vote,
    votingPowerUnits: Number(row.voting_power_units),
    voteCount: Number(row.count),
  }));

  const totalPower = result.rows.length > 0 ? Number(result.rows[0].total_power) : 0;

  // Check if the current user has voted
  const authUserId = request.authUser?.userId;
  let myVote: string | null = null;
  if (authUserId) {
    const myVoteResult = await db.query<{ vote: string }>(
      `SELECT vote FROM coown_governance_votes WHERE corporate_action_id = $1 AND user_id = $2`,
      [actionId, authUserId]
    );
    if (myVoteResult.rows.length > 0) myVote = myVoteResult.rows[0].vote;
  }

  return {
    ok: true,
    summary,
    totalVotingPower: totalPower,
    myVote,
  };
});

// POST /co-own/corporate-actions/:actionId/vote — cast a governance vote
app.post('/co-own/corporate-actions/:actionId/vote', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ actionId: z.string().min(2).max(128) });
  const { actionId } = paramsSchema.parse(request.params);

  const bodySchema = z.object({
    assetId: z.string().min(2).max(128),
    vote: z.enum(['for', 'against', 'abstain']),
    rationale: z.string().trim().max(2000).optional(),
  });

  const { assetId, vote, rationale } = bodySchema.parse(request.body ?? {});

  // Verify the user holds units of this asset
  const holdingsResult = await db.query<{ units: string | number }>(
    `SELECT COALESCE(SUM(units), 0)::bigint AS units
     FROM coown_holdings
     WHERE asset_id = $1 AND holder_user_id = $2`,
    [assetId, request.authUser.userId]
  );

  const votingPower = Number(holdingsResult.rows[0]?.units ?? 0);
  if (votingPower === 0) {
    reply.code(403);
    return { ok: false, error: 'You must hold units of this asset to vote' };
  }

  // Verify the corporate action is a governance type and still open
  const actionResult = await db.query<{ status: string; action_type: string }>(
    `SELECT status, action_type FROM coown_corporate_actions WHERE id = $1`,
    [actionId]
  );

  if (actionResult.rows.length === 0) {
    reply.code(404);
    return { ok: false, error: 'Corporate action not found' };
  }

  if (actionResult.rows[0].action_type !== 'governance') {
    reply.code(400);
    return { ok: false, error: 'Voting is only available for governance actions' };
  }

  if (actionResult.rows[0].status !== 'open') {
    reply.code(400);
    return { ok: false, error: 'Voting has closed for this action' };
  }

  // Upsert the vote (user can change their vote while open)
  const result = await db.query<{ created_at: string }>(
    `INSERT INTO coown_governance_votes (corporate_action_id, user_id, asset_id, vote, voting_power_units, rationale)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (corporate_action_id, user_id)
     DO UPDATE SET vote = $4, voting_power_units = $5, rationale = $6, created_at = NOW()
     RETURNING created_at`,
    [actionId, request.authUser.userId, assetId, vote, votingPower, rationale ?? null]
  );

  return {
    ok: true,
    vote: {
      actionId,
      vote,
      votingPowerUnits: votingPower,
      createdAt: result.rows[0].created_at,
    },
  };
});

/* ── Co-Own DRIP ── */

// GET /co-own/drip/enrollments — list user's DRIP enrollments
app.get('/co-own/drip/enrollments', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const result = await db.query<{
    asset_id: string;
    enrolled: boolean;
    enrolled_at: string | null;
  }>(
    `SELECT asset_id, enrolled, enrolled_at FROM coown_drip_enrollments WHERE user_id = $1`,
    [request.authUser.userId]
  );

  return {
    ok: true,
    enrollments: result.rows.map((row) => ({
      assetId: row.asset_id,
      enrolled: row.enrolled,
      enrolledAt: row.enrolled_at,
    })),
  };
});

// POST /co-own/drip/enroll — enroll or unenroll from DRIP for an asset
app.post('/co-own/drip/enroll', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({
    assetId: z.string().min(2).max(128),
    enrolled: z.boolean(),
  });

  const { assetId, enrolled } = bodySchema.parse(request.body ?? {});

  await db.query(
    `INSERT INTO coown_drip_enrollments (user_id, asset_id, enrolled, enrolled_at)
     VALUES ($1, $2, $3, CASE WHEN $3 THEN NOW() ELSE NULL END)
     ON CONFLICT (user_id, asset_id)
     DO UPDATE SET enrolled = $3, enrolled_at = CASE WHEN $3 THEN NOW() ELSE NULL END, updated_at = NOW()`,
    [request.authUser.userId, assetId, enrolled]
  );

  return { ok: true, assetId, enrolled };
});

/* ── Co-Own Recurring Orders ── */

// GET /co-own/recurring-orders — list user's recurring orders
app.get('/co-own/recurring-orders', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const result = await db.query<{
    id: string;
    asset_id: string;
    side: string;
    units_per_execution: number;
    frequency: string;
    next_execution_at: string;
    max_price_gbp_minor: string | number | null;
    active: boolean;
    executions_count: number;
    created_at: string;
  }>(
    `SELECT id, asset_id, side, units_per_execution, frequency, next_execution_at,
            max_price_gbp_minor, active, executions_count, created_at
     FROM coown_recurring_orders WHERE user_id = $1 ORDER BY created_at DESC`,
    [request.authUser.userId]
  );

  return {
    ok: true,
    orders: result.rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      side: row.side,
      unitsPerExecution: row.units_per_execution,
      frequency: row.frequency,
      nextExecutionAt: row.next_execution_at,
      maxPriceGbpMinor: row.max_price_gbp_minor == null ? null : Number(row.max_price_gbp_minor),
      active: row.active,
      executionsCount: row.executions_count,
      createdAt: row.created_at,
    })),
  };
});

// POST /co-own/recurring-orders — create a recurring order
app.post('/co-own/recurring-orders', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({
    assetId: z.string().min(2).max(128),
    unitsPerExecution: z.number().int().min(1).max(10000),
    frequency: z.enum(['weekly', 'biweekly', 'monthly']),
    maxPriceGbpMinor: z.number().int().positive().optional(),
  });

  const { assetId, unitsPerExecution, frequency, maxPriceGbpMinor } = bodySchema.parse(request.body ?? {});

  const nextExecutionDate = new Date();
  if (frequency === 'weekly') nextExecutionDate.setDate(nextExecutionDate.getDate() + 7);
  else if (frequency === 'biweekly') nextExecutionDate.setDate(nextExecutionDate.getDate() + 14);
  else nextExecutionDate.setMonth(nextExecutionDate.getMonth() + 1);

  const result = await db.query<{
    id: string;
    next_execution_at: string;
    created_at: string;
  }>(
    `INSERT INTO coown_recurring_orders
       (user_id, asset_id, side, units_per_execution, frequency, next_execution_at, max_price_gbp_minor)
     VALUES ($1, $2, 'buy', $3, $4, $5, $6)
     RETURNING id, next_execution_at, created_at`,
    [request.authUser.userId, assetId, unitsPerExecution, frequency, nextExecutionDate, maxPriceGbpMinor ?? null]
  );

  reply.code(201);
  return {
    ok: true,
    order: {
      id: result.rows[0].id,
      assetId,
      side: 'buy',
      unitsPerExecution,
      frequency,
      nextExecutionAt: result.rows[0].next_execution_at,
      maxPriceGbpMinor: maxPriceGbpMinor ?? null,
      active: true,
      executionsCount: 0,
      createdAt: result.rows[0].created_at,
    },
  };
});

// DELETE /co-own/recurring-orders/:id — cancel a recurring order
app.delete('/co-own/recurring-orders/:id', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ id: z.string().min(1) });
  const { id } = paramsSchema.parse(request.params);

  await db.query(
    `UPDATE coown_recurring_orders SET active = FALSE, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
    [id, request.authUser.userId]
  );

  return { ok: true };
});

app.get('/co-own/policy', async () => ({
  ok: true,
  policy: COOWN_POLICY,
}));

// ── Co-Own eligibility (authoritative, server-evidenced) ──
// GET /co-own/eligibility/:assetId
//
// Returns a server-side eligibility decision for the authenticated user
// against a specific Co-Own asset. This is the source of truth for the
// frontend's disabled-state UI. It is ADVISORY for the UI only — every
// money-mutating endpoint (order placement, buyout, reservation) re-runs
// `evaluateMarketEligibility` transactionally inside its own DB transaction
// and rejects on failure, so a tampered or stale client response can never
// authorise a trade.
//
// The decision is short-lived (TTL below) so the frontend must re-fetch
// before showing the trade ticket after the window expires.

app.get('/co-own/eligibility/:assetId', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ assetId: z.string().min(2).max(128) });
  const { assetId } = paramsSchema.parse(request.params);
  const userId = request.authUser.userId;

  const evaluatedAt = new Date();
  const expiresAt = new Date(evaluatedAt.getTime() + CO_OWN_ELIGIBILITY_TTL_MS);

  // Listing-status checks are server-owned and cannot be derived from
  // client state. A missing or closed asset is never eligible.
  const assetResult = await db.query<{ id: string; is_open: boolean; listing_tier: string }>(
    `SELECT id, is_open, listing_tier FROM coOwn_assets WHERE id = $1`,
    [assetId]
  );
  const asset = assetResult.rows[0];
  if (!asset) {
    return {
      ok: true,
      eligible: false,
      reasonCodes: ['ASSET_NOT_FOUND'],
      policyVersion: COMMERCE_POLICY_VERSION,
      evaluatedAt: evaluatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  const reasonCodes: string[] = [];
  if (!asset.is_open) {
    reasonCodes.push('ASSET_CLOSED');
  }

  // Compliance / jurisdiction / KYC / sanctions / limits. orderNotionalGbp
  // is 0 for the standalone eligibility probe — per-order notional limits
  // are re-evaluated transactionally at order placement time.
  const decision = await evaluateMarketEligibility(db, {
    userId,
    market: 'co-own',
    orderNotionalGbp: 0,
  });

  if (!decision.allowed) {
    reasonCodes.push(decision.code);
  }

  // Prior-ownership check: a user who already holds 100% of the asset
  // cannot buy more units (the backend enforces this at order time too).
  if (asset.is_open && decision.allowed) {
    const holdingsResult = await db.query<{ units_owned: string; total_units: number }>(
      `SELECT h.units_owned::text AS units_owned, a.total_units
         FROM coOwn_holdings h
         JOIN coOwn_assets a ON a.id = h.asset_id
        WHERE h.asset_id = $1 AND h.user_id = $2`,
      [assetId, userId]
    );
    const held = Number(holdingsResult.rows[0]?.units_owned ?? 0);
    const total = Math.max(1, holdingsResult.rows[0]?.total_units ?? 1);
    if (held >= total) {
      reasonCodes.push('ALREADY_FULL_OWNER');
    }
  }

  // Build a UI-facing message from the first applicable reason. The
  // authoritative message at execution time comes from the transactional
  // re-evaluation, so this is purely for the disabled-state copy.
  let message: string | undefined;
  if (reasonCodes.length > 0) {
    if (reasonCodes.includes('ASSET_NOT_FOUND')) {
      message = 'Co-Own asset not found.';
    } else if (reasonCodes.includes('ASSET_CLOSED')) {
      message = 'Co-Own asset is closed for trading.';
    } else if (reasonCodes.includes('ALREADY_FULL_OWNER')) {
      message = 'You already own 100% of this asset.';
    } else if (!decision.allowed) {
      message = decision.message;
    }
  }

  return {
    ok: true,
    eligible: reasonCodes.length === 0,
    reasonCodes,
    policyVersion: COMMERCE_POLICY_VERSION,
    evaluatedAt: evaluatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    message,
  };
});

app.get('/co-own/assets', async (request) => {
  const querySchema = z.object({
    openOnly: z.union([z.string(), z.boolean()]).optional(),
    issuerId: z.string().min(2).max(128).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(80),
  });
  const parsedQuery = querySchema.parse(request.query);
  const openOnly = parseQueryBoolean(parsedQuery.openOnly, false);
  const { limit, issuerId } = parsedQuery;

  const whereConditions: string[] = [];
  const whereParams: Array<string | number> = [];

  if (openOnly) {
    whereConditions.push('sa.is_open = TRUE');
  }

  if (issuerId) {
    whereParams.push(issuerId);
    whereConditions.push(`sa.issuer_id = $${whereParams.length}`);
  }

  whereParams.push(limit);
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  const limitPlaceholder = `$${whereParams.length}`;

  const result = await db.query<{
    id: string;
    listing_id: string;
    issuer_id: string;
    title: string;
    image_url: string | null;
    total_units: number;
    available_units: number;
    unit_price_gbp: number | string;
    unit_price_stable: number | string;
    settlement_mode: 'GBP' | 'TVUSD' | 'HYBRID' | 'ONEZE';
    issuer_jurisdiction: string | null;
    market_move_pct_24h: number | string;
    holders: number;
    volume_24h_gbp: number | string;
    is_open: boolean;
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT
        sa.id,
        sa.listing_id,
        sa.issuer_id,
        sa.title,
        sa.image_url,
        sa.total_units,
        sa.available_units,
        sa.unit_price_gbp,
        sa.unit_price_stable,
        sa.settlement_mode,
        sa.issuer_jurisdiction,
        sa.market_move_pct_24h,
        sa.holders,
        sa.volume_24h_gbp,
        sa.is_open,
        sa.created_at,
        sa.updated_at
      FROM coOwn_assets sa
      ${whereClause}
      ORDER BY sa.volume_24h_gbp DESC, sa.created_at DESC
      LIMIT ${limitPlaceholder}
    `,
    whereParams
  );

  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: row.id,
      listingId: row.listing_id,
      issuerId: row.issuer_id,
      title: row.title,
      imageUrl: row.image_url,
      totalUnits: row.total_units,
      availableUnits: row.available_units,
      unitPriceGbp: Number(row.unit_price_gbp),
      unitPriceStable: Number(row.unit_price_stable),
      settlementMode: row.settlement_mode,
      issuerJurisdiction: row.issuer_jurisdiction,
      marketMovePct24h: row.market_move_pct_24h == null ? null : Number(row.market_move_pct_24h),
      holders: row.holders,
      volume24hGbp: row.volume_24h_gbp == null ? null : Number(row.volume_24h_gbp),
      isOpen: row.is_open,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
});

app.post('/co-own/assets', async (request, reply) => {
  const bodySchema = z.object({
    id: z.string().min(4).max(64).optional(),
    listingId: z.string().min(2),
    issuerId: z.string().min(2),
    title: z.string().min(3).max(180).optional(),
    imageUrl: z.string().url().optional(),
    totalUnits: z.number().int().min(1).max(COOWN_POLICY.maxIssuanceUnits),
    unitPriceGbp: z.number().positive(),
    unitPriceStable: z.number().positive(),
    settlementMode: z.literal('ONEZE'),
    issuerJurisdiction: z.string().min(2).max(10).optional(),
    // ── Trust profile (WS1) ──
    legalVehicleType: z.enum(['spv', 'llc', 'trust', 'series_llc', 'none']),
    legalVehicleName: z.string().min(2).max(180).optional(),
    legalVehicleJurisdiction: z.string().min(2).max(64).optional(),
    custodianName: z.string().min(2).max(180).optional(),
    custodianLocation: z.string().min(2).max(180).optional(),
    custodyInsured: z.boolean().optional(),
    custodyInsurer: z.string().min(2).max(180).optional(),
    custodyPolicyRef: z.string().min(2).max(180).optional(),
    custodyCoverageGbp: z.number().nonnegative().optional(),
    authenticityStatus: z.enum(['unverified', 'pending', 'verified']).optional(),
    authenticityMethod: z.string().min(2).max(180).optional(),
    provenance: z.string().min(2).max(2000).optional(),
    conditionGrade: z.string().min(1).max(64).optional(),
    appraisalValueGbp: z.number().nonnegative().optional(),
    appraisalValuedAt: z.string().datetime().optional(),
    appraisalValuer: z.string().min(2).max(180).optional(),
    buyerProtection: z.boolean().optional(),
    buyerProtectionTermsUrl: z.string().url().optional(),
  });

  const payload = bodySchema.parse(request.body);

  // Truthfulness invariant: if custody is insured, the insurer must be named.
  if (payload.custodyInsured && !payload.custodyInsurer) {
    reply.code(400);
    return { ok: false, error: 'custodyInsured requires custodyInsurer', code: 'INSURER_REQUIRED' };
  }
  // If a legal vehicle other than 'none' is declared, a name is required.
  if (payload.legalVehicleType !== 'none' && !payload.legalVehicleName) {
    reply.code(400);
    return { ok: false, error: 'legalVehicleName required for the chosen vehicle type', code: 'VEHICLE_NAME_REQUIRED' };
  }

  await ensureUserExists(payload.issuerId);

  // ── WS2: KYC gate ──
  const issuerVerification = await db.query<{ verification_tier: string | null }>(
    'SELECT verification_tier FROM coown_issuer_verification_profile WHERE user_id = $1',
    [payload.issuerId]
  );
  const tier = issuerVerification.rows[0]?.verification_tier ?? 'email';
  if (tier !== 'id' && tier !== 'seller') {
    reply.code(403);
    return {
      ok: false,
      error: 'Identity verification (KYC) is required to issue Co-Own assets',
      code: 'ISSUER_KYC_REQUIRED',
      currentTier: tier,
    };
  }

  const assetId = payload.id ?? `s_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  const client = await db.connect();
  let result: { rows: { id: string; listing_id: string; issuer_id: string; title: string; image_url: string | null; total_units: number; available_units: number; unit_price_gbp: number | string; unit_price_stable: number | string; settlement_mode: 'GBP' | 'TVUSD' | 'HYBRID' | 'ONEZE'; issuer_jurisdiction: string | null; market_move_pct_24h: number | string; holders: number; volume_24h_gbp: number | string; is_open: boolean; created_at: string; updated_at: string }[] };
  try {
    await client.query('BEGIN');

    const listingResult = await client.query<{ id: string; title: string; image_url: string | null; status: string }>(
      'SELECT id, title, image_url, status FROM listings WHERE id = $1 AND seller_id = $2 LIMIT 1 FOR UPDATE',
      [payload.listingId, payload.issuerId]
    );

    const listing = listingResult.rows[0];
    if (!listing) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Listing not found or not owned by issuer', code: 'LISTING_OWNERSHIP_DENIED' };
    }

    if (listing.status !== 'active') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Listing is not available for co-own (it may already be sold, paused, or fractionalized)', code: 'LISTING_NOT_COOWNABLE' };
    }

    const resolvedTitle = payload.title ?? `${listing.title} Fraction Pool`;
    const resolvedImage = payload.imageUrl ?? listing.image_url;

    result = await client.query<{
      id: string;
      listing_id: string;
      issuer_id: string;
      title: string;
      image_url: string | null;
      total_units: number;
      available_units: number;
      unit_price_gbp: number | string;
      unit_price_stable: number | string;
      settlement_mode: 'GBP' | 'TVUSD' | 'HYBRID' | 'ONEZE';
      issuer_jurisdiction: string | null;
      market_move_pct_24h: number | string;
      holders: number;
      volume_24h_gbp: number | string;
      is_open: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `
        INSERT INTO coOwn_assets (
          id,
          listing_id,
          issuer_id,
          title,
          image_url,
          total_units,
          available_units,
          unit_price_gbp,
          unit_price_stable,
          settlement_mode,
          issuer_jurisdiction,
          market_move_pct_24h,
          holders,
          volume_24h_gbp,
          is_open,
          legal_vehicle_type,
          legal_vehicle_name,
          legal_vehicle_jurisdiction,
          custodian_name,
          custodian_location,
          custody_insured,
          custody_insurer,
          custody_policy_ref,
          custody_coverage_gbp,
          authenticity_status,
          authenticity_method,
          provenance,
          condition_grade,
          appraisal_value_gbp,
          appraisal_valued_at,
          appraisal_valuer,
          buyer_protection,
          buyer_protection_terms_url
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, 0, 0, 0, TRUE,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
        )
        RETURNING
          id,
          listing_id,
          issuer_id,
          title,
          image_url,
          total_units,
          available_units,
          unit_price_gbp,
          unit_price_stable,
          settlement_mode,
          issuer_jurisdiction,
          market_move_pct_24h,
          holders,
          volume_24h_gbp,
          is_open,
          created_at,
          updated_at
      `,
      [
        assetId,
        payload.listingId,
        payload.issuerId,
        resolvedTitle,
        resolvedImage,
        payload.totalUnits,
        roundTo(payload.unitPriceGbp, 4),
        roundTo(payload.unitPriceStable, 4),
        payload.settlementMode,
        payload.issuerJurisdiction ?? null,
        payload.legalVehicleType,
        payload.legalVehicleName ?? null,
        payload.legalVehicleJurisdiction ?? null,
        payload.custodianName ?? null,
        payload.custodianLocation ?? null,
        payload.custodyInsured ?? false,
        payload.custodyInsurer ?? null,
        payload.custodyPolicyRef ?? null,
        payload.custodyCoverageGbp != null ? roundTo(payload.custodyCoverageGbp, 2) : null,
        payload.authenticityStatus ?? 'unverified',
        payload.authenticityMethod ?? null,
        payload.provenance ?? null,
        payload.conditionGrade ?? null,
        payload.appraisalValueGbp != null ? roundTo(payload.appraisalValueGbp, 2) : null,
        payload.appraisalValuedAt ?? null,
        payload.appraisalValuer ?? null,
        payload.buyerProtection ?? false,
        payload.buyerProtectionTermsUrl ?? null,
      ]
    );

    await client.query(
      `UPDATE listings
       SET status = 'paused', updated_at = NOW()
       WHERE id = $1 AND status = 'active'`,
      [payload.listingId]
    );

    try {
      await client.query(
        `INSERT INTO coown_asset_trust_events (asset_id, event_type, changed_by, new_payload)
         VALUES ($1, 'trust_profile_created', $2, $3)`,
        [
          result.rows[0].id,
          payload.issuerId,
          JSON.stringify({
            legalVehicleType: payload.legalVehicleType,
            legalVehicleName: payload.legalVehicleName ?? null,
            custodyInsured: payload.custodyInsured ?? false,
            authenticityStatus: payload.authenticityStatus ?? 'unverified',
            buyerProtection: payload.buyerProtection ?? false,
          }),
        ]
      );
    } catch (auditErr) {
      app.log.warn({ err: auditErr, assetId: result.rows[0].id }, 'trust audit log write failed (non-fatal)');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    app.log.error({ err }, 'POST /co-own/assets failed');
    reply.code(500);
    return { ok: false, error: 'Failed to create co-own asset' };
  } finally {
    client.release();
  }

  reply.code(201);
  return {
    ok: true,
    asset: {
      id: result.rows[0].id,
      listingId: result.rows[0].listing_id,
      issuerId: result.rows[0].issuer_id,
      title: result.rows[0].title,
      imageUrl: result.rows[0].image_url,
      totalUnits: result.rows[0].total_units,
      availableUnits: result.rows[0].available_units,
      unitPriceGbp: Number(result.rows[0].unit_price_gbp),
      unitPriceStable: Number(result.rows[0].unit_price_stable),
      settlementMode: result.rows[0].settlement_mode,
      issuerJurisdiction: result.rows[0].issuer_jurisdiction,
      marketMovePct24h: result.rows[0].market_move_pct_24h == null ? null : Number(result.rows[0].market_move_pct_24h),
      holders: result.rows[0].holders,
      volume24hGbp: result.rows[0].volume_24h_gbp == null ? null : Number(result.rows[0].volume_24h_gbp),
      isOpen: result.rows[0].is_open,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
    },
  };
});

// ── Settlement status ──

app.get('/co-own/settlements', async (request, reply) => {
  const querySchema = z.object({
    userId: z.string().min(2),
    status: z.enum(['pending', 'settled', 'failed', 'reversed']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().optional(),
  });

  const query = querySchema.parse(request.query);
  const cursorDate = query.cursor ? new Date(query.cursor) : new Date(0);

  const result = await db.query<{
    id: string;
    asset_id: string;
    buyer_id: string;
    seller_id: string;
    units: number;
    unit_price_gbp: string;
    notional_gbp: string;
    fee_gbp: string;
    settlement_status: string;
    settled_at: string | null;
    created_at: string;
  }>(
    `
      SELECT
        id, asset_id, buyer_id, seller_id, units,
        unit_price_gbp::text, notional_gbp::text, fee_gbp::text,
        settlement_status, settled_at, created_at
      FROM coOwn_trades
      WHERE (buyer_id = $1 OR seller_id = $1)
        AND ($2::text IS NULL OR settlement_status = $2)
        AND created_at < $3
      ORDER BY created_at DESC
      LIMIT $4
    `,
    [query.userId, query.status ?? null, cursorDate, query.limit]
  );

  reply.code(200);
  return {
    ok: true,
    settlements: result.rows.map((row) => ({
      id: String(row.id),
      assetId: row.asset_id,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      units: row.units,
      unitPriceGbp: Number(row.unit_price_gbp),
      notionalGbp: Number(row.notional_gbp),
      feeGbp: Number(row.fee_gbp),
      settlementStatus: row.settlement_status as 'pending' | 'settled' | 'failed' | 'reversed',
      settledAt: row.settled_at,
      createdAt: row.created_at,
      role: row.buyer_id === query.userId ? 'buyer' : 'seller',
    })),
    nextCursor: result.rows.length === query.limit
      ? result.rows[result.rows.length - 1].created_at
      : null,
  };
});

app.get('/co-own/assets/:assetId/orders', async (request, reply) => {
  const paramsSchema = z.object({ assetId: z.string().min(2) });
  const querySchema = z.object({
    status: z.enum(['open', 'partially_filled', 'filled', 'cancelled', 'rejected']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(60),
  });

  const { assetId } = paramsSchema.parse(request.params);
  const { status, limit } = querySchema.parse(request.query);

  const assetExists = await db.query('SELECT id FROM coOwn_assets WHERE id = $1 LIMIT 1', [assetId]);
  if (!assetExists.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Co-Own asset not found' };
  }

  const result = await db.query<{
    id: number;
    asset_id: string;
    user_id: string;
    side: 'buy' | 'sell';
    order_type: CoOwnOrderType;
    limit_price_gbp: number | string | null;
    units: number;
    remaining_units: number;
    filled_units: number;
    unit_price_gbp: number | string;
    fee_gbp: number | string;
    total_gbp: number | string;
    status: CoOwnOrderStatus;
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT
        id,
        asset_id,
        user_id,
        side,
        order_type,
        limit_price_gbp,
        units,
        remaining_units,
        filled_units,
        unit_price_gbp,
        fee_gbp,
        total_gbp,
        status,
        created_at,
        updated_at
      FROM coOwn_orders
      WHERE asset_id = $1
        AND ($2::text IS NULL OR status = $2)
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [assetId, status ?? null, limit]
  );

  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      userId: row.user_id,
      side: row.side,
      orderType: row.order_type,
      limitPriceGbp: row.limit_price_gbp === null ? null : Number(row.limit_price_gbp),
      units: row.units,
      remainingUnits: row.remaining_units,
      filledUnits: row.filled_units,
      unitPriceGbp: Number(row.unit_price_gbp),
      feeGbp: Number(row.fee_gbp),
      totalGbp: Number(row.total_gbp),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
});

app.get('/co-own/assets/:assetId/orderbook', async (request, reply) => {
  const paramsSchema = z.object({ assetId: z.string().min(2) });
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(40),
    bidLimit: z.coerce.number().int().min(1).max(200).optional(),
    askLimit: z.coerce.number().int().min(1).max(200).optional(),
  });

  const { assetId } = paramsSchema.parse(request.params);
  const { limit, bidLimit, askLimit } = querySchema.parse(request.query);

  const assetExists = await db.query('SELECT id FROM coOwn_assets WHERE id = $1 LIMIT 1', [assetId]);
  if (!assetExists.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Co-Own asset not found' };
  }

  const client = await db.connect();
  let result: { rows: { side: 'buy' | 'sell'; unit_price_gbp: string; units: string; order_count: string }[] };
  let sequencing: { snapshot_sequence: string; event_sequence: string; last_execution_timestamp: string | null } | undefined;
  try {
    await client.query('BEGIN');
    const bidRows = await client.query<{
      side: 'buy' | 'sell';
      unit_price_gbp: string;
      units: string;
      order_count: string;
    }>(
      `
        SELECT
          side,
          unit_price_gbp::text,
          SUM(remaining_units)::text AS units,
          COUNT(*)::text AS order_count
        FROM coOwn_orders
        WHERE asset_id = $1
          AND side = 'buy'
          AND status IN ('open', 'partially_filled')
          AND remaining_units > 0
        GROUP BY side, unit_price_gbp
        ORDER BY unit_price_gbp DESC, side ASC
        LIMIT $2
      `,
      [assetId, bidLimit ?? limit]
    );

    const askRows = await client.query<{
      side: 'buy' | 'sell';
      unit_price_gbp: string;
      units: string;
      order_count: string;
    }>(
      `
        SELECT
          side,
          unit_price_gbp::text,
          SUM(remaining_units)::text AS units,
          COUNT(*)::text AS order_count
        FROM coOwn_orders
        WHERE asset_id = $1
          AND side = 'sell'
          AND status IN ('open', 'partially_filled')
          AND remaining_units > 0
        GROUP BY side, unit_price_gbp
        ORDER BY unit_price_gbp ASC, side ASC
        LIMIT $2
      `,
      [assetId, askLimit ?? limit]
    );

    const sequencingResult = await client.query<{
      snapshot_sequence: string;
      event_sequence: string;
      last_execution_timestamp: string | null;
    }>(
      `
        SELECT
          COALESCE(
            (SELECT next_sequence - 1 FROM coown_market_sequences WHERE asset_id = $1),
            0
          )::text AS snapshot_sequence,
          COALESCE(
            (SELECT MAX(market_sequence) FROM coOwn_trades WHERE asset_id = $1),
            0
          )::text AS event_sequence,
          (SELECT MAX(created_at)::text FROM coOwn_trades WHERE asset_id = $1) AS last_execution_timestamp
      `,
      [assetId]
    );
    await client.query('COMMIT');

    result = { rows: [...bidRows.rows, ...askRows.rows] };
    sequencing = sequencingResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const haltState = await getOnezeMintBurnHaltState();

  return {
    ok: true,
    snapshotSequence: Number(sequencing?.snapshot_sequence ?? 0),
    snapshotSequenceStr: String(sequencing?.snapshot_sequence ?? 0),
    eventSequence: Number(sequencing?.event_sequence ?? 0),
    eventSequenceStr: String(sequencing?.event_sequence ?? 0),
    serverTimestamp: new Date().toISOString(),
    lastExecutionTimestamp: sequencing?.last_execution_timestamp ?? null,
    stalenessThresholdSeconds: 15,
    reconciliationState: haltState.halted ? 'reconciling' : 'reconciled',
    bids: result.rows
      .filter((row) => row.side === 'buy')
      .map((row) => ({
        side: row.side,
        unitPriceGbp: Number(row.unit_price_gbp),
        unitPriceGbpStr: formatGbp(row.unit_price_gbp),
        units: Number(row.units),
        orderCount: Number(row.order_count),
      })),
    asks: result.rows
      .filter((row) => row.side === 'sell')
      .map((row) => ({
        side: row.side,
        unitPriceGbp: Number(row.unit_price_gbp),
        unitPriceGbpStr: formatGbp(row.unit_price_gbp),
        units: Number(row.units),
        orderCount: Number(row.order_count),
      })),
    depthLimits: {
      bid: bidLimit ?? limit,
      ask: askLimit ?? limit,
    },
  };
});

app.get('/co-own/assets/:assetId/executions', async (request, reply) => {
  const paramsSchema = z.object({ assetId: z.string().min(2) });
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).default(200),
  });
  const { assetId } = paramsSchema.parse(request.params);
  const { limit } = querySchema.parse(request.query);

  const result = await db.query<{
    id: number;
    units: number;
    unit_price_gbp: string;
    notional_gbp: string;
    created_at: string;
    settlement_status: string;
    failure_reason: string | null;
    recovery_action: string | null;
  }>(
    `
      SELECT id, units, unit_price_gbp::text, notional_gbp::text, created_at,
             settlement_status, failure_reason, recovery_action
      FROM coOwn_trades
      WHERE asset_id = $1 AND settlement_status IN ('settled', 'failed', 'reversed')
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [assetId, limit]
  );

  return {
    ok: true,
    serverTimestamp: new Date().toISOString(),
    items: result.rows.map((row) => ({
      id: row.id,
      assetId,
      units: row.units,
      unitPriceGbp: Number(row.unit_price_gbp),
      notionalGbp: Number(row.notional_gbp),
      executedAt: row.created_at,
      settlementStatus: row.settlement_status,
      failureReason: row.failure_reason,
      recoveryAction: row.recovery_action,
    })),
  };
});

app.get('/co-own/assets/:assetId/holdings', async (request, reply) => {
  const paramsSchema = z.object({ assetId: z.string().min(2) });
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(100),
  });

  const { assetId } = paramsSchema.parse(request.params);
  const { limit } = querySchema.parse(request.query);

  const result = await db.query<{
    total_holders: number;
    total_units_held: number;
  }>(
    `
      SELECT
        COUNT(*)::integer AS total_holders,
        COALESCE(SUM(units_owned), 0)::integer AS total_units_held
      FROM coOwn_holdings
      WHERE asset_id = $1
    `,
    [assetId]
  );

  return {
    ok: true,
    aggregate: {
      totalHolders: result.rows[0]?.total_holders ?? 0,
      totalUnitsHeld: result.rows[0]?.total_units_held ?? 0,
    },
  };
});

// ── Order preview (authoritative server-side) ──

app.post('/co-own/assets/:assetId/orders/preview', async (request, reply) => {
  const paramsSchema = z.object({ assetId: z.string().min(2) });
  const bodySchema = z.object({
    userId: z.string().min(2),
    side: z.enum(['buy', 'sell']),
    units: z.number().int().min(1).max(COOWN_POLICY.maxOrderUnits),
    orderType: z.enum(['market', 'limit', 'protected_market']).default('market'),
    limitPriceGbp: z.number().positive().optional(),
    maxPriceGbp: z.number().positive().optional(),
    minPriceGbp: z.number().positive().optional(),
  }).superRefine((value, ctx) => {
    if (value.orderType === 'limit' && !value.limitPriceGbp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'limitPriceGbp is required for limit orders',
        path: ['limitPriceGbp'],
      });
    }
    if (value.orderType === 'protected_market') {
      if (value.side === 'buy' && !value.maxPriceGbp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'maxPriceGbp is required for protected_market buy orders',
          path: ['maxPriceGbp'],
        });
      }
      if (value.side === 'sell' && !value.minPriceGbp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'minPriceGbp is required for protected_market sell orders',
          path: ['minPriceGbp'],
        });
      }
    }
  });

  const { assetId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);

  const assetResult = await db.query<{
    id: string;
    unit_price_gbp: number | string;
    unit_price_stable: number | string;
    available_units: number;
    total_units: number;
    is_open: boolean;
  }>(
    `
      SELECT id, unit_price_gbp, unit_price_stable, available_units, total_units, is_open
      FROM coOwn_assets
      WHERE id = $1
    `,
    [assetId]
  );

  const asset = assetResult.rows[0];
  if (!asset) {
    reply.code(404);
    return { ok: false, error: 'Co-Own asset not found' };
  }

  if (!asset.is_open) {
    reply.code(409);
    return { ok: false, error: 'Co-Own asset is closed for trading' };
  }

  const referencePriceGbp = Number(asset.unit_price_gbp);
  const protectionCapGbp =
    payload.orderType === 'protected_market'
      ? payload.side === 'buy'
        ? (payload.maxPriceGbp ?? null)
        : (payload.minPriceGbp ?? null)
      : null;
  const orderPriceGbp =
    payload.orderType === 'limit'
      ? roundTo(payload.limitPriceGbp ?? referencePriceGbp, 4)
      : payload.orderType === 'protected_market' && protectionCapGbp
        ? roundTo(protectionCapGbp, 4)
        : referencePriceGbp;

  const oppositeSide = payload.side === 'buy' ? 'sell' : 'buy';
  const priceFilter =
    payload.orderType === 'limit'
      ? (payload.limitPriceGbp ?? null)
      : protectionCapGbp;
  const restingOrders = await db.query<{
    units: number;
    remaining_units: number;
    unit_price_gbp: string;
  }>(
    `
      SELECT units, remaining_units, unit_price_gbp::text
      FROM coOwn_orders
      WHERE asset_id = $1
        AND side = $2
        AND status IN ('open', 'partially_filled')
        AND (
          $3::numeric IS NULL
          OR ($4 = 'buy' AND unit_price_gbp <= $3)
          OR ($4 = 'sell' AND unit_price_gbp >= $3)
        )
      ORDER BY
        CASE WHEN $4 = 'buy' THEN unit_price_gbp END ASC,
        CASE WHEN $4 = 'sell' THEN unit_price_gbp END DESC,
        id ASC
    `,
    [assetId, oppositeSide, priceFilter, payload.side]
  );

  let remainingUnits = payload.units;
  let filledUnits = 0;
  let grossNotional = 0;
  let worstPrice = 0;
  let avgFillPrice = 0;
  let slippageBeyondDepth = false;

  for (const resting of restingOrders.rows) {
    if (remainingUnits <= 0) break;
    const restingRemaining = resting.remaining_units;
    if (restingRemaining <= 0) continue;

    const fillUnits = Math.min(remainingUnits, restingRemaining);
    const tradePrice = Number(resting.unit_price_gbp);
    grossNotional = roundTo(grossNotional + fillUnits * tradePrice, 4);
    worstPrice = tradePrice;
    remainingUnits -= fillUnits;
    filledUnits += fillUnits;
  }

  if (
    payload.side === 'buy'
    && remainingUnits > 0
    && asset.available_units > 0
    && (payload.orderType === 'market'
      || (payload.orderType === 'protected_market' && (protectionCapGbp ?? 0) >= referencePriceGbp)
      || (payload.orderType === 'limit' && (payload.limitPriceGbp ?? 0) >= referencePriceGbp))
  ) {
    const primaryFillUnits = Math.min(remainingUnits, asset.available_units);
    grossNotional = roundTo(grossNotional + primaryFillUnits * referencePriceGbp, 4);
    if (worstPrice === 0) worstPrice = referencePriceGbp;
    remainingUnits -= primaryFillUnits;
    filledUnits += primaryFillUnits;
  }

  if (filledUnits > 0) {
    avgFillPrice = roundTo(grossNotional / filledUnits, 4);
  }
  if (remainingUnits > 0) {
    slippageBeyondDepth = true;
  }

  const fee = roundTo(grossNotional * CO_OWN_TRADE_FEE_RATE, 4);
  const total =
    payload.side === 'buy'
      ? roundTo(grossNotional + fee, 4)
      : roundTo(Math.max(0, grossNotional - fee), 4);

  const eligibility = await evaluateMarketEligibility(db, {
    userId: payload.userId,
    market: 'co-own',
    orderNotionalGbp: grossNotional,
  });

  reply.code(200);
  return {
    ok: true,
    preview: {
      assetId,
      side: payload.side,
      units: payload.units,
      orderType: payload.orderType,
      limitPriceGbp: payload.limitPriceGbp ?? null,
      protectionPriceGbp: protectionCapGbp ?? null,
      protectionPriceGbpStr: protectionCapGbp != null ? formatGbp(protectionCapGbp) : null,
      referencePriceGbp,
      referencePriceGbpStr: formatGbp(referencePriceGbp),
      orderPriceGbp,
      orderPriceGbpStr: formatGbp(orderPriceGbp),
      estimatedFill: {
        filledUnits,
        remainingUnits: Math.max(0, remainingUnits),
        avgFillPrice,
        avgFillPriceStr: formatGbp(avgFillPrice),
        worstPrice,
        worstPriceStr: formatGbp(worstPrice),
        grossNotional,
        grossNotionalStr: formatGbp(grossNotional),
        slippageBeyondDepth,
      },
      fee,
      feeStr: formatGbp(fee),
      total,
      totalStr: formatGbp(total),
      feeRate: CO_OWN_TRADE_FEE_RATE,
      availableUnits: asset.available_units,
      totalUnits: asset.total_units,
      eligibility: {
        allowed: eligibility.allowed,
        code: eligibility.code ?? null,
        message: eligibility.message,
      },
      binding: false,
      validUntil: new Date(Date.now() + 15_000).toISOString(),
    },
  };
});

// ── Order reservation ──

app.post('/co-own/assets/:assetId/orders/reserve', async (request, reply) => {
  const paramsSchema = z.object({ assetId: z.string().min(2) });
  const bodySchema = z.object({
    userId: z.string().min(2),
    side: z.enum(['buy', 'sell']),
    units: z.number().int().min(1).max(COOWN_POLICY.maxOrderUnits),
    orderType: z.enum(['market', 'limit', 'protected_market']).default('market'),
    limitPriceGbp: z.number().positive().optional(),
    maxPriceGbp: z.number().positive().optional(),
    minPriceGbp: z.number().positive().optional(),
    idempotencyKey: z.string().min(8).max(140).optional(),
  }).superRefine((value, ctx) => {
    if (value.orderType === 'protected_market') {
      if (value.side === 'buy' && !value.maxPriceGbp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'maxPriceGbp is required for protected_market buy orders',
          path: ['maxPriceGbp'],
        });
      }
      if (value.side === 'sell' && !value.minPriceGbp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'minPriceGbp is required for protected_market sell orders',
          path: ['minPriceGbp'],
        });
      }
    }
  });

  const { assetId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);
  await ensureUserExists(payload.userId);

  const reservationIdempotencyHash = payload.idempotencyKey
    ? hashCoOwnReservationPayload({
        side: payload.side,
        units: payload.units,
        orderType: payload.orderType,
        limitPriceGbp: payload.limitPriceGbp ?? null,
        maxPriceGbp: payload.maxPriceGbp ?? null,
        minPriceGbp: payload.minPriceGbp ?? null,
      })
    : null;

  if (payload.idempotencyKey && reservationIdempotencyHash) {
    const idempotentResponse = await getCoOwnReservationIdempotentResponse(db, {
      assetId,
      userId: payload.userId,
      idempotencyKey: payload.idempotencyKey,
      requestHash: reservationIdempotencyHash,
    });
    if (idempotentResponse) {
      reply.code(200);
      return idempotentResponse;
    }
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `
        UPDATE coown_order_reservations
        SET status = 'expired', updated_at = NOW()
        WHERE user_id = $1 AND asset_id = $2 AND status = 'active'
      `,
      [payload.userId, assetId]
    );

    const assetResult = await client.query<{
      id: string;
      unit_price_gbp: number | string;
      available_units: number;
      is_open: boolean;
    }>(
      `SELECT id, unit_price_gbp, available_units, is_open FROM coOwn_assets WHERE id = $1 FOR UPDATE`,
      [assetId]
    );
    const asset = assetResult.rows[0];
    if (!asset) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Co-Own asset not found' };
    }
    if (!asset.is_open) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Co-Own asset is closed for trading' };
    }

    const referencePriceGbp = Number(asset.unit_price_gbp);
    const protectionCapGbp =
      payload.orderType === 'protected_market'
        ? payload.side === 'buy'
          ? (payload.maxPriceGbp ?? null)
          : (payload.minPriceGbp ?? null)
        : null;
    const orderPriceGbp =
      payload.orderType === 'limit'
        ? roundTo(payload.limitPriceGbp ?? referencePriceGbp, 4)
        : payload.orderType === 'protected_market' && protectionCapGbp
          ? roundTo(protectionCapGbp, 4)
          : referencePriceGbp;
    const grossNotional = roundTo(payload.units * orderPriceGbp, 4);
    const fee = roundTo(grossNotional * CO_OWN_TRADE_FEE_RATE, 4);
    const total = payload.side === 'buy' ? roundTo(grossNotional + fee, 4) : roundTo(Math.max(0, grossNotional - fee), 4);

    let reserved1zeUnits = 0;
    let reservedUnits = 0;

    if (payload.side === 'buy') {
      const reserve1ze = roundTo(total, 4);
      reserved1zeUnits = Math.ceil(reserve1ze * 1000);

      const walletResult = await client.query<{ oneze_balance_units: string }>(
        `SELECT oneze_balance_units::text FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [payload.userId]
      );
      const wallet = walletResult.rows[0];
      if (!wallet) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Wallet not found' };
      }

      const otherReservedResult = await client.query<{ total: string }>(
        `
          SELECT COALESCE(SUM(reserved_1ze_units), 0)::text AS total
          FROM coown_order_reservations
          WHERE user_id = $1 AND status IN ('active', 'placed') AND id <> $2
        `,
        [payload.userId, '']
      );
      const otherReservedUnits = Number(otherReservedResult.rows[0]?.total ?? 0);
      const availableUnits = Number(wallet.oneze_balance_units) - otherReservedUnits;

      if (availableUnits < reserved1zeUnits) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Insufficient 1ZE balance. Required: ${(reserved1zeUnits / 1000).toFixed(2)} 1ZE, available: ${(availableUnits / 1000).toFixed(2)} 1ZE`,
          code: 'INSUFFICIENT_1ZE',
        };
      }
    } else {
      reservedUnits = payload.units;
      const holdingResult = await client.query<{ units_owned: number }>(
        `SELECT units_owned FROM coOwn_holdings WHERE user_id = $1 AND asset_id = $2 FOR UPDATE`,
        [payload.userId, assetId]
      );
      const holding = holdingResult.rows[0];
      const unitsOwned = holding?.units_owned ?? 0;

      const otherReservedResult = await client.query<{ total: number }>(
        `
          SELECT COALESCE(SUM(reserved_units), 0) AS total
          FROM coown_order_reservations
          WHERE user_id = $1 AND asset_id = $2 AND status IN ('active', 'placed')
        `,
        [payload.userId, assetId]
      );
      const otherReservedUnits = Number(otherReservedResult.rows[0]?.total ?? 0);
      const availableUnits = unitsOwned - otherReservedUnits;

      if (availableUnits < reservedUnits) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Insufficient units to sell. Required: ${reservedUnits}, available: ${availableUnits}`,
          code: 'INSUFFICIENT_UNITS',
        };
      }
    }

    const reservationId = `res_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + CO_OWN_RESERVATION_TTL_MS);

    await client.query(
      `
        INSERT INTO coown_order_reservations (
          id, user_id, asset_id, side,
          reserved_1ze_units, reserved_units,
          reference_price_gbp, estimated_total_gbp, estimated_fee_gbp,
          expires_at, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
      `,
      [
        reservationId,
        payload.userId,
        assetId,
        payload.side,
        reserved1zeUnits,
        reservedUnits,
        referencePriceGbp,
        total,
        fee,
        expiresAt,
      ]
    );

    reply.code(201);
    const reservationResponseBody = {
      ok: true,
      reservation: {
        id: reservationId,
        assetId,
        userId: payload.userId,
        side: payload.side,
        reserved1zeUnits,
        reserved1zeUnitsStr: String(reserved1zeUnits),
        reservedUnits,
        referencePriceGbp,
        referencePriceGbpStr: formatGbp(referencePriceGbp),
        estimatedTotalGbp: total,
        estimatedTotalGbpStr: formatGbp(total),
        estimatedFeeGbp: fee,
        estimatedFeeGbpStr: formatGbp(fee),
        expiresAt: expiresAt.toISOString(),
        status: 'active',
      },
    };

    if (payload.idempotencyKey && reservationIdempotencyHash) {
      await saveCoOwnReservationIdempotentResponse(client, {
        assetId,
        userId: payload.userId,
        idempotencyKey: payload.idempotencyKey,
        requestHash: reservationIdempotencyHash,
        responseStatus: 201,
        responseBody: reservationResponseBody,
      });
    }

    await client.query('COMMIT');

    return reservationResponseBody;
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return {
      ok: false,
      error: `Unable to reserve order: ${(error as Error).message}`,
    };
  } finally {
    client.release();
  }
});

// Cancel a reservation (release the held funds/units)
app.delete('/co-own/assets/:assetId/orders/reserve/:reservationId', async (request, reply) => {
  const paramsSchema = z.object({
    assetId: z.string().min(2),
    reservationId: z.string().min(8),
  });
  const { assetId, reservationId } = paramsSchema.parse(request.params);

  const actorUserId = request.authUser?.userId;
  if (!actorUserId) {
    reply.code(401);
    return { ok: false, error: 'Authentication required to cancel a reservation' };
  }

  const result = await db.query(
    `
      UPDATE coown_order_reservations
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND asset_id = $2 AND user_id = $3 AND status = 'active'
      RETURNING id
    `,
    [reservationId, assetId, actorUserId]
  );

  if (result.rows.length === 0) {
    const existing = await db.query<{ user_id: string; status: string }>(
      `SELECT user_id, status FROM coown_order_reservations WHERE id = $1 AND asset_id = $2`,
      [reservationId, assetId]
    );
    if (existing.rows[0] && existing.rows[0].user_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Only the reservation owner can cancel it' };
    }
    reply.code(404);
    return { ok: false, error: 'Reservation not found or already released' };
  }

  reply.code(200);
  return { ok: true, reservationId };
});

app.post('/co-own/assets/:assetId/orders', async (request, reply) => {
  const paramsSchema = z.object({ assetId: z.string().min(2) });
  const bodySchema = z.object({
    userId: z.string().min(2),
    side: z.enum(['buy', 'sell']),
    units: z.number().int().min(1).max(COOWN_POLICY.maxOrderUnits),
    orderType: z.enum(['market', 'limit', 'protected_market']).default('market'),
    limitPriceGbp: z.number().positive().optional(),
    maxPriceGbp: z.number().positive().optional(),
    minPriceGbp: z.number().positive().optional(),
    reservationId: z.string().min(8).max(160),
    idempotencyKey: z.string().min(8).max(140).optional(),
  }).superRefine((value, ctx) => {
    if (value.orderType === 'limit' && !value.limitPriceGbp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'limitPriceGbp is required for limit orders',
        path: ['limitPriceGbp'],
      });
    }

    if (value.orderType === 'market' && value.limitPriceGbp !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'limitPriceGbp is only valid for limit orders',
        path: ['limitPriceGbp'],
      });
    }

    if (value.orderType === 'protected_market') {
      if (value.limitPriceGbp !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'protected_market orders use maxPriceGbp/minPriceGbp, not limitPriceGbp',
          path: ['limitPriceGbp'],
        });
      }
      if (value.side === 'buy' && !value.maxPriceGbp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'maxPriceGbp is required for protected_market buy orders',
          path: ['maxPriceGbp'],
        });
      }
      if (value.side === 'sell' && !value.minPriceGbp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'minPriceGbp is required for protected_market sell orders',
          path: ['minPriceGbp'],
        });
      }
    }
  });

  const { assetId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);
  await ensureUserExists(payload.userId);

  const idempotencyRequestHash = payload.idempotencyKey
    ? hashCoOwnOrderPayload({
        side: payload.side,
        units: payload.units,
        orderType: payload.orderType,
        limitPriceGbp: payload.limitPriceGbp ?? null,
        maxPriceGbp: payload.maxPriceGbp ?? null,
        minPriceGbp: payload.minPriceGbp ?? null,
        reservationId: payload.reservationId,
      })
    : null;

  if (payload.idempotencyKey && idempotencyRequestHash) {
    const idempotentResponse = await getCoOwnOrderIdempotentResponse(db, {
      assetId,
      userId: payload.userId,
      idempotencyKey: payload.idempotencyKey,
      requestHash: idempotencyRequestHash,
    });
    if (idempotentResponse) {
      reply.code(200);
      return idempotentResponse;
    }
  }
  const tradingHaltState = await getOnezeMintBurnHaltState();
  if (tradingHaltState.halted) {
    reply.code(423);
    return {
      ok: false,
      error: 'Co-Own trading is paused while 1ZE reconciliation is in progress',
      code: 'CO_OWN_RECONCILIATION_HALT',
    };
  }

  const client = await db.connect();
  let amlAlert: { alertId: string; status: string } | null = null;
  try {
    await client.query('BEGIN');

    if (payload.idempotencyKey && idempotencyRequestHash) {
      const commandInsert = await client.query<{ id: string; status: string }>(
        `
          INSERT INTO coown_order_commands (asset_id, actor_id, idempotency_key, request_hash, status)
          VALUES ($1, $2, $3, $4, 'pending')
          ON CONFLICT (asset_id, idempotency_key) DO NOTHING
          RETURNING id, status
        `,
        [assetId, payload.userId, payload.idempotencyKey, idempotencyRequestHash]
      );

      if (commandInsert.rows.length === 0) {
        const existingCommand = await client.query<{
          status: string;
          order_id: string | null;
          response_code: number | null;
          response_body: Record<string, unknown> | null;
        }>(
          `
            SELECT status, order_id, response_code, response_body
            FROM coown_order_commands
            WHERE asset_id = $1 AND idempotency_key = $2
            LIMIT 1
          `,
          [assetId, payload.idempotencyKey]
        );

        const existing = existingCommand.rows[0];
        if (existing && (existing.status === 'acknowledged' || existing.status === 'completed')) {
          await client.query('ROLLBACK');
          reply.code(existing.response_code ?? 200);
          return {
            ok: true,
            status: 'acknowledged',
            ...(existing.response_body as Record<string, unknown> ?? {}),
          };
        }

        if (existing && existing.status === 'pending') {
          await client.query('ROLLBACK');
          reply.code(202);
          return { ok: true, status: 'processing' };
        }
      }
    }

    const assetResult = await client.query<{
      id: string;
      issuer_id: string;
      total_units: number;
      available_units: number;
      unit_price_gbp: number | string;
      unit_price_stable: number | string;
      holders: number;
      volume_24h_gbp: number | string;
      is_open: boolean;
    }>(
      `
        SELECT
          id,
          issuer_id,
          total_units,
          available_units,
          unit_price_gbp,
          unit_price_stable,
          holders,
          volume_24h_gbp,
          is_open
        FROM coOwn_assets
        WHERE id = $1
        FOR UPDATE
      `,
      [assetId]
    );

    const asset = assetResult.rows[0];
    if (!asset) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Co-Own asset not found' };
    }

    if (!asset.is_open) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Co-Own asset is closed for trading' };
    }

    const reservationResult = await client.query<{
      id: string;
      user_id: string;
      asset_id: string;
      side: 'buy' | 'sell';
      reserved_1ze_units: string;
      reserved_units: number;
      expires_at: string;
      status: string;
    }>(
      `
        SELECT
          id,
          user_id,
          asset_id,
          side,
          reserved_1ze_units::text,
          reserved_units,
          expires_at::text,
          status
        FROM coown_order_reservations
        WHERE id = $1
        FOR UPDATE
      `,
      [payload.reservationId]
    );
    const reservation = reservationResult.rows[0];
    const reservationMismatch = !reservation
      || reservation.user_id !== payload.userId
      || reservation.asset_id !== assetId
      || reservation.side !== payload.side
      || reservation.status !== 'active'
      || Date.parse(reservation.expires_at) <= Date.now();
    if (reservationMismatch) {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: 'Order reservation is missing, expired, or does not match this order',
        code: 'CO_OWN_RESERVATION_INVALID',
      };
    }

    const referencePriceGbp = Number(asset.unit_price_gbp);
    const protectionCapGbp =
      payload.orderType === 'protected_market'
        ? payload.side === 'buy'
          ? (payload.maxPriceGbp ?? null)
          : (payload.minPriceGbp ?? null)
        : null;
    const proposedUnitPrice =
      payload.orderType === 'limit'
        ? roundTo(payload.limitPriceGbp ?? referencePriceGbp, 4)
        : payload.orderType === 'protected_market' && protectionCapGbp
          ? roundTo(protectionCapGbp, 4)
          : referencePriceGbp;
    const proposedNotionalGbp = roundTo(Math.max(0, payload.units) * proposedUnitPrice, 2);
    const requiredBuyReservationUnits = Math.ceil(
      roundTo(proposedNotionalGbp * (1 + CO_OWN_TRADE_FEE_RATE), 4) * 1000
    );
    const reservationIsInsufficient = payload.side === 'buy'
      ? Number(reservation.reserved_1ze_units) < requiredBuyReservationUnits
      : Number(reservation.reserved_units) < payload.units;
    if (reservationIsInsufficient) {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: 'Reserved funds or units do not cover this order obligation',
        code: 'CO_OWN_RESERVATION_INSUFFICIENT',
      };
    }

    const eligibility = await evaluateMarketEligibility(client, {
      userId: payload.userId,
      market: 'co-own',
      orderNotionalGbp: proposedNotionalGbp,
    });

    if (!eligibility.allowed) {
      await client.query('ROLLBACK');

      await appendComplianceAuditSafe(request, {
        eventType: 'co-own.order.blocked.eligibility',
        subjectUserId: payload.userId,
        payload: {
          assetId,
          side: payload.side,
          units: payload.units,
          orderType: payload.orderType,
          orderNotionalGbp: proposedNotionalGbp,
          code: eligibility.code,
          message: eligibility.message,
        },
      });

      reply.code(403);
      return {
        ok: false,
        error: eligibility.message,
        code: eligibility.code,
      };
    }

    const settlementCapability = await evaluateWalletCapability(client, payload.userId, 'settlement', {
      amountUsd: proposedNotionalGbp,
      currency: 'GBP',
      market: 'co-own',
    });
    if (!settlementCapability.allowed) {
      await client.query('ROLLBACK');

      await appendComplianceAuditSafe(request, {
        eventType: 'co-own.order.blocked.wallet_capability',
        subjectUserId: payload.userId,
        payload: {
          assetId,
          side: payload.side,
          units: payload.units,
          orderType: payload.orderType,
          orderNotionalGbp: proposedNotionalGbp,
          capability: 'settlement',
          code: settlementCapability.code,
          reason: settlementCapability.reason,
        },
      });

      reply.code(403);
      return {
        ok: false,
        error: settlementCapability.reason ?? 'Wallet capability check failed',
        code: settlementCapability.code,
      };
    }

    const preTradeAml = await evaluateAmlRisk(client, {
      userId: payload.userId,
      market: 'co-own',
      amountGbp: proposedNotionalGbp,
      counterpartyUserId: asset.issuer_id,
    });

    if (preTradeAml.shouldBlock) {
      await client.query('ROLLBACK');

      if (preTradeAml.shouldCreateAlert) {
        amlAlert = await createAmlAlert(db, {
          userId: payload.userId,
          relatedUserId: asset.issuer_id,
          market: 'co-own',
          eventType: 'trade',
          amountGbp: proposedNotionalGbp,
          referenceId: `${assetId}:pretrade`,
          ruleCode: 'AML_PRE_TRADE_BLOCK',
          notes: 'Co-Own order blocked by AML pre-trade evaluation',
          context: {
            assetId,
            side: payload.side,
            units: payload.units,
            orderType: payload.orderType,
          },
          assessment: preTradeAml,
        });
      }

      await appendComplianceAuditSafe(request, {
        eventType: 'co-own.order.blocked.aml',
        subjectUserId: payload.userId,
        payload: {
          assetId,
          side: payload.side,
          units: payload.units,
          orderType: payload.orderType,
          orderNotionalGbp: proposedNotionalGbp,
          riskScore: preTradeAml.riskScore,
          riskLevel: preTradeAml.riskLevel,
          alertId: amlAlert?.alertId ?? null,
        },
      });

      reply.code(403);
      return {
        ok: false,
        error: 'Order blocked by AML controls. Please contact support for review.',
        code: 'AML_BLOCKED',
        riskLevel: preTradeAml.riskLevel,
        alertId: amlAlert?.alertId ?? null,
      };
    }

    if (payload.side === 'sell') {
      const sellerHolding = await getCoOwnHoldingForUpdate(client, payload.userId, assetId);
      const sellerUnits = sellerHolding?.units_owned ?? 0;
      if (sellerUnits < payload.units) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Insufficient units to sell. Available: ${sellerUnits}`,
        };
      }
    }

    const orderPriceGbp =
      payload.orderType === 'limit'
        ? roundTo(payload.limitPriceGbp ?? referencePriceGbp, 4)
        : payload.orderType === 'protected_market' && protectionCapGbp
          ? roundTo(protectionCapGbp, 4)
          : referencePriceGbp;

    const orderMarketSeq = await allocateMarketSequence(client, assetId);

    const touchedOpposingLevels = new Map<string, { side: 'buy' | 'sell'; price: number }>();
    let lastMarketSeq = orderMarketSeq;

    const orderResult = await client.query<{
      id: number;
      side: 'buy' | 'sell';
      units: number;
      remaining_units: number;
      filled_units: number;
      unit_price_gbp: string;
      fee_gbp: string;
      total_gbp: string;
      created_at: string;
    }>(
      `
        INSERT INTO coOwn_orders (
          asset_id,
          user_id,
          side,
          order_type,
          limit_price_gbp,
          protection_price_gbp,
          units,
          remaining_units,
          filled_units,
          unit_price_gbp,
          fee_gbp,
          total_gbp,
          updated_at,
          status,
          market_sequence
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 0, $8, 0, 0, NOW(), 'open', $9)
        RETURNING id, side, units, remaining_units, filled_units, unit_price_gbp::text, fee_gbp::text, total_gbp::text, created_at
      `,
      [
        assetId,
        payload.userId,
        payload.side,
        payload.orderType,
        payload.orderType === 'limit' ? payload.limitPriceGbp : null,
        payload.orderType === 'protected_market' ? (protectionCapGbp ?? null) : null,
        payload.units,
        orderPriceGbp,
        orderMarketSeq,
      ]
    );

    const incomingOrderId = orderResult.rows[0].id;
    await client.query(
      `
        UPDATE coown_order_reservations
        SET status = 'placed', placed_order_id = $2, updated_at = NOW()
        WHERE id = $1 AND status = 'active'
      `,
      [payload.reservationId, incomingOrderId]
    );
    let remainingUnits = payload.units;
    let filledUnits = 0;
    let tradedNotionalGbp = 0;
    let tradedFeeGbp = 0;
    let lastExecutionPriceGbp: number | null = null;
    let nextAvailableUnits = asset.available_units;

    const restingOrders = await client.query<{
      id: number;
      user_id: string;
      side: 'buy' | 'sell';
      units: number;
      remaining_units: number;
      filled_units: number;
      unit_price_gbp: string;
      fee_gbp: string;
      total_gbp: string;
    }>(
      `
        SELECT
          id,
          user_id,
          side,
          units,
          remaining_units,
          filled_units,
          unit_price_gbp::text,
          fee_gbp::text,
          total_gbp::text
        FROM coOwn_orders
        WHERE asset_id = $1
          AND side = $2
          AND status IN ('open', 'partially_filled')
          AND id <> $3
          AND user_id <> $6
          AND (
            $4::numeric IS NULL
            OR (
              $5 = 'buy' AND unit_price_gbp <= $4
            )
            OR (
              $5 = 'sell' AND unit_price_gbp >= $4
            )
          )
        ORDER BY
          CASE WHEN $5 = 'buy' THEN unit_price_gbp END ASC,
          CASE WHEN $5 = 'sell' THEN unit_price_gbp END DESC,
          id ASC
        FOR UPDATE
      `,
      [
        assetId,
        payload.side === 'buy' ? 'sell' : 'buy',
        incomingOrderId,
        payload.orderType === 'limit'
          ? (payload.limitPriceGbp ?? null)
          : payload.orderType === 'protected_market'
            ? (protectionCapGbp ?? null)
            : null,
        payload.side,
        payload.userId,
      ]
    );

    for (const resting of restingOrders.rows) {
      if (remainingUnits <= 0) {
        break;
      }

      const restingRemaining = resting.remaining_units;
      if (restingRemaining <= 0) {
        continue;
      }

      const fillUnits = Math.min(remainingUnits, restingRemaining);
      const tradePrice = Number(resting.unit_price_gbp);
      const tradeNotional = roundTo(fillUnits * tradePrice, 4);
      const tradeFee = roundTo(tradeNotional * CO_OWN_TRADE_FEE_RATE, 4);
      lastExecutionPriceGbp = tradePrice;

      if (payload.side === 'buy') {
        await applyCoOwnTransfer(client, {
          assetId,
          buyerId: payload.userId,
          sellerId: resting.user_id,
          units: fillUnits,
          unitPriceGbp: tradePrice,
          feeGbp: tradeFee,
          sourceType: 'coOwn_trade',
          buyOrderId: incomingOrderId,
          sellOrderId: resting.id,
          enforceSellerHolding: true,
        });
      } else {
        await applyCoOwnTransfer(client, {
          assetId,
          buyerId: resting.user_id,
          sellerId: payload.userId,
          units: fillUnits,
          unitPriceGbp: tradePrice,
          feeGbp: tradeFee,
          sourceType: 'coOwn_trade',
          buyOrderId: resting.id,
          sellOrderId: incomingOrderId,
          enforceSellerHolding: true,
        });
      }

      tradedNotionalGbp = roundTo(tradedNotionalGbp + tradeNotional, 4);
      tradedFeeGbp = roundTo(tradedFeeGbp + tradeFee, 4);
      remainingUnits -= fillUnits;
      filledUnits += fillUnits;

      const restingRemainingAfter = restingRemaining - fillUnits;
      const restingFilledAfter = resting.filled_units + fillUnits;
      const restingStatus: CoOwnOrderStatus =
        restingRemainingAfter <= 0 ? 'filled' : 'partially_filled';
      const restingTradeNet =
        resting.side === 'buy'
          ? roundTo(tradeNotional + tradeFee, 4)
          : roundTo(Math.max(0, tradeNotional - tradeFee), 4);
      const restingTotalAfter = roundTo(Number(resting.total_gbp) + restingTradeNet, 4);
      const restingFeeAfter = roundTo(Number(resting.fee_gbp) + tradeFee, 4);

      const fillMarketSeq = await allocateMarketSequence(client, assetId);
      const restingPrice = Number(resting.unit_price_gbp);
      touchedOpposingLevels.set(`${resting.side}:${restingPrice}`, { side: resting.side, price: restingPrice });
      lastMarketSeq = fillMarketSeq;

      await client.query(
        `
          UPDATE coOwn_orders
          SET
            remaining_units = $2,
            filled_units = $3,
            fee_gbp = $4,
            total_gbp = $5,
            status = $6,
            updated_at = NOW(),
            market_sequence = $7
          WHERE id = $1
        `,
        [
          resting.id,
          Math.max(0, restingRemainingAfter),
          restingFilledAfter,
          restingFeeAfter,
          restingTotalAfter,
          restingStatus,
          fillMarketSeq,
        ]
      );

      const restingReserve1zeUnits = resting.side === 'buy'
        ? Math.ceil(roundTo(restingRemainingAfter * Number(resting.unit_price_gbp) * (1 + CO_OWN_TRADE_FEE_RATE), 4) * 1000)
        : 0;
      const restingReserveUnits = resting.side === 'sell' ? Math.max(0, restingRemainingAfter) : 0;
      await client.query(
        `
          UPDATE coown_order_reservations
          SET reserved_1ze_units = $2, reserved_units = $3, updated_at = NOW()
          WHERE placed_order_id = $1 AND status = 'placed'
        `,
        [resting.id, restingReserve1zeUnits, restingReserveUnits]
      );
    }

    if (
      payload.side === 'buy'
      && remainingUnits > 0
      && (payload.orderType === 'market'
        || (payload.orderType === 'protected_market' && (protectionCapGbp ?? 0) >= referencePriceGbp)
        || (payload.orderType === 'limit' && (payload.limitPriceGbp ?? 0) >= referencePriceGbp))
      && nextAvailableUnits > 0
    ) {
      const primaryFillUnits = Math.min(remainingUnits, nextAvailableUnits);
      if (primaryFillUnits > 0) {
        const tradePrice = referencePriceGbp;
        const tradeNotional = roundTo(primaryFillUnits * tradePrice, 4);
        const tradeFee = roundTo(tradeNotional * CO_OWN_TRADE_FEE_RATE, 4);
        lastExecutionPriceGbp = tradePrice;

        await applyCoOwnTransfer(client, {
          assetId,
          buyerId: payload.userId,
          sellerId: asset.issuer_id,
          units: primaryFillUnits,
          unitPriceGbp: tradePrice,
          feeGbp: tradeFee,
          sourceType: 'coOwn_trade',
          buyOrderId: incomingOrderId,
          sellOrderId: null,
          enforceSellerHolding: false,
        });

        tradedNotionalGbp = roundTo(tradedNotionalGbp + tradeNotional, 4);
        tradedFeeGbp = roundTo(tradedFeeGbp + tradeFee, 4);
        remainingUnits -= primaryFillUnits;
        filledUnits += primaryFillUnits;
        nextAvailableUnits -= primaryFillUnits;
      }
    }

    let orderStatus: CoOwnOrderStatus;
    let persistedRemainingUnits = Math.max(0, remainingUnits);

    if (payload.orderType === 'market' || payload.orderType === 'protected_market') {
      if (filledUnits > 0 && remainingUnits > 0) {
        orderStatus = 'partially_filled';
        persistedRemainingUnits = 0;
      } else if (filledUnits > 0) {
        orderStatus = 'filled';
        persistedRemainingUnits = 0;
      } else {
        orderStatus = 'rejected';
        persistedRemainingUnits = 0;
      }
    } else if (filledUnits === 0) {
      orderStatus = 'open';
    } else if (remainingUnits > 0) {
      orderStatus = 'partially_filled';
    } else {
      orderStatus = 'filled';
    }

    const orderTotalGbp =
      payload.side === 'buy'
        ? roundTo(tradedNotionalGbp + tradedFeeGbp, 4)
        : roundTo(Math.max(0, tradedNotionalGbp - tradedFeeGbp), 4);

    const incomingOrder = await client.query<{
      id: number;
      created_at: string;
      updated_at: string;
      status: CoOwnOrderStatus;
      remaining_units: number;
      filled_units: number;
    }>(
      `
        UPDATE coOwn_orders
        SET
          remaining_units = $2,
          filled_units = $3,
          fee_gbp = $4,
          total_gbp = $5,
          status = $6,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, created_at, updated_at, status, remaining_units, filled_units
      `,
      [incomingOrderId, persistedRemainingUnits, filledUnits, tradedFeeGbp, orderTotalGbp, orderStatus]
    );

    const incomingReserve1zeUnits = payload.side === 'buy'
      ? Math.ceil(roundTo(persistedRemainingUnits * orderPriceGbp * (1 + CO_OWN_TRADE_FEE_RATE), 4) * 1000)
      : 0;
    const incomingReserveUnits = payload.side === 'sell' ? persistedRemainingUnits : 0;
    await client.query(
      `
        UPDATE coown_order_reservations
        SET reserved_1ze_units = $2, reserved_units = $3, updated_at = NOW()
        WHERE id = $1 AND placed_order_id = $4 AND status = 'placed'
      `,
      [payload.reservationId, incomingReserve1zeUnits, incomingReserveUnits, incomingOrderId]
    );

    const bookDeltaChanges: Array<{
      side: 'buy' | 'sell';
      priceGbp: number;
      priceGbpStr: string;
      units: number;
      orderCount: number;
    }> = [];

    if (persistedRemainingUnits > 0 && (orderStatus === 'open' || orderStatus === 'partially_filled')) {
      bookDeltaChanges.push({
        side: payload.side,
        priceGbp: orderPriceGbp,
        priceGbpStr: formatGbp(orderPriceGbp),
        units: persistedRemainingUnits,
        orderCount: 1,
      });
    }

    if (touchedOpposingLevels.size > 0) {
      const opposingSide = payload.side === 'buy' ? 'sell' : 'buy';
      const touchedPrices = Array.from(touchedOpposingLevels.values()).map((l) => l.price);
      const levelResult = await client.query<{
        side: 'buy' | 'sell';
        unit_price_gbp: string;
        units: string;
        order_count: string;
      }>(
        `
          SELECT side, unit_price_gbp::text, SUM(remaining_units)::text AS units, COUNT(*)::text AS order_count
          FROM coOwn_orders
          WHERE asset_id = $1 AND side = $2 AND status IN ('open', 'partially_filled') AND remaining_units > 0
            AND unit_price_gbp = ANY($3::numeric[])
          GROUP BY side, unit_price_gbp
        `,
        [assetId, opposingSide, touchedPrices]
      );
      for (const row of levelResult.rows) {
        bookDeltaChanges.push({
          side: row.side,
          priceGbp: Number(row.unit_price_gbp),
          priceGbpStr: row.unit_price_gbp,
          units: Number(row.units),
          orderCount: Number(row.order_count),
        });
      }
      for (const level of touchedOpposingLevels.values()) {
        if (!levelResult.rows.some((r) => Number(r.unit_price_gbp) === level.price)) {
          bookDeltaChanges.push({
            side: level.side,
            priceGbp: level.price,
            priceGbpStr: formatGbp(level.price),
            units: 0,
            orderCount: 0,
          });
        }
      }
    }

    const marketStatsResult = await client.query<{
      volume_24h_gbp: string;
      opening_price_gbp: string | null;
    }>(
      `
        SELECT
          COALESCE(SUM(notional_gbp), 0)::text AS volume_24h_gbp,
          (ARRAY_AGG(unit_price_gbp ORDER BY created_at ASC, id ASC))[1]::text AS opening_price_gbp
        FROM coOwn_trades
        WHERE asset_id = $1
          AND created_at >= NOW() - INTERVAL '24 hours'
      `,
      [assetId]
    );
    const marketStats = marketStatsResult.rows[0];
    const nextUnitPriceGbp = lastExecutionPriceGbp ?? referencePriceGbp;
    const stableRatio = Number(asset.unit_price_stable) / Math.max(referencePriceGbp, 0.0001);
    const nextUnitPriceStable = roundTo(nextUnitPriceGbp * stableRatio, 4);
    const openingPriceGbp = Number(marketStats?.opening_price_gbp ?? nextUnitPriceGbp);
    const nextMarketMovePct24h = openingPriceGbp > 0
      ? roundTo(((nextUnitPriceGbp - openingPriceGbp) / openingPriceGbp) * 100, 3)
      : 0;
    const nextVolume24hGbp = roundTo(Number(marketStats?.volume_24h_gbp ?? 0), 2);
    const nextHolders = await recalcCoOwnHolders(client, assetId);

    const updatedAssetResult = await client.query<{
      id: string;
      available_units: number;
      holders: number;
      volume_24h_gbp: string;
      unit_price_gbp: string;
      unit_price_stable: string;
      market_move_pct_24h: string;
      updated_at: string;
    }>(
      `
        UPDATE coOwn_assets
        SET
          available_units = $2,
          holders = $3,
          volume_24h_gbp = $4,
          unit_price_gbp = $5,
          unit_price_stable = $6,
          market_move_pct_24h = $7,
          is_open = CASE WHEN $2 <= 0 THEN FALSE ELSE is_open END,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          available_units,
          holders,
          volume_24h_gbp::text,
          unit_price_gbp::text,
          unit_price_stable::text,
          market_move_pct_24h::text,
          updated_at
      `,
      [
        assetId,
        nextAvailableUnits,
        nextHolders,
        nextVolume24hGbp,
        nextUnitPriceGbp,
        nextUnitPriceStable,
        nextMarketMovePct24h,
      ]
    );

    if (preTradeAml.shouldCreateAlert) {
      const monitoredAmount = tradedNotionalGbp > 0 ? tradedNotionalGbp : proposedNotionalGbp;
      amlAlert = await createAmlAlert(client, {
        userId: payload.userId,
        relatedUserId: asset.issuer_id,
        market: 'co-own',
        eventType: 'trade',
        amountGbp: monitoredAmount,
        referenceId: String(incomingOrder.rows[0].id),
        ruleCode: 'AML_POST_TRADE_MONITOR',
        notes: 'Co-Own order generated elevated AML risk score',
        context: {
          assetId,
          side: payload.side,
          orderType: payload.orderType,
          units: payload.units,
          filledUnits: incomingOrder.rows[0].filled_units,
        },
        assessment: preTradeAml,
      });
    }

    reply.code(201);
    const responseBody = {
      ok: true,
      order: {
        id: incomingOrder.rows[0].id,
        assetId,
        userId: payload.userId,
        side: payload.side,
        orderType: payload.orderType,
        limitPriceGbp: payload.limitPriceGbp ?? null,
        protectionPriceGbp: payload.orderType === 'protected_market' ? (protectionCapGbp ?? null) : null,
        units: payload.units,
        filledUnits: incomingOrder.rows[0].filled_units,
        remainingUnits: incomingOrder.rows[0].remaining_units,
        unitPriceGbp: orderPriceGbp,
        unitPriceGbpStr: formatGbp(orderPriceGbp),
        feeGbp: tradedFeeGbp,
        feeGbpStr: formatGbp(tradedFeeGbp),
        totalGbp: orderTotalGbp,
        totalGbpStr: formatGbp(orderTotalGbp),
        status: incomingOrder.rows[0].status,
        createdAt: incomingOrder.rows[0].created_at,
        updatedAt: incomingOrder.rows[0].updated_at,
      },
      asset: {
        id: updatedAssetResult.rows[0].id,
        availableUnits: updatedAssetResult.rows[0].available_units,
        holders: updatedAssetResult.rows[0].holders,
        volume24hGbp: updatedAssetResult.rows[0].volume_24h_gbp == null ? null : Number(updatedAssetResult.rows[0].volume_24h_gbp),
        unitPriceGbp: Number(updatedAssetResult.rows[0].unit_price_gbp),
        unitPriceStable: Number(updatedAssetResult.rows[0].unit_price_stable),
        marketMovePct24h: updatedAssetResult.rows[0].market_move_pct_24h == null ? null : Number(updatedAssetResult.rows[0].market_move_pct_24h),
        updatedAt: updatedAssetResult.rows[0].updated_at,
      },
      aml: amlAlert
        ? {
          alertId: amlAlert.alertId,
          status: amlAlert.status,
        }
        : null,
    };

    if (payload.idempotencyKey && idempotencyRequestHash) {
      await saveCoOwnOrderIdempotentResponse(client, {
        assetId,
        userId: payload.userId,
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
        responseStatus: 201,
        responseBody,
      });
    }

    if (payload.idempotencyKey && idempotencyRequestHash) {
      await client.query(
        `
          UPDATE coown_order_commands
          SET status = 'acknowledged', order_id = $2, response_code = 200, response_body = $3, completed_at = NOW()
          WHERE asset_id = $1 AND idempotency_key = $4
        `,
        [assetId, String(incomingOrder.rows[0].id), JSON.stringify(responseBody), payload.idempotencyKey]
      );
    }

    await client.query('COMMIT');

    try {
      await db.query(
        `INSERT INTO coown_market_audit_events (asset_id, event_type, event_payload, visibility, changed_by)
         VALUES ($1, $2, $3::jsonb, 'public', $4)`,
        [
          assetId,
          `order.${incomingOrder.rows[0].status}`,
          JSON.stringify({
            orderId: incomingOrder.rows[0].id,
            side: payload.side,
            orderType: payload.orderType,
            units: payload.units,
            filledUnits: incomingOrder.rows[0].filled_units,
            remainingUnits: incomingOrder.rows[0].remaining_units,
            unitPriceGbp: orderPriceGbp,
            status: incomingOrder.rows[0].status,
          }),
          payload.userId,
        ]
      );
    } catch (auditError) {
      app.log.error({ err: auditError, assetId }, 'Failed to write market audit event');
    }

    publishRealtimeEvent({
      topic: `co-own.asset:${assetId}`,
      type: `order.${incomingOrder.rows[0].status}`,
      payload: {
        assetId,
        orderId: incomingOrder.rows[0].id,
        side: payload.side,
        orderType: payload.orderType,
        units: payload.units,
        filledUnits: incomingOrder.rows[0].filled_units,
        remainingUnits: incomingOrder.rows[0].remaining_units,
        unitPriceGbp: orderPriceGbp,
        status: incomingOrder.rows[0].status,
      },
      seq: true,
      version: 1,
    });

    if (filledUnits > 0 && lastExecutionPriceGbp != null) {
      publishRealtimeEvent({
        topic: `co-own.asset:${assetId}`,
        type: 'trade.executed',
        payload: {
          assetId,
          side: payload.side,
          units: filledUnits,
          unitPriceGbp: lastExecutionPriceGbp,
          notionalGbp: tradedNotionalGbp,
        },
        seq: true,
        version: 1,
      });
    }

    if (bookDeltaChanges.length > 0) {
      try {
        await publishRealtimeEvent({
          topic: `co-own.asset:${assetId}`,
          type: 'co-own.book-delta',
          payload: {
            type: 'co-own.book-delta',
            assetId,
            sequence: lastMarketSeq,
            changes: bookDeltaChanges,
            serverTimestamp: new Date().toISOString(),
          },
          seq: true,
          version: 1,
        });
      } catch {
        // Delta emission is best-effort.
      }
    }

    await appendComplianceAuditSafe(request, {
      eventType: 'co-own.order.created',
      subjectUserId: payload.userId,
      payload: {
        assetId,
        orderId: incomingOrder.rows[0].id,
        side: payload.side,
        orderType: payload.orderType,
        units: payload.units,
        filledUnits: incomingOrder.rows[0].filled_units,
        remainingUnits: incomingOrder.rows[0].remaining_units,
        status: incomingOrder.rows[0].status,
        amlAlertId: amlAlert?.alertId ?? null,
      },
    });

    return responseBody;
  } catch (error) {
    await client.query('ROLLBACK');

    const apiError = getApiError(error);
    if (apiError?.code === 'CO_OWN_SELLER_UNITS_INSUFFICIENT') {
      reply.code(409);
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    reply.code(500);
    return {
      ok: false,
      error: `Unable to place co-own order: ${(error as Error).message}`,
    };
  } finally {
    client.release();
  }
});

app.get('/co-own/assets/:assetId/orders/lookup-by-key/:idempotencyKey', async (request, reply) => {
  const paramsSchema = z.object({
    assetId: z.string().min(2),
    idempotencyKey: z.string().min(8).max(140),
  });
  const { assetId, idempotencyKey } = paramsSchema.parse(request.params);

  const actorUserId = request.authUser?.userId;
  if (!actorUserId) {
    reply.code(401);
    return { ok: false, error: 'Authentication required to look up an order' };
  }

  const idempotentResult = await db.query<{
    response_status: number;
    response_body: Record<string, unknown>;
  }>(
    `
      SELECT response_status, response_body
      FROM coown_order_idempotency
      WHERE asset_id = $1
        AND user_id = $2
        AND idempotency_key = $3
      LIMIT 1
    `,
    [assetId, actorUserId, idempotencyKey]
  );

  if (idempotentResult.rows[0]) {
    reply.code(200);
    return {
      ok: true,
      status: 'acknowledged',
      ...idempotentResult.rows[0].response_body as Record<string, unknown>,
    };
  }

  const commandResult = await db.query<{ status: string }>(
    `
      SELECT status
      FROM coown_order_commands
      WHERE asset_id = $1
        AND actor_id = $2
        AND idempotency_key = $3
      LIMIT 1
    `,
    [assetId, actorUserId, idempotencyKey]
  );

  if (commandResult.rows[0] && commandResult.rows[0].status === 'pending') {
    reply.code(202);
    return { ok: true, status: 'processing' };
  }

  reply.code(404);
  return { ok: false, status: 'safe_to_retry' };
});

app.post('/co-own/assets/:assetId/orders/:orderId/cancel', async (request, reply) => {
  const paramsSchema = z.object({
    assetId: z.string().min(2),
    orderId: z.coerce.number().int().positive(),
  });
  const bodySchema = z.object({ userId: z.string().min(2) });
  const { assetId, orderId } = paramsSchema.parse(request.params);
  const { userId } = bodySchema.parse(request.body);
  resolveAuthenticatedUserId(request, userId);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query<{
      id: number;
      user_id: string;
      status: CoOwnOrderStatus;
      filled_units: number;
    }>(
      `
        SELECT id, user_id, status, filled_units
        FROM coOwn_orders
        WHERE id = $1 AND asset_id = $2
        FOR UPDATE
      `,
      [orderId, assetId]
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Co-Own order not found' };
    }
    if (order.user_id !== userId) {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Only the order owner can cancel this order' };
    }
    if (order.status !== 'open' && order.status !== 'partially_filled') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: `A ${order.status} order cannot be cancelled` };
    }

    const cancelMarketSeq = await allocateMarketSequence(client, assetId);

    await client.query(
      `
        UPDATE coOwn_orders
        SET remaining_units = 0, status = 'cancelled', updated_at = NOW(), market_sequence = $2
        WHERE id = $1
      `,
      [orderId, cancelMarketSeq]
    );
    await client.query(
      `
        UPDATE coown_order_reservations
        SET reserved_1ze_units = 0, reserved_units = 0, status = 'cancelled', updated_at = NOW()
        WHERE placed_order_id = $1 AND status = 'placed'
      `,
      [orderId]
    );
    await client.query('COMMIT');
    return {
      ok: true,
      order: { id: orderId, status: 'cancelled', filledUnits: order.filled_units, remainingUnits: 0 },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.get('/co-own/assets/:assetId/buyout-offers', async (request, reply) => {
  const paramsSchema = z.object({ assetId: z.string().min(2) });
  const querySchema = z.object({
    status: z.enum(['open', 'accepted', 'expired', 'cancelled', 'rejected', 'settled']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(60),
  });

  const { assetId } = paramsSchema.parse(request.params);
  const { status, limit } = querySchema.parse(request.query);

  const result = await db.query<{
    id: string;
    asset_id: string;
    bidder_user_id: string;
    offer_price_gbp: string;
    target_units: number;
    accepted_units: number;
    status: string;
    expires_at: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT
        id,
        asset_id,
        bidder_user_id,
        offer_price_gbp::text,
        target_units,
        accepted_units,
        status,
        expires_at::text,
        metadata,
        created_at::text,
        updated_at::text
      FROM coOwn_buyout_offers
      WHERE asset_id = $1
        AND ($2::text IS NULL OR status = $2)
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [assetId, status ?? null, limit]
  );

  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      bidderUserId: row.bidder_user_id,
      offerPriceGbp: Number(row.offer_price_gbp),
      targetUnits: row.target_units,
      acceptedUnits: row.accepted_units,
      status: row.status,
      expiresAt: row.expires_at,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
});

app.post('/co-own/assets/:assetId/buyout-offers', {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: '1 minute',
    },
  },
}, async (request, reply) => {
  const paramsSchema = z.object({ assetId: z.string().min(2) });
  const bodySchema = z.object({
    bidderUserId: z.string().min(2),
    offerPriceGbp: z.number().positive(),
    targetUnits: z.number().int().min(1).max(COOWN_POLICY.maxBuyoutUnits).optional(),
    expiresInHours: z.number().int().min(1).max(168).default(24),
    metadata: z.record(z.unknown()).optional(),
  });

  const { assetId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});
  await ensureUserExists(payload.bidderUserId);

  const client = await db.connect();
  let amlAlert: { alertId: string; status: string } | null = null;
  try {
    await client.query('BEGIN');

    const assetResult = await client.query<{
      id: string;
      total_units: number;
      is_open: boolean;
    }>(
      `
        SELECT id, total_units, is_open
        FROM coOwn_assets
        WHERE id = $1
        FOR UPDATE
      `,
      [assetId]
    );

    const asset = assetResult.rows[0];
    if (!asset) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Co-Own asset not found' };
    }

    if (!asset.is_open) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Co-Own asset is closed for buyout offers' };
    }

    const bidderHolding = await getCoOwnHoldingForUpdate(client, payload.bidderUserId, assetId);
    const bidderUnits = bidderHolding?.units_owned ?? 0;
    const inferredTarget = Math.max(0, asset.total_units - bidderUnits);
    const targetUnits = payload.targetUnits ?? inferredTarget;

    if (targetUnits <= 0) {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: 'Bidder already controls all units for this asset',
      };
    }

    const offerNotionalGbp = roundTo(targetUnits * payload.offerPriceGbp, 2);

    const eligibility = await evaluateMarketEligibility(client, {
      userId: payload.bidderUserId,
      market: 'co-own',
      orderNotionalGbp: offerNotionalGbp,
    });

    if (!eligibility.allowed) {
      await client.query('ROLLBACK');

      await appendComplianceAuditSafe(request, {
        eventType: 'buyout.offer.blocked.eligibility',
        subjectUserId: payload.bidderUserId,
        payload: {
          assetId,
          targetUnits,
          offerPriceGbp: payload.offerPriceGbp,
          offerNotionalGbp,
          code: eligibility.code,
          message: eligibility.message,
        },
      });

      reply.code(403);
      return {
        ok: false,
        error: eligibility.message,
        code: eligibility.code,
      };
    }

    const amlAssessment = await evaluateAmlRisk(client, {
      userId: payload.bidderUserId,
      market: 'co-own',
      amountGbp: offerNotionalGbp,
    });

    if (amlAssessment.shouldBlock) {
      await client.query('ROLLBACK');

      if (amlAssessment.shouldCreateAlert) {
        amlAlert = await createAmlAlert(db, {
          userId: payload.bidderUserId,
          market: 'co-own',
          eventType: 'trade',
          amountGbp: offerNotionalGbp,
          referenceId: `${assetId}:buyout-offer`,
          ruleCode: 'AML_BUYOUT_OFFER_BLOCK',
          notes: 'Buyout offer blocked by AML controls',
          context: {
            assetId,
            bidderUserId: payload.bidderUserId,
            targetUnits,
            offerPriceGbp: payload.offerPriceGbp,
          },
          assessment: amlAssessment,
        });
      }

      await appendComplianceAuditSafe(request, {
        eventType: 'buyout.offer.blocked.aml',
        subjectUserId: payload.bidderUserId,
        payload: {
          assetId,
          targetUnits,
          offerPriceGbp: payload.offerPriceGbp,
          offerNotionalGbp,
          riskScore: amlAssessment.riskScore,
          riskLevel: amlAssessment.riskLevel,
          alertId: amlAlert?.alertId ?? null,
        },
      });

      reply.code(403);
      return {
        ok: false,
        error: 'Buyout offer blocked by AML controls. Please contact support.',
        code: 'AML_BLOCKED',
        riskLevel: amlAssessment.riskLevel,
        alertId: amlAlert?.alertId ?? null,
      };
    }

    const offerId = createRuntimeId('buyout');
    const expiresAt = new Date(Date.now() + payload.expiresInHours * 60 * 60 * 1000).toISOString();

    const inserted = await client.query<{
      id: string;
      created_at: string;
      updated_at: string;
    }>(
      `
        INSERT INTO coOwn_buyout_offers (
          id,
          asset_id,
          bidder_user_id,
          offer_price_gbp,
          target_units,
          accepted_units,
          status,
          expires_at,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, 0, 'open', $6, $7::jsonb)
        RETURNING id, created_at::text, updated_at::text
      `,
      [
        offerId,
        assetId,
        payload.bidderUserId,
        roundTo(payload.offerPriceGbp, 4),
        targetUnits,
        expiresAt,
        toJsonString(payload.metadata ?? {}),
      ]
    );

    if (amlAssessment.shouldCreateAlert) {
      amlAlert = await createAmlAlert(client, {
        userId: payload.bidderUserId,
        market: 'co-own',
        eventType: 'trade',
        amountGbp: offerNotionalGbp,
        referenceId: offerId,
        ruleCode: 'AML_BUYOUT_OFFER_MONITOR',
        notes: 'Buyout offer generated elevated AML risk score',
        context: {
          assetId,
          bidderUserId: payload.bidderUserId,
          targetUnits,
          offerPriceGbp: payload.offerPriceGbp,
        },
        assessment: amlAssessment,
      });
    }

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `co-own.asset:${assetId}`,
      type: 'buyout.offer.opened',
      payload: {
        offerId,
        assetId,
        bidderUserId: payload.bidderUserId,
        offerPriceGbp: roundTo(payload.offerPriceGbp, 4),
        targetUnits,
        expiresAt,
      },
    });

    await appendComplianceAuditSafe(request, {
      eventType: 'buyout.offer.opened',
      subjectUserId: payload.bidderUserId,
      payload: {
        offerId,
        assetId,
        targetUnits,
        offerPriceGbp: roundTo(payload.offerPriceGbp, 4),
        amlAlertId: amlAlert?.alertId ?? null,
      },
    });

    reply.code(201);
    return {
      ok: true,
      offer: {
        id: inserted.rows[0].id,
        assetId,
        bidderUserId: payload.bidderUserId,
        offerPriceGbp: roundTo(payload.offerPriceGbp, 4),
        targetUnits,
        acceptedUnits: 0,
        status: 'open',
        expiresAt,
        createdAt: inserted.rows[0].created_at,
        updatedAt: inserted.rows[0].updated_at,
      },
      aml: amlAlert
        ? {
          alertId: amlAlert.alertId,
          status: amlAlert.status,
        }
        : null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return {
      ok: false,
      error: `Unable to create buyout offer: ${(error as Error).message}`,
    };
  } finally {
    client.release();
  }
});

app.post('/co-own/buyout-offers/:offerId/accept', async (request, reply) => {
  const paramsSchema = z.object({ offerId: z.string().min(4) });
  const bodySchema = z.object({
    holderUserId: z.string().min(2),
    units: z.number().int().min(1).max(COOWN_POLICY.maxBuyoutUnits),
    metadata: z.record(z.unknown()).optional(),
  });

  const { offerId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});
  await ensureUserExists(payload.holderUserId);

  const client = await db.connect();
  let amlAlert: { alertId: string; status: string } | null = null;
  try {
    await client.query('BEGIN');

    const offerResult = await client.query<{
      id: string;
      asset_id: string;
      bidder_user_id: string;
      offer_price_gbp: string;
      target_units: number;
      accepted_units: number;
      status: string;
      expires_at: string;
      total_units: number;
    }>(
      `
        SELECT
          bo.id,
          bo.asset_id,
          bo.bidder_user_id,
          bo.offer_price_gbp::text,
          bo.target_units,
          bo.accepted_units,
          bo.status,
          bo.expires_at::text,
          sa.total_units
        FROM coOwn_buyout_offers bo
        INNER JOIN coOwn_assets sa ON sa.id = bo.asset_id
        WHERE bo.id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [offerId]
    );

    const offer = offerResult.rows[0];
    if (!offer) {
      await client.query('ROLLBACK');
      reply.code(404);
      return {
        ok: false,
        error: 'Buyout offer not found',
      };
    }

    if (offer.bidder_user_id === payload.holderUserId) {
      await client.query('ROLLBACK');
      reply.code(400);
      return {
        ok: false,
        error: 'Bidder cannot accept their own buyout offer',
      };
    }

    const offerExpired = new Date(offer.expires_at).getTime() <= Date.now();
    if (offer.status !== 'open' || offerExpired) {
      await client.query(
        `
          UPDATE coOwn_buyout_offers
          SET status = CASE WHEN expires_at <= NOW() THEN 'expired' ELSE status END,
              updated_at = NOW()
          WHERE id = $1
        `,
        [offerId]
      );
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: 'Buyout offer is no longer open',
      };
    }

    const remainingTarget = Math.max(0, offer.target_units - offer.accepted_units);
    const acceptedUnits = Math.min(payload.units, remainingTarget);
    if (acceptedUnits <= 0) {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: 'Buyout offer target already fulfilled',
      };
    }

    const acceptanceNotionalGbp = roundTo(acceptedUnits * Number(offer.offer_price_gbp), 2);

    const holderEligibility = await evaluateMarketEligibility(client, {
      userId: payload.holderUserId,
      market: 'co-own',
      orderNotionalGbp: acceptanceNotionalGbp,
    });

    if (!holderEligibility.allowed) {
      await client.query('ROLLBACK');

      await appendComplianceAuditSafe(request, {
        eventType: 'buyout.accept.blocked.holder_eligibility',
        subjectUserId: payload.holderUserId,
        payload: {
          offerId,
          assetId: offer.asset_id,
          acceptedUnits,
          acceptanceNotionalGbp,
          code: holderEligibility.code,
          message: holderEligibility.message,
        },
      });

      reply.code(403);
      return {
        ok: false,
        error: holderEligibility.message,
        code: holderEligibility.code,
      };
    }

    const bidderEligibility = await evaluateMarketEligibility(client, {
      userId: offer.bidder_user_id,
      market: 'co-own',
      orderNotionalGbp: acceptanceNotionalGbp,
    });

    if (!bidderEligibility.allowed) {
      await client.query('ROLLBACK');

      await appendComplianceAuditSafe(request, {
        eventType: 'buyout.accept.blocked.bidder_eligibility',
        subjectUserId: offer.bidder_user_id,
        payload: {
          offerId,
          assetId: offer.asset_id,
          acceptedUnits,
          acceptanceNotionalGbp,
          code: bidderEligibility.code,
          message: bidderEligibility.message,
        },
      });

      reply.code(403);
      return {
        ok: false,
        error: 'Buyout bidder no longer eligible for this jurisdiction.',
        code: bidderEligibility.code,
      };
    }

    const amlAssessment = await evaluateAmlRisk(client, {
      userId: payload.holderUserId,
      market: 'co-own',
      amountGbp: acceptanceNotionalGbp,
      counterpartyUserId: offer.bidder_user_id,
    });

    if (amlAssessment.shouldBlock) {
      await client.query('ROLLBACK');

      if (amlAssessment.shouldCreateAlert) {
        amlAlert = await createAmlAlert(db, {
          userId: payload.holderUserId,
          relatedUserId: offer.bidder_user_id,
          market: 'co-own',
          eventType: 'trade',
          amountGbp: acceptanceNotionalGbp,
          referenceId: offerId,
          ruleCode: 'AML_BUYOUT_ACCEPT_BLOCK',
          notes: 'Buyout acceptance blocked by AML controls',
          context: {
            offerId,
            assetId: offer.asset_id,
            holderUserId: payload.holderUserId,
            bidderUserId: offer.bidder_user_id,
            acceptedUnits,
          },
          assessment: amlAssessment,
        });
      }

      await appendComplianceAuditSafe(request, {
        eventType: 'buyout.accept.blocked.aml',
        subjectUserId: payload.holderUserId,
        payload: {
          offerId,
          assetId: offer.asset_id,
          acceptedUnits,
          acceptanceNotionalGbp,
          riskScore: amlAssessment.riskScore,
          riskLevel: amlAssessment.riskLevel,
          alertId: amlAlert?.alertId ?? null,
        },
      });

      reply.code(403);
      return {
        ok: false,
        error: 'Buyout acceptance blocked by AML controls.',
        code: 'AML_BLOCKED',
        riskLevel: amlAssessment.riskLevel,
        alertId: amlAlert?.alertId ?? null,
      };
    }

    await applyCoOwnTransfer(client, {
      assetId: offer.asset_id,
      buyerId: offer.bidder_user_id,
      sellerId: payload.holderUserId,
      units: acceptedUnits,
      unitPriceGbp: Number(offer.offer_price_gbp),
      feeGbp: 0,
      sourceType: 'buyout',
      buyOrderId: null,
      sellOrderId: null,
      enforceSellerHolding: true,
    });

    await client.query(
      `
        INSERT INTO coOwn_buyout_acceptances (
          offer_id,
          holder_user_id,
          units,
          status,
          responded_at,
          metadata
        )
        VALUES ($1, $2, $3, 'accepted', NOW(), $4::jsonb)
        ON CONFLICT (offer_id, holder_user_id)
        DO UPDATE
          SET
            units = EXCLUDED.units,
            status = EXCLUDED.status,
            responded_at = NOW(),
            metadata = coOwn_buyout_acceptances.metadata || EXCLUDED.metadata
      `,
      [offerId, payload.holderUserId, acceptedUnits, toJsonString(payload.metadata ?? {})]
    );

    const nextAcceptedUnits = offer.accepted_units + acceptedUnits;
    const nextStatus = nextAcceptedUnits >= offer.target_units ? 'settled' : 'accepted';

    await client.query(
      `
        UPDATE coOwn_buyout_offers
        SET
          accepted_units = $2,
          status = $3,
          updated_at = NOW()
        WHERE id = $1
      `,
      [offerId, nextAcceptedUnits, nextStatus]
    );

    const bidderHolding = await getCoOwnHoldingForUpdate(client, offer.bidder_user_id, offer.asset_id);
    const bidderUnits = bidderHolding?.units_owned ?? 0;
    if (nextStatus === 'settled' && bidderUnits >= offer.total_units) {
      await client.query(
        `
          UPDATE coOwn_assets
          SET is_open = FALSE, updated_at = NOW()
          WHERE id = $1
        `,
        [offer.asset_id]
      );
    }

    const nextHolders = await recalcCoOwnHolders(client, offer.asset_id);
    await client.query(
      `
        UPDATE coOwn_assets
        SET holders = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [offer.asset_id, nextHolders]
    );

    if (amlAssessment.shouldCreateAlert) {
      amlAlert = await createAmlAlert(client, {
        userId: payload.holderUserId,
        relatedUserId: offer.bidder_user_id,
        market: 'co-own',
        eventType: 'trade',
        amountGbp: acceptanceNotionalGbp,
        referenceId: offerId,
        ruleCode: 'AML_BUYOUT_ACCEPT_MONITOR',
        notes: 'Buyout acceptance generated elevated AML risk score',
        context: {
          offerId,
          assetId: offer.asset_id,
          holderUserId: payload.holderUserId,
          bidderUserId: offer.bidder_user_id,
          acceptedUnits,
        },
        assessment: amlAssessment,
      });
    }

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `co-own.asset:${offer.asset_id}`,
      type: 'buyout.offer.accepted',
      payload: {
        offerId,
        holderUserId: payload.holderUserId,
        units: acceptedUnits,
        acceptedUnits: nextAcceptedUnits,
        status: nextStatus,
      },
    });

    try {
      await queueUserNotification({
        userId: offer.bidder_user_id,
        title: 'Buyout accepted',
        body: `${payload.holderUserId} accepted ${acceptedUnits} units from your buyout offer.`,
        payload: {
          offerId,
          assetId: offer.asset_id,
          holderUserId: payload.holderUserId,
          units: acceptedUnits,
          event: 'buyout_acceptance',
        },
        metadata: {
          source: 'buyout_accept_route',
        },
      });
    } catch (error) {
      request.log.error({ err: error, offerId }, 'Failed to queue bidder buyout notification');
    }

    await appendComplianceAuditSafe(request, {
      eventType: 'buyout.accepted',
      subjectUserId: payload.holderUserId,
      payload: {
        offerId,
        assetId: offer.asset_id,
        holderUserId: payload.holderUserId,
        bidderUserId: offer.bidder_user_id,
        acceptedUnits,
        status: nextStatus,
        amlAlertId: amlAlert?.alertId ?? null,
      },
    });

    return {
      ok: true,
      offer: {
        id: offerId,
        assetId: offer.asset_id,
        bidderUserId: offer.bidder_user_id,
        offerPriceGbp: Number(offer.offer_price_gbp),
        targetUnits: offer.target_units,
        acceptedUnits: nextAcceptedUnits,
        status: nextStatus,
        expiresAt: offer.expires_at,
      },
      accepted: {
        holderUserId: payload.holderUserId,
        units: acceptedUnits,
      },
      aml: amlAlert
        ? {
          alertId: amlAlert.alertId,
          status: amlAlert.status,
        }
        : null,
    };
  } catch (error) {
    await client.query('ROLLBACK');

    const apiError = getApiError(error);
    if (apiError?.code === 'CO_OWN_SELLER_UNITS_INSUFFICIENT') {
      reply.code(409);
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    reply.code(500);
    return {
      ok: false,
      error: `Unable to accept buyout offer: ${(error as Error).message}`,
    };
  } finally {
    client.release();
  }
});

// ── Lookup co-own asset by listing ID ──
// Returns the co-own asset associated with a standard listing, if one exists.
// This powers the "Buy Shares" section on the listing detail screen — when a
// listing has been syndicated into a co-own asset, the listing detail page
// shows share availability, price per unit, and a CTA to the trade screen.
app.get('/co-own/assets/by-listing/:listingId', async (request, reply) => {
  const paramsSchema = z.object({ listingId: z.string().min(2).max(128) });
  const { listingId } = paramsSchema.parse(request.params);

  const result = await db.query<{
    id: string;
    listing_id: string;
    issuer_id: string;
    title: string;
    image_url: string | null;
    total_units: number;
    available_units: number;
    unit_price_gbp: number;
    is_open: boolean;
    created_at: string;
    issuer_username: string | null;
    issuer_display_name: string | null;
    issuer_avatar: string | null;
  }>(
    `SELECT
       sa.id, sa.listing_id, sa.issuer_id, sa.title, sa.image_url,
       sa.total_units, sa.available_units, sa.unit_price_gbp, sa.is_open,
       sa.created_at,
       u.username AS issuer_username,
       u.display_name AS issuer_display_name,
       u.avatar AS issuer_avatar
     FROM coOwn_assets sa
     LEFT JOIN users u ON u.id = sa.issuer_id
     WHERE sa.listing_id = $1
     ORDER BY sa.created_at DESC
     LIMIT 1`,
    [listingId]
  );

  const row = result.rows[0];
  if (!row) {
    reply.code(404);
    return { ok: false, error: 'No co-own asset found for this listing' };
  }

  return {
    ok: true,
    asset: {
      id: row.id,
      listingId: row.listing_id,
      issuerId: row.issuer_id,
      title: row.title,
      imageUrl: row.image_url,
      totalUnits: row.total_units,
      availableUnits: row.available_units,
      unitPriceGbp: Number(row.unit_price_gbp),
      isOpen: row.is_open,
      createdAt: row.created_at,
      issuer: row.issuer_username
        ? {
            username: row.issuer_username,
            displayName: row.issuer_display_name,
            avatar: row.issuer_avatar,
          }
        : null,
    },
  };
});

app.get('/co-own/assets/:assetId', async (request, reply) => {
  const paramsSchema = z.object({ assetId: z.string().min(2) });
  const { assetId } = paramsSchema.parse(request.params);

  const result = await db.query<{
    id: string;
    listing_id: string;
    issuer_id: string;
    title: string;
    image_url: string | null;
    total_units: number;
    available_units: number;
    unit_price_gbp: number;
    unit_price_stable: number;
    settlement_mode: string;
    issuer_jurisdiction: string | null;
    market_move_pct_24h: number;
    holders: number;
    volume_24h_gbp: number;
    is_open: boolean;
    created_at: string;
    updated_at: string;
    issuer_username: string | null;
    issuer_display_name: string | null;
    issuer_avatar: string | null;
    issuer_location: string | null;
    issuer_verification_tier: 'email' | 'id' | 'seller' | null;
    issuer_verification_tier_set_at: string | null;
    issuer_seller_standards_met: boolean | null;
    legal_vehicle_type: 'spv' | 'llc' | 'trust' | 'series_llc' | 'none' | null;
    legal_vehicle_name: string | null;
    legal_vehicle_jurisdiction: string | null;
    custodian_name: string | null;
    custodian_location: string | null;
    custody_insured: boolean;
    custody_insurer: string | null;
    custody_policy_ref: string | null;
    custody_coverage_gbp: string | number | null;
    authenticity_status: 'unverified' | 'pending' | 'verified' | null;
    authenticity_method: string | null;
    authenticity_verified_at: string | null;
    provenance: string | null;
    condition_grade: string | null;
    appraisal_value_gbp: string | number | null;
    appraisal_valued_at: string | null;
    appraisal_valuer: string | null;
    buyer_protection: boolean;
    buyer_protection_terms_url: string | null;
    listing_tier: 'preview' | 'listed' | 'badged' | 'delisted';
    escrow_partner: string | null;
    escrow_terms_url: string | null;
    settlement_eta_hours: number | null;
    safeguarded: boolean;
    safeguarding_partner: string | null;
    safeguarding_evidence_url: string | null;
    safeguarding_terms_url: string | null;
    recourse_agreement_signed: boolean;
    recourse_status: string | null;
    total_traded_value_gbp: string | number;
    active_verification_demands: number;
  }>(
    `
      SELECT
        sa.*,
        u.username AS issuer_username,
        u.display_name AS issuer_display_name,
        u.avatar AS issuer_avatar,
        u.location AS issuer_location,
        ivp.verification_tier AS issuer_verification_tier,
        ivp.verification_tier_set_at AS issuer_verification_tier_set_at,
        ivp.seller_standards_met AS issuer_seller_standards_met
      FROM coOwn_assets sa
      LEFT JOIN users u ON u.id = sa.issuer_id
      LEFT JOIN coown_issuer_verification_profile ivp ON ivp.user_id = sa.issuer_id
      WHERE sa.id = $1
      LIMIT 1
    `,
    [assetId]
  );

  const row = result.rows[0];
  if (!row) {
    reply.code(404);
    return { ok: false, error: 'Asset not found' };
  }

  const trustEventsResult = await db.query<{
    event_type: string;
    changed_by: string | null;
    created_at: string;
  }>(
    `
      SELECT event_type, changed_by, created_at
      FROM coown_asset_trust_events
      WHERE asset_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `,
    [assetId]
  );

  let appraisalStaleDays: number | null = null;
  if (row.appraisal_valued_at) {
    const valuedAt = new Date(row.appraisal_valued_at).getTime();
    if (Number.isFinite(valuedAt)) {
      appraisalStaleDays = Math.max(0, Math.floor((Date.now() - valuedAt) / (24 * 60 * 60 * 1000)));
    }
  }

  const marketAuditResult = await db.query<{
    id: number;
    event_type: string;
    event_payload: unknown;
    created_at: string;
  }>(
    `SELECT id, event_type, event_payload, created_at
     FROM coown_market_audit_events
     WHERE asset_id = $1 AND visibility = 'public'
     ORDER BY created_at DESC, id DESC
     LIMIT 10`,
    [assetId]
  );

  const staleMarkResult = await db.query<{ last_event_at: string | null }>(
    `SELECT MAX(created_at) AS last_event_at FROM coown_market_audit_events
     WHERE asset_id = $1 AND visibility = 'public'`,
    [assetId]
  );
  const lastMarketEventAt = staleMarkResult.rows[0]?.last_event_at ?? null;
  const staleMarkDays = lastMarketEventAt
    ? Math.max(0, Math.floor((Date.now() - new Date(lastMarketEventAt).getTime()) / (24 * 60 * 60 * 1000)))
    : null;

  const snapshotResult = await db.query<{
    last_execution_price_gbp: string | null;
    last_execution_at: string | null;
    volume_24h_gbp: string | null;
    price_24h_ago_gbp: string | null;
    best_bid_gbp: string | null;
    best_ask_gbp: string | null;
  }>(
    `
      WITH last_trade AS (
        SELECT unit_price_gbp, created_at
        FROM coOwn_trades
        WHERE asset_id = $1 AND settlement_status = 'settled'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ),
      vol_24h AS (
        SELECT COALESCE(SUM(notional_gbp), 0)::text AS volume
        FROM coOwn_trades
        WHERE asset_id = $1
          AND settlement_status = 'settled'
          AND created_at >= NOW() - INTERVAL '24 hours'
      ),
      price_24h_ago AS (
        SELECT unit_price_gbp
        FROM coOwn_trades
        WHERE asset_id = $1
          AND settlement_status = 'settled'
          AND created_at < NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ),
      best_bid AS (
        SELECT MAX(unit_price_gbp)::text AS price
        FROM coOwn_orders
        WHERE asset_id = $1
          AND side = 'buy'
          AND status IN ('open', 'partially_filled')
          AND remaining_units > 0
      ),
      best_ask AS (
        SELECT MIN(unit_price_gbp)::text AS price
        FROM coOwn_orders
        WHERE asset_id = $1
          AND side = 'sell'
          AND status IN ('open', 'partially_filled')
          AND remaining_units > 0
      )
      SELECT
        (SELECT unit_price_gbp::text FROM last_trade) AS last_execution_price_gbp,
        (SELECT to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM last_trade) AS last_execution_at,
        (SELECT volume FROM vol_24h) AS volume_24h_gbp,
        (SELECT unit_price_gbp::text FROM price_24h_ago) AS price_24h_ago_gbp,
        (SELECT price FROM best_bid) AS best_bid_gbp,
        (SELECT price FROM best_ask) AS best_ask_gbp
    `,
    [assetId]
  );

  const snap = snapshotResult.rows[0];
  const lastExecutionPriceGbp = snap?.last_execution_price_gbp
    ? Number(snap.last_execution_price_gbp)
    : null;
  const price24hAgo = snap?.price_24h_ago_gbp ? Number(snap.price_24h_ago_gbp) : null;
  const volume24h = snap?.volume_24h_gbp ? Number(snap.volume_24h_gbp) : 0;
  let marketMovePct24h: number | null = null;
  if (lastExecutionPriceGbp != null && price24hAgo != null && price24hAgo > 0) {
    marketMovePct24h = ((lastExecutionPriceGbp - price24hAgo) / price24hAgo) * 100;
  }

  const marketSnapshot = {
    version: 1,
    asOf: new Date().toISOString(),
    connectionStatus: row.is_open
      ? (staleMarkDays != null && staleMarkDays > 7 ? 'stale' : 'live')
      : 'closed',
    lastExecutionPriceGbp,
    lastExecutionAt: snap?.last_execution_at ?? null,
    volume24hGbp: volume24h > 0 ? volume24h : null,
    marketMovePct24h,
    bestBidGbp: snap?.best_bid_gbp ? Number(snap.best_bid_gbp) : null,
    bestAskGbp: snap?.best_ask_gbp ? Number(snap.best_ask_gbp) : null,
  };

  const candleResult = await db.query<{
    bucket_day: string;
    open_price: string;
    high_price: string;
    low_price: string;
    close_price: string;
    total_volume: string;
  }>(
    `
      SELECT
        date_trunc('day', created_at) AS bucket_day,
        (array_agg(unit_price_gbp ORDER BY created_at ASC, id ASC))[1]::text AS open_price,
        MAX(unit_price_gbp)::text AS high_price,
        MIN(unit_price_gbp)::text AS low_price,
        (array_agg(unit_price_gbp ORDER BY created_at DESC, id DESC))[1]::text AS close_price,
        SUM(units)::text AS total_volume
      FROM coOwn_trades
      WHERE asset_id = $1
        AND settlement_status = 'settled'
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY bucket_day
      ORDER BY bucket_day ASC
    `,
    [assetId]
  );

  const candles = candleResult.rows.map((c) => ({
    timestamp: c.bucket_day,
    openGbp: Number(c.open_price),
    highGbp: Number(c.high_price),
    lowGbp: Number(c.low_price),
    closeGbp: Number(c.close_price),
    volume: Number(c.total_volume),
  }));

  const rightsResult = await db.query<{
    id: string;
    version: number;
    rights_type: string;
    jurisdiction: string;
    governing_law: string | null;
    summary_terms: string;
    transferable: boolean;
    min_holding_units: number;
    published_at: string;
    tbc_eta_date: string | null;
    tbc_reason: string | null;
    economic_rights: string | null;
    voting_rights: string | null;
    exit_rights: string | null;
    fee_rights: string | null;
  }>(
    `
      SELECT id, version, rights_type, jurisdiction, governing_law,
             summary_terms, transferable, min_holding_units, published_at,
             tbc_eta_date, tbc_reason,
             economic_rights, voting_rights, exit_rights, fee_rights
      FROM coown_rights
      WHERE asset_id = $1 AND status = 'published'
      ORDER BY version DESC
      LIMIT 1
    `,
    [assetId]
  );

  const rights = rightsResult.rows[0]
    ? {
        id: rightsResult.rows[0].id,
        version: rightsResult.rows[0].version,
        rightsType: rightsResult.rows[0].rights_type,
        jurisdiction: rightsResult.rows[0].jurisdiction,
        governingLaw: rightsResult.rows[0].governing_law,
        summaryTerms: rightsResult.rows[0].summary_terms,
        transferable: rightsResult.rows[0].transferable,
        minHoldingUnits: rightsResult.rows[0].min_holding_units,
        publishedAt: rightsResult.rows[0].published_at,
        tbcEtaDate: rightsResult.rows[0].tbc_eta_date,
        tbcReason: rightsResult.rows[0].tbc_reason,
        economicRights: rightsResult.rows[0].economic_rights,
        votingRights: rightsResult.rows[0].voting_rights,
        exitRights: rightsResult.rows[0].exit_rights,
        feeRights: rightsResult.rows[0].fee_rights,
      }
    : null;

  const riskResult = await db.query<{
    id: string;
    version: number;
    market_risk: string | null;
    liquidity_risk: string | null;
    custody_risk: string | null;
    regulatory_risk: string | null;
    counterparty_risk: string | null;
    other_risks: string | null;
    published_at: string;
  }>(
    `SELECT id, version, market_risk, liquidity_risk, custody_risk,
            regulatory_risk, counterparty_risk, other_risks, published_at
     FROM coown_risk_disclosures
     WHERE asset_id = $1 AND status = 'published'
     ORDER BY version DESC
     LIMIT 1`,
    [assetId]
  );

  const riskDisclosures = riskResult.rows[0]
    ? {
        marketRisk: riskResult.rows[0].market_risk,
        liquidityRisk: riskResult.rows[0].liquidity_risk,
        custodyRisk: riskResult.rows[0].custody_risk,
        regulatoryRisk: riskResult.rows[0].regulatory_risk,
        counterpartyRisk: riskResult.rows[0].counterparty_risk,
        otherRisks: riskResult.rows[0].other_risks,
        publishedAt: riskResult.rows[0].published_at,
      }
    : null;

  return {
    ok: true,
    item: {
      id: row.id,
      listingId: row.listing_id,
      issuerId: row.issuer_id,
      issuer: row.issuer_username
        ? {
            username: row.issuer_username,
            displayName: row.issuer_display_name,
            avatar: row.issuer_avatar,
            location: row.issuer_location,
          }
        : null,
      issuerVerification: row.issuer_verification_tier
        ? {
            tier: row.issuer_verification_tier,
            tierSetAt: row.issuer_verification_tier_set_at,
            kycVerified: row.issuer_verification_tier === 'id' || row.issuer_verification_tier === 'seller',
            sellerStandardsMet: row.issuer_seller_standards_met ?? false,
          }
        : null,
      title: row.title,
      imageUrl: row.image_url,
      totalUnits: row.total_units,
      availableUnits: row.available_units,
      unitPriceGbp: Number(row.unit_price_gbp),
      unitPriceStable: Number(row.unit_price_stable),
      settlementMode: row.settlement_mode,
      issuerJurisdiction: row.issuer_jurisdiction,
      marketMovePct24h: row.market_move_pct_24h == null ? null : Number(row.market_move_pct_24h),
      holders: row.holders,
      volume24hGbp: row.volume_24h_gbp == null ? null : Number(row.volume_24h_gbp),
      isOpen: row.is_open,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      legalVehicleType: row.legal_vehicle_type,
      legalVehicleName: row.legal_vehicle_name,
      legalVehicleJurisdiction: row.legal_vehicle_jurisdiction,
      custodianName: row.custodian_name,
      custodianLocation: row.custodian_location,
      custodyInsured: row.custody_insured,
      custodyInsurer: row.custody_insurer,
      custodyPolicyRef: row.custody_policy_ref,
      custodyCoverageGbp: row.custody_coverage_gbp == null ? null : Number(row.custody_coverage_gbp),
      authenticityStatus: row.authenticity_status,
      authenticityMethod: row.authenticity_method,
      authenticityVerifiedAt: row.authenticity_verified_at,
      provenance: row.provenance,
      conditionGrade: row.condition_grade,
      appraisalValueGbp: row.appraisal_value_gbp == null ? null : Number(row.appraisal_value_gbp),
      appraisalValuedAt: row.appraisal_valued_at,
      appraisalValuer: row.appraisal_valuer,
      appraisalStaleDays,
      buyerProtection: row.buyer_protection,
      buyerProtectionTermsUrl: row.buyer_protection_terms_url,
      listingTier: row.listing_tier,
      escrowPartner: row.escrow_partner,
      escrowTermsUrl: row.escrow_terms_url,
      settlementEtaHours: row.settlement_eta_hours,
      safeguarded: row.safeguarded,
      safeguardingPartner: row.safeguarding_partner,
      safeguardingEvidenceUrl: row.safeguarding_evidence_url,
      safeguardingTermsUrl: row.safeguarding_terms_url,
      recourseAgreementSigned: row.recourse_agreement_signed ?? false,
      recourseStatus: row.recourse_status ?? 'pending',
      totalTradedValueGbp: row.total_traded_value_gbp != null ? Number(row.total_traded_value_gbp) : 0,
      activeVerificationDemands: row.active_verification_demands ?? 0,
      trustAuditEvents: trustEventsResult.rows.map((e) => ({
        eventType: e.event_type,
        createdAt: e.created_at,
        changedByLabel: e.changed_by ?? null,
      })),
      staleMarkDays,
      marketAuditEvents: marketAuditResult.rows.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        payload: e.event_payload,
        createdAt: e.created_at,
      })),
      marketSnapshot,
      candles,
      rights,
      riskDisclosures,
    },
  };
});

// __BLOCK2F_PLACEHOLDER__
};
