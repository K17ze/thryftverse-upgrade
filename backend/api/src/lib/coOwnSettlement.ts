/**
 * Co-Own 1ZE settlement primitives.
 *
 * FIN-05: the Co-Own trade path (routes/coOwn.ts applyCoOwnTransfer) and the
 * DRIP reinvestment worker (workers/handlers/coOwnDripExecutionHandler.ts)
 * used to mutate `wallets.oneze_balance_units` and append `wallet_ledger`
 * rows directly, bypassing `oneze_wallet_segments` — so purchased/earned
 * provenance diverged from the real balance after every trade.
 *
 * These helpers are the single segment-aware mutation path for both callers:
 *   - every debit is reservation-aware (other open/placed Co-Own order
 *     reservations for the same wallet are not spendable) and drains the
 *     'earned' segment before 'purchased', mirroring the canonical
 *     debitWalletSegmentBalance ordering in index.ts;
 *   - every credit lands in an explicit segment ('earned' by default —
 *     trade/DRIP proceeds are income received from a counterparty, matching
 *     the P2P receive convention);
 *   - every mutation also writes the wallet_ledger row via
 *     applyWalletLedgerDelta (the canonical wallet primitive in
 *     lib/walletMoneyPath.ts) and appends oneze_balance_origin_events.
 *
 * Seam note: the reservation-aware spendable computation delegates to
 * walletMoneyPath.computeSpendableOnezeUnits (PKG-02) — the canonical
 * primitive every money path uses for gross-minus-holds math. It locks the
 * wallet row first, then enforceable reservation rows in id order, matching
 * the documented lock discipline.
 *
 * FIN-07: getCoOwnLockupState/assertCoOwnResalePermitted implement the
 * contractual lockup that was serialized to clients but never enforced.
 */
import {
  createApiError,
  normalizeOnezeCountryTag,
  toJsonString,
  type DbQueryable,
  type WalletRow,
  type WalletSegmentRow,
} from './workerHelpers.js';
import { applyWalletLedgerDelta, computeSpendableOnezeUnits } from './walletMoneyPath.js';

// ─── Lockup ─────────────────────────────────────────────────────────────────

export interface CoOwnLockupState {
  /** True while the asset's effective lockup end is still in the future. */
  locked: boolean;
  /** Effective lockup end (lockup_end_date, else created_at + lockup_months). */
  lockupEndsAt: string | null;
}

/**
 * Read the asset's effective lockup window. `lockup_end_date` is the stored
 * contractual end; `lockup_months` is a duration-from-listing fallback used
 * when no explicit end was recorded. NULL/ past → not locked.
 */
export async function getCoOwnLockupState(
  client: DbQueryable,
  assetId: string
): Promise<CoOwnLockupState> {
  const result = await client.query<{
    effective_lockup_end: string | Date | null;
    locked: boolean;
  }>(
    `
      SELECT
        COALESCE(
          lockup_end_date,
          created_at + (lockup_months * INTERVAL '1 month')
        ) AS effective_lockup_end,
        COALESCE(
          lockup_end_date,
          created_at + (lockup_months * INTERVAL '1 month')
        ) > NOW() AS locked
      FROM coOwn_assets
      WHERE id = $1
      LIMIT 1
    `,
    [assetId]
  );

  const row = result.rows[0];
  const raw = row?.effective_lockup_end;
  return {
    locked: row?.locked === true,
    lockupEndsAt: raw == null ? null : new Date(raw).toISOString(),
  };
}

/**
 * Reject a secondary-market resale while the asset lockup is in force.
 * Called on every seller-enforced trade/transfer entry point (order
 * placement, reserve, and inside the settlement primitive itself as a
 * backstop for resting orders placed before the lockup applied).
 */
export async function assertCoOwnResalePermitted(
  client: DbQueryable,
  assetId: string
): Promise<void> {
  const lockup = await getCoOwnLockupState(client, assetId);
  if (!lockup.locked) {
    return;
  }

  const error = createApiError(
    'CO_OWN_LOCKUP_ACTIVE',
    'This asset is in its lockup period — secondary resale is not permitted yet',
    { assetId, lockupEndsAt: lockup.lockupEndsAt }
  );
  error.statusCode = 423;
  throw error;
}

// ─── Wallet loading + reservation-aware availability ────────────────────────

export async function lockCoOwnWalletForUser(
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

export interface CoOwnSpendableSnapshot {
  wallet: WalletRow;
  balanceUnits: number;
  /** 1ZE units reserved by OTHER live co-own order reservations. */
  reservedForOtherOrdersUnits: number;
  spendableUnits: number;
}

/**
 * Reservation-aware spendable balance for a user's 1ZE wallet: gross balance
 * minus units held by other active/placed order reservations. The wallet row
 * is locked (FOR UPDATE) so the caller can check-then-debit inside its own
 * transaction without a TOCTOU gap.
 *
 * `excludePlacedOrderId` excludes the reservation already bound to the order
 * being settled — those funds are reserved FOR this debit, not against it.
 */
export async function getCoOwnSpendableUnits(
  client: DbQueryable,
  input: {
    userId: string;
    excludePlacedOrderId?: number | null;
  }
): Promise<CoOwnSpendableSnapshot | null> {
  // computeSpendableOnezeUnits locks the wallet FOR UPDATE first, then the
  // enforceable reservation rows in id order — the canonical reservation
  // math and lock discipline shared by every wallet money path.
  const funds = await computeSpendableOnezeUnits(client, {
    userId: input.userId,
    excludePlacedOrderId: input.excludePlacedOrderId ?? null,
  });
  if (!funds.walletId) {
    return null;
  }

  // Re-read the locked row for the full WalletRow the segment bookkeeping
  // needs (the lock is already held by this transaction — re-locking is a
  // no-op in Postgres).
  const wallet = await lockCoOwnWalletForUser(client, input.userId);
  if (!wallet) {
    return null;
  }

  return {
    wallet,
    balanceUnits: funds.grossUnits,
    reservedForOtherOrdersUnits: funds.reservedUnits,
    spendableUnits: funds.spendableUnits,
  };
}

// ─── Segment bookkeeping (mirrors index.ts/workerRuntime.ts semantics) ──────

async function appendCoOwnOriginEvent(
  client: DbQueryable,
  input: {
    walletId: string;
    txId: string;
    amountUnits: number;
    originCountry: string;
    segment: 'purchased' | 'earned';
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  if (!Number.isSafeInteger(input.amountUnits) || input.amountUnits === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO oneze_balance_origin_events (
        wallet_id,
        tx_id,
        amount_units,
        origin_country,
        segment,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      input.walletId,
      input.txId,
      input.amountUnits,
      normalizeOnezeCountryTag(input.originCountry),
      input.segment,
      toJsonString(input.metadata ?? {}),
    ]
  );
}

/**
 * Ensure the segment row exists and converges to the wallet balance, then
 * lock it FOR UPDATE. Mirrors index.ts ensureWalletSegments exactly,
 * including the surplus clamp: when segment total exceeds the wallet balance
 * (a bypassed debit), drain 'earned' first then 'purchased' — the same order
 * a canonical debit would have applied.
 */
async function loadCoOwnWalletSegmentsForUpdate(
  client: DbQueryable,
  wallet: WalletRow
): Promise<WalletSegmentRow> {
  const seededPurchasedUnits = Math.max(0, Number(wallet.oneze_balance_units));

  const upserted = await client.query<WalletSegmentRow>(
    `
      INSERT INTO oneze_wallet_segments (
        wallet_id,
        purchased_balance_units,
        earned_balance_units,
        metadata
      )
      VALUES ($1, $2, 0, $3::jsonb)
      ON CONFLICT (wallet_id)
      DO UPDATE SET wallet_id = EXCLUDED.wallet_id
      RETURNING
        wallet_id,
        purchased_balance_units,
        earned_balance_units,
        metadata,
        created_at::text,
        updated_at::text
    `,
    [
      wallet.id,
      seededPurchasedUnits,
      toJsonString({ bootstrapFromWalletUnits: seededPurchasedUnits }),
    ]
  );

  let segments = upserted.rows[0];
  const walletBalanceUnits = Math.max(0, Number(wallet.oneze_balance_units));
  const segmentTotalUnits =
    Number(segments.purchased_balance_units) + Number(segments.earned_balance_units);

  if (segmentTotalUnits < walletBalanceUnits) {
    // Deficit: units exist with no provenance — treat as purchased
    // (conservative: purchased units carry the redemption lock semantics).
    const parityDeltaUnits = walletBalanceUnits - segmentTotalUnits;
    const patched = await client.query<WalletSegmentRow>(
      `
        UPDATE oneze_wallet_segments
        SET
          purchased_balance_units = purchased_balance_units + $2,
          metadata = metadata || $3::jsonb,
          updated_at = NOW()
        WHERE wallet_id = $1
        RETURNING
          wallet_id,
          purchased_balance_units,
          earned_balance_units,
          metadata,
          created_at::text,
          updated_at::text
      `,
      [
        wallet.id,
        parityDeltaUnits,
        toJsonString({
          paritySync: {
            at: new Date().toISOString(),
            deltaUnits: parityDeltaUnits,
            reason: 'segment_total_below_wallet_balance',
          },
        }),
      ]
    );
    segments = patched.rows[0] ?? segments;
  } else if (segmentTotalUnits > walletBalanceUnits) {
    // Surplus: the wallet was debited through a path that skipped segment
    // accounting. Clamp back to the real balance draining 'earned' first,
    // then 'purchased' — mirroring the canonical debit ordering.
    const surplusUnits = segmentTotalUnits - walletBalanceUnits;
    const earnedReduction = Math.min(Number(segments.earned_balance_units), surplusUnits);
    const purchasedReduction = surplusUnits - earnedReduction;
    const patched = await client.query<WalletSegmentRow>(
      `
        UPDATE oneze_wallet_segments
        SET
          earned_balance_units = earned_balance_units - $2,
          purchased_balance_units = purchased_balance_units - $3,
          metadata = metadata || $4::jsonb,
          updated_at = NOW()
        WHERE wallet_id = $1
        RETURNING
          wallet_id,
          purchased_balance_units,
          earned_balance_units,
          metadata,
          created_at::text,
          updated_at::text
      `,
      [
        wallet.id,
        earnedReduction,
        purchasedReduction,
        toJsonString({
          paritySync: {
            at: new Date().toISOString(),
            deltaUnits: -surplusUnits,
            earnedReduction,
            purchasedReduction,
            reason: 'segment_total_above_wallet_balance',
          },
        }),
      ]
    );
    segments = patched.rows[0] ?? segments;
  }

  const locked = await client.query<WalletSegmentRow>(
    `
      SELECT
        wallet_id,
        purchased_balance_units,
        earned_balance_units,
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

  const row = locked.rows[0];
  if (!row) {
    throw createApiError('WALLET_SEGMENTS_NOT_FOUND', 'Wallet segment record is missing', {
      walletId: wallet.id,
      userId: wallet.user_id,
    });
  }

  return row;
}

// ─── Segment-aware 1ZE mutations ────────────────────────────────────────────

export interface CoOwnOnezeDebitResult {
  walletId: string;
  balanceAfterUnits: number;
  purchasedDebitedUnits: number;
  earnedDebitedUnits: number;
}

/**
 * Debit a user's 1ZE wallet with reservation-aware availability AND segment
 * accounting. Earned units are spent before purchased units (canonical debit
 * ordering; no withdrawal lock is applied — a Co-Own spend is an internal
 * settlement, not a fiat redemption).
 *
 * Throws:
 *   WALLET_NOT_FOUND          — no wallet row for the user
 *   INSUFFICIENT_1ZE_BALANCE  — spendable (balance − other reservations) < amount
 *   WALLET_INSUFFICIENT_BALANCE / WALLET_SEGMENT_AMOUNT_INVALID — guard rails
 */
export async function debitCoOwnOnezeUnits(
  client: DbQueryable,
  input: {
    userId: string;
    txId: string;
    amountUnits: number;
    kind: string;
    refType?: string;
    refId?: string;
    metadata?: Record<string, unknown>;
    originCountry?: string;
    excludePlacedOrderId?: number | null;
  }
): Promise<CoOwnOnezeDebitResult> {
  if (!Number.isSafeInteger(input.amountUnits) || input.amountUnits <= 0) {
    throw createApiError(
      'WALLET_SEGMENT_AMOUNT_INVALID',
      'Co-Own 1ZE debit must be a positive integer unit amount'
    );
  }

  const spendable = await getCoOwnSpendableUnits(client, {
    userId: input.userId,
    excludePlacedOrderId: input.excludePlacedOrderId ?? null,
  });
  if (!spendable) {
    throw createApiError('WALLET_NOT_FOUND', 'Wallet not found', { userId: input.userId });
  }

  if (spendable.spendableUnits < input.amountUnits) {
    throw createApiError(
      'INSUFFICIENT_1ZE_BALANCE',
      'Insufficient 1ZE balance for settlement',
      {
        userId: input.userId,
        required1zeUnits: input.amountUnits,
        available1zeUnits: spendable.spendableUnits,
        reservedForOtherOrdersUnits: spendable.reservedForOtherOrdersUnits,
      }
    );
  }

  const balanceAfterUnits = await applyWalletLedgerDelta(client, {
    walletId: spendable.wallet.id,
    txId: input.txId,
    asset: '1ZE',
    amount: -input.amountUnits,
    kind: input.kind,
    refType: input.refType,
    refId: input.refId,
    metadata: input.metadata,
  });

  const segments = await loadCoOwnWalletSegmentsForUpdate(client, spendable.wallet);
  const earnedUnits = Number(segments.earned_balance_units);
  const purchasedUnits = Number(segments.purchased_balance_units);
  const earnedDebitedUnits = Math.min(earnedUnits, input.amountUnits);
  const purchasedDebitedUnits = input.amountUnits - earnedDebitedUnits;

  if (purchasedDebitedUnits > purchasedUnits) {
    throw createApiError(
      'WALLET_SEGMENT_AMOUNT_INVALID',
      'Segment balances cannot cover this debit',
      {
        walletId: spendable.wallet.id,
        amountUnits: input.amountUnits,
        purchasedUnits,
        earnedUnits,
      }
    );
  }

  await client.query(
    `
      UPDATE oneze_wallet_segments
      SET
        purchased_balance_units = $2,
        earned_balance_units = $3,
        metadata = metadata || $4::jsonb,
        updated_at = NOW()
      WHERE wallet_id = $1
    `,
    [
      spendable.wallet.id,
      purchasedUnits - purchasedDebitedUnits,
      earnedUnits - earnedDebitedUnits,
      toJsonString({
        txId: input.txId,
        operation: 'debit',
        purchasedDebitedUnits,
        earnedDebitedUnits,
        source: 'coown_settlement',
        ...(input.metadata ?? {}),
      }),
    ]
  );

  if (purchasedDebitedUnits > 0) {
    await appendCoOwnOriginEvent(client, {
      walletId: spendable.wallet.id,
      txId: input.txId,
      amountUnits: -purchasedDebitedUnits,
      originCountry: input.originCountry ?? 'GLOBAL',
      segment: 'purchased',
      metadata: { direction: 'debit', ...(input.metadata ?? {}) },
    });
  }

  if (earnedDebitedUnits > 0) {
    await appendCoOwnOriginEvent(client, {
      walletId: spendable.wallet.id,
      txId: input.txId,
      amountUnits: -earnedDebitedUnits,
      originCountry: input.originCountry ?? 'GLOBAL',
      segment: 'earned',
      metadata: { direction: 'debit', ...(input.metadata ?? {}) },
    });
  }

  return {
    walletId: spendable.wallet.id,
    balanceAfterUnits,
    purchasedDebitedUnits,
    earnedDebitedUnits,
  };
}

export interface CoOwnOnezeCreditResult {
  walletId: string;
  balanceAfterUnits: number;
}

/**
 * Credit a user's 1ZE wallet with segment accounting. `segment` defaults to
 * 'earned' — trade/DRIP proceeds are income received from a counterparty
 * (same convention as P2P receive), not fiat-funded purchases.
 *
 * Throws WALLET_NOT_FOUND when the user has no wallet — callers must treat a
 * missing counterparty wallet as a hard failure (see FIN-06): never commit a
 * debit without its balancing credit.
 */
export async function creditCoOwnOnezeUnits(
  client: DbQueryable,
  input: {
    userId: string;
    txId: string;
    amountUnits: number;
    kind: string;
    refType?: string;
    refId?: string;
    metadata?: Record<string, unknown>;
    originCountry?: string;
    segment?: 'purchased' | 'earned';
  }
): Promise<CoOwnOnezeCreditResult> {
  if (!Number.isSafeInteger(input.amountUnits) || input.amountUnits <= 0) {
    throw createApiError(
      'WALLET_SEGMENT_AMOUNT_INVALID',
      'Co-Own 1ZE credit must be a positive integer unit amount'
    );
  }

  const wallet = await lockCoOwnWalletForUser(client, input.userId);
  if (!wallet) {
    throw createApiError('WALLET_NOT_FOUND', 'Counterparty wallet not found', {
      userId: input.userId,
    });
  }

  const segment = input.segment ?? 'earned';

  const balanceAfterUnits = await applyWalletLedgerDelta(client, {
    walletId: wallet.id,
    txId: input.txId,
    asset: '1ZE',
    amount: input.amountUnits,
    kind: input.kind,
    refType: input.refType,
    refId: input.refId,
    metadata: input.metadata,
  });

  const segments = await loadCoOwnWalletSegmentsForUpdate(client, wallet);
  const nextPurchasedUnits =
    Number(segments.purchased_balance_units) + (segment === 'purchased' ? input.amountUnits : 0);
  const nextEarnedUnits =
    Number(segments.earned_balance_units) + (segment === 'earned' ? input.amountUnits : 0);

  await client.query(
    `
      UPDATE oneze_wallet_segments
      SET
        purchased_balance_units = $2,
        earned_balance_units = $3,
        metadata = metadata || $4::jsonb,
        updated_at = NOW()
      WHERE wallet_id = $1
    `,
    [
      wallet.id,
      nextPurchasedUnits,
      nextEarnedUnits,
      toJsonString({
        txId: input.txId,
        operation: 'credit',
        segment,
        creditedUnits: input.amountUnits,
        source: 'coown_settlement',
        ...(input.metadata ?? {}),
      }),
    ]
  );

  await appendCoOwnOriginEvent(client, {
    walletId: wallet.id,
    txId: input.txId,
    amountUnits: input.amountUnits,
    originCountry: input.originCountry ?? 'GLOBAL',
    segment,
    metadata: { direction: 'credit', ...(input.metadata ?? {}) },
  });

  return {
    walletId: wallet.id,
    balanceAfterUnits,
  };
}
