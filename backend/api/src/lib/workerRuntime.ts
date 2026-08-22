/**
 * Complex business helpers used by the standalone BullMQ worker handlers.
 *
 * These functions are defined inline in `src/index.ts` (the Fastify monolith
 * entry point) and are not exported. Importing `src/index.ts` from the worker
 * is impossible because it calls `void start()` at module load, which boots
 * the API server. To let the standalone worker process run the REAL handler
 * implementations, the helpers are copied here verbatim and wired to the
 * shared `db` / `redis` singletons and the worker `logger`.
 *
 * Single-source-of-truth note: the canonical implementations live in
 * `src/index.ts`. This module is a focused extraction for the worker process.
 * A future refactor should move these helpers into importable service modules
 * so both the API and the worker import a single copy.
 */
import type { Pool } from 'pg';
import * as Sentry from '@sentry/node';
import type { Redis as IORedis } from 'ioredis';
import type { Logger } from 'pino';
import { config } from './config.js';
import { db } from './db/pool.js';
import { redis } from './redis.js';
import { logger as defaultLogger } from './logger.js';
import { enqueuePushNotificationJob } from './queues.js';
import { publishRealtimeEvent } from './realtime.js';
import { recordPushDelivery } from './metrics.js';
import { resolveCountryPricingQuoteByCurrency } from './pricingEngine.js';
import { assetAmountFromOneze, moneyFromMajorDecimal } from './money.js';
import {
  type DbQueryable,
  type LedgerAccountCode,
  type LedgerOwnerType,
  type MintOperationRow,
  type WalletRow,
  type WalletSegmentRow,
  type WithdrawalRow,
  ALERT_DEDUP_REDIS_PREFIX,
  DEFAULT_WALLET_FIAT_CURRENCY,
  MINT_OPERATION_TERMINAL_STATES,
  ONEZE_MG_PER_IZE,
  PAYOUTS_PAUSED_REDIS_KEY,
  createApiError,
  createRuntimeId,
  fromFiatMinor,
  ledgerTablesAvailable,
  mgToOnezeAmount,
  mapEventToPushCategory,
  normalizeOnezeCountryTag,
  roundTo,
  toJsonString,
} from './workerHelpers.js';

/**
 * Logger used by the copied helpers in place of the Fastify `app.log`.
 * Defaults to the shared pino logger; the worker can override it via
 * `initWorkerRuntime`.
 */
let log: Logger = defaultLogger;

/**
 * Optional runtime initialisation. The standalone worker calls this with its
 * own logger so job log lines are tagged consistently. `db` and `redis` are
 * imported from their singleton modules (importing them creates the
 * connections), so they do not need to be passed in.
 */
export function initWorkerRuntime(input: { log?: Logger } = {}): void {
  if (input.log) {
    log = input.log;
  }
}

export function getWorkerDb(): Pool {
  return db;
}

export function getWorkerRedis(): IORedis {
  return redis;
}

// ─── Notification queueing ─────────────────────────────────────────────────

export async function queueUserNotification(input: {
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
}): Promise<string | null> {
  const eventType = input.eventType ?? 'generic';
  const idempotencyKey = input.idempotencyKey ?? null;
  const eventId = createRuntimeId('notif');

  // Atomic idempotent insertion: INSERT ... ON CONFLICT ... RETURNING
  // Determines whether this invocation actually inserted a new event.
  const insertResult = await db.query<{ id: string }>(
    `
      INSERT INTO notification_events (
        id, user_id, channel, title, body, payload, status, metadata,
        event_type, actor_user_id, image_url, route, idempotency_key
      )
      VALUES ($1, $2, 'push', $3, $4, $5::jsonb, 'queued', $6::jsonb, $7, $8, $9, $10::jsonb, $11)
      ON CONFLICT (user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
      DO NOTHING
      RETURNING id
    `,
    [
      eventId,
      input.userId,
      input.title,
      input.body,
      toJsonString(input.payload ?? {}),
      toJsonString(input.metadata ?? {}),
      eventType,
      input.actorUserId ?? null,
      input.imageUrl ?? null,
      toJsonString(input.route ?? {}),
      idempotencyKey,
    ]
  );

  // If no row was returned, a concurrent insert won the race.
  // Return the existing event ID without enqueuing push or publishing realtime.
  if (!insertResult.rowCount) {
    if (idempotencyKey) {
      const existing = await db.query<{
        id: string;
        user_id: string;
        title: string;
        body: string;
        payload: Record<string, unknown>;
        event_type: string;
        actor_user_id: string | null;
        route: Record<string, unknown> | null;
        status: string;
      }>(
        `SELECT id, user_id, title, body, payload, event_type,
                actor_user_id, route, status
         FROM notification_events
         WHERE user_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [input.userId, idempotencyKey]
      );
      const existingEvent = existing.rows[0];
      // A durable event may have been inserted just before Redis became
      // unavailable. Retrying the producer repairs that boundary. BullMQ's
      // event-based job ID prevents duplicate queued jobs.
      if (existingEvent?.status === 'queued') {
        await enqueuePushNotificationJob({
          eventId: existingEvent.id,
          userId: existingEvent.user_id,
          title: existingEvent.title,
          body: existingEvent.body,
          payload: existingEvent.payload,
          eventType: existingEvent.event_type,
          actorUserId: existingEvent.actor_user_id,
          route: existingEvent.route,
        });
      }
      return existingEvent?.id ?? null;
    }
    return null;
  }

  const insertedEventId = insertResult.rows[0].id;

  // Push preference check
  const pushCategory = mapEventToPushCategory(eventType);
  let shouldPush = true;
  if (pushCategory) {
    const prefResult = await db.query<{ enabled: boolean }>(
      `SELECT enabled FROM notification_preferences WHERE user_id = $1 AND category = $2 LIMIT 1`,
      [input.userId, pushCategory]
    );
    if (prefResult.rowCount && !prefResult.rows[0].enabled) {
      shouldPush = false;
    }
  }

  if (shouldPush) {
    await enqueuePushNotificationJob({
      eventId: insertedEventId,
      userId: input.userId,
      title: input.title,
      body: input.body,
      payload: input.payload,
      eventType,
      actorUserId: input.actorUserId ?? null,
      route: input.route ?? null,
    });
  }

  recordPushDelivery({
    provider: 'expo',
    status: 'queued',
  });

  publishRealtimeEvent({
    topic: `notifications.user:${input.userId}`,
    type: 'notification.queued',
    userId: input.userId,
    payload: {
      id: insertedEventId,
      title: input.title,
      body: input.body,
      eventType,
      actorUserId: input.actorUserId ?? null,
      imageUrl: input.imageUrl ?? null,
      route: input.route ?? null,
      ...input.payload,
    },
  });

  return insertedEventId;
}

// ─── Ledger helpers ────────────────────────────────────────────────────────

export async function ensureLedgerAccount(
  client: DbQueryable,
  ownerType: LedgerOwnerType,
  ownerId: string,
  accountCode: LedgerAccountCode,
  currency = 'GBP'
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `
      INSERT INTO ledger_accounts (owner_type, owner_id, account_code, currency)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (owner_type, owner_id, account_code, currency)
      DO UPDATE SET owner_id = EXCLUDED.owner_id
      RETURNING id
    `,
    [ownerType, ownerId, accountCode, currency]
  );

  return result.rows[0].id;
}

export async function appendLedgerEntry(
  client: DbQueryable,
  input: {
    accountId: number;
    counterpartyAccountId: number;
    direction: 'debit' | 'credit';
    amountGbp?: number;
    amount?: number;
    currency?: string;
    sourceType:
      | 'order_payment'
      | 'order_delivery'
      | 'payout'
      | 'refund'
      | 'adjustment'
      | 'mint'
      | 'burn'
      | 'coOwn_trade'
      | 'buyout'
      | 'reserve_reconcile'
      | 'reserve_hold'
      | 'reserve_release'
      | 'transfer';
    sourceId: string;
    lineType: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const normalizedCurrency = (input.currency ?? 'GBP').toUpperCase();
  const normalizedAmount =
    input.amount !== undefined
      ? input.amount
      : input.amountGbp !== undefined
        ? input.amountGbp
        : 0;
  const normalizedAmountGbp =
    input.amountGbp !== undefined
      ? input.amountGbp
      : normalizedCurrency === 'GBP'
        ? normalizedAmount
        : null;
  const canonicalAsset =
    normalizedCurrency === 'IZE'
      ? (() => {
          const assetAmount = assetAmountFromOneze(String(normalizedAmount));
          return {
            assetCode: assetAmount.asset,
            amountBaseUnits: assetAmount.baseUnitAmount,
            scale: assetAmount.scale,
            registryVersion: 'oneze-base-units-v1',
          };
        })()
      : (() => {
          const money = moneyFromMajorDecimal(normalizedCurrency, String(normalizedAmount));
          return {
            assetCode: money.currency,
            amountBaseUnits: money.minorAmount,
            scale: money.exponent,
            registryVersion: money.registryVersion,
          };
        })();

  await client.query(
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
    `,
    [
      input.accountId,
      input.counterpartyAccountId,
      input.direction,
      normalizedAmountGbp,
      normalizedAmount,
      normalizedCurrency,
      canonicalAsset.amountBaseUnits,
      canonicalAsset.assetCode,
      canonicalAsset.scale,
      canonicalAsset.registryVersion,
      input.sourceType,
      input.sourceId,
      input.lineType,
      toJsonString({
        ...(input.metadata ?? {}),
        canonicalAssetAmount: canonicalAsset,
      }),
    ]
  );
}

export async function getLedgerAccountBalance(
  client: DbQueryable,
  ownerType: LedgerOwnerType,
  ownerId: string,
  accountCode: LedgerAccountCode,
  currency = 'GBP'
): Promise<number> {
  const result = await client.query<{ balance: string }>(
    `
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN le.direction = 'credit' THEN le.amount
              ELSE -le.amount
            END
          ),
          0
        )::text AS balance
      FROM ledger_entries le
      INNER JOIN ledger_accounts la
        ON la.id = le.account_id
      WHERE la.owner_type = $1
        AND la.owner_id = $2
        AND la.account_code = $3
        AND la.currency = $4
    `,
    [ownerType, ownerId, accountCode, currency.toUpperCase()]
  );

  return Number(result.rows[0]?.balance ?? '0');
}

export async function postAuctionSettlementLedgerEntries(
  client: DbQueryable,
  input: {
    auctionId: string;
    buyerId: string;
    sellerId: string;
    winningBidGbp: number;
    platformFeeGbp: number;
  }
): Promise<void> {
  const winningBidGbp = roundTo(Math.max(0, input.winningBidGbp), 2);
  const platformFeeGbp = roundTo(Math.max(0, input.platformFeeGbp), 2);
  if (winningBidGbp <= 0) {
    return;
  }

  const sellerNetGbp = roundTo(Math.max(0, winningBidGbp - platformFeeGbp), 2);
  const sourceId = `auction:${input.auctionId}`;

  const buyerSpendAccountId = await ensureLedgerAccount(
    client,
    'user',
    input.buyerId,
    'buyer_spend'
  );
  const sellerPayableAccountId = await ensureLedgerAccount(
    client,
    'user',
    input.sellerId,
    'ize_wallet',
    'IZE'
  );
  const escrowAccountId = await ensureLedgerAccount(
    client,
    'platform',
    'platform',
    'escrow_liability'
  );
  const platformRevenueAccountId = await ensureLedgerAccount(
    client,
    'platform',
    'platform',
    'platform_revenue'
  );

  await appendLedgerEntry(client, {
    accountId: buyerSpendAccountId,
    counterpartyAccountId: escrowAccountId,
    direction: 'debit',
    amountGbp: winningBidGbp,
    sourceType: 'order_payment',
    sourceId,
    lineType: 'auction_buyer_charge',
    metadata: {
      auctionId: input.auctionId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
    },
  });

  await appendLedgerEntry(client, {
    accountId: escrowAccountId,
    counterpartyAccountId: buyerSpendAccountId,
    direction: 'credit',
    amountGbp: winningBidGbp,
    sourceType: 'order_payment',
    sourceId,
    lineType: 'auction_buyer_charge',
    metadata: {
      auctionId: input.auctionId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
    },
  });

  if (sellerNetGbp > 0) {
    await appendLedgerEntry(client, {
      accountId: escrowAccountId,
      counterpartyAccountId: sellerPayableAccountId,
      direction: 'debit',
      amountGbp: sellerNetGbp,
      sourceType: 'order_payment',
      sourceId,
      lineType: 'auction_seller_payable_credit',
      metadata: {
        auctionId: input.auctionId,
        sellerId: input.sellerId,
      },
    });

    await appendLedgerEntry(client, {
      accountId: sellerPayableAccountId,
      counterpartyAccountId: escrowAccountId,
      direction: 'credit',
      amountGbp: sellerNetGbp,
      sourceType: 'order_payment',
      sourceId,
      lineType: 'auction_seller_payable_credit',
      metadata: {
        auctionId: input.auctionId,
        sellerId: input.sellerId,
      },
    });
  }

  if (platformFeeGbp > 0) {
    await appendLedgerEntry(client, {
      accountId: escrowAccountId,
      counterpartyAccountId: platformRevenueAccountId,
      direction: 'debit',
      amountGbp: platformFeeGbp,
      sourceType: 'order_payment',
      sourceId,
      lineType: 'auction_platform_fee_credit',
      metadata: {
        component: 'auction_platform_charge',
      },
    });

    await appendLedgerEntry(client, {
      accountId: platformRevenueAccountId,
      counterpartyAccountId: escrowAccountId,
      direction: 'credit',
      amountGbp: platformFeeGbp,
      sourceType: 'order_payment',
      sourceId,
      lineType: 'auction_platform_fee_credit',
      metadata: {
        component: 'auction_platform_charge',
      },
    });
  }
}

// ─── Mint operation helpers ────────────────────────────────────────────────

export async function loadMintOperationById(
  client: DbQueryable,
  operationId: string,
  options?: { forUpdate?: boolean }
): Promise<MintOperationRow | null> {
  const baseQuery = `
    SELECT
      id,
      user_id,
      state,
      fiat_amount_minor::text,
      fiat_currency,
      net_fiat_amount_minor::text,
      platform_fee_minor::text,
      ize_amount_mg::text,
      rate_per_gram::text,
      rate_source,
      rate_locked_at::text,
      rate_expires_at::text,
      payment_intent_id,
      lot_id,
      custodian_ref,
      escrow_ledger_tx_id,
      wallet_credit_tx_id,
      purchase_attempted_at::text,
      settled_at::text,
      last_error,
      metadata,
      created_at::text,
      updated_at::text
    FROM mint_operations
    WHERE id = $1
    LIMIT 1
  `;

  const queryText = options?.forUpdate ? `${baseQuery} FOR UPDATE` : baseQuery;
  const result = await client.query<MintOperationRow>(queryText, [operationId]);
  return result.rows[0] ?? null;
}

// ─── Wallet helpers ────────────────────────────────────────────────────────

export async function ensureWallet(
  client: DbQueryable,
  userId: string,
  fiatCurrency = DEFAULT_WALLET_FIAT_CURRENCY
): Promise<WalletRow> {
  const result = await client.query<WalletRow>(
    `
      INSERT INTO wallets (
        id,
        user_id,
        fiat_currency
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING
        id,
        user_id,
        oneze_balance_mg,
        fiat_balance_minor,
        fiat_currency,
        version,
        created_at::text,
        updated_at::text
    `,
    [createRuntimeId('wal'), userId, fiatCurrency.toUpperCase()]
  );

  const wallet = result.rows[0];

  const walletLedgerCountResult = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM wallet_ledger
      WHERE wallet_id = $1
    `,
    [wallet.id]
  );

  const walletLedgerCount = Number(walletLedgerCountResult.rows[0]?.count ?? '0');
  if (walletLedgerCount > 0) {
    return wallet;
  }

  if (!(await ledgerTablesAvailable(client))) {
    return wallet;
  }

  const legacyIzeBalance = await getLedgerAccountBalance(client, 'user', userId, 'ize_wallet', 'IZE');
  const syncedOnezeBalanceMg = Math.max(0, Math.round(legacyIzeBalance * ONEZE_MG_PER_IZE));

  if (
    !Number.isSafeInteger(syncedOnezeBalanceMg)
    || syncedOnezeBalanceMg === Number(wallet.oneze_balance_mg)
  ) {
    return wallet;
  }

  const syncedResult = await client.query<WalletRow>(
    `
      UPDATE wallets
      SET
        oneze_balance_mg = $2,
        version = version + 1,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        user_id,
        oneze_balance_mg,
        fiat_balance_minor,
        fiat_currency,
        version,
        created_at::text,
        updated_at::text
    `,
    [wallet.id, syncedOnezeBalanceMg]
  );

  return syncedResult.rows[0] ?? wallet;
}

async function loadWalletForUpdate(client: DbQueryable, walletId: string): Promise<WalletRow> {
  const result = await client.query<WalletRow>(
    `
      SELECT
        id,
        user_id,
        oneze_balance_mg,
        fiat_balance_minor,
        fiat_currency,
        version,
        created_at::text,
        updated_at::text
      FROM wallets
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [walletId]
  );

  const wallet = result.rows[0];
  if (!wallet) {
    throw createApiError('WALLET_NOT_FOUND', 'Wallet not found', { walletId });
  }

  return wallet;
}

export async function applyWalletLedgerDelta(
  client: DbQueryable,
  input: {
    walletId: string;
    txId: string;
    asset: '1ZE' | 'FIAT';
    amount: number;
    kind: string;
    refType?: string;
    refId?: string;
    anchorValueInInr?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<number> {
  if (!Number.isSafeInteger(input.amount)) {
    throw createApiError('WALLET_AMOUNT_INVALID', 'Wallet ledger amount must be an integer unit');
  }

  const wallet = await loadWalletForUpdate(client, input.walletId);
  const currentBalance = Number(
    input.asset === '1ZE' ? wallet.oneze_balance_mg : wallet.fiat_balance_minor
  );
  const nextBalance = currentBalance + input.amount;

  if (nextBalance < 0) {
    throw createApiError('WALLET_INSUFFICIENT_BALANCE', 'Wallet balance is insufficient for this operation', {
      walletId: input.walletId,
      asset: input.asset,
      currentBalance,
      attemptedDelta: input.amount,
    });
  }

  if (input.asset === '1ZE') {
    await client.query(
      `
        UPDATE wallets
        SET
          oneze_balance_mg = $2,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1
      `,
      [input.walletId, nextBalance]
    );
  } else {
    await client.query(
      `
        UPDATE wallets
        SET
          fiat_balance_minor = $2,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1
      `,
      [input.walletId, nextBalance]
    );
  }

  await client.query(
    `
      INSERT INTO wallet_ledger (
        wallet_id,
        tx_id,
        asset,
        amount,
        balance_after,
        kind,
        ref_type,
        ref_id,
        anchor_value_in_inr,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    `,
    [
      input.walletId,
      input.txId,
      input.asset,
      input.amount,
      nextBalance,
      input.kind,
      input.refType ?? null,
      input.refId ?? null,
      input.anchorValueInInr ?? null,
      toJsonString(input.metadata ?? {}),
    ]
  );

  return nextBalance;
}

async function ensureWalletSegments(client: DbQueryable, wallet: WalletRow): Promise<WalletSegmentRow> {
  const seededPurchasedMg = Math.max(0, Number(wallet.oneze_balance_mg));

  const upserted = await client.query<WalletSegmentRow>(
    `
      INSERT INTO oneze_wallet_segments (
        wallet_id,
        purchased_balance_mg,
        earned_balance_mg,
        metadata
      )
      VALUES ($1, $2, 0, $3::jsonb)
      ON CONFLICT (wallet_id)
      DO UPDATE SET wallet_id = EXCLUDED.wallet_id
      RETURNING
        wallet_id,
        purchased_balance_mg,
        earned_balance_mg,
        metadata,
        created_at::text,
        updated_at::text
    `,
    [
      wallet.id,
      seededPurchasedMg,
      toJsonString({
        bootstrapFromWalletMg: seededPurchasedMg,
      }),
    ]
  );

  const segments = upserted.rows[0];
  const walletBalanceMg = Math.max(0, Number(wallet.oneze_balance_mg));
  const segmentTotalMg = Number(segments.purchased_balance_mg) + Number(segments.earned_balance_mg);

  if (segmentTotalMg >= walletBalanceMg) {
    return segments;
  }

  const parityDeltaMg = walletBalanceMg - segmentTotalMg;
  const parityPatched = await client.query<WalletSegmentRow>(
    `
      UPDATE oneze_wallet_segments
      SET
        purchased_balance_mg = purchased_balance_mg + $2,
        metadata = metadata || $3::jsonb,
        updated_at = NOW()
      WHERE wallet_id = $1
      RETURNING
        wallet_id,
        purchased_balance_mg,
        earned_balance_mg,
        metadata,
        created_at::text,
        updated_at::text
    `,
    [
      wallet.id,
      parityDeltaMg,
      toJsonString({
        paritySync: {
          at: new Date().toISOString(),
          deltaMg: parityDeltaMg,
          reason: 'segment_total_below_wallet_balance',
        },
      }),
    ]
  );

  return parityPatched.rows[0] ?? segments;
}

async function loadWalletSegmentsForUpdate(
  client: DbQueryable,
  wallet: WalletRow
): Promise<WalletSegmentRow> {
  await ensureWalletSegments(client, wallet);

  const result = await client.query<WalletSegmentRow>(
    `
      SELECT
        wallet_id,
        purchased_balance_mg,
        earned_balance_mg,
        metadata,
        created_at::text,
        updated_at::text
      FROM oneze_wallet_segments
      WHERE wallet_id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [wallet.id]
  );

  const segments = result.rows[0];
  if (!segments) {
    throw createApiError('WALLET_SEGMENTS_NOT_FOUND', 'Wallet segment record is missing', {
      walletId: wallet.id,
      userId: wallet.user_id,
    });
  }

  return segments;
}

async function appendWalletOriginEvent(
  client: DbQueryable,
  input: {
    walletId: string;
    txId: string;
    amountMg: number;
    originCountry: string;
    segment: 'purchased' | 'earned';
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  if (!Number.isSafeInteger(input.amountMg) || input.amountMg === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO oneze_balance_origin_events (
        wallet_id,
        tx_id,
        amount_mg,
        origin_country,
        segment,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      input.walletId,
      input.txId,
      input.amountMg,
      normalizeOnezeCountryTag(input.originCountry),
      input.segment,
      toJsonString(input.metadata ?? {}),
    ]
  );
}

export async function creditWalletSegmentBalance(
  client: DbQueryable,
  input: {
    wallet: WalletRow;
    txId: string;
    purchasedCreditMg?: number;
    earnedCreditMg?: number;
    originCountry: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ purchasedBalanceMg: number; earnedBalanceMg: number }> {
  const purchasedCreditMg = input.purchasedCreditMg ?? 0;
  const earnedCreditMg = input.earnedCreditMg ?? 0;

  if (!Number.isSafeInteger(purchasedCreditMg) || !Number.isSafeInteger(earnedCreditMg)) {
    throw createApiError('WALLET_SEGMENT_AMOUNT_INVALID', 'Wallet segment credits must be integer mg units');
  }

  if (purchasedCreditMg < 0 || earnedCreditMg < 0) {
    throw createApiError('WALLET_SEGMENT_AMOUNT_INVALID', 'Wallet segment credits cannot be negative');
  }

  const segments = await loadWalletSegmentsForUpdate(client, input.wallet);
  const nextPurchasedMg = Number(segments.purchased_balance_mg) + purchasedCreditMg;
  const nextEarnedMg = Number(segments.earned_balance_mg) + earnedCreditMg;

  await client.query(
    `
      UPDATE oneze_wallet_segments
      SET
        purchased_balance_mg = $2,
        earned_balance_mg = $3,
        metadata = metadata || $4::jsonb,
        updated_at = NOW()
      WHERE wallet_id = $1
    `,
    [
      input.wallet.id,
      nextPurchasedMg,
      nextEarnedMg,
      toJsonString({
        txId: input.txId,
        operation: 'credit',
        purchasedCreditMg,
        earnedCreditMg,
        ...(input.metadata ?? {}),
      }),
    ]
  );

  if (purchasedCreditMg > 0) {
    await appendWalletOriginEvent(client, {
      walletId: input.wallet.id,
      txId: input.txId,
      amountMg: purchasedCreditMg,
      originCountry: input.originCountry,
      segment: 'purchased',
      metadata: {
        direction: 'credit',
        ...(input.metadata ?? {}),
      },
    });
  }

  if (earnedCreditMg > 0) {
    await appendWalletOriginEvent(client, {
      walletId: input.wallet.id,
      txId: input.txId,
      amountMg: earnedCreditMg,
      originCountry: input.originCountry,
      segment: 'earned',
      metadata: {
        direction: 'credit',
        ...(input.metadata ?? {}),
      },
    });
  }

  return {
    purchasedBalanceMg: nextPurchasedMg,
    earnedBalanceMg: nextEarnedMg,
  };
}

// ─── Withdrawal helpers ────────────────────────────────────────────────────

function toWithdrawalPayload(row: WithdrawalRow) {
  const grossMinor = Number(row.gross_minor);
  const spreadMinor = Number(row.spread_minor);
  const networkFeeMinor = Number(row.network_fee_minor);
  const netMinor = Number(row.net_minor);

  return {
    id: row.id,
    userId: row.user_id,
    burnTxId: row.burn_tx_id,
    amountMg: Number(row.amount_mg),
    amountOneze: mgToOnezeAmount(Number(row.amount_mg)),
    targetCurrency: row.target_currency,
    grossMinor,
    gross: fromFiatMinor(grossMinor, row.target_currency),
    spreadMinor,
    spread: fromFiatMinor(spreadMinor, row.target_currency),
    networkFeeMinor,
    networkFee: fromFiatMinor(networkFeeMinor, row.target_currency),
    netMinor,
    net: fromFiatMinor(netMinor, row.target_currency),
    rateLocked: Number(row.rate_locked),
    rateExpiresAt: row.rate_expires_at,
    rail: row.rail,
    railRef: row.rail_ref,
    status: row.status,
    payoutDestination: row.payout_destination,
    metadata: row.metadata,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function canTransitionWithdrawalStatus(
  currentStatus: WithdrawalRow['status'],
  nextStatus: WithdrawalRow['status']
): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }

  if (currentStatus === 'QUOTED') {
    return ['ACCEPTED', 'RESERVED', 'FAILED'].includes(nextStatus);
  }

  if (currentStatus === 'ACCEPTED') {
    return ['RESERVED', 'FAILED', 'REVERSED'].includes(nextStatus);
  }

  if (currentStatus === 'RESERVED') {
    return ['PAID_OUT', 'FAILED', 'REVERSED'].includes(nextStatus);
  }

  if (currentStatus === 'FAILED') {
    return ['REVERSED'].includes(nextStatus);
  }

  return false;
}

async function loadWithdrawalById(
  client: DbQueryable,
  withdrawalId: string,
  options?: { forUpdate?: boolean }
): Promise<WithdrawalRow | null> {
  const baseQuery = `
    SELECT
      id,
      user_id,
      burn_tx_id,
      amount_mg::text,
      target_currency,
      gross_minor::text,
      spread_minor::text,
      network_fee_minor::text,
      net_minor::text,
      rate_locked::text,
      rate_expires_at::text,
      rail,
      rail_ref,
      status,
      payout_destination,
      metadata,
      created_at::text,
      completed_at::text
    FROM withdrawals
    WHERE id = $1
    LIMIT 1
  `;

  const queryText = options?.forUpdate ? `${baseQuery} FOR UPDATE` : baseQuery;
  const result = await client.query<WithdrawalRow>(queryText, [withdrawalId]);
  return result.rows[0] ?? null;
}

export async function executeReservedWithdrawal(
  client: DbQueryable,
  input: {
    withdrawalId: string;
    railRef?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{
  alreadySettled: boolean;
  withdrawal: ReturnType<typeof toWithdrawalPayload>;
  settlement: {
    railRef: string;
    reserveConsumption: Array<{ lotId: string; consumedMg: number }>;
  } | null;
  wallet: {
    walletId: string;
    onezeBalanceMg: number;
    onezeBalance: number;
  } | null;
}> {
  const withdrawal = await loadWithdrawalById(client, input.withdrawalId, { forUpdate: true });
  if (!withdrawal) {
    throw createApiError('WITHDRAWAL_NOT_FOUND', 'Withdrawal not found', {
      withdrawalId: input.withdrawalId,
    });
  }

  if (withdrawal.status === 'PAID_OUT') {
    return {
      alreadySettled: true,
      withdrawal: toWithdrawalPayload(withdrawal),
      settlement: null,
      wallet: null,
    };
  }

  if (!canTransitionWithdrawalStatus(withdrawal.status, 'PAID_OUT')) {
    throw createApiError('WITHDRAWAL_STATE_INVALID', 'Withdrawal cannot be executed from current status', {
      withdrawalId: input.withdrawalId,
      status: withdrawal.status,
    });
  }

  const amountMg = Number(withdrawal.amount_mg);
  const linkedTxId = withdrawal.burn_tx_id ?? createRuntimeId('wdburn');
  const reserveConsumption: Array<{ lotId: string; consumedMg: number }> = [];
  const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, withdrawal.target_currency);

  const wallet = await ensureWallet(client, withdrawal.user_id, withdrawal.target_currency);
  const walletBalanceAfterMg = await applyWalletLedgerDelta(client, {
    walletId: wallet.id,
    txId: linkedTxId,
    asset: '1ZE',
    amount: 0,
    kind: 'WITHDRAWAL_SETTLED',
    refType: 'withdrawal',
    refId: withdrawal.id,
    anchorValueInInr: pricingQuote.anchorValueInInr,
    metadata: {
      withdrawalId: withdrawal.id,
      reserveLots: reserveConsumption,
      pricingSource: `internal_pricing:${pricingQuote.countryCode}:sell`,
      ...(input.metadata ?? {}),
    },
  });

  const railRef = input.railRef ?? `${withdrawal.rail}_${createRuntimeId('payout')}`;
  const updatedResult = await client.query<WithdrawalRow>(
    `
      UPDATE withdrawals
      SET
        burn_tx_id = COALESCE(burn_tx_id, $2),
        rail_ref = $3,
        status = 'PAID_OUT',
        completed_at = NOW(),
        metadata = metadata || $4::jsonb
      WHERE id = $1
      RETURNING
        id,
        user_id,
        burn_tx_id,
        amount_mg::text,
        target_currency,
        gross_minor::text,
        spread_minor::text,
        network_fee_minor::text,
        net_minor::text,
        rate_locked::text,
        rate_expires_at::text,
        rail,
        rail_ref,
        status,
        payout_destination,
        metadata,
        created_at::text,
        completed_at::text
    `,
    [
      withdrawal.id,
      linkedTxId,
      railRef,
      toJsonString({
        executedAt: new Date().toISOString(),
        reserveConsumption,
        ...(input.metadata ?? {}),
      }),
    ]
  );

  return {
    alreadySettled: false,
    withdrawal: toWithdrawalPayload(updatedResult.rows[0]),
    settlement: {
      railRef,
      reserveConsumption,
    },
    wallet: {
      walletId: wallet.id,
      onezeBalanceMg: walletBalanceAfterMg,
      onezeBalance: mgToOnezeAmount(walletBalanceAfterMg),
    },
  };
}

// ─── Payout pause state ────────────────────────────────────────────────────

export async function setPayoutPauseState(input: {
  paused: boolean;
  reason: string;
  reconciliationRunId?: string;
  mismatchGbp?: number;
}): Promise<void> {
  if (!input.paused) {
    await redis.del(PAYOUTS_PAUSED_REDIS_KEY);
    return;
  }

  await redis.set(
    PAYOUTS_PAUSED_REDIS_KEY,
    toJsonString({
      paused: true,
      reason: input.reason,
      reconciliationRunId: input.reconciliationRunId ?? null,
      mismatchGbp: input.mismatchGbp ?? null,
      pausedAt: new Date().toISOString(),
    })
  );
}

// ─── Ops alerting ──────────────────────────────────────────────────────────

async function listAdminAlertRecipients(): Promise<string[]> {
  const configuredIds = config.alertingAdminUserIds
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  try {
    const result = await db.query<{ id: string }>(
      `
        SELECT id
        FROM users
        WHERE role = 'admin'
        ORDER BY created_at ASC
        LIMIT 200
      `
    );

    const roleIds = result.rows.map((row) => row.id).filter((entry) => entry.trim().length > 0);
    const uniqueIds = new Set<string>([...configuredIds, ...roleIds]);
    return Array.from(uniqueIds);
  } catch {
    return configuredIds;
  }
}

export async function dispatchOpsAlert(alert: {
  code: string;
  severity: 'warning' | 'critical';
  message: string;
  metricValue?: number | null;
  threshold?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const dedupeBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const dedupeKey = `${ALERT_DEDUP_REDIS_PREFIX}${alert.code}:${dedupeBucket}`;
  const shouldSend = await redis.set(dedupeKey, '1', 'EX', 5 * 60, 'NX');

  if (!shouldSend) {
    return;
  }

  if (alert.severity === 'critical' && config.sentryDsn) {
    Sentry.captureMessage(`Operational alert: ${alert.message}`, {
      level: 'error',
      tags: {
        alert_code: alert.code,
      },
      extra: {
        metricValue: alert.metricValue,
        threshold: alert.threshold,
        metadata: alert.metadata,
      },
    });
  }

  if (config.alertingWebhookUrls.length > 0) {
    await Promise.all(
      config.alertingWebhookUrls.map(async (webhookUrl) => {
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(10_000),
            body: toJsonString({
              text: `[${alert.severity.toUpperCase()}] ${alert.message}`,
              alert,
            }),
          });
          if (!response.ok) {
            throw new Error(`Alert webhook returned HTTP ${response.status}`);
          }
        } catch (error) {
          log.error({ err: error, webhookUrl, code: alert.code }, 'Failed sending ops alert webhook');
        }
      })
    );
  }

  const adminRecipients = await listAdminAlertRecipients();
  await Promise.all(
    adminRecipients.map(async (userId) => {
      try {
        await queueUserNotification({
          userId,
          title: alert.severity === 'critical' ? 'Critical Ops Alert' : 'Ops Alert',
          body: alert.message,
          payload: {
            event: 'ops_alert',
            code: alert.code,
            severity: alert.severity,
            metricValue: alert.metricValue,
            threshold: alert.threshold,
          },
          metadata: {
            source: 'ops_alerting_scheduler',
            ...alert.metadata,
          },
        });
      } catch (error) {
        log.error({ err: error, userId, code: alert.code }, 'Failed queueing ops alert notification');
      }
    })
  );
}

// Re-export terminal states for handlers that reference them.
export { MINT_OPERATION_TERMINAL_STATES };
