import crypto from 'node:crypto';
import {
  createApiError,
  createRuntimeId,
  toJsonString,
  unitsToOnezeAmount,
  ONEZE_UNITS_PER_IZE,
  type DbQueryable,
  type WalletRow,
} from './workerHelpers.js';
import {
  resolveCountryPricingQuoteByCurrency,
  resolveInternalFxRate,
} from './pricingEngine.js';
import {
  allocateMoneyByBasisPoints,
  moneyFromMinor,
  moneyToMajorDecimal,
} from './money.js';
import { verifyMintQuoteMac } from './paymentIntentMetadata.js';

// ─── Canonical wallet balance mutation ───────────────────────────────────────
// This is THE wallet ledger primitive: it locks the wallet row, applies the
// delta with a negative-balance guard, and appends the wallet_ledger entry —
// all on the caller's transaction. index.ts delegates to this copy; a stale
// duplicate remains in lib/workerRuntime.ts for the standalone worker
// process, but new money paths must use this one.

async function loadWalletForUpdate(client: DbQueryable, walletId: string): Promise<WalletRow> {
  const result = await client.query<WalletRow>(
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

function normalizePocketCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z0-9]{3}$/.test(normalized)) {
    throw createApiError('WALLET_CURRENCY_INVALID', 'Currency must be a three-character code', {
      currency,
    });
  }
  return normalized;
}

/**
 * Lock the per-currency pocket row for a wallet that is ALREADY locked FOR
 * UPDATE. Deadlock-safe order, held by every writer in this module:
 *   1. wallets row FOR UPDATE (loadWalletForUpdate / lockWalletRowsForUpdate)
 *   2. wallet_currency_balances row(s) FOR UPDATE — this function, or the
 *      batched lockCurrencyBalanceRowsForUpdate which locks in sorted order.
 * No code path may take a pocket lock before the wallet lock.
 *
 * Missing pockets are seeded first (INSERT ... ON CONFLICT DO NOTHING, then
 * SELECT FOR UPDATE — the insert itself takes no row lock worth ordering).
 * The pocket matching the wallet's legacy fiat_currency seeds from
 * wallets.fiat_balance_minor so balances recorded before the multi-currency
 * table existed remain correct; every other currency starts at 0.
 */
async function lockCurrencyPocketForUpdate(
  client: DbQueryable,
  wallet: WalletRow,
  currency: string
): Promise<{ currency: string; balanceMinor: number }> {
  const normalized = normalizePocketCurrency(currency);
  const legacyCurrency = wallet.fiat_currency.trim().toUpperCase();
  const seedMinor = normalized === legacyCurrency ? Number(wallet.fiat_balance_minor) : 0;

  await client.query(
    `
      INSERT INTO wallet_currency_balances (
        wallet_id,
        currency,
        balance_minor,
        version,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 0, NOW(), NOW())
      ON CONFLICT (wallet_id, currency) DO NOTHING
    `,
    [wallet.id, normalized, seedMinor]
  );

  const result = await client.query<{ balance_minor: string }>(
    `
      SELECT balance_minor::text AS balance_minor
      FROM wallet_currency_balances
      WHERE wallet_id = $1
        AND currency = $2
      LIMIT 1
      FOR UPDATE
    `,
    [wallet.id, normalized]
  );

  return {
    currency: normalized,
    balanceMinor: Number(result.rows[0]?.balance_minor ?? seedMinor),
  };
}

/**
 * Canonical wallet balance mutation for both the 1ZE bucket and every fiat
 * currency pocket.
 *
 * FIAT legs resolve their pocket currency from `fiatCurrency` (defaulting to
 * the wallet's legacy fiat_currency so existing callers are unchanged), then:
 *   - upsert + lock wallet_currency_balances(wallet_id, currency) and apply
 *     the delta with the same negative-balance guard, computed from the
 *     pocket row (the authoritative balance for that currency);
 *   - when the resolved currency IS the legacy fiat_currency, mirror the new
 *     balance into wallets.fiat_balance_minor exactly as before — every
 *     pre-multi-currency caller keeps working untouched;
 *   - when it differs, wallets.fiat_balance_minor is NOT touched — only the
 *     pocket row and the ledger leg move.
 *
 * The wallet_ledger leg always stamps `currency` ('1ZE' for token legs, the
 * resolved code for fiat legs) and `balance_after` reflects the pocket the
 * leg moved.
 */
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
    /** FIAT legs only — the pocket currency. Defaults to wallets.fiat_currency. */
    fiatCurrency?: string;
  }
): Promise<number> {
  if (!Number.isSafeInteger(input.amount)) {
    throw createApiError('WALLET_AMOUNT_INVALID', 'Wallet ledger amount must be an integer unit');
  }

  const wallet = await loadWalletForUpdate(client, input.walletId);

  let nextBalance: number;
  let ledgerCurrency: string;

  if (input.asset === '1ZE') {
    const currentBalance = Number(wallet.oneze_balance_units);
    nextBalance = currentBalance + input.amount;

    if (nextBalance < 0) {
      throw createApiError('WALLET_INSUFFICIENT_BALANCE', 'Wallet balance is insufficient for this operation', {
        walletId: input.walletId,
        asset: input.asset,
        currentBalance,
        attemptedDelta: input.amount,
      });
    }

    await client.query(
      `
        UPDATE wallets
        SET
          oneze_balance_units = $2,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1
      `,
      [input.walletId, nextBalance]
    );
    ledgerCurrency = '1ZE';
  } else {
    const resolvedCurrency = normalizePocketCurrency(input.fiatCurrency ?? wallet.fiat_currency);
    const pocket = await lockCurrencyPocketForUpdate(client, wallet, resolvedCurrency);
    nextBalance = pocket.balanceMinor + input.amount;

    if (nextBalance < 0) {
      throw createApiError('WALLET_INSUFFICIENT_BALANCE', 'Wallet balance is insufficient for this operation', {
        walletId: input.walletId,
        asset: input.asset,
        currency: pocket.currency,
        currentBalance: pocket.balanceMinor,
        attemptedDelta: input.amount,
      });
    }

    await client.query(
      `
        UPDATE wallet_currency_balances
        SET
          balance_minor = $3,
          version = version + 1,
          updated_at = NOW()
        WHERE wallet_id = $1
          AND currency = $2
      `,
      [input.walletId, pocket.currency, nextBalance]
    );

    // Legacy mirror: the single-fiat bucket on wallets stays the
    // compatibility view of ITS OWN currency only. Foreign pockets leave it
    // untouched.
    if (pocket.currency === wallet.fiat_currency.trim().toUpperCase()) {
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
    ledgerCurrency = pocket.currency;
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
        metadata,
        currency
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
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
      ledgerCurrency,
    ]
  );

  return nextBalance;
}

// ─── Reservation-aware spendable 1ZE primitive ─────────────────────────────
// wallets.oneze_balance_units is the GROSS settled balance. Funds committed
// to enforceable holds must not be spendable a second time. The canonical
// hold source today is coown_order_reservations (status 'active'/'placed',
// unexpired) — the same predicate the position projection uses
// (index.ts /wallet/1ze/:userId/position). Withdrawals are NOT a hold source:
// the accept path debits the wallet immediately (kind WITHDRAWAL_RESERVED),
// so those funds are already out of the gross balance.
//
// Lock discipline (matches reservation placement in routes/coOwn.ts and DvP
// settlement): the wallet row is locked FOR UPDATE first, then matching
// reservation rows are locked in stable id order. Every caller that debits
// user funds inside its own transaction should compute spendable through
// this primitive instead of reading the gross balance.

export interface SpendableOnezeFunds {
  walletId: string | null;
  userId: string;
  /** Settled wallets.oneze_balance_units. */
  grossUnits: number;
  /** 1ZE units held by enforceable coown_order_reservations rows. */
  reservedUnits: number;
  /** max(0, gross - reserved) — what a new debit may consume. */
  spendableUnits: number;
  /** Reservation row ids contributing to reservedUnits (for diagnostics). */
  reservationIds: string[];
}

async function loadWalletForUpdateByUserId(
  client: DbQueryable,
  userId: string
): Promise<WalletRow | null> {
  const result = await client.query<WalletRow>(
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
      FOR UPDATE
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

/**
 * Lock a set of wallet rows FOR UPDATE in deterministic id order. Callers
 * that will mutate more than one wallet in one transaction (e.g. a P2P
 * transfer) must acquire the locks through this helper first so two
 * opposite-direction transfers cannot deadlock.
 */
export async function lockWalletRowsForUpdate(
  client: DbQueryable,
  walletIds: readonly string[]
): Promise<string[]> {
  const uniqueIds = [...new Set(walletIds)].filter((id) => typeof id === 'string' && id.length > 0);
  if (uniqueIds.length === 0) {
    return [];
  }

  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM wallets
      WHERE id = ANY($1::text[])
      ORDER BY id
      FOR UPDATE
    `,
    [uniqueIds]
  );

  return result.rows.map((row) => row.id);
}

/**
 * Compute the spendable 1ZE balance for a wallet: settled gross balance minus
 * all enforceable reservations/holds. Runs entirely on the caller's
 * transaction with row locks — wallet first, then reservation rows in id
 * order — so a concurrent reservation placement, expiry, or settlement cannot
 * change the answer after it is computed.
 *
 * Exclusions let a settler ignore the reservation that is being consumed by
 * the current operation (same convention as coOwn.ts DvP settlement):
 *   - excludeReservationIds: reservation row ids to skip
 *   - excludePlacedOrderId: skip reservations whose placed_order_id matches
 */
export async function computeSpendableOnezeUnits(
  client: DbQueryable,
  input: {
    userId?: string;
    walletId?: string;
    excludeReservationIds?: readonly string[];
    excludePlacedOrderId?: number | string | null;
  }
): Promise<SpendableOnezeFunds> {
  if (!input.walletId && !input.userId) {
    throw createApiError('WALLET_LOOKUP_INVALID', 'computeSpendableOnezeUnits requires a walletId or userId');
  }

  const wallet = input.walletId
    ? await loadWalletForUpdate(client, input.walletId)
    : await loadWalletForUpdateByUserId(client, input.userId!);

  const userId = input.userId ?? wallet?.user_id;
  if (!userId) {
    throw createApiError('WALLET_NOT_FOUND', 'Wallet not found', {
      walletId: input.walletId ?? null,
      userId: input.userId ?? null,
    });
  }

  const grossUnits = wallet ? Number(wallet.oneze_balance_units) : 0;

  const excludeReservationIds = new Set(input.excludeReservationIds ?? []);
  const excludePlacedOrderId =
    input.excludePlacedOrderId === null || input.excludePlacedOrderId === undefined
      ? null
      : String(input.excludePlacedOrderId);

  const reservations = await client.query<{
    id: string;
    reserved_units: string;
    placed_order_id: string | null;
  }>(
    `
      SELECT
        id,
        reserved_1ze_units::text AS reserved_units,
        placed_order_id::text AS placed_order_id
      FROM coown_order_reservations
      WHERE user_id = $1
        AND status IN ('active', 'placed')
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY id
      FOR UPDATE
    `,
    [userId]
  );

  let reservedUnits = 0;
  const reservationIds: string[] = [];
  for (const row of reservations.rows) {
    if (excludeReservationIds.has(row.id)) {
      continue;
    }
    if (excludePlacedOrderId !== null && row.placed_order_id === excludePlacedOrderId) {
      continue;
    }
    reservedUnits += Number(row.reserved_units);
    reservationIds.push(row.id);
  }

  return {
    walletId: wallet?.id ?? null,
    userId,
    grossUnits,
    reservedUnits,
    spendableUnits: Math.max(0, grossUnits - reservedUnits),
    reservationIds,
  };
}

/**
 * Assert the wallet can fund a `requiredUnits` debit from spendable funds.
 * Returns the computed breakdown for callers that want it in the response;
 * throws WALLET_INSUFFICIENT_BALANCE otherwise.
 */
export async function assertSpendableOnezeUnits(
  client: DbQueryable,
  input: {
    userId?: string;
    walletId?: string;
    requiredUnits: number;
    excludeReservationIds?: readonly string[];
    excludePlacedOrderId?: number | string | null;
  }
): Promise<SpendableOnezeFunds> {
  const funds = await computeSpendableOnezeUnits(client, input);

  if (funds.spendableUnits < input.requiredUnits) {
    throw createApiError('WALLET_INSUFFICIENT_BALANCE', 'Wallet spendable balance is insufficient for this operation', {
      walletId: funds.walletId,
      userId: funds.userId,
      asset: '1ZE',
      grossUnits: funds.grossUnits,
      reservedUnits: funds.reservedUnits,
      spendableUnits: funds.spendableUnits,
      requiredUnits: input.requiredUnits,
    });
  }

  return funds;
}

// ─── Multi-currency fiat pockets ─────────────────────────────────────────────
// wallet_currency_balances holds one row per (wallet_id, currency); the
// legacy wallets.fiat_balance_minor remains the compatibility mirror for the
// wallet's own fiat_currency only (see applyWalletLedgerDelta).
//
// Lock discipline is identical to the 1ZE spendable primitive: the wallets
// row is locked FOR UPDATE first, then pocket rows — so a concurrent
// mutation serialized on the wallet lock cannot move the answer after it is
// computed. Every mutation of a pocket must go through
// applyWalletLedgerDelta (or lock the rows via lockCurrencyBalanceRowsForUpdate
// before mutating) so this order can never invert.

export interface WalletCurrencyBalance {
  walletId: string;
  currency: string;
  balanceMinor: number;
  version: number;
}

/**
 * Read one currency pocket. With `lock: true` the wallets row is locked FOR
 * UPDATE first (deadlock-safe order), then the pocket row FOR UPDATE —
 * intended for callers about to debit the pocket inside their transaction.
 * Returns null when the wallet or the pocket does not exist.
 */
export async function getCurrencyBalance(
  client: DbQueryable,
  walletId: string,
  currency: string,
  options?: { lock?: boolean }
): Promise<WalletCurrencyBalance | null> {
  const normalized = normalizePocketCurrency(currency);

  if (options?.lock) {
    const wallet = await client.query<{ id: string }>(
      `SELECT id FROM wallets WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [walletId]
    );
    if (!wallet.rows[0]) {
      return null;
    }
  }

  const result = await client.query<{ balance_minor: string; version: string }>(
    `
      SELECT balance_minor::text AS balance_minor, version::text AS version
      FROM wallet_currency_balances
      WHERE wallet_id = $1
        AND currency = $2
      LIMIT 1
      ${options?.lock ? 'FOR UPDATE' : ''}
    `,
    [walletId, normalized]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    walletId,
    currency: normalized,
    balanceMinor: Number(row.balance_minor),
    version: Number(row.version),
  };
}

/**
 * Seed-if-missing then lock several currency pockets in one deterministic
 * order: wallets row FOR UPDATE first (inside loadWalletForUpdate), then
 * pocket rows FOR UPDATE in sorted currency order via a single locked read.
 * Callers mutating more than one pocket in one transaction (e.g. an FX
 * conversion debiting one currency and crediting another) acquire their
 * locks through this helper so opposite-order mutations cannot deadlock.
 * Returns the locked balances keyed by currency.
 */
export async function lockCurrencyBalanceRowsForUpdate(
  client: DbQueryable,
  walletId: string,
  currencies: readonly string[]
): Promise<Map<string, number>> {
  const wallet = await loadWalletForUpdate(client, walletId);
  const normalized = [...new Set(currencies.map((c) => normalizePocketCurrency(c)))].sort();
  const balances = new Map<string, number>();
  if (normalized.length === 0) {
    return balances;
  }

  for (const currency of normalized) {
    const seedMinor =
      currency === wallet.fiat_currency.trim().toUpperCase()
        ? Number(wallet.fiat_balance_minor)
        : 0;
    await client.query(
      `
        INSERT INTO wallet_currency_balances (
          wallet_id,
          currency,
          balance_minor,
          version,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 0, NOW(), NOW())
        ON CONFLICT (wallet_id, currency) DO NOTHING
      `,
      [wallet.id, currency, seedMinor]
    );
  }

  const result = await client.query<{ currency: string; balance_minor: string }>(
    `
      SELECT currency, balance_minor::text AS balance_minor
      FROM wallet_currency_balances
      WHERE wallet_id = $1
        AND currency = ANY($2::char(3)[])
      ORDER BY currency
      FOR UPDATE
    `,
    [wallet.id, normalized]
  );

  for (const row of result.rows) {
    balances.set(row.currency, Number(row.balance_minor));
  }
  return balances;
}

export interface SpendableFiatFunds {
  walletId: string | null;
  userId: string;
  currency: string;
  /** Settled wallet_currency_balances.balance_minor (or the legacy mirror). */
  grossMinor: number;
  /**
   * Minor units committed to enforceable holds. No fiat hold sources exist
   * yet — this is the extension point: subtract future hold tables here and
   * surface contributing ids in holdSources, mirroring reservedUnits /
   * reservationIds on SpendableOnezeFunds.
   */
  heldMinor: number;
  /** max(0, gross - held) — what a new debit may consume. */
  spendableMinor: number;
  /** Hold-source row ids contributing to heldMinor (for diagnostics). */
  holdSources: string[];
}

/**
 * Spendable balance of one fiat currency pocket: gross minus enforceable
 * holds (none exist yet, so spendable = gross). Lock order matches
 * computeSpendableOnezeUnits — wallet row FOR UPDATE, then the pocket row —
 * so callers that debit inside their own transaction get a stable answer.
 *
 * When the requested currency is the wallet's legacy fiat_currency and no
 * pocket row exists yet (pre-backfill), the legacy wallets.fiat_balance_minor
 * is the effective gross — same lazy-seed semantics as the mutation path.
 */
export async function computeSpendableFiatMinor(
  client: DbQueryable,
  input: {
    userId?: string;
    walletId?: string;
    currency: string;
  }
): Promise<SpendableFiatFunds> {
  if (!input.walletId && !input.userId) {
    throw createApiError('WALLET_LOOKUP_INVALID', 'computeSpendableFiatMinor requires a walletId or userId');
  }

  const wallet = input.walletId
    ? await loadWalletForUpdate(client, input.walletId)
    : await loadWalletForUpdateByUserId(client, input.userId!);

  const userId = input.userId ?? wallet?.user_id;
  if (!userId) {
    throw createApiError('WALLET_NOT_FOUND', 'Wallet not found', {
      walletId: input.walletId ?? null,
      userId: input.userId ?? null,
    });
  }

  const currency = normalizePocketCurrency(input.currency);
  const legacyCurrency = wallet?.fiat_currency.trim().toUpperCase();

  const pocket = await client.query<{ balance_minor: string }>(
    `
      SELECT balance_minor::text AS balance_minor
      FROM wallet_currency_balances
      WHERE wallet_id = $1
        AND currency = $2
      LIMIT 1
      FOR UPDATE
    `,
    [wallet?.id ?? input.walletId ?? null, currency]
  );

  const grossMinor = pocket.rows[0]
    ? Number(pocket.rows[0].balance_minor)
    : wallet && currency === legacyCurrency
      ? Number(wallet.fiat_balance_minor)
      : 0;

  // Future fiat hold sources (reservations, pending transfers) subtract here.
  const heldMinor = 0;

  return {
    walletId: wallet?.id ?? null,
    userId,
    currency,
    grossMinor,
    heldMinor,
    spendableMinor: Math.max(0, grossMinor - heldMinor),
    holdSources: [],
  };
}

/**
 * Assert the wallet can fund a `requiredMinor` debit from the currency
 * pocket's spendable funds. Mirrors assertSpendableOnezeUnits.
 */
export async function assertSpendableFiatMinor(
  client: DbQueryable,
  input: {
    userId?: string;
    walletId?: string;
    currency: string;
    requiredMinor: number;
  }
): Promise<SpendableFiatFunds> {
  const funds = await computeSpendableFiatMinor(client, input);

  if (funds.spendableMinor < input.requiredMinor) {
    throw createApiError('WALLET_INSUFFICIENT_BALANCE', 'Wallet spendable balance is insufficient for this operation', {
      walletId: funds.walletId,
      userId: funds.userId,
      asset: 'FIAT',
      currency: funds.currency,
      grossMinor: funds.grossMinor,
      heldMinor: funds.heldMinor,
      spendableMinor: funds.spendableMinor,
      requiredMinor: input.requiredMinor,
    });
  }

  return funds;
}

// ─── Wallet idempotency helpers ──────────────────────────────────────────────
// Shared by every wallet money-mutating route (mint, burn, convert, buy,
// transfers). The stored request_hash is compared before a replay is served
// so a recycled key with a different payload is rejected, not silently
// replayed.

export function hashWalletIdempotencyPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(toJsonString(payload ?? {})).digest('hex');
}

export async function getWalletIdempotentResponse(
  client: DbQueryable,
  input: {
    userId: string;
    operation: string;
    idempotencyKey: string;
    requestHash: string;
  }
): Promise<Record<string, unknown> | null> {
  const result = await client.query<{
    request_hash: string;
    response_payload: Record<string, unknown>;
  }>(
    `
      SELECT request_hash, response_payload
      FROM wallet_idempotency_keys
      WHERE user_id = $1
        AND operation = $2
        AND idempotency_key = $3
      LIMIT 1
    `,
    [input.userId, input.operation, input.idempotencyKey]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  if (row.request_hash !== input.requestHash) {
    throw createApiError(
      'IDEMPOTENCY_KEY_REUSED',
      'Idempotency key was already used with a different request payload'
    );
  }

  return row.response_payload;
}

export async function saveWalletIdempotentResponse(
  client: DbQueryable,
  input: {
    userId: string;
    operation: string;
    idempotencyKey: string;
    requestHash: string;
    responsePayload: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO wallet_idempotency_keys (
        user_id,
        operation,
        idempotency_key,
        request_hash,
        response_payload
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (user_id, operation, idempotency_key)
      DO NOTHING
    `,
    [
      input.userId,
      input.operation,
      input.idempotencyKey,
      input.requestHash,
      toJsonString(input.responsePayload),
    ]
  );
}

// ─── Claim-before-mutate idempotency ─────────────────────────────────────────
// The read-then-write pair above is not race-safe on its own: two concurrent
// requests with the same absent key can both read "no row", both mutate the
// wallet, and then one response save loses the ON CONFLICT race — a double
// spend. The canonical fix claims the key inside the SAME transaction as the
// mutation:
//
//   1. INSERT the idempotency row with a pending marker payload ON CONFLICT
//      DO NOTHING. Postgres serializes speculative inserts on the unique key:
//      a concurrent claim blocks until the in-flight row commits or aborts.
//   2. If we won the insert, run the money mutations, then UPDATE the row
//      with the real response payload — same transaction, so a crash rolls
//      back the claim too and a retry starts clean.
//   3. If we lost the conflict, the winning row is now committed: replay its
//      stored response when the request hash matches, reject a reused key
//      with a different payload, and report 409 if a pending marker is ever
//      observed (only reachable for rows written outside this flow).
//
// wallet_idempotency_keys has no status column and the ledger schema must not
// change — the pending marker lives inside the JSONB response_payload and is
// never visible once the transaction commits its final payload.

const WALLET_IDEMPOTENCY_CLAIM_FIELD = '__walletIdempotencyClaim';
const WALLET_IDEMPOTENCY_CLAIM_PENDING = 'in_progress';

export type WalletIdempotencyClaimResult =
  | { status: 'claimed' }
  | { status: 'replay'; responsePayload: Record<string, unknown> }
  | { status: 'in_progress' };

/**
 * Claim an idempotency key for a wallet mutation. Must be called inside the
 * mutation's transaction BEFORE any wallet writes. The caller decides:
 *   - 'claimed'     → proceed with mutations, then completeWalletIdempotencyClaim
 *   - 'replay'      → return the stored response payload, mutate nothing
 *   - 'in_progress' → a concurrent/legacy claim is unresolved; return 409
 */
export async function claimWalletIdempotencyKey(
  client: DbQueryable,
  input: {
    userId: string;
    operation: string;
    idempotencyKey: string;
    requestHash: string;
  }
): Promise<WalletIdempotencyClaimResult> {
  // Under READ COMMITTED a same-key concurrent claim forces our INSERT to
  // wait on the winner's transaction. If the winner aborts we still insert
  // and claim; if it commits we fall through to read the committed row. A
  // second attempt covers the narrow case where the winner aborted after our
  // conflict check resolved without inserting (defensive — the loop cannot
  // spin: each iteration either claims, replays, or throws).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const claim = await client.query<{ idempotency_key: string }>(
      `
        INSERT INTO wallet_idempotency_keys (
          user_id,
          operation,
          idempotency_key,
          request_hash,
          response_payload
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (user_id, operation, idempotency_key)
        DO NOTHING
        RETURNING idempotency_key
      `,
      [
        input.userId,
        input.operation,
        input.idempotencyKey,
        input.requestHash,
        toJsonString({ [WALLET_IDEMPOTENCY_CLAIM_FIELD]: WALLET_IDEMPOTENCY_CLAIM_PENDING }),
      ]
    );

    if (claim.rows[0]) {
      return { status: 'claimed' };
    }

    const existing = await client.query<{
      request_hash: string;
      response_payload: Record<string, unknown>;
    }>(
      `
        SELECT request_hash, response_payload
        FROM wallet_idempotency_keys
        WHERE user_id = $1
          AND operation = $2
          AND idempotency_key = $3
        LIMIT 1
        FOR UPDATE
      `,
      [input.userId, input.operation, input.idempotencyKey]
    );

    const row = existing.rows[0];
    if (!row) {
      // Conflicting in-flight claim aborted between our insert attempt and
      // the read — loop once to retry the claim.
      continue;
    }

    if (row.request_hash !== input.requestHash) {
      throw createApiError(
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency key was already used with a different request payload'
      );
    }

    const payload = row.response_payload;
    if (
      payload
      && typeof payload === 'object'
      && payload[WALLET_IDEMPOTENCY_CLAIM_FIELD] === WALLET_IDEMPOTENCY_CLAIM_PENDING
    ) {
      return { status: 'in_progress' };
    }

    return { status: 'replay', responsePayload: payload };
  }

  throw createApiError(
    'IDEMPOTENCY_CLAIM_FAILED',
    'Unable to claim idempotency key for this operation',
    { operation: input.operation }
  );
}

/**
 * Store the real response payload on a previously claimed idempotency row.
 * Runs inside the same transaction as the mutations, so the response commits
 * atomically with them.
 */
export async function completeWalletIdempotencyClaim(
  client: DbQueryable,
  input: {
    userId: string;
    operation: string;
    idempotencyKey: string;
    requestHash: string;
    responsePayload: Record<string, unknown>;
  }
): Promise<void> {
  const result = await client.query(
    `
      UPDATE wallet_idempotency_keys
      SET response_payload = $5::jsonb
      WHERE user_id = $1
        AND operation = $2
        AND idempotency_key = $3
        AND request_hash = $4
    `,
    [
      input.userId,
      input.operation,
      input.idempotencyKey,
      input.requestHash,
      toJsonString(input.responsePayload),
    ]
  );

  if (!result.rowCount) {
    throw createApiError(
      'IDEMPOTENCY_CLAIM_LOST',
      'Idempotency claim row is missing — refusing to commit an unrecorded mutation',
      { operation: input.operation }
    );
  }
}

// ─── P2P transfer context policy ─────────────────────────────────────────────
// The /wallet/1ze/transfer context is not a free-text label: each allowed
// context is a claim that a real domain event authorizes this movement of
// funds. Arbitrary authenticated users must not be able to mint a privileged
// context string and bypass commerce/co-own rails, so every privileged
// context is verified against its source of truth:
//   - coOwn_trade:      NOT transferable. A settled coOwn_trades row is a
//                       completed delivery-vs-payment: applyCoOwnTransfer
//                       already moved the buyer→seller wallet legs inside the
//                       same atomic transaction that wrote the trade, and it
//                       never inserts a wallet_ize_transfers context record.
//                       Accepting the trade id here would let the already-paid
//                       consideration authorize a SECOND payment through the
//                       public route (SEP21-FIN-B) — and the old parity check
//                       (ceil((notional_gbp + fee_gbp) * 1000)) priced the
//                       obsolete GBP×1000 FX instead of the versioned
//                       settlement quote and credited the gross leg rather
//                       than the seller-net leg. The context is refused
//                       unconditionally — fail closed.
//   - platform_reward:  system-originated — requires an admin caller. There
//                       is no reward domain table to cross-check, so caller
//                       authority IS the enforceable proof.
// Every privileged context is also single-use: once a committed
// wallet_ize_transfers row carries the context, the same reference cannot
// fund a second transfer.

export async function assertP2pTransferContextAuthorized(
  client: DbQueryable,
  input: {
    contextType: string;
    contextId: string;
    senderUserId: string;
    recipientUserId: string;
    amountUnits: number;
    callerRole?: string | null;
  }
): Promise<void> {
  switch (input.contextType) {
    case 'coOwn_trade': {
      // SEP21-FIN-B: a settled DvP trade is not an unpaid obligation — it is
      // evidence the payment ALREADY happened. The context can never
      // authorize a wallet movement through the public transfer route,
      // regardless of participants, amount, or caller role.
      throw createApiError(
        'P2P_TRANSFER_CONTEXT_NOT_TRANSFERABLE',
        'coOwn_trade transfers settle delivery-vs-payment inside the trade itself; a settled trade cannot authorize a P2P payment',
        { contextType: input.contextType, contextId: input.contextId }
      );
    }

    case 'platform_reward': {
      if (input.callerRole !== 'admin') {
        throw createApiError(
          'P2P_TRANSFER_CONTEXT_BLOCKED',
          'platform_reward transfers are system-originated and require administrative authority',
          { contextType: input.contextType, callerRole: input.callerRole ?? null }
        );
      }
      break;
    }

    default:
      throw createApiError(
        'P2P_TRANSFER_CONTEXT_INVALID',
        'Unsupported P2P transfer context type',
        { contextType: input.contextType }
      );
  }

  // Single-use: a committed transfer already consumed this context reference.
  const priorUse = await client.query(
    `
      SELECT 1
      FROM wallet_ize_transfers
      WHERE status = 'committed'
        AND metadata->>'contextType' = $1
        AND metadata->>'contextId' = $2
      LIMIT 1
    `,
    [input.contextType, input.contextId]
  );

  if (priorUse.rows[0]) {
    throw createApiError(
      'P2P_TRANSFER_CONTEXT_BLOCKED',
      'Transfer context has already been consumed by a committed transfer',
      { contextType: input.contextType, contextId: input.contextId }
    );
  }
}

// ─── 1ZE unit helpers ────────────────────────────────────────────────────────

export function onezeAmountToUnits(amount: number): number {
  const units = Math.round(amount * ONEZE_UNITS_PER_IZE);
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw createApiError('IZE_AMOUNT_INVALID', '1ze amount cannot be represented safely in minor units');
  }

  return units;
}

// ─── Convert-1ZE-to-fiat quote ───────────────────────────────────────────────
// Single source of truth for the convert quote. Both the preview branch and
// the execution branch of POST /wallet/convert-1ze-to-fiat call this — a
// preview MUST return the same numbers an execution would charge, so the math
// lives here exactly once. This function only reads pricing state; it never
// writes ledger entries or mutates balances.

export interface OnezeToFiatConversionQuote {
  normalizedIzeAmount: number;
  amountUnits: number;
  fiatCurrency: string;
  pricingQuote: Awaited<ReturnType<typeof resolveCountryPricingQuoteByCurrency>>;
  fxRate: number;
  principalAmount: number;
  feeBps: number;
  feeAmount: number;
  netRedemption: number;
}

export async function computeOnezeToFiatConversionQuote(
  client: DbQueryable,
  input: {
    izeAmount: number;
    fiatCurrency: string;
    feeBps: number;
  }
): Promise<OnezeToFiatConversionQuote> {
  const fiatCurrency = input.fiatCurrency.toUpperCase();
  const normalizedIzeAmount = Number(input.izeAmount.toFixed(6));
  const amountUnits = onezeAmountToUnits(normalizedIzeAmount);

  // At-par pricing model: 1 1ZE = $1.00 USD. Convert to the target fiat
  // currency via the USD→local FX rate. The platform spread is applied as a
  // separate transparent fee, not baked into the exchange rate.
  const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, fiatCurrency);
  const onezeAmountFromUnits = unitsToOnezeAmount(amountUnits);
  const fxRate = (await resolveInternalFxRate(client, 'USD', fiatCurrency)).rate;
  const principalAmount = Number((onezeAmountFromUnits * fxRate).toFixed(6));

  const feeBps = input.feeBps;
  const feeAmount = Number(((principalAmount * feeBps) / 10_000).toFixed(6));
  const netRedemption = Number((principalAmount - feeAmount).toFixed(6));

  return {
    normalizedIzeAmount,
    amountUnits,
    fiatCurrency,
    pricingQuote,
    fxRate,
    principalAmount,
    feeBps,
    feeAmount,
    netRedemption,
  };
}

// ─── wallet_ize_operations replay lookup ─────────────────────────────────────
// Used when the unique index on wallet_ize_operations.payment_intent_id turns
// a mint retry into a 23505 — the committed operation is replayed instead of
// minting a second time.

export interface WalletIzeOperationRow {
  id: string;
  user_id: string;
  operation_type: string;
  fiat_amount: number | string;
  fiat_currency: string;
  ize_amount: number | string;
  rate_per_gram: number | string;
  status: string;
  payment_intent_id: string | null;
  payout_request_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  committed_at: string | null;
}

export async function findWalletIzeOperationByPaymentIntentId(
  client: DbQueryable,
  paymentIntentId: string
): Promise<WalletIzeOperationRow | null> {
  const result = await client.query<WalletIzeOperationRow>(
    `
      SELECT
        id,
        user_id,
        operation_type,
        fiat_amount::text,
        fiat_currency,
        ize_amount::text,
        rate_per_gram::text,
        status,
        payment_intent_id,
        payout_request_id,
        metadata,
        created_at::text,
        committed_at::text
      FROM wallet_ize_operations
      WHERE payment_intent_id = $1
      LIMIT 1
    `,
    [paymentIntentId]
  );

  return result.rows[0] ?? null;
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null | undefined)?.code === '23505';
}

// ─── oneze_internal refund ───────────────────────────────────────────────────
// A oneze_internal commerce payment debited the buyer's
// wallets.oneze_balance_units inside settlePaymentIntent (kind 'PURCHASE',
// asset '1ZE', metadata.intentId = the settled intent). Refunding must
// re-credit the SAME wallet in 1ZE units — there is no external provider call
// because the money never left the platform.
//
// Idempotency is anchored on refundOperationId: a second call with the same
// operation id finds the existing ONEZE_REFUND ledger entry and returns its
// reference without crediting again. A cumulative cap keeps partial refunds
// from ever exceeding the original debit.

export interface OnezeInternalRefundResult {
  providerRefundRef: string;
  creditedUnits: number;
  walletLedgerId: string | null;
  alreadyCredited: boolean;
}

export async function refundOnezeInternalWalletDebit(
  client: DbQueryable,
  input: {
    intentId: string;
    refundAmount: number;
    refundOperationId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<OnezeInternalRefundResult> {
  const providerRefundRef = `oneze_refund_${input.refundOperationId}`;

  // Replay guard: this exact refund operation already credited.
  const existingRefund = await client.query<{ id: string; amount: string }>(
    `
      SELECT id::text AS id, amount::text AS amount
      FROM wallet_ledger
      WHERE asset = '1ZE'
        AND kind = 'ONEZE_REFUND'
        AND metadata->>'refundOperationId' = $1
      LIMIT 1
    `,
    [input.refundOperationId]
  );

  if (existingRefund.rows[0]) {
    return {
      providerRefundRef,
      creditedUnits: Number(existingRefund.rows[0].amount),
      walletLedgerId: existingRefund.rows[0].id,
      alreadyCredited: true,
    };
  }

  // Load the original purchase debit for this intent. The entry records the
  // exact GBP total, the GBP→USD rate used, and the units debited — the
  // refund re-credits at that same locked rate.
  const purchase = await client.query<{
    id: string;
    wallet_id: string;
    amount: string;
    metadata: Record<string, unknown> | null;
    user_id: string;
  }>(
    `
      SELECT wl.id::text AS id, wl.wallet_id, wl.amount::text AS amount,
             wl.metadata, w.user_id
      FROM wallet_ledger wl
      JOIN wallets w ON w.id = wl.wallet_id
      WHERE wl.asset = '1ZE'
        AND wl.kind = 'PURCHASE'
        AND wl.metadata->>'intentId' = $1
      ORDER BY wl.id DESC
      LIMIT 1
    `,
    [input.intentId]
  );

  const purchaseRow = purchase.rows[0];
  if (!purchaseRow) {
    throw createApiError(
      'REFUND_SOURCE_NOT_FOUND',
      'No 1ZE purchase debit found for this payment intent — cannot refund through the internal rail',
      { intentId: input.intentId }
    );
  }

  const purchaseMetadata =
    purchaseRow.metadata && typeof purchaseRow.metadata === 'object'
      ? purchaseRow.metadata
      : {};
  const originalDebitUnits = Math.abs(Number(purchaseRow.amount));
  const originalTotalGbp = Number(purchaseMetadata.totalGbp ?? 0);
  const gbpToUsdRate = Number(purchaseMetadata.gbpToUsdRate ?? 0);

  // Cumulative cap: partial refunds already credited against this intent
  // count toward the original debit.
  const refundedSoFarResult = await client.query<{ total: string }>(
    `
      SELECT COALESCE(SUM(amount), 0)::text AS total
      FROM wallet_ledger
      WHERE asset = '1ZE'
        AND kind = 'ONEZE_REFUND'
        AND metadata->>'intentId' = $1
    `,
    [input.intentId]
  );
  const refundedUnitsSoFar = Number(refundedSoFarResult.rows[0]?.total ?? '0');
  const remainingRefundableUnits = Math.max(0, originalDebitUnits - refundedUnitsSoFar);

  if (remainingRefundableUnits <= 0) {
    throw createApiError(
      'REFUND_AMOUNT_EXCEEDS_REMAINING',
      'This 1ZE payment has already been fully refunded',
      { intentId: input.intentId }
    );
  }

  // Refund units: proportional to the refunded GBP share of the original
  // total when the purchase metadata is available; otherwise derive from the
  // original locked rate. A full refund always returns every unit debited.
  const refundAmount = Number(input.refundAmount.toFixed(6));
  let refundUnits: number;
  if (
    Number.isFinite(originalTotalGbp) && originalTotalGbp > 0
    && refundAmount >= originalTotalGbp - 0.005
  ) {
    refundUnits = originalDebitUnits;
  } else if (Number.isFinite(originalTotalGbp) && originalTotalGbp > 0) {
    refundUnits = Math.max(1, Math.round(originalDebitUnits * (refundAmount / originalTotalGbp)));
  } else if (Number.isFinite(gbpToUsdRate) && gbpToUsdRate > 0) {
    refundUnits = Math.max(1, Math.round((refundAmount / gbpToUsdRate) * ONEZE_UNITS_PER_IZE));
  } else {
    throw createApiError(
      'REFUND_RATE_UNAVAILABLE',
      'Unable to derive the 1ZE refund amount — original purchase rate metadata is missing',
      { intentId: input.intentId }
    );
  }
  refundUnits = Math.min(refundUnits, remainingRefundableUnits);

  const txId = createRuntimeId('wtx');
  const orderId =
    typeof purchaseMetadata.orderId === 'string' ? purchaseMetadata.orderId : input.intentId;

  const balanceAfter = await applyWalletLedgerDelta(client, {
    walletId: purchaseRow.wallet_id,
    txId,
    asset: '1ZE',
    amount: refundUnits,
    kind: 'ONEZE_REFUND',
    refType: 'commerce_order_refund',
    refId: orderId,
    metadata: {
      intentId: input.intentId,
      orderId,
      refundOperationId: input.refundOperationId,
      refundAmountGbp: refundAmount,
      originalDebitUnits,
      refundedUnitsSoFar,
      gbpToUsdRate: Number.isFinite(gbpToUsdRate) ? gbpToUsdRate : null,
      reason: input.reason ?? null,
      source: 'oneze_internal_refund',
      ...(input.metadata ?? {}),
    },
  });

  const inserted = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM wallet_ledger WHERE wallet_id = $1 AND tx_id = $2 LIMIT 1`,
    [purchaseRow.wallet_id, txId]
  );

  return {
    providerRefundRef,
    creditedUnits: refundUnits,
    walletLedgerId: inserted.rows[0]?.id ?? null,
    alreadyCredited: false,
  };
}

// ─── Refund-after-payout recovery planner ────────────────────────────────────
// Pure decision model for postCommerceOrderRefundLedgerReversal. When seller
// escrow was already released, the buyer_refund legs drive escrow_liability
// negative — the seller must return the goods value they received. The
// recovery is the goods subtotal only: platform fees and postage are reversed
// by their own legs and never leave the seller's pocket.

export interface RefundRecoveryInput {
  sellerEscrowReleased: boolean;
  sellerId: string | null;
  subtotalGbp: number;
  platformChargeGbp: number;
  postageFeeGbp: number;
  totalGbp: number;
}

export interface RefundRecoveryPlan {
  postBuyerRefund: boolean;
  postSellerRecovery: boolean;
  sellerRecoveryAmount: number;
  reversePlatformFee: boolean;
  reversePostage: boolean;
  escrowGoesNegative: boolean;
}

export function planCommerceOrderRefundRecovery(input: RefundRecoveryInput): RefundRecoveryPlan {
  const sellerShare = Math.max(
    0,
    Number((input.totalGbp - input.platformChargeGbp - input.postageFeeGbp).toFixed(6))
  );
  const sellerRecoveryAmount = input.sellerEscrowReleased && input.sellerId && input.subtotalGbp > 0
    ? Number(Math.min(input.subtotalGbp, sellerShare).toFixed(6))
    : 0;

  return {
    postBuyerRefund: input.totalGbp > 0,
    postSellerRecovery: sellerRecoveryAmount > 0,
    sellerRecoveryAmount,
    reversePlatformFee: input.platformChargeGbp > 0,
    reversePostage: input.postageFeeGbp > 0,
    escrowGoesNegative: input.sellerEscrowReleased,
  };
}

// ─── Mint operation lazy materialization ─────────────────────────────────────
// The mint quote route no longer persists a mint_operations row per quote
// (debounced previews used to leak one row per keystroke). The quote metadata
// — including the locked rate — rides on the payment intent, and the mint
// operation is materialized here only when a real payment event arrives.

/**
 * Wallet-topup platform fee applied by the mint quote route
 * (`POST /wallet/1ze/mint/quote` → `allocateMoneyByBasisPoints(money, 100)`).
 * The materializer recomputes the expected mint against the SAME fee split —
 * keep both sides on this constant so the check can never drift apart.
 */
export const MINT_QUOTE_TOPUP_FEE_BASIS_POINTS = 100;

export interface MintQuoteIntentMetadata {
  mintOperationId?: string;
  mintQuote?: {
    ratePerGram?: number;
    rateSource?: string;
    rateLockedAt?: string;
    rateExpiresAt?: string;
    fiatAmountMinor?: number;
    netFiatAmountMinor?: number;
    platformFeeMinor?: number;
    izeAmountUnits?: number;
  };
  [key: string]: unknown;
}

export interface MintOperationInsertRow {
  id: string;
  user_id: string;
  state: string;
  fiat_amount_minor: string;
  fiat_currency: string;
  net_fiat_amount_minor: string;
  platform_fee_minor: string;
  ize_amount_units: string;
  rate_per_gram: string;
  rate_source: string;
  rate_locked_at: string;
  rate_expires_at: string;
  payment_intent_id: string | null;
  lot_id: string | null;
  custodian_ref: string | null;
  escrow_ledger_tx_id: string | null;
  wallet_credit_tx_id: string | null;
  purchase_attempted_at: string | null;
  settled_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Materialize a mint_operations row for a settled wallet_topup intent whose
 * quote was never persisted. Returns null when the intent is not a mint-quote
 * intent (no mintOperationId/mintQuote metadata) or the required quote fields
 * are missing — in that case the webhook caller keeps its null-op behavior.
 */
export async function materializeMintOperationForPaymentIntent(
  client: DbQueryable,
  paymentIntentId: string
): Promise<MintOperationInsertRow | null> {
  const intentResult = await client.query<{
    id: string;
    user_id: string;
    channel: string;
    amount_gbp: string;
    amount_currency: string;
    amount_minor: string | null;
    metadata: Record<string, unknown> | null;
  }>(
    `
      SELECT id, user_id, channel, amount_gbp::text, amount_currency,
             amount_minor::text, metadata
      FROM payment_intents
      WHERE id = $1
      LIMIT 1
    `,
    [paymentIntentId]
  );

  const intent = intentResult.rows[0];
  if (!intent || intent.channel !== 'wallet_topup') {
    return null;
  }

  const metadata = (intent.metadata ?? {}) as MintQuoteIntentMetadata;
  const quote = metadata.mintQuote ?? {};
  const mintOperationId =
    typeof metadata.mintOperationId === 'string' && metadata.mintOperationId.length > 0
      ? metadata.mintOperationId
      : null;

  const izeAmountUnits = Number(quote.izeAmountUnits);
  const ratePerGram = Number(quote.ratePerGram);
  const rateLockedAt = typeof quote.rateLockedAt === 'string' ? quote.rateLockedAt : null;
  const rateExpiresAt = typeof quote.rateExpiresAt === 'string' ? quote.rateExpiresAt : null;
  const fiatAmountMinor = Number(quote.fiatAmountMinor ?? NaN);
  const netFiatAmountMinor = Number(quote.netFiatAmountMinor);
  const platformFeeMinor = Number(quote.platformFeeMinor ?? 0);

  if (
    !mintOperationId
    || !Number.isFinite(izeAmountUnits) || izeAmountUnits <= 0
    || !Number.isFinite(ratePerGram) || ratePerGram <= 0
    || !rateLockedAt
    || !rateExpiresAt
    || !Number.isFinite(fiatAmountMinor)
    || !Number.isFinite(netFiatAmountMinor)
  ) {
    return null;
  }

  // Metadata provenance: the quote fields gate how much 1ZE a genuine
  // payment mints, so they must be authenticated, not merely present.
  // mintQuoteMac is an HMAC over the quote bound to THIS intent + user —
  // written exclusively by the mint/quote route. A quote without a valid
  // MAC (forged metadata, transplanted quote, tampered amount) fails closed:
  // the caller keeps its null-op behaviour and no units are minted.
  if (
    !verifyMintQuoteMac(
      {
        paymentIntentId: intent.id,
        userId: intent.user_id,
        mintOperationId,
        fiatAmountMinor,
        netFiatAmountMinor,
        platformFeeMinor,
        izeAmountUnits,
        ratePerGram,
        rateSource: typeof quote.rateSource === 'string' ? quote.rateSource : '',
        rateLockedAt,
        rateExpiresAt,
      },
      metadata.mintQuoteMac,
    )
  ) {
    return null;
  }

  // The quoted gross amount must equal the amount actually captured —
  // quote.fiatAmountMinor is part of the MAC, but binding it to
  // intent.amount_minor closes any residual path where a quote valid for a
  // different amount could be replayed onto this intent.
  const capturedMinor = Number(intent.amount_minor);
  if (!Number.isFinite(capturedMinor) || Math.abs(fiatAmountMinor - capturedMinor) > 0) {
    return null;
  }

  // Amount authority (review P0): the minted quantity is never taken from
  // stored metadata. Recompute it from the captured amount through the same
  // fee split + locked-rate formula the quote route used
  // (allocateMoneyByBasisPoints → net fiat → netFiat / ratePerGram → units).
  // A stored quote whose fee/net/units disagree with the recomputation —
  // forged, transplanted, or produced by a broken writer — fails closed.
  try {
    const expectedGross = moneyFromMinor(intent.amount_currency, BigInt(capturedMinor));
    const expectedAllocation = allocateMoneyByBasisPoints(
      expectedGross,
      MINT_QUOTE_TOPUP_FEE_BASIS_POINTS,
    );
    const expectedNetFiatMinor = Number(expectedAllocation.net.minorAmount);
    const expectedPlatformFeeMinor = expectedAllocation.fee
      ? Number(expectedAllocation.fee.minorAmount)
      : 0;
    const expectedIzeAmountUnits = onezeAmountToUnits(
      Number(
        (
          Number(moneyToMajorDecimal(expectedAllocation.net)) / ratePerGram
        ).toFixed(6),
      ),
    );

    if (
      netFiatAmountMinor !== expectedNetFiatMinor
      || platformFeeMinor !== expectedPlatformFeeMinor
      || izeAmountUnits !== expectedIzeAmountUnits
    ) {
      return null;
    }
  } catch {
    // Any failure to recompute (unsupported currency, fee consuming the
    // gross, non-representable unit amount) is a malformed quote — refuse.
    return null;
  }

  // Insert in PAYMENT_PENDING — the state the old quote route left the row in
  // after binding the payment intent — so the caller's existing transition
  // logic (PAYMENT_PENDING → PAYMENT_CONFIRMED → reserve enqueue) applies
  // verbatim. ON CONFLICT covers the race where two webhook deliveries both
  // materialize the same intent.
  const insert = await client.query<MintOperationInsertRow>(
    `
      INSERT INTO mint_operations (
        id,
        user_id,
        state,
        fiat_amount_minor,
        fiat_currency,
        net_fiat_amount_minor,
        platform_fee_minor,
        ize_amount_units,
        rate_per_gram,
        rate_source,
        rate_locked_at,
        rate_expires_at,
        payment_intent_id,
        metadata
      )
      VALUES (
        $1, $2, 'PAYMENT_PENDING', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
      )
      ON CONFLICT (payment_intent_id) DO NOTHING
      RETURNING
        id,
        user_id,
        state,
        fiat_amount_minor::text,
        fiat_currency,
        net_fiat_amount_minor::text,
        platform_fee_minor::text,
        ize_amount_units::text,
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
    `,
    [
      mintOperationId,
      intent.user_id,
      fiatAmountMinor,
      intent.amount_currency,
      netFiatAmountMinor,
      platformFeeMinor,
      izeAmountUnits,
      ratePerGram,
      typeof quote.rateSource === 'string' ? quote.rateSource : 'internal_pricing:GB:buy',
      rateLockedAt,
      rateExpiresAt,
      paymentIntentId,
      toJsonString({
        materializedFrom: 'payment_intent_quote_metadata',
        quoteHash: metadata.quoteHash ?? null,
        canonicalMoney: metadata.canonicalMoney ?? null,
        targetAssetAmount: metadata.targetAssetAmount ?? null,
      }),
    ]
  );

  if (insert.rows[0]) {
    return insert.rows[0];
  }

  // Lost the conflict race — read the winner.
  const existing = await client.query<MintOperationInsertRow>(
    `
      SELECT
        id,
        user_id,
        state,
        fiat_amount_minor::text,
        fiat_currency,
        net_fiat_amount_minor::text,
        platform_fee_minor::text,
        ize_amount_units::text,
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
      WHERE payment_intent_id = $1
      LIMIT 1
    `,
    [paymentIntentId]
  );

  return existing.rows[0] ?? null;
}
