import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { Pool, type PoolClient } from 'pg';
import {
  applyWalletLedgerDelta,
  refundOnezeInternalWalletDebit,
} from '../lib/walletMoneyPath.js';
import { evaluateWalletCapability } from '../lib/compliance.js';

// ── Production invariant proofs (real PostgreSQL) ──
//
// Closes the audit's P0 proof gaps (R09–R13): unique-item double-sale race,
// payment webhook replay/out-of-order handling, double-entry ledger balance
// enforcement, Co-Own supply conservation, withdrawal reconciliation, and the
// KYC/payout capability gate. Each test mirrors the exact SQL the production
// routes run (index.ts checkout claim, webhook dedupe insert, intent state
// machine, coOwn.ts transfer guard) or calls the real lib function directly
// (applyWalletLedgerDelta, refundOnezeInternalWalletDebit,
// evaluateWalletCapability).
//
// Concurrency tests COMMIT their fixtures (cross-connection visibility) and
// clean them up explicitly; everything else runs inside transactions that are
// rolled back, so the database is never polluted.
//
// Run with:
//   DATABASE_URL=postgresql://thryftverse:thryftverse@localhost:5432/thryftverse \
//     node --import tsx --test src/integration/productionInvariants.test.ts
//
// If PostgreSQL is unreachable each test is marked SKIPPED explicitly — a skip
// is never reported as a pass.

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://thryftverse:thryftverse@localhost:5432/thryftverse';

function suffix(): string {
  return `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

interface FixtureIds {
  sellerId: string;
  buyerA: string;
  buyerB: string;
  listingId: string;
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

async function createListing(
  client: PoolClient,
  listingId: string,
  sellerId: string,
  status = 'active',
): Promise<void> {
  await client.query(
    `INSERT INTO listings (id, seller_id, title, description, price_gbp, status)
     VALUES ($1, $2, 'Invariant test listing', 'Fixture', 25, $3)`,
    [listingId, sellerId, status],
  );
}

// Mirrors the direct-buy claim sequence in index.ts: lock the listing row,
// verify it is still purchasable, create the order + active reservation, and
// pause the listing — all inside one transaction. Returns 'claimed' when the
// sequence completes or 'conflict' when the row is no longer active.
async function claimListingCheckout(
  client: PoolClient,
  input: { listingId: string; buyerId: string; sellerId: string },
): Promise<'claimed' | 'conflict'> {
  await client.query('BEGIN');
  try {
    const listingResult = await client.query<{ status: string }>(
      `SELECT status FROM listings WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [input.listingId],
    );
    const status = listingResult.rows[0]?.status;
    if (status !== 'active') {
      await client.query('ROLLBACK');
      return 'conflict';
    }

    const orderId = `inv_ord_${suffix()}`;
    await client.query(
      `INSERT INTO orders (
         id, buyer_id, seller_id, listing_id,
         subtotal_gbp, buyer_protection_fee_gbp, total_gbp, status
       )
       VALUES ($1, $2, $3, $4, 25, 0, 25, 'created')`,
      [orderId, input.buyerId, input.sellerId, input.listingId],
    );

    await client.query(
      `INSERT INTO listing_checkout_reservations (
         id, offer_id, listing_id, buyer_id, seller_id,
         order_id, source, status, expires_at
       )
       VALUES ($1, NULL, $2, $3, $4, $5, 'direct', 'active', NOW() + INTERVAL '15 minutes')`,
      [`inv_res_${suffix()}`, input.listingId, input.buyerId, input.sellerId, orderId],
    );

    await client.query(
      `UPDATE listings
       SET status = 'paused', pause_source = 'checkout_reservation', updated_at = NOW()
       WHERE id = $1`,
      [input.listingId],
    );
    await client.query('COMMIT');
    return 'claimed';
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

// Mirrors transitionPaymentIntentStatus in index.ts: lock the intent row,
// treat terminal-from and same-status moves as idempotent no-ops, and reject
// transitions outside the allowed map.
const INTENT_TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
const INTENT_ALLOWED: Record<string, string[]> = {
  requires_payment_method: ['requires_confirmation', 'cancelled'],
  requires_confirmation: ['processing', 'succeeded', 'failed', 'cancelled'],
  processing: ['succeeded', 'failed', 'cancelled'],
  provider_submission_pending: [
    'requires_payment_method',
    'requires_confirmation',
    'processing',
    'succeeded',
    'failed',
    'cancelled',
  ],
  succeeded: [],
  failed: [],
  cancelled: [],
};

async function transitionIntent(
  client: PoolClient,
  intentId: string,
  nextStatus: string,
): Promise<{ fromStatus: string; applied: boolean }> {
  const result = await client.query<{ status: string }>(
    `SELECT status FROM payment_intents WHERE id = $1 LIMIT 1 FOR UPDATE`,
    [intentId],
  );
  const row = result.rows[0];
  assert.ok(row, 'intent must exist');
  const fromStatus = row.status;
  if (fromStatus === nextStatus || INTENT_TERMINAL.has(fromStatus)) {
    return { fromStatus, applied: false };
  }
  if (!INTENT_ALLOWED[fromStatus]?.includes(nextStatus)) {
    const err = new Error(
      `Payment intent cannot transition from '${fromStatus}' to '${nextStatus}'`,
    ) as Error & { code?: string };
    err.code = 'PAYMENT_INTENT_INVALID_TRANSITION';
    throw err;
  }
  await client.query(
    `UPDATE payment_intents SET status = $2, updated_at = NOW() WHERE id = $1`,
    [intentId, nextStatus],
  );
  return { fromStatus, applied: true };
}

async function createGatewayAndIntent(
  client: PoolClient,
  input: { userId: string; status?: string },
): Promise<{ gatewayId: string; intentId: string }> {
  const gatewayId = `inv_gw_${suffix()}`;
  const intentId = `inv_pi_${suffix()}`;
  await client.query(
    `INSERT INTO payment_gateways (id, display_name, gateway_type)
     VALUES ($1, 'Invariant gateway', 'fiat')`,
    [gatewayId],
  );
  await client.query(
    `INSERT INTO payment_intents (id, user_id, gateway_id, channel, amount_gbp, status)
     VALUES ($1, $2, $3, 'commerce', 25, $4)`,
    [intentId, input.userId, gatewayId, input.status ?? 'processing'],
  );
  return { gatewayId, intentId };
}

async function cleanupListingFixture(client: PoolClient, fx: FixtureIds): Promise<void> {
  await client.query(
    `DELETE FROM listing_checkout_reservations WHERE listing_id = $1`,
    [fx.listingId],
  );
  await client.query(`DELETE FROM orders WHERE listing_id = $1`, [fx.listingId]);
  await client.query(`DELETE FROM listings WHERE id = $1`, [fx.listingId]);
  await client.query(
    `DELETE FROM users WHERE id IN ($1, $2, $3)`,
    [fx.sellerId, fx.buyerA, fx.buyerB],
  );
}

describe('Production invariants (real PostgreSQL)', () => {
  let pool: Pool;
  let dbAvailable = false;
  let dbError: string | null = null;

  const requireDb = (t: { skip: (msg?: string) => void }): boolean => {
    if (!dbAvailable) {
      t.skip(`PostgreSQL unreachable (${dbError ?? 'not probed'}) — set DATABASE_URL`);
      return false;
    }
    return true;
  };

  before(async () => {
    pool = new Pool({ connectionString: DATABASE_URL, max: 6 });
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      dbAvailable = true;
    } catch (err) {
      dbError = err instanceof Error ? (err as NodeJS.ErrnoException).code ?? err.message : String(err);
    }
  });

  after(async () => {
    await pool?.end();
  });

  // ── P0-07 / R10: unique-item double-sale ────────────────────────────────
  it('admits exactly one checkout reservation under concurrent buyers', async (t) => {
    if (!requireDb(t)) return;
    const setup = await pool.connect();
    const contenderA = await pool.connect();
    const contenderB = await pool.connect();
    const fx: FixtureIds = {
      sellerId: `inv_seller_${suffix()}`,
      buyerA: `inv_buyer_a_${suffix()}`,
      buyerB: `inv_buyer_b_${suffix()}`,
      listingId: `inv_listing_${suffix()}`,
    };
    try {
      await setup.query('BEGIN');
      await createUsers(setup, [
        { id: fx.sellerId, username: `inv_s_${suffix()}` },
        { id: fx.buyerA, username: `inv_ba_${suffix()}` },
        { id: fx.buyerB, username: `inv_bba_${suffix()}` },
      ]);
      await createListing(setup, fx.listingId, fx.sellerId);
      await setup.query('COMMIT');

      // Contender A takes the row lock and runs the full claim sequence but
      // holds the transaction open until B is demonstrably blocked.
      await contenderA.query('BEGIN');
      const lockA = await contenderA.query<{ status: string }>(
        `SELECT status FROM listings WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [fx.listingId],
      );
      assert.equal(lockA.rows[0]?.status, 'active', 'contender A must see an active listing');

      // Contender B blocks on the same row — fire without awaiting.
      const bLockPromise = (async () => {
        await contenderB.query('BEGIN');
        return contenderB.query<{ status: string }>(
          `SELECT status FROM listings WHERE id = $1 LIMIT 1 FOR UPDATE`,
          [fx.listingId],
        );
      })();

      // A completes the claim while B is still queued on the lock.
      const orderId = `inv_ord_${suffix()}`;
      await contenderA.query(
        `INSERT INTO orders (
           id, buyer_id, seller_id, listing_id,
           subtotal_gbp, buyer_protection_fee_gbp, total_gbp, status
         )
         VALUES ($1, $2, $3, $4, 25, 0, 25, 'created')`,
        [orderId, fx.buyerA, fx.sellerId, fx.listingId],
      );
      await contenderA.query(
        `INSERT INTO listing_checkout_reservations (
           id, offer_id, listing_id, buyer_id, seller_id,
           order_id, source, status, expires_at
         )
         VALUES ($1, NULL, $2, $3, $4, $5, 'direct', 'active', NOW() + INTERVAL '15 minutes')`,
        [`inv_res_${suffix()}`, fx.listingId, fx.buyerA, fx.sellerId, orderId],
      );
      await contenderA.query(
        `UPDATE listings
         SET status = 'paused', pause_source = 'checkout_reservation', updated_at = NOW()
         WHERE id = $1`,
        [fx.listingId],
      );
      await contenderA.query('COMMIT');

      // B's blocked lock now resolves — it must observe 'paused', i.e. the
      // serialized loser receives the production 409 path, never an order.
      const bLock = await bLockPromise;
      assert.equal(
        bLock.rows[0]?.status,
        'paused',
        'lock-waiting loser must observe the reserved listing, not an active one',
      );
      await contenderB.query('ROLLBACK');

      // Backstop: even a client that skipped the lock cannot create a second
      // active reservation — the partial unique index rejects it (23505).
      const intruder = await pool.connect();
      try {
        await intruder.query('BEGIN');
        await intruder.query(
          `INSERT INTO orders (
             id, buyer_id, seller_id, listing_id,
             subtotal_gbp, buyer_protection_fee_gbp, total_gbp, status
           )
           VALUES ($1, $2, $3, $4, 25, 0, 25, 'created')`,
          [`inv_ord_${suffix()}`, fx.buyerB, fx.sellerId, fx.listingId],
        );
        await assert.rejects(
          intruder.query(
            `INSERT INTO listing_checkout_reservations (
               id, offer_id, listing_id, buyer_id, seller_id,
               order_id, source, status, expires_at
             )
             VALUES ($1, NULL, $2, $3, $4, $5, 'direct', 'active', NOW() + INTERVAL '15 minutes')`,
            [
              `inv_res_${suffix()}`,
              fx.listingId,
              fx.buyerB,
              fx.sellerId,
              `inv_ord2_${suffix()}`,
            ],
          ),
          (err: NodeJS.ErrnoException) => err.code === '23505',
          'a second ACTIVE reservation for the same listing must violate the unique index',
        );
        await intruder.query('ROLLBACK');
      } finally {
        intruder.release();
      }

      // Exactly one active reservation exists.
      const count = await setup.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM listing_checkout_reservations
         WHERE listing_id = $1 AND status = 'active'`,
        [fx.listingId],
      );
      assert.equal(count.rows[0].n, '1');
    } finally {
      await setup.query('ROLLBACK').catch(() => undefined);
      await cleanupListingFixture(setup, fx).catch(() => undefined);
      setup.release();
      contenderA.release();
      contenderB.release();
    }
  });

  it('rejects a buyer checkout on an already-paused listing', async (t) => {
    if (!requireDb(t)) return;
    const client = await pool.connect();
    const fx: FixtureIds = {
      sellerId: `inv_seller_${suffix()}`,
      buyerA: `inv_buyer_${suffix()}`,
      buyerB: `inv_buyer2_${suffix()}`,
      listingId: `inv_listing_${suffix()}`,
    };
    try {
      await client.query('BEGIN');
      await createUsers(client, [
        { id: fx.sellerId, username: `inv_s_${suffix()}` },
        { id: fx.buyerA, username: `inv_b_${suffix()}` },
      ]);
      await createListing(client, fx.listingId, fx.sellerId, 'paused');
      const outcome = await claimListingCheckout(client, {
        listingId: fx.listingId,
        buyerId: fx.buyerA,
        sellerId: fx.sellerId,
      });
      assert.equal(outcome, 'conflict');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  // ── P0-08 / R11: webhook replay + out-of-order ──────────────────────────
  it('dedupes replayed provider events via the unique (gateway, event) key', async (t) => {
    if (!requireDb(t)) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = `inv_wh_user_${suffix()}`;
      await createUsers(client, [{ id: userId, username: `inv_wh_${suffix()}` }]);
      const { gatewayId, intentId } = await createGatewayAndIntent(client, { userId });

      const providerEventId = `evt_${suffix()}`;
      const insert = () =>
        client.query<{ id: string }>(
          `INSERT INTO payment_webhook_events (
             gateway_id, provider_event_id, event_type, intent_id, payload
           )
           VALUES ($1, $2, 'payment_intent.succeeded', $3, '{}'::jsonb)
           ON CONFLICT (gateway_id, provider_event_id) DO NOTHING
           RETURNING id`,
          [gatewayId, providerEventId, intentId],
        );

      const first = await insert();
      assert.equal(first.rowCount, 1, 'first delivery inserts the dedupe row');

      const replay = await insert();
      assert.equal(replay.rowCount, 0, 'replayed delivery is a no-op insert');

      // Production distinguishes "received" from "processed": an unprocessed
      // replay falls through and re-processes; a processed one short-circuits.
      const unprocessed = await client.query<{ processed_at: string | null }>(
        `SELECT processed_at FROM payment_webhook_events
         WHERE gateway_id = $1 AND provider_event_id = $2`,
        [gatewayId, providerEventId],
      );
      assert.equal(
        unprocessed.rows[0]?.processed_at,
        null,
        'received-but-unprocessed events must remain eligible for re-processing',
      );

      await client.query(
        `UPDATE payment_webhook_events SET processed_at = NOW()
         WHERE gateway_id = $1 AND provider_event_id = $2`,
        [gatewayId, providerEventId],
      );
      const processed = await client.query<{ processed_at: string | null }>(
        `SELECT processed_at FROM payment_webhook_events
         WHERE gateway_id = $1 AND provider_event_id = $2`,
        [gatewayId, providerEventId],
      );
      assert.ok(processed.rows[0]?.processed_at, 'processed_at marks the event final');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('keeps a terminal payment intent terminal against out-of-order events', async (t) => {
    if (!requireDb(t)) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = `inv_oo_user_${suffix()}`;
      await createUsers(client, [{ id: userId, username: `inv_oo_${suffix()}` }]);
      const { intentId } = await createGatewayAndIntent(client, {
        userId,
        status: 'processing',
      });

      // In-order: processing → succeeded applies.
      const first = await transitionIntent(client, intentId, 'succeeded');
      assert.deepEqual(first, { fromStatus: 'processing', applied: true });

      // Out-of-order replay of an earlier state must be a no-op, not a move.
      const replay = await transitionIntent(client, intentId, 'processing');
      assert.equal(replay.applied, false, 'terminal intent ignores stale events');
      const replayFail = await transitionIntent(client, intentId, 'failed');
      assert.equal(replayFail.applied, false, 'terminal intent cannot be un-succeeded');

      const finalRow = await client.query<{ status: string }>(
        `SELECT status FROM payment_intents WHERE id = $1`,
        [intentId],
      );
      assert.equal(finalRow.rows[0]?.status, 'succeeded');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('rejects backward intent transitions that skip the state machine', async (t) => {
    if (!requireDb(t)) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = `inv_sm_user_${suffix()}`;
      await createUsers(client, [{ id: userId, username: `inv_sm_${suffix()}` }]);
      const { intentId } = await createGatewayAndIntent(client, {
        userId,
        status: 'processing',
      });

      await assert.rejects(
        transitionIntent(client, intentId, 'requires_confirmation'),
        /cannot transition/,
        'processing → requires_confirmation is not an allowed transition',
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('enforces order idempotency — duplicate buyer key cannot mint two orders', async (t) => {
    if (!requireDb(t)) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sellerId = `inv_seller_${suffix()}`;
      const buyerId = `inv_buyer_${suffix()}`;
      const listingId = `inv_listing_${suffix()}`;
      await createUsers(client, [
        { id: sellerId, username: `inv_s_${suffix()}` },
        { id: buyerId, username: `inv_b_${suffix()}` },
      ]);
      await createListing(client, listingId, sellerId);

      const idemKey = `idem_${suffix()}`;
      const insertOrder = () =>
        client.query(
          `INSERT INTO orders (
             id, buyer_id, seller_id, listing_id,
             subtotal_gbp, buyer_protection_fee_gbp, total_gbp, status,
             idempotency_key
           )
           VALUES ($1, $2, $3, $4, 25, 0, 25, 'created', $5)`,
          [`inv_ord_${suffix()}`, buyerId, sellerId, listingId, idemKey],
        );

      await insertOrder();
      await assert.rejects(
        insertOrder(),
        (err: NodeJS.ErrnoException) => err.code === '23505',
        'orders_buyer_idempotency_idx must reject a duplicated buyer key',
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  // ── P0-09 / R12: double-entry balance enforcement ───────────────────────
  it('rejects unbalanced journal lines and accepts a balanced posting', async (t) => {
    if (!requireDb(t)) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const acctA = `inv_acct_a_${suffix()}`;
      const acctB = `inv_acct_b_${suffix()}`;
      const mkAccount = (ownerId: string, code: string, side: string) =>
        client.query<{ id: string }>(
          `INSERT INTO money_accounts (owner_type, owner_id, account_code, currency, normal_side)
           VALUES ('user', $1, $2, 'GBP', $3) RETURNING id::text AS id`,
          [ownerId, code, side],
        );
      const aId = (await mkAccount(acctA, 'buyer_spend', 'debit')).rows[0].id;
      const bId = (await mkAccount(acctB, 'escrow_liability', 'credit')).rows[0].id;

      const mkJournal = () =>
        client.query<{ id: string }>(
          `INSERT INTO money_journals (posting_key, event_type, event_id, effective_at)
           VALUES ($1, 'invariant_test', $2, NOW()) RETURNING id::text AS id`,
          [`inv_j_${suffix()}`, suffix()],
        );

      // A single-sided line insert must fail — the AFTER ROW trigger sees the
      // journal unbalanced at statement end.
      const jBad = (await mkJournal()).rows[0].id;
      await assert.rejects(
        client.query(
          `INSERT INTO money_journal_lines (journal_id, account_id, side, amount_minor, currency, line_code)
           VALUES ($1, $2, 'debit', 2500, 'GBP', 'principal')`,
          [jBad, aId],
        ),
        (err: Error & { code?: string }) =>
          err.code === 'R001' || /not balanced/.test(err.message),
        'a lone debit line must trip the balance trigger',
      );

      // A balanced pair in ONE statement is the only valid posting shape.
      const jGood = (await mkJournal()).rows[0].id;
      await client.query(
        `INSERT INTO money_journal_lines (journal_id, account_id, side, amount_minor, currency, line_code)
         VALUES
           ($1, $2, 'debit', 2500, 'GBP', 'principal'),
           ($1, $3, 'credit', 2500, 'GBP', 'principal')`,
        [jGood, aId, bId],
      );

      // Unbalanced multi-line inserts fail even though both lines arrive.
      const jUnbalanced = (await mkJournal()).rows[0].id;
      await assert.rejects(
        client.query(
          `INSERT INTO money_journal_lines (journal_id, account_id, side, amount_minor, currency, line_code)
           VALUES
             ($1, $2, 'debit', 2500, 'GBP', 'principal'),
             ($1, $3, 'credit', 2400, 'GBP', 'principal')`,
          [jUnbalanced, aId, bId],
        ),
        (err: Error & { code?: string }) =>
          err.code === 'R001' || /not balanced/.test(err.message),
      );

      // Posted journals are immutable — UPDATE raises R002.
      await assert.rejects(
        client.query(
          `UPDATE money_journals SET metadata = '{"tampered":true}'::jsonb WHERE id = $1`,
          [jGood],
        ),
        (err: Error & { code?: string }) =>
          err.code === 'R002' || /immutable/.test(err.message),
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('wallet ledger primitive refuses overdrafts and negative balances', async (t) => {
    if (!requireDb(t)) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = `inv_wal_user_${suffix()}`;
      const walletId = `inv_wal_${suffix()}`;
      await createUsers(client, [{ id: userId, username: `inv_w_${suffix()}` }]);
      await createWallet(client, walletId, userId, 5_000n);

      // Real primitive: a debit larger than the balance throws before writing.
      await assert.rejects(
        applyWalletLedgerDelta(client, {
          walletId,
          txId: `inv_tx_${suffix()}`,
          asset: '1ZE',
          amount: -10_000,
          kind: 'DEBIT',
        }),
        /WALLET_INSUFFICIENT_BALANCE|insufficient/i,
      );

      const bal = await client.query<{ b: string }>(
        `SELECT oneze_balance_units::text AS b FROM wallets WHERE id = $1`,
        [walletId],
      );
      assert.equal(bal.rows[0].b, '5000', 'rejected debit must leave the balance untouched');

      // Direct SQL cannot bypass the column CHECK either.
      await assert.rejects(
        client.query(
          `UPDATE wallets SET oneze_balance_units = -1 WHERE id = $1`,
          [walletId],
        ),
        (err: NodeJS.ErrnoException) => err.code === '23514',
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('writes ONEZE_REFUND ledger entries and replays them idempotently', async (t) => {
    if (!requireDb(t)) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = `inv_rf_user_${suffix()}`;
      const walletId = `inv_wal_${suffix()}`;
      const intentId = `inv_pi_${suffix()}`;
      await createUsers(client, [{ id: userId, username: `inv_rf_${suffix()}` }]);
      await createWallet(client, walletId, userId, 100_000n);

      // Original purchase debit — the shape the internal-rail checkout writes.
      await applyWalletLedgerDelta(client, {
        walletId,
        txId: `inv_tx_purchase_${suffix()}`,
        asset: '1ZE',
        amount: -25_000,
        kind: 'PURCHASE',
        refType: 'commerce_order',
        refId: intentId,
        metadata: { intentId, totalGbp: 25, gbpToUsdRate: 1.27 },
      });

      // Before migration 324 this insert raised 23514 — the CHECK did not
      // admit 'ONEZE_REFUND'. Now it must succeed and credit the wallet.
      const refund = await refundOnezeInternalWalletDebit(client, {
        intentId,
        refundAmount: 25,
        refundOperationId: `refop_${suffix()}`,
        reason: 'invariant_test',
      });
      assert.equal(refund.alreadyCredited, false);
      assert.equal(refund.creditedUnits, 25_000, 'full refund returns every debited unit');

      const bal = await client.query<{ b: string }>(
        `SELECT oneze_balance_units::text AS b FROM wallets WHERE id = $1`,
        [walletId],
      );
      assert.equal(bal.rows[0].b, '100000', 'refund restores the pre-purchase balance');

      // Replay: same refundOperationId is a read-through no-op.
      const replay = await refundOnezeInternalWalletDebit(client, {
        intentId,
        refundAmount: 25,
        refundOperationId: refund.providerRefundRef.replace('oneze_refund_', ''),
        reason: 'invariant_test',
      });
      assert.equal(replay.alreadyCredited, true, 'replayed refund must not double-credit');

      const entries = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM wallet_ledger
         WHERE wallet_id = $1 AND kind = 'ONEZE_REFUND'`,
        [walletId],
      );
      assert.equal(entries.rows[0].n, '1', 'exactly one refund ledger row exists');

      // Over-refund beyond the original debit is rejected.
      await assert.rejects(
        refundOnezeInternalWalletDebit(client, {
          intentId,
          refundAmount: 1,
          refundOperationId: `refop2_${suffix()}`,
        }),
        /REFUND_AMOUNT_EXCEEDS_REMAINING|fully refunded/,
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  // ── R09: Co-Own supply conservation ─────────────────────────────────────
  it('conserves total unit supply across secondary-market transfers', async (t) => {
    if (!requireDb(t)) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const issuerId = `inv_issuer_${suffix()}`;
      const buyerA = `inv_ca_${suffix()}`;
      const buyerB = `inv_cb_${suffix()}`;
      const listingId = `inv_listing_${suffix()}`;
      const assetId = `inv_asset_${suffix()}`;
      await createUsers(client, [
        { id: issuerId, username: `inv_i_${suffix()}` },
        { id: buyerA, username: `inv_ca_${suffix()}` },
        { id: buyerB, username: `inv_cb_${suffix()}` },
      ]);
      await createListing(client, listingId, issuerId);
      await client.query(
        `INSERT INTO coOwn_assets (
           id, listing_id, issuer_id, title, total_units, available_units,
           unit_price_gbp, unit_price_stable, settlement_mode, is_open
         )
         VALUES ($1, $2, $3, 'Invariant asset', 20, 0, 4, 4, 'ONEZE', TRUE)`,
        [assetId, listingId, issuerId],
      );
      await client.query(
        `INSERT INTO coOwn_holdings (user_id, asset_id, units_owned, avg_entry_price_gbp, realized_pnl_gbp)
         VALUES ($1, $2, 20, 4, 0)`,
        [issuerId, assetId],
      );

      const assertConserved = async () => {
        const res = await client.query<{ held: string; available: string; total: string }>(
          `SELECT
             COALESCE((SELECT SUM(units_owned) FROM coOwn_holdings WHERE asset_id = $1), 0)::text AS held,
             available_units::text AS available,
             total_units::text AS total
           FROM coOwn_assets WHERE id = $1`,
          [assetId],
        );
        const row = res.rows[0];
        assert.equal(
          Number(row.held) + Number(row.available),
          Number(row.total),
          'SUM(holdings.units_owned) + available_units must equal total_units',
        );
      };

      // Mirror of applyCoOwnTransfer's holding swap: seller decrement is
      // guarded by a units_owned >= units predicate; buyer is upserted.
      const transfer = async (units: number) => {
        const sellerRes = await client.query(
          `UPDATE coOwn_holdings
           SET units_owned = units_owned - $3
           WHERE user_id = $1 AND asset_id = $2 AND units_owned >= $3`,
          [issuerId, assetId, units],
        );
        if (!sellerRes.rowCount) {
          throw new Error('CO_OWN_SELLER_UNITS_INSUFFICIENT');
        }
        await client.query(
          `INSERT INTO coOwn_holdings (user_id, asset_id, units_owned, avg_entry_price_gbp, realized_pnl_gbp)
           VALUES ($1, $2, $3, 4, 0)
           ON CONFLICT (user_id, asset_id)
           DO UPDATE SET units_owned = coOwn_holdings.units_owned + EXCLUDED.units_owned`,
          [buyerA, assetId, units],
        );
      };

      await transfer(5);
      await assertConserved();
      await transfer(7);
      await assertConserved();

      // Seller now holds 8 — a 9-unit transfer must fail inside a savepoint
      // and leave every holding untouched.
      await client.query('SAVEPOINT before_bad_transfer');
      await assert.rejects(transfer(9), /INSUFFICIENT/);
      await client.query('ROLLBACK TO SAVEPOINT before_bad_transfer');
      await assertConserved();

      const sellerRow = await client.query<{ u: string }>(
        `SELECT units_owned::text AS u FROM coOwn_holdings WHERE user_id = $1 AND asset_id = $2`,
        [issuerId, assetId],
      );
      assert.equal(sellerRow.rows[0].u, '8');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  // ── R13: withdrawal reserve/settle/reverse keeps the wallet whole ───────
  it('withdrawal reserve→reverse restores the wallet exactly', async (t) => {
    if (!requireDb(t)) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = `inv_wd_user_${suffix()}`;
      const walletId = `inv_wal_${suffix()}`;
      await createUsers(client, [{ id: userId, username: `inv_wd_${suffix()}` }]);
      await createWallet(client, walletId, userId, 50_000n);

      // RESERVED: debit the wallet.
      const afterReserve = await applyWalletLedgerDelta(client, {
        walletId,
        txId: `inv_tx_wd_${suffix()}`,
        asset: '1ZE',
        amount: -30_000,
        kind: 'WITHDRAWAL_RESERVED',
        refType: 'withdrawal',
        refId: `inv_wd_${suffix()}`,
      });
      assert.equal(afterReserve, 20_000);

      // FAILED rail → REVERSED: credit back the exact reserved amount.
      const afterReverse = await applyWalletLedgerDelta(client, {
        walletId,
        txId: `inv_tx_wdr_${suffix()}`,
        asset: '1ZE',
        amount: 30_000,
        kind: 'WITHDRAWAL_REVERSED',
      });
      assert.equal(afterReverse, 50_000, 'reversal restores the pre-reserve balance');

      // Reserve more than the balance → rejected, balance intact.
      await assert.rejects(
        applyWalletLedgerDelta(client, {
          walletId,
          txId: `inv_tx_wd2_${suffix()}`,
          asset: '1ZE',
          amount: -60_000,
          kind: 'WITHDRAWAL_RESERVED',
        }),
        /insufficient/i,
      );
      const bal = await client.query<{ b: string }>(
        `SELECT oneze_balance_units::text AS b FROM wallets WHERE id = $1`,
        [walletId],
      );
      assert.equal(bal.rows[0].b, '50000');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  // ── P0-10: KYC capability gate on the settlement path ───────────────────
  it('denies settlement for unverified profiles and allows verified ones', async (t) => {
    if (!requireDb(t)) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const unverifiedId = `inv_kyc_u_${suffix()}`;
      const verifiedId = `inv_kyc_v_${suffix()}`;
      await createUsers(client, [
        { id: unverifiedId, username: `inv_ku_${suffix()}` },
        { id: verifiedId, username: `inv_kv_${suffix()}` },
      ]);

      // Fresh profile (auto-created by the gate): trading disabled,
      // sanctions unknown, KYC not started — settlement must fail closed.
      const fresh = await evaluateWalletCapability(client, unverifiedId, 'settlement', {
        currency: 'GBP',
      });
      assert.equal(fresh.allowed, false, 'unverified profile must not reach settlement');
      assert.match(
        fresh.code ?? '',
        /WALLET_CAPABILITY/,
        'denial must carry a machine-readable capability code',
      );

      // Fully cleared profile: KYC verified, sanctions clear, low AML tier,
      // trading enabled → the gate admits settlement.
      await client.query(
        `INSERT INTO user_compliance_profiles (
           user_id, country_code, kyc_status, kyc_level, document_status,
           liveness_status, sanctions_status, pep_status, aml_risk_tier, trading_enabled
         )
         VALUES ($1, 'GB', 'verified', 'basic', 'approved', 'passed', 'clear', 'clear', 'low', TRUE)`,
        [verifiedId],
      );
      const cleared = await evaluateWalletCapability(client, verifiedId, 'settlement', {
        currency: 'GBP',
      });
      assert.equal(
        cleared.allowed,
        true,
        `verified+clear profile must reach settlement (got ${cleared.code}: ${cleared.reason ?? ''})`,
      );

      // Sanctions-blocked profile is denied even with verified KYC.
      const blockedId = `inv_kyc_b_${suffix()}`;
      await createUsers(client, [{ id: blockedId, username: `inv_kb_${suffix()}` }]);
      await client.query(
        `INSERT INTO user_compliance_profiles (
           user_id, country_code, kyc_status, kyc_level, document_status,
           liveness_status, sanctions_status, pep_status, aml_risk_tier, trading_enabled
         )
         VALUES ($1, 'GB', 'verified', 'basic', 'approved', 'passed', 'blocked', 'clear', 'low', TRUE)`,
        [blockedId],
      );
      const blocked = await evaluateWalletCapability(client, blockedId, 'settlement', {
        currency: 'GBP',
      });
      assert.equal(blocked.allowed, false);
      assert.equal(blocked.code, 'WALLET_CAPABILITY_SANCTIONS_BLOCK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });
});
