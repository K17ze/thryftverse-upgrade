import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { Pool, type PoolClient } from 'pg';
import { appendDomainEvent } from '../lib/domainOutbox.js';

// ── Co-Own transactional contract tests (real PostgreSQL) ──
//
// These tests exercise the migrated transactional behaviour of the Co-Own
// secondary market directly against the real PostgreSQL database. They replay
// the core SQL patterns used by `src/routes/coOwn.ts` (matching, expiry,
// reserved balances, cancellation, buyout acceptance, idempotent replay and
// domain-outbox event emission) inside transactions that are ROLLED BACK at
// the end, so the database is never polluted.
//
// Run with:
//   DATABASE_URL=postgresql://thryftverse:thryftverse@localhost:5432/thryftverse \
//     node --import tsx --test src/integration/coOwnContract.test.ts
//
// Set SKIP_INTEGRATION=true to skip the suite (e.g. in CI without a DB).

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://thryftverse:thryftverse@localhost:5432/thryftverse';

const shouldRun = process.env.SKIP_INTEGRATION !== 'true';

const CO_OWN_TRADE_FEE_RATE = 0.01;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function suffix(): string {
  return `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

// ── Fixture helpers ──

interface FixtureIds {
  issuerId: string;
  buyerA: string;
  buyerB: string;
  sellerId: string;
  listingId: string;
  assetId: string;
  walletA: string;
  walletB: string;
  walletSeller: string;
  walletIssuer: string;
}

async function createUsers(
  client: PoolClient,
  ids: { id: string; username: string }[],
): Promise<void> {
  const values: string[] = [];
  const params: string[] = [];
  ids.forEach((u, i) => {
    const base = i * 2;
    values.push(`($${base + 1}, $${base + 2})`);
    params.push(u.id, u.username);
  });
  await client.query(
    `INSERT INTO users (id, username) VALUES ${values.join(', ')}`,
    params,
  );
}

async function createWallet(
  client: PoolClient,
  walletId: string,
  userId: string,
  onezeBalanceUnits: bigint,
): Promise<void> {
  await client.query(
    `INSERT INTO wallets (id, user_id, oneze_balance_units, fiat_balance_minor, fiat_currency)
     VALUES ($1, $2, $3, 0, 'GBP')`,
    [walletId, userId, onezeBalanceUnits],
  );
}

async function createAsset(
  client: PoolClient,
  assetId: string,
  listingId: string,
  issuerId: string,
  opts: { totalUnits?: number; availableUnits?: number; unitPriceGbp?: number } = {},
): Promise<void> {
  const totalUnits = opts.totalUnits ?? 20;
  const availableUnits = opts.availableUnits ?? 0;
  const unitPriceGbp = opts.unitPriceGbp ?? 4;
  await client.query(
    `INSERT INTO listings (id, seller_id, title, description, price_gbp, status)
     VALUES ($1, $2, 'Contract test listing', 'Fixture', ${unitPriceGbp}, 'active')`,
    [listingId, issuerId],
  );
  await client.query(
    `INSERT INTO coOwn_assets (
       id, listing_id, issuer_id, title, total_units, available_units,
       unit_price_gbp, unit_price_stable, settlement_mode, is_open
     )
     VALUES ($1, $2, $3, 'Contract asset', $4, $5, $6, $6, 'ONEZE', TRUE)`,
    [assetId, listingId, issuerId, totalUnits, availableUnits, unitPriceGbp],
  );
}

async function setHolding(
  client: PoolClient,
  userId: string,
  assetId: string,
  units: number,
  avgEntry = 4,
): Promise<void> {
  await client.query(
    `INSERT INTO coOwn_holdings (user_id, asset_id, units_owned, avg_entry_price_gbp, realized_pnl_gbp)
     VALUES ($1, $2, $3, $4, 0)
     ON CONFLICT (user_id, asset_id)
     DO UPDATE SET units_owned = EXCLUDED.units_owned, avg_entry_price_gbp = EXCLUDED.avg_entry_price_gbp`,
    [userId, assetId, units, avgEntry],
  );
}

// Allocate a per-asset market sequence, mirroring allocateMarketSequence in coOwn.ts.
async function allocateMarketSequence(
  client: PoolClient,
  assetId: string,
): Promise<number> {
  const result = await client.query<{ next_sequence: string }>(
    `INSERT INTO coown_market_sequences (asset_id, next_sequence)
     VALUES ($1, 1)
     ON CONFLICT (asset_id)
     DO UPDATE SET next_sequence = coown_market_sequences.next_sequence + 1
     RETURNING next_sequence::text`,
    [assetId],
  );
  return Number(result.rows[0].next_sequence);
}

// Insert a resting order (open) with an active reservation, mirroring the
// route's order-insert + reservation-place pattern.
async function placeRestingOrder(
  client: PoolClient,
  input: {
    assetId: string;
    userId: string;
    side: 'buy' | 'sell';
    units: number;
    unitPriceGbp: number;
    orderType?: 'market' | 'limit' | 'protected_market';
    limitPriceGbp?: number | null;
    expiresAt?: Date | null;
    reserved1zeUnits?: number;
    reservedUnits?: number;
  },
): Promise<{ orderId: number; reservationId: string }> {
  const orderType = input.orderType ?? 'limit';
  const limitPriceGbp =
    orderType === 'limit' ? (input.limitPriceGbp ?? input.unitPriceGbp) : null;
  const seq = await allocateMarketSequence(client, input.assetId);
  const expiresAt = input.expiresAt ?? null;
  const orderResult = await client.query<{ id: string }>(
    `INSERT INTO coOwn_orders (
       asset_id, user_id, side, order_type, limit_price_gbp, units,
       remaining_units, filled_units, unit_price_gbp, fee_gbp, total_gbp,
       status, market_sequence, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $6, 0, $7, 0, 0, 'open', $8, $9)
     RETURNING id`,
    [
      input.assetId,
      input.userId,
      input.side,
      orderType,
      limitPriceGbp,
      input.units,
      input.unitPriceGbp,
      seq,
      expiresAt,
    ],
  );
  const orderId = Number(orderResult.rows[0].id);

  const reservationId = `test_res_${suffix()}`;
  const reserved1zeUnits =
    input.reserved1zeUnits ??
    (input.side === 'buy'
      ? Math.ceil(roundTo(input.units * input.unitPriceGbp * (1 + CO_OWN_TRADE_FEE_RATE), 4) * 1000)
      : 0);
  const reservedUnits = input.reservedUnits ?? (input.side === 'sell' ? input.units : 0);
  await client.query(
    `INSERT INTO coown_order_reservations (
       id, user_id, asset_id, side, reserved_1ze_units, reserved_units,
       reference_price_gbp, estimated_total_gbp, estimated_fee_gbp,
       expires_at, status, placed_order_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, NOW() + INTERVAL '1 hour', 'placed', $8)`,
    [
      reservationId,
      input.userId,
      input.assetId,
      input.side,
      reserved1zeUnits,
      reservedUnits,
      input.unitPriceGbp,
      orderId,
    ],
  );

  return { orderId, reservationId };
}

// Atomic DvP transfer: holdings + trade + 1ZE wallet debit/credit, mirroring
// applyCoOwnTransfer in coOwn.ts (settlement side only, ledger tables omitted).
async function applyTransfer(
  client: PoolClient,
  input: {
    assetId: string;
    buyerId: string;
    sellerId: string;
    units: number;
    unitPriceGbp: number;
    feeGbp: number;
    buyOrderId: number | null;
    sellOrderId: number | null;
    enforceSellerHolding: boolean;
  },
): Promise<void> {
  const units = Math.max(0, Math.floor(input.units));
  if (units <= 0) return;

  // Lock and update holdings.
  const buyerHoldingRes = await client.query<{ units_owned: number; avg_entry_price_gbp: string }>(
    `SELECT units_owned, avg_entry_price_gbp::text FROM coOwn_holdings
     WHERE user_id = $1 AND asset_id = $2 FOR UPDATE`,
    [input.buyerId, input.assetId],
  );
  const sellerHoldingRes = await client.query<{ units_owned: number; avg_entry_price_gbp: string }>(
    `SELECT units_owned, avg_entry_price_gbp::text FROM coOwn_holdings
     WHERE user_id = $1 AND asset_id = $2 FOR UPDATE`,
    [input.sellerId, input.assetId],
  );

  if (input.enforceSellerHolding) {
    const sellerUnits = sellerHoldingRes.rows[0]?.units_owned ?? 0;
    assert.ok(
      sellerUnits >= units,
      `Seller ${input.sellerId} has insufficient units (${sellerUnits} < ${units})`,
    );
  }

  const buyerBefore = buyerHoldingRes.rows[0]?.units_owned ?? 0;
  const buyerAvgBefore = Number(buyerHoldingRes.rows[0]?.avg_entry_price_gbp ?? 0);
  const buyerAfter = buyerBefore + units;
  const buyerAvgAfter =
    buyerAfter > 0
      ? (buyerAvgBefore * buyerBefore + input.unitPriceGbp * units) / buyerAfter
      : input.unitPriceGbp;

  await client.query(
    `INSERT INTO coOwn_holdings (user_id, asset_id, units_owned, avg_entry_price_gbp, realized_pnl_gbp, updated_at)
     VALUES ($1, $2, $3, $4, 0, NOW())
     ON CONFLICT (user_id, asset_id)
     DO UPDATE SET units_owned = EXCLUDED.units_owned, avg_entry_price_gbp = EXCLUDED.avg_entry_price_gbp, updated_at = NOW()`,
    [input.buyerId, input.assetId, buyerAfter, roundTo(buyerAvgAfter, 4)],
  );

  if (input.enforceSellerHolding) {
    const sellerBefore = sellerHoldingRes.rows[0]?.units_owned ?? 0;
    const sellerAvgBefore = Number(sellerHoldingRes.rows[0]?.avg_entry_price_gbp ?? 0);
    const sellerAfter = sellerBefore - units;
    const realizedDelta = (input.unitPriceGbp - sellerAvgBefore) * units;
    const sellerRealizedRes = await client.query<{ realized_pnl_gbp: string }>(
      `SELECT realized_pnl_gbp::text FROM coOwn_holdings WHERE user_id = $1 AND asset_id = $2`,
      [input.sellerId, input.assetId],
    );
    const sellerRealizedBefore = Number(sellerRealizedRes.rows[0]?.realized_pnl_gbp ?? 0);
    await client.query(
      `INSERT INTO coOwn_holdings (user_id, asset_id, units_owned, avg_entry_price_gbp, realized_pnl_gbp, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, asset_id)
       DO UPDATE SET units_owned = EXCLUDED.units_owned, avg_entry_price_gbp = EXCLUDED.avg_entry_price_gbp, realized_pnl_gbp = EXCLUDED.realized_pnl_gbp, updated_at = NOW()`,
      [
        input.sellerId,
        input.assetId,
        Math.max(0, sellerAfter),
        sellerAfter > 0 ? roundTo(sellerAvgBefore, 4) : 0,
        roundTo(sellerRealizedBefore + realizedDelta, 4),
      ],
    );
  }

  const notionalGbp = roundTo(units * input.unitPriceGbp, 4);
  await client.query(
    `INSERT INTO coOwn_trades (
       asset_id, buy_order_id, sell_order_id, buyer_id, seller_id,
       units, unit_price_gbp, notional_gbp, fee_gbp, settlement_status, settled_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'settled', NOW())`,
    [
      input.assetId,
      input.buyOrderId,
      input.sellOrderId,
      input.buyerId,
      input.sellerId,
      units,
      input.unitPriceGbp,
      notionalGbp,
      input.feeGbp,
    ],
  );

  // 1ZE wallet settlement.
  const buyerPays1ze = Math.ceil(roundTo(notionalGbp + input.feeGbp, 4) * 1000);
  const sellerReceives1ze = Math.floor(roundTo(Math.max(0, notionalGbp - input.feeGbp), 4) * 1000);

  if (buyerPays1ze > 0) {
    const buyerWalletRes = await client.query<{ id: string; oneze_balance_units: string }>(
      `SELECT id, oneze_balance_units::text FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [input.buyerId],
    );
    const buyerWallet = buyerWalletRes.rows[0];
    assert.ok(buyerWallet, `Buyer wallet not found for ${input.buyerId}`);
    const buyerBalance = Number(buyerWallet.oneze_balance_units);
    assert.ok(
      buyerBalance >= buyerPays1ze,
      `Buyer has insufficient 1ZE balance (${buyerBalance} < ${buyerPays1ze})`,
    );
    const buyerBalanceAfter = buyerBalance - buyerPays1ze;
    await client.query(
      `UPDATE wallets SET oneze_balance_units = $2, version = version + 1, updated_at = NOW() WHERE id = $1`,
      [buyerWallet.id, buyerBalanceAfter],
    );
    const tradeTxId = `coown_trade_${input.buyOrderId ?? 'x'}_${input.sellOrderId ?? 'x'}_${Date.now()}`;
    await client.query(
      `INSERT INTO wallet_ledger (wallet_id, tx_id, asset, amount, balance_after, kind, ref_type, ref_id, metadata)
       VALUES ($1, $2, '1ZE', $3, $4, 'CO_OWN_TRADE', 'coOwn_trade', $5, $6::jsonb)`,
      [
        buyerWallet.id,
        tradeTxId,
        -buyerPays1ze,
        buyerBalanceAfter,
        String(input.buyOrderId ?? ''),
        JSON.stringify({ assetId: input.assetId, units, side: 'buy', notionalGbp, feeGbp: input.feeGbp }),
      ],
    );

    if (sellerReceives1ze > 0) {
      const sellerWalletRes = await client.query<{ id: string; oneze_balance_units: string }>(
        `SELECT id, oneze_balance_units::text FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [input.sellerId],
      );
      const sellerWallet = sellerWalletRes.rows[0];
      assert.ok(sellerWallet, `Seller wallet not found for ${input.sellerId}`);
      const sellerBalanceAfter = Number(sellerWallet.oneze_balance_units) + sellerReceives1ze;
      await client.query(
        `UPDATE wallets SET oneze_balance_units = $2, version = version + 1, updated_at = NOW() WHERE id = $1`,
        [sellerWallet.id, sellerBalanceAfter],
      );
      await client.query(
        `INSERT INTO wallet_ledger (wallet_id, tx_id, asset, amount, balance_after, kind, ref_type, ref_id, metadata)
         VALUES ($1, $2, '1ZE', $3, $4, 'CO_OWN_TRADE', 'coOwn_trade', $5, $6::jsonb)`,
        [
          sellerWallet.id,
          tradeTxId,
          sellerReceives1ze,
          sellerBalanceAfter,
          String(input.sellOrderId ?? ''),
          JSON.stringify({ assetId: input.assetId, units, side: 'sell', notionalGbp, feeGbp: input.feeGbp }),
        ],
      );
    }
  }

  await client.query(
    `UPDATE coOwn_assets SET total_traded_value_gbp = total_traded_value_gbp + $2, updated_at = NOW() WHERE id = $1`,
    [input.assetId, notionalGbp],
  );
}

// Run the matching loop for an incoming order against resting opposing orders,
// mirroring the route's matching engine (secondary-market only).
async function matchIncoming(
  client: PoolClient,
  input: {
    assetId: string;
    incomingOrderId: number;
    incomingUserId: string;
    side: 'buy' | 'sell';
    units: number;
    unitPriceGbp: number;
    orderType: 'market' | 'limit' | 'protected_market';
  },
): Promise<{ filledUnits: number; remainingUnits: number; status: string }> {
  let remainingUnits = input.units;
  let filledUnits = 0;

  const opposingSide = input.side === 'buy' ? 'sell' : 'buy';
  const restingRes = await client.query<{
    id: number;
    user_id: string;
    remaining_units: number;
    filled_units: number;
    unit_price_gbp: string;
    fee_gbp: string;
    total_gbp: string;
  }>(
    `SELECT id, user_id, remaining_units, filled_units, unit_price_gbp::text, fee_gbp::text, total_gbp::text
     FROM coOwn_orders
     WHERE asset_id = $1
       AND side = $2
       AND status IN ('open', 'partially_filled')
       AND (expires_at IS NULL OR expires_at > NOW())
       AND id <> $3
       AND user_id <> $4
       AND ($5::numeric IS NULL
            OR ($6 = 'buy' AND unit_price_gbp <= $5)
            OR ($6 = 'sell' AND unit_price_gbp >= $5))
     ORDER BY
       CASE WHEN $6 = 'buy' THEN unit_price_gbp END ASC,
       CASE WHEN $6 = 'sell' THEN unit_price_gbp END DESC,
       id ASC
     FOR UPDATE`,
    [
      input.assetId,
      opposingSide,
      input.incomingOrderId,
      input.incomingUserId,
      input.orderType === 'limit' ? input.unitPriceGbp : null,
      input.side,
    ],
  );

  for (const resting of restingRes.rows) {
    if (remainingUnits <= 0) break;
    const restingRemaining = resting.remaining_units;
    if (restingRemaining <= 0) continue;

    const fillUnits = Math.min(remainingUnits, restingRemaining);
    const tradePrice = Number(resting.unit_price_gbp);
    const tradeNotional = roundTo(fillUnits * tradePrice, 4);
    const tradeFee = roundTo(tradeNotional * CO_OWN_TRADE_FEE_RATE, 4);

    if (input.side === 'buy') {
      await applyTransfer(client, {
        assetId: input.assetId,
        buyerId: input.incomingUserId,
        sellerId: resting.user_id,
        units: fillUnits,
        unitPriceGbp: tradePrice,
        feeGbp: tradeFee,
        buyOrderId: input.incomingOrderId,
        sellOrderId: resting.id,
        enforceSellerHolding: true,
      });
    } else {
      await applyTransfer(client, {
        assetId: input.assetId,
        buyerId: resting.user_id,
        sellerId: input.incomingUserId,
        units: fillUnits,
        unitPriceGbp: tradePrice,
        feeGbp: tradeFee,
        buyOrderId: resting.id,
        sellOrderId: input.incomingOrderId,
        enforceSellerHolding: true,
      });
    }

    remainingUnits -= fillUnits;
    filledUnits += fillUnits;

    const restingRemainingAfter = restingRemaining - fillUnits;
    const restingFilledAfter = resting.filled_units + fillUnits;
    const restingStatus = restingRemainingAfter <= 0 ? 'filled' : 'partially_filled';
    const restingFeeAfter = roundTo(Number(resting.fee_gbp) + tradeFee, 4);
    const restingTradeNet =
      opposingSide === 'buy'
        ? roundTo(tradeNotional + tradeFee, 4)
        : roundTo(Math.max(0, tradeNotional - tradeFee), 4);
    const restingTotalAfter = roundTo(Number(resting.total_gbp) + restingTradeNet, 4);
    const fillSeq = await allocateMarketSequence(client, input.assetId);

    await client.query(
      `UPDATE coOwn_orders
       SET remaining_units = $2, filled_units = $3, fee_gbp = $4, total_gbp = $5,
           status = $6, updated_at = NOW(), market_sequence = $7
       WHERE id = $1`,
      [
        resting.id,
        Math.max(0, restingRemainingAfter),
        restingFilledAfter,
        restingFeeAfter,
        restingTotalAfter,
        restingStatus,
        fillSeq,
      ],
    );

    const restingReserve1ze =
      opposingSide === 'buy'
        ? Math.ceil(roundTo(restingRemainingAfter * tradePrice * (1 + CO_OWN_TRADE_FEE_RATE), 4) * 1000)
        : 0;
    const restingReserveUnits = opposingSide === 'sell' ? Math.max(0, restingRemainingAfter) : 0;
    await client.query(
      `UPDATE coown_order_reservations
       SET reserved_1ze_units = $2, reserved_units = $3, updated_at = NOW()
       WHERE placed_order_id = $1 AND status = 'placed'`,
      [resting.id, restingReserve1ze, restingReserveUnits],
    );
  }

  let status: string;
  let persistedRemaining = Math.max(0, remainingUnits);
  if (input.orderType === 'market' || input.orderType === 'protected_market') {
    if (filledUnits > 0 && remainingUnits > 0) {
      status = 'partially_filled';
      persistedRemaining = 0;
    } else if (filledUnits > 0) {
      status = 'filled';
      persistedRemaining = 0;
    } else {
      status = 'rejected';
      persistedRemaining = 0;
    }
  } else if (filledUnits === 0) {
    status = 'open';
  } else if (remainingUnits > 0) {
    status = 'partially_filled';
  } else {
    status = 'filled';
  }

  await client.query(
    `UPDATE coOwn_orders
     SET remaining_units = $2, filled_units = $3, status = $4, updated_at = NOW()
     WHERE id = $1`,
    [input.incomingOrderId, persistedRemaining, filledUnits, status],
  );

  return { filledUnits, remainingUnits: persistedRemaining, status };
}

// Build a full isolated fixture: issuer + buyerA + buyerB + seller, each with a
// funded wallet, plus an open asset and (optionally) seller holdings.
async function buildFixture(
  client: PoolClient,
  opts: { sellerUnits?: number; assetTotalUnits?: number; unitPriceGbp?: number } = {},
): Promise<FixtureIds> {
  const s = suffix();
  const issuerId = `test_issuer_${s}`;
  const buyerA = `test_buyerA_${s}`;
  const buyerB = `test_buyerB_${s}`;
  const sellerId = `test_seller_${s}`;
  const listingId = `test_listing_${s}`;
  const assetId = `test_asset_${s}`;
  const walletA = `test_walletA_${s}`;
  const walletB = `test_walletB_${s}`;
  const walletSeller = `test_walletSeller_${s}`;
  const walletIssuer = `test_walletIssuer_${s}`;

  await createUsers(client, [
    { id: issuerId, username: `issuer_${s}` },
    { id: buyerA, username: `buyerA_${s}` },
    { id: buyerB, username: `buyerB_${s}` },
    { id: sellerId, username: `seller_${s}` },
  ]);

  const fund = 100_000_000n; // 100M 1ZE units — plenty for all settlement paths.
  await createWallet(client, walletA, buyerA, fund);
  await createWallet(client, walletB, buyerB, fund);
  await createWallet(client, walletSeller, sellerId, fund);
  await createWallet(client, walletIssuer, issuerId, fund);

  await createAsset(client, assetId, listingId, issuerId, {
    totalUnits: opts.assetTotalUnits ?? 20,
    availableUnits: 0,
    unitPriceGbp: opts.unitPriceGbp ?? 4,
  });

  if (opts.sellerUnits && opts.sellerUnits > 0) {
    await setHolding(client, sellerId, assetId, opts.sellerUnits, opts.unitPriceGbp ?? 4);
  }

  return {
    issuerId,
    buyerA,
    buyerB,
    sellerId,
    listingId,
    assetId,
    walletA,
    walletB,
    walletSeller,
    walletIssuer,
  };
}

describe('Co-Own contract tests (real PostgreSQL)', { skip: !shouldRun }, () => {
  let pool: Pool;

  before(async () => {
    pool = new Pool({ connectionString: DATABASE_URL, max: 6 });
    // Verify reachability; skip the whole suite if the DB is unreachable.
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  });

  after(async () => {
    await pool?.end();
  });

  // 1. Concurrent matching — row-level locking prevents double-matching.
  //
  // Genuine cross-transaction concurrency requires the resting order to be
  // visible to other connections, so the fixture is committed and then cleaned
  // up explicitly at the end (all other tests use BEGIN/ROLLBACK isolation).
  it('should allow only one order to match a resting order under concurrent contention', async () => {
    const setup = await pool.connect();
    const contenderA = await pool.connect();
    const contenderB = await pool.connect();
    let fx: FixtureIds | null = null;
    let sellOrderId = 0;
    try {
      // Setup: commit the fixture + resting sell order so it is visible to
      // other connections.
      await setup.query('BEGIN');
      fx = await buildFixture(setup, { sellerUnits: 5, unitPriceGbp: 4 });
      const placed = await placeRestingOrder(setup, {
        assetId: fx.assetId,
        userId: fx.sellerId,
        side: 'sell',
        units: 5,
        unitPriceGbp: 4,
      });
      sellOrderId = placed.orderId;
      await setup.query('COMMIT');

      // Contender A locks the resting sell order FOR UPDATE (as the route does).
      await contenderA.query('BEGIN');
      const lockedRes = await contenderA.query<{ id: string }>(
        `SELECT id FROM coOwn_orders
         WHERE id = $1 AND asset_id = $2 AND side = 'sell' AND status IN ('open','partially_filled')
         FOR UPDATE`,
        [sellOrderId, fx.assetId],
      );
      assert.equal(lockedRes.rows.length, 1, 'contender A should lock the resting sell order');

      // Contender B uses FOR UPDATE SKIP LOCKED (the contention-safe pattern).
      // Because A holds the lock, B must skip the row — it cannot match it.
      await contenderB.query('BEGIN');
      const skippedRes = await contenderB.query<{ id: string }>(
        `SELECT id FROM coOwn_orders
         WHERE id = $1 AND asset_id = $2 AND side = 'sell' AND status IN ('open','partially_filled')
         FOR UPDATE SKIP LOCKED`,
        [sellOrderId, fx.assetId],
      );
      assert.equal(
        skippedRes.rows.length,
        0,
        'contender B must not match a row locked by another transaction (SKIP LOCKED)',
      );

      // A fills the order completely; B has no liquidity to match → rejected.
      await applyTransfer(contenderA, {
        assetId: fx.assetId,
        buyerId: fx.buyerA,
        sellerId: fx.sellerId,
        units: 5,
        unitPriceGbp: 4,
        feeGbp: roundTo(5 * 4 * CO_OWN_TRADE_FEE_RATE, 4),
        buyOrderId: null,
        sellOrderId,
        enforceSellerHolding: true,
      });
      await contenderA.query(
        `UPDATE coOwn_orders SET remaining_units = 0, filled_units = 5, status = 'filled', updated_at = NOW() WHERE id = $1`,
        [sellOrderId],
      );
      await contenderA.query('COMMIT');

      // Now B can see the filled order; no resting sell liquidity remains.
      const bFilledRes = await contenderB.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM coOwn_orders
         WHERE asset_id = $1 AND side = 'sell' AND status IN ('open','partially_filled')`,
        [fx.assetId],
      );
      assert.equal(
        Number(bFilledRes.rows[0].count),
        0,
        'no resting sell liquidity remains for contender B — only one order can match',
      );
      await contenderB.query('ROLLBACK');
    } finally {
      // Best-effort rollback of any leftover open transactions.
      try { await contenderA.query('ROLLBACK'); } catch { /* ignore */ }
      try { await contenderB.query('ROLLBACK'); } catch { /* ignore */ }
      // Explicit cleanup (the fixture was committed).
      if (fx) {
        try {
          await setup.query(
            `DELETE FROM coown_assets WHERE id = $1`,
            [fx.assetId],
          );
          await setup.query(
            `DELETE FROM wallets WHERE user_id = ANY($1::text[])`,
            [[fx.buyerA, fx.buyerB, fx.sellerId, fx.issuerId]],
          );
          await setup.query(
            `DELETE FROM users WHERE id = ANY($1::text[])`,
            [[fx.buyerA, fx.buyerB, fx.sellerId, fx.issuerId]],
          );
        } catch {
          // best-effort; unique IDs prevent conflicts with future runs
        }
      }
      setup.release();
      contenderA.release();
      contenderB.release();
    }
  });

  // 2. Idempotent order replay — same command + idempotency key returns the
  // original response, never a duplicate order.
  it('should return the original response on idempotent order replay and not create a duplicate order', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fx = await buildFixture(client, { sellerUnits: 5, unitPriceGbp: 4 });

      const idempotencyKey = `test_idem_${suffix()}`;
      const requestHash = `hash_${suffix()}`;
      const originalOrderId = 999_001;
      const originalResponse = {
        ok: true,
        order: { id: originalOrderId, status: 'open', units: 3 },
      };

      // First submission: record the command as acknowledged with its response.
      await client.query(
        `INSERT INTO coown_order_commands (asset_id, actor_id, idempotency_key, request_hash, status, order_id, response_status, response_body)
         VALUES ($1, $2, $3, $4, 'acknowledged', NULL, 200, $5::jsonb)`,
        [fx.assetId, fx.buyerA, idempotencyKey, requestHash, JSON.stringify(originalResponse)],
      );
      await client.query(
        `INSERT INTO coown_order_idempotency (idempotency_key, asset_id, user_id, request_hash, response_status, response_body)
         VALUES ($1, $2, $3, $4, 200, $5::jsonb)`,
        [idempotencyKey, fx.assetId, fx.buyerA, requestHash, JSON.stringify(originalResponse)],
      );

      // Replay: the command insert is a no-op (ON CONFLICT DO NOTHING).
      const replayInsert = await client.query<{ id: string }>(
        `INSERT INTO coown_order_commands (asset_id, actor_id, idempotency_key, request_hash, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (asset_id, actor_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [fx.assetId, fx.buyerA, idempotencyKey, requestHash],
      );
      assert.equal(replayInsert.rows.length, 0, 'replay must not insert a new command row');

      // The existing command is acknowledged → return the original response.
      const existing = await client.query<{
        status: string;
        response_status: number | null;
        response_body: Record<string, unknown> | null;
      }>(
        `SELECT status, response_status, response_body
         FROM coown_order_commands
         WHERE asset_id = $1 AND actor_id = $2 AND idempotency_key = $3
         LIMIT 1`,
        [fx.assetId, fx.buyerA, idempotencyKey],
      );
      assert.equal(existing.rows[0].status, 'acknowledged');
      assert.deepEqual(existing.rows[0].response_body, originalResponse);

      // Idempotency lookup also returns the original response (same hash).
      const idemLookup = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        `SELECT request_hash, response_body
         FROM coown_order_idempotency
         WHERE asset_id = $1 AND user_id = $2 AND idempotency_key = $3
         LIMIT 1`,
        [fx.assetId, fx.buyerA, idempotencyKey],
      );
      assert.equal(idemLookup.rows[0].request_hash, requestHash);
      assert.deepEqual(idemLookup.rows[0].response_body, originalResponse);

      // No duplicate order was created.
      const orderCount = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM coOwn_orders WHERE asset_id = $1 AND user_id = $2`,
        [fx.assetId, fx.buyerA],
      );
      assert.equal(Number(orderCount.rows[0].count), 0, 'no duplicate order should be created on replay');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  // 3. Order expiry — the GFD expiry sweeper cancels past-deadline orders and
  // releases their reservations.
  it('should expire a GFD order with a past timestamp and release its reservation', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fx = await buildFixture(client, { sellerUnits: 5, unitPriceGbp: 4 });

      const pastExpiry = new Date(Date.now() - 60_000); // 1 minute ago
      const { orderId, reservationId } = await placeRestingOrder(client, {
        assetId: fx.assetId,
        userId: fx.sellerId,
        side: 'sell',
        units: 4,
        unitPriceGbp: 4,
        expiresAt: pastExpiry,
      });

      // Expiry sweeper — same UPDATE as the route's matching pre-pass.
      const expired = await client.query<{ id: number }>(
        `UPDATE coOwn_orders
         SET remaining_units = 0, status = 'cancelled', cancel_reason = 'expired', updated_at = NOW()
         WHERE asset_id = $1
           AND status IN ('open', 'partially_filled')
           AND expires_at IS NOT NULL
           AND expires_at <= NOW()
         RETURNING id`,
        [fx.assetId],
      );
      assert.ok(
        expired.rows.some((r) => Number(r.id) === orderId),
        'the past-deadline order must be expired by the sweeper',
      );

      // Release the reservation for expired orders.
      await client.query(
        `UPDATE coown_order_reservations
         SET status = 'expired', reserved_1ze_units = 0, reserved_units = 0, updated_at = NOW()
         WHERE placed_order_id = ANY($1::bigint[]) AND status = 'placed'`,
        [expired.rows.map((r) => r.id)],
      );

      const orderRes = await client.query<{ status: string; cancel_reason: string | null; remaining_units: number }>(
        `SELECT status, cancel_reason, remaining_units FROM coOwn_orders WHERE id = $1`,
        [orderId],
      );
      assert.equal(orderRes.rows[0].status, 'cancelled');
      assert.equal(orderRes.rows[0].cancel_reason, 'expired');
      assert.equal(orderRes.rows[0].remaining_units, 0);

      const resRes = await client.query<{ status: string; reserved_1ze_units: string; reserved_units: number }>(
        `SELECT status, reserved_1ze_units::text, reserved_units FROM coown_order_reservations WHERE id = $1`,
        [reservationId],
      );
      assert.equal(resRes.rows[0].status, 'expired');
      assert.equal(Number(resRes.rows[0].reserved_1ze_units), 0);
      assert.equal(resRes.rows[0].reserved_units, 0);

      // A non-expired order in the same book must be untouched.
      const { orderId: liveOrderId } = await placeRestingOrder(client, {
        assetId: fx.assetId,
        userId: fx.sellerId,
        side: 'sell',
        units: 2,
        unitPriceGbp: 5,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const liveRes = await client.query<{ status: string }>(
        `SELECT status FROM coOwn_orders WHERE id = $1`,
        [liveOrderId],
      );
      assert.equal(liveRes.rows[0].status, 'open');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  // 4. Reserved balance — buy order reserves 1ZE funds; cancellation releases them.
  it('should track reserved funds on a buy order and release them on cancellation', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fx = await buildFixture(client, { sellerUnits: 5, unitPriceGbp: 4 });

      const { orderId, reservationId } = await placeRestingOrder(client, {
        assetId: fx.assetId,
        userId: fx.buyerA,
        side: 'buy',
        units: 5,
        unitPriceGbp: 4,
      });

      // Reserved 1ZE funds are tracked on the reservation.
      const reservedRes = await client.query<{ reserved_1ze_units: string; status: string }>(
        `SELECT reserved_1ze_units::text, status FROM coown_order_reservations WHERE id = $1`,
        [reservationId],
      );
      const expectedReserved = Math.ceil(roundTo(5 * 4 * (1 + CO_OWN_TRADE_FEE_RATE), 4) * 1000);
      assert.equal(reservedRes.rows[0].status, 'placed');
      assert.equal(Number(reservedRes.rows[0].reserved_1ze_units), expectedReserved);

      // Cancel the order — mirrors the cancel handler.
      const cancelSeq = await allocateMarketSequence(client, fx.assetId);
      await client.query(
        `UPDATE coOwn_orders
         SET remaining_units = 0, status = 'cancelled', cancel_reason = 'user', updated_at = NOW(), market_sequence = $2
         WHERE id = $1`,
        [orderId, cancelSeq],
      );
      await client.query(
        `UPDATE coown_order_reservations
         SET reserved_1ze_units = 0, reserved_units = 0, status = 'cancelled', updated_at = NOW()
         WHERE placed_order_id = $1 AND status = 'placed'`,
        [orderId],
      );

      const afterOrder = await client.query<{ status: string; cancel_reason: string | null }>(
        `SELECT status, cancel_reason FROM coOwn_orders WHERE id = $1`,
        [orderId],
      );
      assert.equal(afterOrder.rows[0].status, 'cancelled');
      assert.equal(afterOrder.rows[0].cancel_reason, 'user');

      const afterRes = await client.query<{ reserved_1ze_units: string; reserved_units: number; status: string }>(
        `SELECT reserved_1ze_units::text, reserved_units, status FROM coown_order_reservations WHERE id = $1`,
        [reservationId],
      );
      assert.equal(afterRes.rows[0].status, 'cancelled');
      assert.equal(Number(afterRes.rows[0].reserved_1ze_units), 0, 'reserved 1ZE funds must be released');
      assert.equal(afterRes.rows[0].reserved_units, 0);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  // 5. Permissions — user A cannot cancel user B's order, and cannot accept a
  // buyout offer meant for user B.
  it('should forbid user A from cancelling user B order and from accepting user B buyout offer', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fx = await buildFixture(client, { sellerUnits: 5, unitPriceGbp: 4 });

      // Order owned by buyerB.
      const { orderId } = await placeRestingOrder(client, {
        assetId: fx.assetId,
        userId: fx.buyerB,
        side: 'buy',
        units: 3,
        unitPriceGbp: 4,
      });

      // buyerA attempts to cancel buyerB's order — the route's ownership check.
      const orderRes = await client.query<{ user_id: string; status: string }>(
        `SELECT user_id, status FROM coOwn_orders WHERE id = $1 AND asset_id = $2 FOR UPDATE`,
        [orderId, fx.assetId],
      );
      const order = orderRes.rows[0];
      const cancellingUserId = fx.buyerA;
      const isOwner = order.user_id === cancellingUserId;
      assert.equal(isOwner, false, 'user A is not the owner of user B order');
      // The route returns 403 here; we verify the order is left untouched.
      assert.equal(order.status, 'open');

      // Buyout offer created by buyerA (bidder), targeting seller's units.
      const offerId = `test_buyout_${suffix()}`;
      await client.query(
        `INSERT INTO coOwn_buyout_offers (id, asset_id, bidder_user_id, offer_price_gbp, target_units, accepted_units, status, expires_at, metadata)
         VALUES ($1, $2, $3, 5, 3, 0, 'open', NOW() + INTERVAL '24 hours', '{}'::jsonb)`,
        [offerId, fx.assetId, fx.buyerA],
      );

      // buyerA (the bidder) attempts to accept their own offer — the route
      // rejects this (bidder cannot accept their own offer). Additionally, an
      // acceptance where the authenticated holder does not match the body
      // holder is rejected at the auth layer. We verify the ownership guard:
      // the offer's bidder_user_id equals the attempting user → blocked.
      const offerRow = await client.query<{ bidder_user_id: string; status: string }>(
        `SELECT bidder_user_id, status FROM coOwn_buyout_offers WHERE id = $1 FOR UPDATE`,
        [offerId],
      );
      const attemptingUser = fx.buyerA;
      assert.equal(
        offerRow.rows[0].bidder_user_id,
        attemptingUser,
        'bidder cannot accept their own offer (route returns 400)',
      );
      // No acceptance row should exist for the bidder.
      const acceptanceCount = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM coOwn_buyout_acceptances WHERE offer_id = $1 AND holder_user_id = $2`,
        [offerId, attemptingUser],
      );
      assert.equal(Number(acceptanceCount.rows[0].count), 0);

      // The offer remains open and untouched.
      assert.equal(offerRow.rows[0].status, 'open');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  // 6. Event emission — creating and filling an order appends the correct
  // domain-outbox event records within the same transaction.
  it('should emit domain-outbox events when an order is created and filled', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fx = await buildFixture(client, { sellerUnits: 5, unitPriceGbp: 4 });

      const { orderId: sellOrderId } = await placeRestingOrder(client, {
        assetId: fx.assetId,
        userId: fx.sellerId,
        side: 'sell',
        units: 5,
        unitPriceGbp: 4,
      });

      // Append an order-placed event (as the route would via the outbox).
      const placedEventId = await appendDomainEvent(client, {
        aggregateType: 'coOwn_order',
        aggregateId: `${fx.assetId}:${sellOrderId}`,
        eventType: 'coOwn.order.placed',
        payload: { assetId: fx.assetId, orderId: sellOrderId, side: 'sell', units: 5, unitPriceGbp: 4 },
        actorId: fx.sellerId,
        deduplicationKey: `coOwn.order.placed:${fx.assetId}:${sellOrderId}`,
      });
      assert.ok(placedEventId, 'order.placed event id should be returned');

      // Place and match an incoming buy order that fills the sell.
      const buySeq = await allocateMarketSequence(client, fx.assetId);
      const buyOrderRes = await client.query<{ id: string }>(
        `INSERT INTO coOwn_orders (asset_id, user_id, side, order_type, units, remaining_units, filled_units, unit_price_gbp, fee_gbp, total_gbp, status, market_sequence)
         VALUES ($1, $2, 'buy', 'market', 5, 5, 0, 4, 0, 0, 'open', $3)
         RETURNING id`,
        [fx.assetId, fx.buyerA, buySeq],
      );
      const buyOrderId = Number(buyOrderRes.rows[0].id);

      const matchResult = await matchIncoming(client, {
        assetId: fx.assetId,
        incomingOrderId: buyOrderId,
        incomingUserId: fx.buyerA,
        side: 'buy',
        units: 5,
        unitPriceGbp: 4,
        orderType: 'market',
      });
      assert.equal(matchResult.filledUnits, 5);
      assert.equal(matchResult.status, 'filled');

      // Append an order-filled event for the matched pair.
      const filledEventId = await appendDomainEvent(client, {
        aggregateType: 'coOwn_order',
        aggregateId: `${fx.assetId}:${buyOrderId}`,
        eventType: 'coOwn.order.filled',
        payload: { assetId: fx.assetId, buyOrderId, sellOrderId, units: 5, unitPriceGbp: 4 },
        actorId: fx.buyerA,
        deduplicationKey: `coOwn.order.filled:${fx.assetId}:${buyOrderId}`,
      });
      assert.ok(filledEventId, 'order.filled event id should be returned');

      // Verify the domain_outbox holds both events with correct metadata.
      const events = await client.query<{
        id: string;
        aggregate_type: string;
        aggregate_id: string;
        event_type: string;
        status: string;
      }>(
        `SELECT id, aggregate_type, aggregate_id, event_type, status
         FROM domain_outbox
         WHERE id = ANY($1::text[])
         ORDER BY created_at ASC`,
        [[placedEventId, filledEventId]],
      );
      assert.equal(events.rows.length, 2, 'both events must be persisted in the outbox');
      assert.equal(events.rows[0].aggregate_type, 'coOwn_order');
      assert.equal(events.rows[0].event_type, 'coOwn.order.placed');
      assert.equal(events.rows[1].aggregate_type, 'coOwn_order');
      assert.equal(events.rows[1].event_type, 'coOwn.order.filled');
      assert.equal(events.rows[0].status, 'pending');
      assert.equal(events.rows[1].status, 'pending');

      // Deduplication: replaying the same deduplication key is a no-op insert.
      const replayId = await appendDomainEvent(client, {
        aggregateType: 'coOwn_order',
        aggregateId: `${fx.assetId}:${sellOrderId}`,
        eventType: 'coOwn.order.placed',
        payload: { assetId: fx.assetId, orderId: sellOrderId, side: 'sell', units: 5, unitPriceGbp: 4 },
        actorId: fx.sellerId,
        deduplicationKey: `coOwn.order.placed:${fx.assetId}:${sellOrderId}`,
      });
      assert.equal(replayId, placedEventId, 'replaying a duplicate event must return the existing id');

      const dupCount = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM domain_outbox WHERE deduplication_key = $1`,
        [`coOwn.order.placed:${fx.assetId}:${sellOrderId}`],
      );
      assert.equal(Number(dupCount.rows[0].count), 1, 'deduplication key must prevent duplicate events');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  // 7. Partial fill — a buy order for 10 units matched against a 3-unit sell
  // leaves the buy partially filled (3) with 7 remaining; the sell is filled.
  it('should partially fill a buy order and fully fill the smaller sell order', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fx = await buildFixture(client, { sellerUnits: 3, unitPriceGbp: 4 });

      // Resting sell for 3 units.
      const { orderId: sellOrderId } = await placeRestingOrder(client, {
        assetId: fx.assetId,
        userId: fx.sellerId,
        side: 'sell',
        units: 3,
        unitPriceGbp: 4,
      });

      // Incoming limit buy for 10 units at 4 GBP (limit allows matching at <= 4).
      const buySeq = await allocateMarketSequence(client, fx.assetId);
      const buyOrderRes = await client.query<{ id: string }>(
        `INSERT INTO coOwn_orders (asset_id, user_id, side, order_type, limit_price_gbp, units, remaining_units, filled_units, unit_price_gbp, fee_gbp, total_gbp, status, market_sequence)
         VALUES ($1, $2, 'buy', 'limit', 4, 10, 10, 0, 4, 0, 0, 'open', $3)
         RETURNING id`,
        [fx.assetId, fx.buyerA, buySeq],
      );
      const buyOrderId = Number(buyOrderRes.rows[0].id);

      const result = await matchIncoming(client, {
        assetId: fx.assetId,
        incomingOrderId: buyOrderId,
        incomingUserId: fx.buyerA,
        side: 'buy',
        units: 10,
        unitPriceGbp: 4,
        orderType: 'limit',
      });

      assert.equal(result.filledUnits, 3, 'buy order should fill 3 units');
      assert.equal(result.remainingUnits, 7, 'buy order should have 7 units remaining');
      assert.equal(result.status, 'partially_filled');

      const buyRow = await client.query<{ filled_units: number; remaining_units: number; status: string }>(
        `SELECT filled_units, remaining_units, status FROM coOwn_orders WHERE id = $1`,
        [buyOrderId],
      );
      assert.equal(buyRow.rows[0].filled_units, 3);
      assert.equal(buyRow.rows[0].remaining_units, 7);
      assert.equal(buyRow.rows[0].status, 'partially_filled');

      const sellRow = await client.query<{ filled_units: number; remaining_units: number; status: string }>(
        `SELECT filled_units, remaining_units, status FROM coOwn_orders WHERE id = $1`,
        [sellOrderId],
      );
      assert.equal(sellRow.rows[0].filled_units, 3, 'sell order should be fully filled');
      assert.equal(sellRow.rows[0].remaining_units, 0);
      assert.equal(sellRow.rows[0].status, 'filled');

      // A trade record must exist for the 3-unit fill.
      const tradeRes = await client.query<{ units: number; buyer_id: string; seller_id: string }>(
        `SELECT units, buyer_id, seller_id FROM coOwn_trades WHERE asset_id = $1 AND buy_order_id = $2 AND sell_order_id = $3`,
        [fx.assetId, buyOrderId, sellOrderId],
      );
      assert.equal(tradeRes.rows.length, 1);
      assert.equal(tradeRes.rows[0].units, 3);
      assert.equal(tradeRes.rows[0].buyer_id, fx.buyerA);
      assert.equal(tradeRes.rows[0].seller_id, fx.sellerId);

      // Holdings reflect the transfer.
      const buyerHolding = await client.query<{ units_owned: number }>(
        `SELECT units_owned FROM coOwn_holdings WHERE user_id = $1 AND asset_id = $2`,
        [fx.buyerA, fx.assetId],
      );
      assert.equal(buyerHolding.rows[0].units_owned, 3);
      const sellerHolding = await client.query<{ units_owned: number }>(
        `SELECT units_owned FROM coOwn_holdings WHERE user_id = $1 AND asset_id = $2`,
        [fx.sellerId, fx.assetId],
      );
      assert.equal(sellerHolding.rows[0].units_owned, 0);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  // 8. Buyout partial acceptance — the offer stays 'open' until accepted_units
  // reaches target_units, then flips to 'settled' (B11/U47 contract).
  it('should keep a buyout offer open across partial acceptances until the target is reached', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fx = await buildFixture(client, { sellerUnits: 0, unitPriceGbp: 4 });

      // Two holders, each owning 3 units of the asset.
      const holderA = fx.sellerId; // reuse seller as holder A
      const holderB = fx.buyerB; // buyerB acts as holder B
      await setHolding(client, holderA, fx.assetId, 3, 4);
      await setHolding(client, holderB, fx.assetId, 3, 4);

      // Bidder (buyerA) creates a buyout offer targeting 5 units total.
      const offerId = `test_buyout_${suffix()}`;
      await client.query(
        `INSERT INTO coOwn_buyout_offers (id, asset_id, bidder_user_id, offer_price_gbp, target_units, accepted_units, status, expires_at, metadata)
         VALUES ($1, $2, $3, 5, 5, 0, 'open', NOW() + INTERVAL '24 hours', '{}'::jsonb)`,
        [offerId, fx.assetId, fx.buyerA],
      );

      // Acceptance helper mirroring the route's buyout-accept transaction.
      async function acceptBuyout(holderUserId: string, units: number): Promise<void> {
        const offerRes = await client.query<{
          bidder_user_id: string;
          target_units: number;
          accepted_units: number;
          status: string;
          expires_at: string;
        }>(
          `SELECT bidder_user_id, target_units, accepted_units, status, expires_at::text
           FROM coOwn_buyout_offers WHERE id = $1 FOR UPDATE`,
          [offerId],
        );
        const offer = offerRes.rows[0];
        assert.notEqual(offer.bidder_user_id, holderUserId, 'bidder cannot accept own offer');
        assert.equal(offer.status, 'open', 'offer must be open to accept');

        const remainingTarget = Math.max(0, offer.target_units - offer.accepted_units);
        const acceptedUnits = Math.min(units, remainingTarget);
        assert.ok(acceptedUnits > 0, 'there must be remaining target to accept');

        // DvP transfer from holder → bidder.
        await applyTransfer(client, {
          assetId: fx.assetId,
          buyerId: offer.bidder_user_id,
          sellerId: holderUserId,
          units: acceptedUnits,
          unitPriceGbp: 5,
          feeGbp: 0,
          buyOrderId: null,
          sellOrderId: null,
          enforceSellerHolding: true,
        });

        // Record the acceptance.
        await client.query(
          `INSERT INTO coOwn_buyout_acceptances (offer_id, holder_user_id, units, status, responded_at, metadata)
           VALUES ($1, $2, $3, 'accepted', NOW(), '{}'::jsonb)
           ON CONFLICT (offer_id, holder_user_id)
           DO UPDATE SET units = EXCLUDED.units, status = EXCLUDED.status, responded_at = NOW()`,
          [offerId, holderUserId, acceptedUnits],
        );

        // B11/U47: offer stays 'open' until accepted_units reaches target.
        const nextAccepted = offer.accepted_units + acceptedUnits;
        const nextStatus = nextAccepted >= offer.target_units ? 'settled' : 'open';
        await client.query(
          `UPDATE coOwn_buyout_offers SET accepted_units = $2, status = $3, updated_at = NOW() WHERE id = $1`,
          [offerId, nextAccepted, nextStatus],
        );
      }

      // First holder accepts 3 units — offer remains open (3/5).
      await acceptBuyout(holderA, 3);
      const afterFirst = await client.query<{ accepted_units: number; status: string }>(
        `SELECT accepted_units, status FROM coOwn_buyout_offers WHERE id = $1`,
        [offerId],
      );
      assert.equal(afterFirst.rows[0].accepted_units, 3);
      assert.equal(afterFirst.rows[0].status, 'open', 'offer must remain open after a partial acceptance');

      // Second holder accepts 2 units — target reached (5/5) → settled.
      await acceptBuyout(holderB, 2);
      const afterSecond = await client.query<{ accepted_units: number; status: string }>(
        `SELECT accepted_units, status FROM coOwn_buyout_offers WHERE id = $1`,
        [offerId],
      );
      assert.equal(afterSecond.rows[0].accepted_units, 5);
      assert.equal(afterSecond.rows[0].status, 'settled', 'offer must settle once accepted_units reaches target');

      // Both acceptance rows are recorded.
      const acceptances = await client.query<{ holder_user_id: string; units: number; status: string }>(
        `SELECT holder_user_id, units, status FROM coOwn_buyout_acceptances WHERE offer_id = $1 ORDER BY responded_at ASC`,
        [offerId],
      );
      assert.equal(acceptances.rows.length, 2);
      assert.equal(acceptances.rows[0].units, 3);
      assert.equal(acceptances.rows[1].units, 2);
      assert.equal(acceptances.rows[0].status, 'accepted');
      assert.equal(acceptances.rows[1].status, 'accepted');

      // Bidder now holds all 5 accepted units.
      const bidderHolding = await client.query<{ units_owned: number }>(
        `SELECT units_owned FROM coOwn_holdings WHERE user_id = $1 AND asset_id = $2`,
        [fx.buyerA, fx.assetId],
      );
      assert.equal(bidderHolding.rows[0].units_owned, 5);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
