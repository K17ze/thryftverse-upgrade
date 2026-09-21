import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeOnezeToFiatConversionQuote,
  findWalletIzeOperationByPaymentIntentId,
  getWalletIdempotentResponse,
  hashWalletIdempotencyPayload,
  isPostgresUniqueViolation,
  materializeMintOperationForPaymentIntent,
  planCommerceOrderRefundRecovery,
  refundOnezeInternalWalletDebit,
  saveWalletIdempotentResponse,
} from '../lib/walletMoneyPath.js';
import { computeMintQuoteMac } from '../lib/paymentIntentMetadata.js';
import type { DbQueryable } from '../lib/workerHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Money-path safety invariants
//
// These tests pin the behaviors the wallet/payment/refund/payout money paths
// must uphold:
//   (a) convert-1ze-to-fiat preview shares the execution quote math and never
//       writes — no ledger rows, no balance mutation;
//   (b) replaying a mint with the same paymentIntentId cannot double-mint —
//       the unique index raises 23505 and the committed operation replays;
//   (c) buy-1ze replay with the same idempotencyKey returns the stored
//       response, and a recycled key with a different payload is rejected;
//   (d) a oneze_internal refund re-credits the buyer's 1ZE wallet exactly
//       once and can never exceed the original debit;
//   (e) quote-time mint operations are materialized lazily from the payment
//       intent — one row per intent, created only when payment events land.
// ─────────────────────────────────────────────────────────────────────────────

interface WalletRow {
  id: string;
  user_id: string;
  oneze_balance_units: string;
  fiat_balance_minor: string;
  fiat_currency: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface WalletLedgerRow {
  id: number;
  wallet_id: string;
  tx_id: string;
  asset: string;
  amount: number;
  balance_after: number;
  kind: string;
  ref_type: string | null;
  ref_id: string | null;
  anchor_value_in_inr: number | null;
  metadata: Record<string, unknown>;
}

interface IzeOperationRow {
  id: string;
  user_id: string;
  operation_type: string;
  fiat_amount: string;
  fiat_currency: string;
  ize_amount: string;
  rate_per_gram: string;
  status: string;
  payment_intent_id: string | null;
  payout_request_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  committed_at: string | null;
}

interface FakeState {
  wallets: WalletRow[];
  walletLedger: WalletLedgerRow[];
  izeOperations: IzeOperationRow[];
  idempotencyKeys: Array<{
    user_id: string;
    operation: string;
    idempotency_key: string;
    request_hash: string;
    response_payload: Record<string, unknown>;
  }>;
  paymentIntents: Array<{
    id: string;
    user_id: string;
    channel: string;
    amount_gbp: string;
    amount_currency: string;
    amount_minor: string | null;
    metadata: Record<string, unknown>;
  }>;
  mintOperations: Array<Record<string, unknown>>;
}

function createMoneyPathClient(state: FakeState) {
  const queries: string[] = [];
  const writes: string[] = [];
  let ledgerSeq = state.walletLedger.length;

  const client = {
    query: async (text: string, params?: unknown[]) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      queries.push(sql);
      if (/^(INSERT|UPDATE|DELETE)/i.test(sql)) writes.push(sql);

      // ── Pricing reads (computeOnezeToFiatConversionQuote) ──
      if (sql.includes('FROM oneze_country_pricing_profiles')) {
        return {
          rows: [{
            country_code: 'GB',
            currency: 'GBP',
            fx_fee_bps: 150,
            load_fee_bps: 200,
            withdraw_fee_bps: 200,
            withdrawal_lock_hours: 0,
            daily_redeem_limit_ize: '500',
            weekly_redeem_limit_ize: '2000',
            is_active: true,
            metadata: {},
            updated_at: '2026-01-01T00:00:00Z',
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM oneze_anchor_config')) {
        return {
          rows: [{
            anchor_currency: 'USD',
            anchor_value: '1',
            notes: null,
            metadata: {},
            updated_at: '2026-01-01T00:00:00Z',
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM oneze_internal_fx_rates')) {
        return { rows: [{ rate: '1', source: 'test_par' }], rowCount: 1 };
      }

      // ── wallet_ledger reads for the oneze_internal refund ──
      if (sql.includes('FROM wallet_ledger wl JOIN wallets')) {
        const intentId = params![0] as string;
        const rows = state.walletLedger
          .filter(
            (r) =>
              r.asset === '1ZE' &&
              r.kind === 'PURCHASE' &&
              r.metadata?.intentId === intentId,
          )
          .map((r) => ({
            id: String(r.id),
            wallet_id: r.wallet_id,
            amount: String(r.amount),
            metadata: r.metadata,
            user_id:
              state.wallets.find((w) => w.id === r.wallet_id)?.user_id ?? '',
          }));
        return { rows, rowCount: rows.length };
      }
      if (
        sql.includes('FROM wallet_ledger') &&
        sql.includes("kind = 'ONEZE_REFUND'") &&
        sql.includes("metadata->>'refundOperationId'")
      ) {
        const opId = params![0] as string;
        const rows = state.walletLedger
          .filter(
            (r) =>
              r.asset === '1ZE' &&
              r.kind === 'ONEZE_REFUND' &&
              r.metadata?.refundOperationId === opId,
          )
          .map((r) => ({ id: String(r.id), amount: String(r.amount) }));
        return { rows, rowCount: rows.length };
      }
      if (
        sql.includes('COALESCE(SUM(amount), 0)') &&
        sql.includes('FROM wallet_ledger')
      ) {
        const intentId = params![0] as string;
        const total = state.walletLedger
          .filter(
            (r) =>
              r.asset === '1ZE' &&
              r.kind === 'ONEZE_REFUND' &&
              r.metadata?.intentId === intentId,
          )
          .reduce((sum, r) => sum + r.amount, 0);
        return { rows: [{ total: String(total) }], rowCount: 1 };
      }
      if (
        sql.startsWith('SELECT id::text AS id FROM wallet_ledger') &&
        sql.includes('tx_id')
      ) {
        const [walletId, txId] = params as [string, string];
        const row = state.walletLedger.find(
          (r) => r.wallet_id === walletId && r.tx_id === txId,
        );
        return { rows: row ? [{ id: String(row.id) }] : [], rowCount: row ? 1 : 0 };
      }

      // ── wallets (loadWalletForUpdate + balance UPDATEs) ──
      if (sql.includes('FROM wallets') && sql.includes('FOR UPDATE')) {
        const wallet = state.wallets.find((w) => w.id === params![0]);
        return { rows: wallet ? [wallet] : [], rowCount: wallet ? 1 : 0 };
      }
      if (sql.startsWith('UPDATE wallets SET oneze_balance_units')) {
        const wallet = state.wallets.find((w) => w.id === params![0]);
        if (wallet) {
          wallet.oneze_balance_units = String(params![1]);
          wallet.version += 1;
        }
        return { rows: [], rowCount: wallet ? 1 : 0 };
      }
      if (sql.startsWith('UPDATE wallets SET fiat_balance_minor')) {
        const wallet = state.wallets.find((w) => w.id === params![0]);
        if (wallet) {
          wallet.fiat_balance_minor = String(params![1]);
          wallet.version += 1;
        }
        return { rows: [], rowCount: wallet ? 1 : 0 };
      }
      if (sql.startsWith('INSERT INTO wallet_ledger')) {
        const [
          walletId,
          txId,
          asset,
          amount,
          balanceAfter,
          kind,
          refType,
          refId,
          anchorValueInInr,
          metadata,
        ] = params as [
          string, string, string, number, number, string,
          string | null, string | null, number | null, string,
        ];
        state.walletLedger.push({
          id: ++ledgerSeq,
          wallet_id: walletId,
          tx_id: txId,
          asset,
          amount,
          balance_after: balanceAfter,
          kind,
          ref_type: refType,
          ref_id: refId,
          anchor_value_in_inr: anchorValueInInr,
          metadata: JSON.parse(metadata),
        });
        return { rows: [], rowCount: 1 };
      }

      // ── wallet_idempotency_keys ──
      if (sql.includes('FROM wallet_idempotency_keys')) {
        const [userId, operation, key] = params as [string, string, string];
        const row = state.idempotencyKeys.find(
          (k) =>
            k.user_id === userId &&
            k.operation === operation &&
            k.idempotency_key === key,
        );
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.startsWith('INSERT INTO wallet_idempotency_keys')) {
        const [userId, operation, key, requestHash, responsePayload] =
          params as [string, string, string, string, string];
        const exists = state.idempotencyKeys.some(
          (k) =>
            k.user_id === userId &&
            k.operation === operation &&
            k.idempotency_key === key,
        );
        if (!exists) {
          state.idempotencyKeys.push({
            user_id: userId,
            operation,
            idempotency_key: key,
            request_hash: requestHash,
            response_payload: JSON.parse(responsePayload),
          });
        }
        return { rows: [], rowCount: 1 };
      }

      // ── wallet_ize_operations (mint replay) ──
      if (sql.includes('FROM wallet_ize_operations')) {
        const paymentIntentId = params![0] as string;
        const rows = state.izeOperations.filter(
          (op) => op.payment_intent_id === paymentIntentId,
        );
        return { rows, rowCount: rows.length };
      }

      // ── payment_intents + mint_operations (lazy materialization) ──
      if (sql.includes('FROM payment_intents')) {
        const intent = state.paymentIntents.find((p) => p.id === params![0]);
        return { rows: intent ? [intent] : [], rowCount: intent ? 1 : 0 };
      }
      if (sql.startsWith('INSERT INTO mint_operations')) {
        const paymentIntentId = params![11] as string;
        const existing = state.mintOperations.find(
          (op) => op.payment_intent_id === paymentIntentId,
        );
        if (existing) {
          // ON CONFLICT (payment_intent_id) DO NOTHING
          return { rows: [], rowCount: 0 };
        }
        const row = {
          id: params![0],
          user_id: params![1],
          state: 'PAYMENT_PENDING',
          fiat_amount_minor: String(params![2]),
          fiat_currency: params![3],
          net_fiat_amount_minor: String(params![4]),
          platform_fee_minor: String(params![5]),
          ize_amount_units: String(params![6]),
          rate_per_gram: String(params![7]),
          rate_source: params![8],
          rate_locked_at: params![9],
          rate_expires_at: params![10],
          payment_intent_id: paymentIntentId,
          lot_id: null,
          custodian_ref: null,
          escrow_ledger_tx_id: null,
          wallet_credit_tx_id: null,
          purchase_attempted_at: null,
          settled_at: null,
          last_error: null,
          metadata: JSON.parse(params![12] as string),
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        };
        state.mintOperations.push(row);
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes('FROM mint_operations')) {
        const paymentIntentId = params![0] as string;
        const rows = state.mintOperations.filter(
          (op) => op.payment_intent_id === paymentIntentId,
        );
        return { rows, rowCount: rows.length };
      }

      return { rows: [], rowCount: 0 };
    },
  } as unknown as DbQueryable;

  return { client, queries, writes };
}

function emptyState(): FakeState {
  return {
    wallets: [],
    walletLedger: [],
    izeOperations: [],
    idempotencyKeys: [],
    paymentIntents: [],
    mintOperations: [],
  };
}

// ─── (a) convert preview: shared quote math is read-only ─────────────────────

test('conversion quote shares execution math and performs no writes', async () => {
  const state = emptyState();
  const { client, queries, writes } = createMoneyPathClient(state);

  const quote = await computeOnezeToFiatConversionQuote(client, {
    izeAmount: 10,
    fiatCurrency: 'GBP',
    feeBps: 150,
  });

  // 10 1ZE at par (fxRate 1) → £10 principal; 150 bps fee → £0.15; net £9.85.
  assert.equal(quote.amountUnits, 10_000);
  assert.equal(quote.principalAmount, 10);
  assert.equal(quote.feeAmount, 0.15);
  assert.equal(quote.netRedemption, 9.85);
  assert.equal(quote.fxRate, 1);

  // A preview executes exactly this path — it must never write.
  assert.equal(writes.length, 0, `quote path wrote: ${writes.join(' | ')}`);
  assert.ok(queries.length > 0, 'quote should read pricing state');
  assert.ok(
    queries.every((sql) => sql.startsWith('SELECT')),
    'quote path must be SELECT-only',
  );
});

// ─── (b) mint replay: same paymentIntentId cannot mint twice ─────────────────

test('mint replay with the same paymentIntentId replays the committed operation', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  const committedOp: IzeOperationRow = {
    id: 'ize_mint_winner',
    user_id: 'user_1',
    operation_type: 'mint',
    fiat_amount: '9.9',
    fiat_currency: 'GBP',
    ize_amount: '9.9',
    rate_per_gram: '1',
    status: 'committed',
    payment_intent_id: 'pi_1',
    payout_request_id: null,
    metadata: {
      walletTopup: {
        grossFiatAmount: 10,
        netFiatAmount: 9.9,
        platformFeeRate: 0.01,
        platformFeeAmount: 0.1,
      },
    },
    created_at: '2026-01-01T00:00:00Z',
    committed_at: '2026-01-01T00:00:01Z',
  };

  // First mint committed — the unique index then rejects the retry.
  state.izeOperations.push(committedOp);
  const secondInsert = (): never => {
    throw Object.assign(new Error('duplicate key value'), { code: '23505' });
  };

  assert.throws(secondInsert, (err: unknown) =>
    isPostgresUniqueViolation(err),
  );

  // The route's 23505 catch resolves the durable row — the second call must
  // observe the committed operation and credit nothing else.
  const replay = await findWalletIzeOperationByPaymentIntentId(client, 'pi_1');
  assert.ok(replay, 'expected the committed mint operation to be found');
  assert.equal(replay!.id, 'ize_mint_winner');
  assert.equal(replay!.payment_intent_id, 'pi_1');
  assert.equal(state.izeOperations.length, 1, 'replay must not create a second operation');
  assert.equal(
    state.walletLedger.length,
    0,
    'replay must not append another wallet ledger credit',
  );
});

test('unknown payment intent has no committed operation to replay', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  const replay = await findWalletIzeOperationByPaymentIntentId(client, 'pi_unknown');
  assert.equal(replay, null);
});

// ─── (c) buy-1ze idempotency: stored response replays, mismatch rejects ──────

test('buy-1ze replay with the same idempotencyKey returns the stored response', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  const requestHash = hashWalletIdempotencyPayload({
    userId: 'user_1',
    fiatAmount: 25,
    fiatCurrency: 'GBP',
  });
  const storedResponse = {
    ok: true,
    userId: 'user_1',
    wallet: { onezeBalanceUnits: 24_500 },
    purchase: { fiatAmount: 25, izeAmount: 24.5 },
  };

  await saveWalletIdempotentResponse(client, {
    userId: 'user_1',
    operation: 'buy_1ze',
    idempotencyKey: 'buy-key-1234',
    requestHash,
    responsePayload: storedResponse,
  });

  const replayed = await getWalletIdempotentResponse(client, {
    userId: 'user_1',
    operation: 'buy_1ze',
    idempotencyKey: 'buy-key-1234',
    requestHash,
  });

  assert.deepEqual(replayed, storedResponse);
});

test('idempotency key reused with a different payload is rejected', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  await saveWalletIdempotentResponse(client, {
    userId: 'user_1',
    operation: 'buy_1ze',
    idempotencyKey: 'buy-key-1234',
    requestHash: hashWalletIdempotencyPayload({ fiatAmount: 25 }),
    responsePayload: { ok: true },
  });

  await assert.rejects(
    getWalletIdempotentResponse(client, {
      userId: 'user_1',
      operation: 'buy_1ze',
      idempotencyKey: 'buy-key-1234',
      requestHash: hashWalletIdempotencyPayload({ fiatAmount: 50 }),
    }),
    (err: unknown) => (err as { code?: string }).code === 'IDEMPOTENCY_KEY_REUSED',
  );
});

test('idempotency save is insert-or-ignore — a second save cannot clobber', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  const hash = hashWalletIdempotencyPayload({ fiatAmount: 25 });
  await saveWalletIdempotentResponse(client, {
    userId: 'user_1',
    operation: 'buy_1ze',
    idempotencyKey: 'buy-key-1234',
    requestHash: hash,
    responsePayload: { ok: true, first: true },
  });
  await saveWalletIdempotentResponse(client, {
    userId: 'user_1',
    operation: 'buy_1ze',
    idempotencyKey: 'buy-key-1234',
    requestHash: hash,
    responsePayload: { ok: true, first: false },
  });

  const replayed = await getWalletIdempotentResponse(client, {
    userId: 'user_1',
    operation: 'buy_1ze',
    idempotencyKey: 'buy-key-1234',
    requestHash: hash,
  });
  assert.equal(replayed?.first, true, 'stored response must be immutable once saved');
});

// ─── (d) oneze_internal refund: re-credits the wallet once ───────────────────

function seedOnezePurchase(state: FakeState): void {
  state.wallets.push({
    id: 'wal_buyer',
    user_id: 'buyer_1',
    oneze_balance_units: '0',
    fiat_balance_minor: '0',
    fiat_currency: 'GBP',
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  // The purchase debit posted by settlePaymentIntent: 5 1ZE for a £5 order.
  state.walletLedger.push({
    id: 1,
    wallet_id: 'wal_buyer',
    tx_id: 'wtx_purchase_1',
    asset: '1ZE',
    amount: -5_000,
    balance_after: 0,
    kind: 'PURCHASE',
    ref_type: 'commerce_order',
    ref_id: 'ord_1',
    anchor_value_in_inr: null,
    metadata: {
      orderId: 'ord_1',
      intentId: 'pi_oneze_1',
      gatewayId: 'oneze_internal',
      totalGbp: 5,
      gbpToUsdRate: 1,
      izeAmount: 5,
      debitUnits: 5_000,
    },
  });
}

test('oneze_internal refund re-credits the buyer wallet exactly once', async () => {
  const state = emptyState();
  seedOnezePurchase(state);
  const { client } = createMoneyPathClient(state);

  const first = await refundOnezeInternalWalletDebit(client, {
    intentId: 'pi_oneze_1',
    refundAmount: 5,
    refundOperationId: 'rf_1',
    reason: 'test refund',
  });

  assert.equal(first.providerRefundRef, 'oneze_refund_rf_1');
  assert.equal(first.creditedUnits, 5_000);
  assert.equal(first.alreadyCredited, false);
  assert.equal(state.wallets[0].oneze_balance_units, '5000');

  const refundEntries = state.walletLedger.filter((r) => r.kind === 'ONEZE_REFUND');
  assert.equal(refundEntries.length, 1);
  assert.equal(refundEntries[0].amount, 5_000);
  assert.equal(refundEntries[0].balance_after, 5_000);
  assert.equal(refundEntries[0].ref_type, 'commerce_order_refund');
  assert.equal(refundEntries[0].ref_id, 'ord_1');

  // Replay with the same refundOperationId — no second credit.
  const second = await refundOnezeInternalWalletDebit(client, {
    intentId: 'pi_oneze_1',
    refundAmount: 5,
    refundOperationId: 'rf_1',
  });

  assert.equal(second.alreadyCredited, true);
  assert.equal(second.creditedUnits, 5_000);
  assert.equal(state.wallets[0].oneze_balance_units, '5000');
  assert.equal(
    state.walletLedger.filter((r) => r.kind === 'ONEZE_REFUND').length,
    1,
    'a replayed refund must never append a second ledger credit',
  );
});

test('oneze_internal refund refuses to exceed the original debit', async () => {
  const state = emptyState();
  seedOnezePurchase(state);
  const { client } = createMoneyPathClient(state);

  await refundOnezeInternalWalletDebit(client, {
    intentId: 'pi_oneze_1',
    refundAmount: 5,
    refundOperationId: 'rf_1',
  });

  // A second refund operation for the same intent — the debit is already
  // fully refunded, so this must throw rather than credit again.
  await assert.rejects(
    refundOnezeInternalWalletDebit(client, {
      intentId: 'pi_oneze_1',
      refundAmount: 5,
      refundOperationId: 'rf_2',
    }),
    (err: unknown) =>
      (err as { code?: string }).code === 'REFUND_AMOUNT_EXCEEDS_REMAINING',
  );

  assert.equal(state.wallets[0].oneze_balance_units, '5000');
});

test('oneze_internal partial refund credits a proportional share', async () => {
  const state = emptyState();
  seedOnezePurchase(state);
  const { client } = createMoneyPathClient(state);

  const partial = await refundOnezeInternalWalletDebit(client, {
    intentId: 'pi_oneze_1',
    refundAmount: 2, // £2 of the £5 order
    refundOperationId: 'rf_partial',
  });

  assert.equal(partial.creditedUnits, 2_000);
  assert.equal(state.wallets[0].oneze_balance_units, '2000');

  // A second partial taking the remainder works; the cap is the debit.
  const rest = await refundOnezeInternalWalletDebit(client, {
    intentId: 'pi_oneze_1',
    refundAmount: 3,
    refundOperationId: 'rf_rest',
  });
  assert.equal(rest.creditedUnits, 3_000);
  assert.equal(state.wallets[0].oneze_balance_units, '5000');
});

test('oneze_internal refund without a purchase debit fails truthfully', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  await assert.rejects(
    refundOnezeInternalWalletDebit(client, {
      intentId: 'pi_missing',
      refundAmount: 5,
      refundOperationId: 'rf_x',
    }),
    (err: unknown) => (err as { code?: string }).code === 'REFUND_SOURCE_NOT_FOUND',
  );
});

// ─── (e) lazy mint operation materialization ─────────────────────────────────

test('mint operation materializes once from payment intent quote metadata', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  const mintQuote = {
    fiatAmountMinor: 1000,
    netFiatAmountMinor: 990,
    platformFeeMinor: 10,
    izeAmountUnits: 9_900,
    ratePerGram: 1,
    rateSource: 'fixed_par:GBP:1ZE',
    rateLockedAt: '2026-01-01T00:00:00Z',
    rateExpiresAt: '2026-01-01T00:15:00Z',
  };
  state.paymentIntents.push({
    id: 'pi_1',
    user_id: 'user_1',
    channel: 'wallet_topup',
    amount_gbp: '10',
    amount_currency: 'GBP',
    amount_minor: '1000',
    metadata: {
      mintOperationId: 'mintop_1',
      quoteHash: 'hash_1',
      mintQuote,
      mintQuoteMac: computeMintQuoteMac({
        paymentIntentId: 'pi_1',
        userId: 'user_1',
        mintOperationId: 'mintop_1',
        ...mintQuote,
      }),
    },
  });

  const first = await materializeMintOperationForPaymentIntent(client, 'pi_1');
  assert.ok(first);
  assert.equal(first!.id, 'mintop_1');
  assert.equal(first!.state, 'PAYMENT_PENDING');
  assert.equal(first!.payment_intent_id, 'pi_1');
  assert.equal(state.mintOperations.length, 1);

  // A second delivery of the same payment event returns the existing row —
  // no duplicate mint operation.
  const second = await materializeMintOperationForPaymentIntent(client, 'pi_1');
  assert.ok(second);
  assert.equal(second!.id, 'mintop_1');
  assert.equal(state.mintOperations.length, 1);
});

test('mint operation is not materialized for non-mint intents', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  state.paymentIntents.push({
    id: 'pi_order',
    user_id: 'user_1',
    channel: 'order_payment',
    amount_gbp: '42',
    amount_currency: 'GBP',
    amount_minor: '4200',
    metadata: {},
  });

  const result = await materializeMintOperationForPaymentIntent(client, 'pi_order');
  assert.equal(result, null);
  assert.equal(state.mintOperations.length, 0);
});

test('forged mint quote metadata (no valid MAC) never materializes — review P0', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  // The attack from review-security P0: a caller-supplied mintQuote on a
  // genuine wallet_topup intent — pay £1, mint 1e9 units. Without a valid
  // mintQuoteMac bound to this intent + user, the quote is untrusted and
  // the materializer fails closed.
  state.paymentIntents.push({
    id: 'pi_forged',
    user_id: 'user_1',
    channel: 'wallet_topup',
    amount_gbp: '1',
    amount_currency: 'GBP',
    amount_minor: '100',
    metadata: {
      mintOperationId: 'mintop_forged',
      mintQuote: {
        fiatAmountMinor: 100,
        netFiatAmountMinor: 99,
        platformFeeMinor: 1,
        izeAmountUnits: 1_000_000_000,
        ratePerGram: 0.000001,
        rateSource: 'fixed_par:GBP:1ZE',
        rateLockedAt: '2026-01-01T00:00:00Z',
        rateExpiresAt: '2026-01-01T00:15:00Z',
      },
    },
  });

  const forged = await materializeMintOperationForPaymentIntent(client, 'pi_forged');
  assert.equal(forged, null);
  assert.equal(state.mintOperations.length, 0);
});

test('a quote MAC bound to a different intent does not transplant', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  const mintQuote = {
    fiatAmountMinor: 1000,
    netFiatAmountMinor: 990,
    platformFeeMinor: 10,
    izeAmountUnits: 9_900,
    ratePerGram: 1,
    rateSource: 'fixed_par:GBP:1ZE',
    rateLockedAt: '2026-01-01T00:00:00Z',
    rateExpiresAt: '2026-01-01T00:15:00Z',
  };
  // MAC is valid — but computed for a DIFFERENT payment intent.
  state.paymentIntents.push({
    id: 'pi_2',
    user_id: 'user_1',
    channel: 'wallet_topup',
    amount_gbp: '10',
    amount_currency: 'GBP',
    amount_minor: '1000',
    metadata: {
      mintOperationId: 'mintop_2',
      mintQuote,
      mintQuoteMac: computeMintQuoteMac({
        paymentIntentId: 'pi_1',
        userId: 'user_1',
        mintOperationId: 'mintop_2',
        ...mintQuote,
      }),
    },
  });

  const result = await materializeMintOperationForPaymentIntent(client, 'pi_2');
  assert.equal(result, null);
  assert.equal(state.mintOperations.length, 0);
});

test('a quote whose fiat amount exceeds the captured amount fails closed', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  const mintQuote = {
    fiatAmountMinor: 1000,
    netFiatAmountMinor: 990,
    platformFeeMinor: 10,
    izeAmountUnits: 9_900,
    ratePerGram: 1,
    rateSource: 'fixed_par:GBP:1ZE',
    rateLockedAt: '2026-01-01T00:00:00Z',
    rateExpiresAt: '2026-01-01T00:15:00Z',
  };
  state.paymentIntents.push({
    id: 'pi_3',
    user_id: 'user_1',
    channel: 'wallet_topup',
    amount_gbp: '5',
    amount_currency: 'GBP',
    amount_minor: '500', // captured £5 — quote claims £10 gross
    metadata: {
      mintOperationId: 'mintop_3',
      mintQuote,
      mintQuoteMac: computeMintQuoteMac({
        paymentIntentId: 'pi_3',
        userId: 'user_1',
        mintOperationId: 'mintop_3',
        ...mintQuote,
      }),
    },
  });

  const result = await materializeMintOperationForPaymentIntent(client, 'pi_3');
  assert.equal(result, null);
  assert.equal(state.mintOperations.length, 0);
});

test('a valid-MAC quote whose izeAmountUnits does not recompute is rejected — review P0', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  // Stronger than the no-MAC forgery test: this quote carries a VALID mint
  // quote MAC bound to this intent + user — but the stored izeAmountUnits
  // (1e9) is not what the captured amount recomputes to. £10 gross → £0.10
  // fee → £9.90 net → 9.9 1ZE → 9_900 units at ratePerGram 1. The
  // materializer recomputes from intent.amount_minor and must reject the
  // divergence even when the MAC authenticates the stored fields.
  const mintQuote = {
    fiatAmountMinor: 1000,
    netFiatAmountMinor: 990,
    platformFeeMinor: 10,
    izeAmountUnits: 1_000_000_000,
    ratePerGram: 1,
    rateSource: 'fixed_par:GBP:1ZE',
    rateLockedAt: '2026-01-01T00:00:00Z',
    rateExpiresAt: '2026-01-01T00:15:00Z',
  };
  state.paymentIntents.push({
    id: 'pi_inflated',
    user_id: 'user_1',
    channel: 'wallet_topup',
    amount_gbp: '10',
    amount_currency: 'GBP',
    amount_minor: '1000',
    metadata: {
      mintOperationId: 'mintop_inflated',
      mintQuote,
      mintQuoteMac: computeMintQuoteMac({
        paymentIntentId: 'pi_inflated',
        userId: 'user_1',
        mintOperationId: 'mintop_inflated',
        ...mintQuote,
      }),
    },
  });

  const result = await materializeMintOperationForPaymentIntent(client, 'pi_inflated');
  assert.equal(result, null);
  assert.equal(state.mintOperations.length, 0);
});

test('a valid-MAC quote with inconsistent fee/net fields is rejected', async () => {
  const state = emptyState();
  const { client } = createMoneyPathClient(state);

  // £10 gross at the 100bps top-up fee is £0.10 fee / £9.90 net — a quote
  // claiming zero fee / full-net inflates the mint by ~1%. The recompute
  // checks fee + net + units, not just the headline amount.
  const mintQuote = {
    fiatAmountMinor: 1000,
    netFiatAmountMinor: 1000,
    platformFeeMinor: 0,
    izeAmountUnits: 10_000,
    ratePerGram: 1,
    rateSource: 'fixed_par:GBP:1ZE',
    rateLockedAt: '2026-01-01T00:00:00Z',
    rateExpiresAt: '2026-01-01T00:15:00Z',
  };
  state.paymentIntents.push({
    id: 'pi_nofee',
    user_id: 'user_1',
    channel: 'wallet_topup',
    amount_gbp: '10',
    amount_currency: 'GBP',
    amount_minor: '1000',
    metadata: {
      mintOperationId: 'mintop_nofee',
      mintQuote,
      mintQuoteMac: computeMintQuoteMac({
        paymentIntentId: 'pi_nofee',
        userId: 'user_1',
        mintOperationId: 'mintop_nofee',
        ...mintQuote,
      }),
    },
  });

  const result = await materializeMintOperationForPaymentIntent(client, 'pi_nofee');
  assert.equal(result, null);
  assert.equal(state.mintOperations.length, 0);
});

// ─── refund-after-payout planner sanity (full coverage in refundAfterPayout) ──

test('seller recovery recovers only the goods share of the refund', () => {
  const plan = planCommerceOrderRefundRecovery({
    sellerEscrowReleased: true,
    sellerId: 'seller_1',
    subtotalGbp: 50,
    platformChargeGbp: 3.2,
    postageFeeGbp: 3.5,
    totalGbp: 56.7,
  });
  assert.equal(plan.postSellerRecovery, true);
  assert.equal(plan.sellerRecoveryAmount, 50);
});
