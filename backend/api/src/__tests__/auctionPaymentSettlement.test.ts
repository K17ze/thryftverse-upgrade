import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

// ─────────────────────────────────────────────────────────────────────────────
// FIN-01 / FIN-09 — auction winner payment: pending → provider-verified paid
//
// Old behaviour: POST /auctions/:id/payment directly wrote status='settled',
// paid_at, a 'paid' order and ledger entries with no provider capture, and a
// retry after success hit the settled guard → 409 instead of replaying the
// stored result. These tests exercise the REAL route registrar and the REAL
// settlement helper against a SQL-inspecting fake client — every test below
// fails against the old handler.
// ─────────────────────────────────────────────────────────────────────────────

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/test';

const {
  registerAuctionLifecycleRoutes,
  settleAuctionWinForVerifiedIntent,
} = await import('../routes/auctions.js');

// routes/auctions.js → lib/workerRuntime.js → lib/queues.js owns eagerly
// reconnecting ioredis clients (queueConnection / workerConnection) that are
// not exported, so the event loop can never drain on its own. Close what we
// can, then release the process once every assertion has reported.
test.after(async () => {
  try {
    const { closeRedis } = await import('../lib/redis.js');
    await closeRedis();
  } finally {
    // Do NOT process.exit() here — it fires before the runner reports, which
    // masks per-test results and always exits 0. The runner passes
    // --test-force-exit (scripts/run-unit-tests.mjs) to terminate lingering
    // ioredis handles AFTER results and the exit code are settled.
  }
});

type RouteHandler = (request: any, reply: any) => Promise<any>;

function createRouteHarness() {
  const handlers = new Map<string, RouteHandler>();
  const app = {
    post(path: string, handler: RouteHandler) {
      handlers.set(`POST ${path}`, handler);
    },
    get(path: string, handler: RouteHandler) {
      handlers.set(`GET ${path}`, handler);
    },
    delete(path: string, handler: RouteHandler) {
      handlers.set(`DELETE ${path}`, handler);
    },
    async inject() {
      throw new Error('inject must be stubbed via createAuctionPaymentIntent');
    },
    log: { error() {} },
  } as unknown as FastifyInstance;
  return { app, handlers };
}

function createReply() {
  return {
    statusCode: 200,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
  };
}

const AUCTION = {
  id: 'auc_1',
  seller_id: 'seller_1',
  listing_id: 'listing_1',
  status: 'awaiting_payment',
  winner_bidder_id: 'winner_1',
  winner_bid_id: 42,
  current_bid_gbp: '50.00',
  cancelled_at: null,
  settled_at: null,
  paid_at: null,
};

function makeRouteDb(opts: {
  auction: Record<string, unknown> | null;
  orders?: Record<string, unknown>[];
  latestIntent?: Record<string, unknown> | null;
  sellerReachState?: string | null;
  bids?: Record<string, unknown>[];
  /** Simulate the payment_intents_auction_live_uidx conflict: the bind
   *  UPDATE throws 23505 once (a concurrent attempt committed first). */
  bindConflictOnce?: boolean;
}) {
  const statements: string[] = [];
  const calls: { sql: string; params: unknown[] }[] = [];
  let bindConflictArmed = opts.bindConflictOnce === true;
  const query = async (sql: string, params?: unknown[]) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    statements.push(normalized);
    calls.push({ sql: normalized, params: params ?? [] });
    // The post-mint server-side binding write — simulate losing the
    // concurrent-mint race on the live-intent unique index.
    if (
      bindConflictArmed
      && normalized.startsWith('UPDATE payment_intents')
      && normalized.includes('metadata')
    ) {
      bindConflictArmed = false;
      throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    }
    if (normalized.includes('FROM auctions')) {
      return { rowCount: opts.auction ? 1 : 0, rows: opts.auction ? [opts.auction] : [] };
    }
    if (normalized.includes('FROM payment_intents')) {
      // Under bindConflictOnce, no bound intent exists until the losing
      // bind fires — Phase A sees nothing, the post-conflict re-lookup sees
      // the winner's committed attempt.
      if (opts.bindConflictOnce && bindConflictArmed) {
        return { rowCount: 0, rows: [] };
      }
      return {
        rowCount: opts.latestIntent ? 1 : 0,
        rows: opts.latestIntent ? [opts.latestIntent] : [],
      };
    }
    if (normalized.includes('FROM auction_bids')) {
      const rows = opts.bids ?? [];
      return { rowCount: rows.length, rows };
    }
    if (normalized.includes('FROM users')) {
      return {
        rowCount: 1,
        rows: [{
          reach_state: opts.sellerReachState ?? 'normal',
          reach_reason: null,
          reach_set_at: null,
        }],
      };
    }
    if (normalized.includes('FROM orders')) {
      const rows = opts.orders ?? [];
      return { rowCount: rows.length, rows };
    }
    return { rowCount: 1, rows: [] };
  };
  const client = {
    query,
    release() {},
  };
  const db = {
    async connect() {
      return client;
    },
    query,
  } as unknown as Pool;
  return { db, statements, calls };
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    authUser: { userId: 'winner_1', role: 'user' },
    params: { auctionId: 'auc_1' },
    body: { idempotencyKey: 'pay-key-1' },
    headers: { authorization: 'Bearer test-token' },
    log: { error() {}, info() {}, warn() {} },
    ...overrides,
  };
}

// ── Winner pay: pending → verified-paid transition ──────────────────────

test('winner pay mints a provider intent and returns pending — no settle without verified capture', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements, calls } = makeRouteDb({ auction: { ...AUCTION } });
  let capturedInput: Record<string, unknown> | null = null;

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async (input) => {
      capturedInput = input as unknown as Record<string, unknown>;
      return {
        statusCode: 200,
        body: {
          ok: true,
          intent: {
            id: 'pi_1',
            status: 'requires_confirmation',
            gatewayId: 'mollie_eu',
            clientSecret: null,
            nextActionUrl: 'https://pay.mollie.example/checkout',
            providerStatus: 'open',
          },
        },
      };
    },
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('POST /auctions/:auctionId/payment');
  assert.ok(handler);
  const result = await handler(makeRequest(), createReply());

  assert.equal(result.ok, true);
  assert.equal(result.paymentStatus, 'pending');
  assert.equal(result.intent?.id, 'pi_1');
  assert.equal(result.intent?.nextActionUrl, 'https://pay.mollie.example/checkout');
  assert.equal(result.auction?.status, 'awaiting_payment');

  // The canonical flow received server-derived money + auction linkage.
  assert.ok(capturedInput);
  const money = (capturedInput as { money: { currency: string; minorAmount: string } }).money;
  assert.equal(money.currency, 'GBP');
  // The intent must ride a PUBLIC gateway — with no explicit gatewayId the
  // canonical route defaults commerce to the oneze_internal rail, which can
  // never reach 'succeeded' for a card-sheet payment (wedges at
  // awaiting_payment forever).
  const gatewayId = (capturedInput as { gatewayId?: string }).gatewayId;
  assert.ok(gatewayId, 'expected an explicit gatewayId on the intent input');
  assert.notEqual(gatewayId, 'oneze_internal');
  assert.equal(money.minorAmount, '5000');
  assert.equal(
    (capturedInput as { idempotencyKey: string }).idempotencyKey,
    'auction-pay:auc_1:pay-key-1',
  );
  const metadata = (capturedInput as { metadata: Record<string, unknown> }).metadata;
  assert.equal(metadata.auctionId, 'auc_1');
  assert.equal(metadata.winnerBidderId, 'winner_1');
  assert.equal(metadata.source, 'auction_win');

  // CRITICAL: the old handler ran UPDATE auctions SET status='settled',
  // UPDATE listings SET status='sold' and INSERT INTO orders ... 'paid'
  // inside this request. None of that may happen before provider capture.
  assert.equal(
    statements.some((sql) => sql.includes("SET status = 'settled'")),
    false,
    'auction must not settle before verified provider capture',
  );
  assert.equal(
    statements.some(
      (sql) => sql.startsWith('INSERT INTO orders') && sql.includes("'paid'"),
    ),
    false,
    'no PAID order may be inserted before verified provider capture',
  );

  // SEP21-FIN-C: the canonical pending order IS provisioned before the
  // mint — 'created' status, winner's address terms, auction-source
  // reservation — and the intent binding write carries its order_id so the
  // verified capture settles through the canonical commerce branch.
  const orderInsert = calls.find((c) => c.sql.startsWith('INSERT INTO orders'));
  assert.ok(orderInsert, 'a pending canonical order must exist before mint');
  assert.ok(orderInsert.sql.includes("'created'"));
  assert.equal(orderInsert.params[1], 'winner_1'); // buyer_id
  assert.equal(orderInsert.params[2], 'seller_1'); // seller_id
  assert.equal(orderInsert.params[4], 48.5); // subtotal = winning bid − 3% fee
  assert.equal(orderInsert.params[5], 1.5); // buyer_protection_fee_gbp
  assert.equal(orderInsert.params[6], 50); // total_gbp = winning bid
  assert.equal(orderInsert.params[7], 'auc_1'); // claims orders.auction_id
  assert.ok(
    statements.some(
      (sql) =>
        sql.includes('listing_checkout_reservations') && sql.includes("'auction'"),
    ),
    'an auction-source reservation must arm the created→paid transition',
  );
  const bindUpdate = calls.find(
    (c) =>
      c.sql.startsWith('UPDATE payment_intents') && c.sql.includes('order_id'),
  );
  assert.ok(bindUpdate, 'the intent binding write must carry order_id');
  assert.ok(
    statements.some(
      (sql) =>
        sql.startsWith('UPDATE orders') && sql.includes('payment_intent_id'),
    ),
    'the order must be back-bound to the minted intent',
  );
});

test('duplicate winner-pay after settlement replays the stored result (FIN-09)', async () => {
  const { app, handlers } = createRouteHarness();
  const { db } = makeRouteDb({
    auction: { ...AUCTION, status: 'settled', settled_at: '2026-09-20T10:00:00Z', paid_at: '2026-09-20T10:00:00Z' },
    orders: [{ id: 'order_1' }],
  });
  let createCalled = false;

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => {
      createCalled = true;
      return { statusCode: 200, body: { ok: true, intent: { id: 'pi_x', status: 'requires_confirmation' } } };
    },
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('POST /auctions/:auctionId/payment');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(makeRequest(), reply);

  // Old behaviour: 409 AUCTION_SETTLED. The stored authoritative result
  // must replay instead.
  assert.equal(reply.statusCode, 200);
  assert.equal(result.ok, true);
  assert.equal(result.paymentStatus, 'paid');
  assert.equal(result.orderId, 'order_1');
  assert.equal(createCalled, false);
});

test('in-flight intent is replayed to the winner — no second provider payment', async () => {
  const { app, handlers } = createRouteHarness();
  const { db } = makeRouteDb({
    auction: { ...AUCTION },
    latestIntent: {
      id: 'pi_9',
      status: 'requires_confirmation',
      gateway_id: 'mollie_eu',
      client_secret: null,
      next_action_url: 'https://pay.mollie.example/checkout',
      provider_status: 'open',
      failure_code: null,
      failure_message: null,
    },
  });
  let createCalled = false;

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => {
      createCalled = true;
      return { statusCode: 200, body: { ok: true, intent: { id: 'pi_new', status: 'requires_confirmation' } } };
    },
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('POST /auctions/:auctionId/payment');
  assert.ok(handler);
  const result = await handler(
    makeRequest({ body: { idempotencyKey: 'different-key' } }),
    createReply(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.paymentStatus, 'pending');
  assert.equal(result.intent?.id, 'pi_9');
  assert.equal(createCalled, false);
});

test('non-winner cannot initiate auction payment', async () => {
  const { app, handlers } = createRouteHarness();
  const { db } = makeRouteDb({ auction: { ...AUCTION } });

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => ({ statusCode: 200, body: { ok: true } }),
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('POST /auctions/:auctionId/payment');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    makeRequest({ authUser: { userId: 'intruder_1', role: 'user' } }),
    reply,
  );

  assert.equal(reply.statusCode, 403);
  assert.equal(result.ok, false);
});

// ── Verified settlement helper ──────────────────────────────────────────

function makeSettlementClient(state: {
  intent: Record<string, unknown> | null;
  auction: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  reachState?: string | null;
  /** When true, ledger_tables exist and account/entry inserts are served. */
  ledgerEnabled?: boolean;
}) {
  const statements: string[] = [];
  const calls: { sql: string; params: unknown[] }[] = [];
  let accountSeq = 0;
  const client = {
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      calls.push({ sql: normalized, params: params ?? [] });
      if (normalized.startsWith('UPDATE auctions')) {
        if (state.auction && !state.auction.paid_at && !state.auction.settled_at) {
          state.auction.paid_at = new Date().toISOString();
          state.auction.settled_at = new Date().toISOString();
          state.auction.status = 'settled';
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      }
      if (normalized.startsWith('UPDATE listings')) {
        return { rowCount: 1, rows: [] };
      }
      if (normalized.startsWith('INSERT INTO orders')) {
        state.order = { id: 'auc-pay-auc_1-pi_1', status: 'paid' };
        return { rowCount: 1, rows: [] };
      }
      if (normalized.startsWith('INSERT INTO ledger_accounts')) {
        return { rowCount: 1, rows: [{ id: ++accountSeq }] };
      }
      if (normalized.startsWith('INSERT INTO ledger_entries')) {
        return { rowCount: 1, rows: [] };
      }
      if (normalized.includes('FROM payment_intents')) {
        return { rowCount: state.intent ? 1 : 0, rows: state.intent ? [state.intent] : [] };
      }
      if (normalized.includes('FROM auctions')) {
        return { rowCount: state.auction ? 1 : 0, rows: state.auction ? [state.auction] : [] };
      }
      if (normalized.includes('FROM orders')) {
        const rows = state.order ? [state.order] : [];
        return { rowCount: rows.length, rows };
      }
      if (normalized.includes('FROM users')) {
        // getSellerReach — null state reads as 'normal' (asReachState).
        return {
          rowCount: 1,
          rows: [{
            reach_state: state.reachState ?? 'normal',
            reach_reason: null,
            reach_set_at: null,
          }],
        };
      }
      if (normalized.includes('to_regclass')) {
        return { rowCount: 1, rows: [{ exists: state.ledgerEnabled === true }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  return { client, statements, calls };
}

const SUCCEEDED_INTENT = {
  id: 'pi_1',
  user_id: 'winner_1',
  status: 'succeeded',
  amount_gbp: '50.00',
  metadata: {
    source: 'auction_win',
    auctionId: 'auc_1',
    winnerBidderId: 'winner_1',
    expectedAmountGbp: 50,
  },
};

test('verified capture settles the auction exactly once — replay is idempotent', async () => {
  const state = {
    intent: { ...SUCCEEDED_INTENT },
    auction: { ...AUCTION },
    order: null as Record<string, unknown> | null,
  };
  const { client, statements } = makeSettlementClient(state);

  const first = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(first.kind, 'settled');
  assert.equal(first.kind === 'settled' && first.settlement.alreadySettled, false);
  assert.equal(first.kind === 'settled' && first.settlement.orderId, 'auc-pay-auc_1-pi_1');
  assert.ok(statements.some((sql) => sql.includes("SET status = 'settled'")));
  assert.ok(statements.some((sql) => sql.includes("status = 'sold'") || sql.includes("'sold'")));
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO orders')));

  // Second invocation (duplicate webhook / replay) — auction row is now
  // settled, so the guard replays without any mutation.
  statements.length = 0;
  const second = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(second.kind, 'settled');
  assert.equal(second.kind === 'settled' && second.settlement.alreadySettled, true);
  assert.equal(
    statements.some((sql) => sql.startsWith('UPDATE auctions')),
    false,
    'idempotent replay must not re-run the settlement UPDATE',
  );
  assert.equal(
    statements.some((sql) => sql.startsWith('INSERT INTO orders')),
    false,
    'idempotent replay must not insert a second order',
  );
});

test('non-succeeded intent produces no auction mutation', async () => {
  const state = {
    intent: { ...SUCCEEDED_INTENT, status: 'processing' },
    auction: { ...AUCTION },
    order: null as Record<string, unknown> | null,
  };
  const { client, statements } = makeSettlementClient(state);

  const result = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(result.kind, 'skipped');
  assert.equal(result.kind === 'skipped' && result.reason, 'intent_status:processing');
  assert.equal(statements.some((sql) => sql.startsWith('UPDATE auctions')), false);
  assert.equal(statements.some((sql) => sql.startsWith('INSERT INTO orders')), false);
});

test('winner mismatch refuses settlement — capture never settles the wrong bidder', async () => {
  const state = {
    intent: { ...SUCCEEDED_INTENT, metadata: { ...SUCCEEDED_INTENT.metadata, winnerBidderId: 'previous_winner' } },
    auction: { ...AUCTION, winner_bidder_id: 'second_chance_winner' },
    order: null as Record<string, unknown> | null,
  };
  const { client, statements } = makeSettlementClient(state);

  const result = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(result.kind, 'skipped');
  assert.equal(result.kind === 'skipped' && result.reason, 'winner_mismatch');
  assert.equal(statements.some((sql) => sql.startsWith('UPDATE auctions')), false);
});

test('amount mismatch refuses settlement — captured money must equal the winning bid', async () => {
  const state = {
    intent: { ...SUCCEEDED_INTENT, amount_gbp: '10.00' },
    auction: { ...AUCTION },
    order: null as Record<string, unknown> | null,
  };
  const { client, statements } = makeSettlementClient(state);

  const result = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(result.kind, 'skipped');
  assert.equal(result.kind === 'skipped' && result.reason, 'amount_mismatch');
  assert.equal(statements.some((sql) => sql.startsWith('UPDATE auctions')), false);
});

test('non-auction intents are ignored by the settlement hook', async () => {
  const state = {
    intent: { ...SUCCEEDED_INTENT, metadata: { source: 'commerce_order' } },
    auction: { ...AUCTION },
    order: null as Record<string, unknown> | null,
  };
  const { client, statements } = makeSettlementClient(state);

  const result = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(result.kind, 'not_auction_intent');
  assert.equal(statements.some((sql) => sql.startsWith('UPDATE auctions')), false);
});

// ── Winner/payer binding hardening (review P1) ──────────────────────────

test('auction-bound intent with no winnerBidderId is refused — binding is required, not defaulted', async () => {
  const state = {
    intent: {
      ...SUCCEEDED_INTENT,
      metadata: { source: 'auction_win', auctionId: 'auc_1' }, // winnerBidderId absent
    },
    auction: { ...AUCTION },
    order: null as Record<string, unknown> | null,
  };
  const { client, statements } = makeSettlementClient(state);

  const result = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(result.kind, 'skipped');
  assert.equal(result.kind === 'skipped' && result.reason, 'winner_binding_missing');
  assert.equal(statements.some((sql) => sql.startsWith('UPDATE auctions')), false);
});

test('a capture paid by someone other than the winner never settles', async () => {
  const state = {
    intent: { ...SUCCEEDED_INTENT, user_id: 'intruder_1' },
    auction: { ...AUCTION },
    order: null as Record<string, unknown> | null,
  };
  const { client, statements } = makeSettlementClient(state);

  const result = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(result.kind, 'skipped');
  assert.equal(result.kind === 'skipped' && result.reason, 'payer_not_winner');
  assert.equal(statements.some((sql) => sql.startsWith('UPDATE auctions')), false);
});

test('a seller suspended between mint and capture never settles — orphaned for refund', async () => {
  const state = {
    intent: { ...SUCCEEDED_INTENT },
    auction: { ...AUCTION },
    order: null as Record<string, unknown> | null,
    reachState: 'suspended',
  };
  const { client, statements } = makeSettlementClient(state);

  const result = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(result.kind, 'skipped');
  assert.equal(result.kind === 'skipped' && result.reason, 'seller_suspended');
  assert.equal(
    statements.some((sql) => sql.startsWith('UPDATE auctions')),
    false,
    'a suspended seller must not take the winner’s captured funds',
  );
  assert.equal(statements.some((sql) => sql.startsWith('INSERT INTO orders')), false);
});

test('admin-initiated capture settles when initiatedByRole is server-marked', async () => {
  const state = {
    intent: {
      ...SUCCEEDED_INTENT,
      user_id: 'admin_1',
      metadata: { ...SUCCEEDED_INTENT.metadata, initiatedByRole: 'admin' },
    },
    auction: { ...AUCTION },
    order: null as Record<string, unknown> | null,
  };
  const { client } = makeSettlementClient(state);

  const result = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(result.kind, 'settled');
});

// ── Route-level hardening ────────────────────────────────────────────────

test('settled replay is winner-gated — a non-winner gets 403, not the order detail', async () => {
  const { app, handlers } = createRouteHarness();
  const { db } = makeRouteDb({
    auction: { ...AUCTION, status: 'settled', settled_at: '2026-09-20T10:00:00Z', paid_at: '2026-09-20T10:00:00Z' },
    orders: [{ id: 'order_1' }],
  });

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => ({ statusCode: 200, body: { ok: true } }),
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('POST /auctions/:auctionId/payment');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    makeRequest({ authUser: { userId: 'seller_1', role: 'user' } }),
    reply,
  );

  // Old behaviour replayed orderId/paymentStatus to ANY authenticated user
  // before the winner check. Now the gate runs first.
  assert.equal(reply.statusCode, 403);
  assert.equal(result.ok, false);
  assert.equal(result.orderId, undefined);
});

test('the phase-A lookup is winner-scoped and prefers a verified capture over terminal rows', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements } = makeRouteDb({ auction: { ...AUCTION } });

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => ({
      statusCode: 200,
      body: { ok: true, intent: { id: 'pi_1', status: 'requires_confirmation' } },
    }),
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('POST /auctions/:auctionId/payment');
  assert.ok(handler);
  await handler(makeRequest(), createReply());

  const lookup = statements.find((sql) => sql.includes('FROM payment_intents'));
  assert.ok(lookup);
  assert.ok(lookup!.includes("metadata->>'winnerBidderId'"), 'lookup must scope to the current winner');
  assert.ok(
    lookup!.includes("WHEN status = 'succeeded' THEN 0"),
    'a newer terminal intent must not shadow a succeeded capture',
  );
});

test('winner pay writes the auction binding server-side after minting', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements } = makeRouteDb({ auction: { ...AUCTION } });

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => ({
      statusCode: 200,
      body: { ok: true, intent: { id: 'pi_1', status: 'requires_confirmation' } },
    }),
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('POST /auctions/:auctionId/payment');
  assert.ok(handler);
  const result = await handler(makeRequest(), createReply());
  assert.equal(result.ok, true);

  const bind = statements.find(
    (sql) => sql.startsWith('UPDATE payment_intents') && sql.includes('metadata'),
  );
  assert.ok(bind, 'the auction binding must be written by the server post-mint');
});

test('concurrent-mint conflict retires the duplicate and replays the stored attempt', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements } = makeRouteDb({
    auction: { ...AUCTION },
    bindConflictOnce: true,
    latestIntent: {
      id: 'pi_live',
      user_id: 'winner_1',
      status: 'requires_confirmation',
      gateway_id: 'mollie_eu',
      client_secret: 'sec_live',
      next_action_url: 'https://pay.mollie.example/checkout',
      provider_status: 'open',
      failure_code: null,
      failure_message: null,
    },
  });

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => ({
      statusCode: 200,
      body: {
        ok: true,
        intent: { id: 'pi_dup', status: 'requires_confirmation', clientSecret: 'sec_dup' },
      },
    }),
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('POST /auctions/:auctionId/payment');
  assert.ok(handler);
  const result = await handler(makeRequest(), createReply());

  assert.equal(result.ok, true);
  assert.equal(result.paymentStatus, 'pending');
  // The stored live attempt is replayed — never the losing duplicate.
  assert.equal(result.intent?.id, 'pi_live');
  assert.equal(result.intent?.clientSecret, 'sec_live');
  // The duplicate is cancelled out of the live set.
  assert.ok(
    statements.some(
      (sql) => sql.startsWith('UPDATE payment_intents') && sql.includes("status = 'cancelled'"),
    ),
    'the superseded duplicate intent must be cancelled',
  );
});

test('payment-status never leaks client_secret to the seller', async () => {
  const { app, handlers } = createRouteHarness();
  const { db } = makeRouteDb({
    auction: { ...AUCTION },
    latestIntent: {
      id: 'pi_9',
      user_id: 'winner_1',
      status: 'requires_confirmation',
      gateway_id: 'mollie_eu',
      client_secret: 'sec_winner',
      next_action_url: 'https://pay.mollie.example/checkout',
      provider_status: 'open',
      failure_code: null,
      failure_message: null,
    },
  });

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => ({ statusCode: 200, body: { ok: true } }),
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('GET /auctions/:auctionId/payment-status');
  assert.ok(handler);
  const result = await handler(
    makeRequest({ authUser: { userId: 'seller_1', role: 'user' } }),
    createReply(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.intent?.id, 'pi_9');
  // The seller may see status but never the confirmation secret.
  assert.equal(result.intent?.clientSecret, null);
  assert.equal(result.intent?.nextActionUrl, null);
});

test('payment-status reports reconciliation state, not paid, when settlement is skipped', async () => {
  const { app, handlers } = createRouteHarness();
  const { db } = makeRouteDb({
    auction: { ...AUCTION },
    latestIntent: {
      id: 'pi_bad',
      user_id: 'winner_1',
      status: 'succeeded',
      amount_gbp: '10.00', // captured amount ≠ current_bid_gbp 50.00 → amount_mismatch
      metadata: { auctionId: 'auc_1', winnerBidderId: 'winner_1' },
      gateway_id: 'mollie_eu',
      client_secret: null,
      next_action_url: null,
      provider_status: 'paid',
      failure_code: null,
      failure_message: null,
    },
  });

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => ({ statusCode: 200, body: { ok: true } }),
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('GET /auctions/:auctionId/payment-status');
  assert.ok(handler);
  const result = await handler(makeRequest(), createReply());

  // Old behaviour reported 'paid' on the succeeded intent alone. The
  // truthful state: captured but not settled → pending + reconciliation.
  assert.equal(result.ok, true);
  assert.equal(result.paymentStatus, 'pending');
  assert.equal(result.settlementState, 'requires_reconciliation');
  assert.equal(result.settlementReason, 'amount_mismatch');
  assert.equal(result.orderId, undefined);
});

test('payment-status returns the winner their own client_secret', async () => {
  const { app, handlers } = createRouteHarness();
  const { db } = makeRouteDb({
    auction: { ...AUCTION },
    latestIntent: {
      id: 'pi_9',
      user_id: 'winner_1',
      status: 'requires_confirmation',
      gateway_id: 'mollie_eu',
      client_secret: 'sec_winner',
      next_action_url: 'https://pay.mollie.example/checkout',
      provider_status: 'open',
      failure_code: null,
      failure_message: null,
    },
  });

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => ({ statusCode: 200, body: { ok: true } }),
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('GET /auctions/:auctionId/payment-status');
  assert.ok(handler);
  const result = await handler(makeRequest(), createReply());

  assert.equal(result.intent?.clientSecret, 'sec_winner');
  assert.equal(result.intent?.nextActionUrl, 'https://pay.mollie.example/checkout');
});

// ── Second-chance repricing (review P1) ──────────────────────────────────

test('second-chance accept reprices current_bid_gbp to the accepting bid', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements } = makeRouteDb({
    auction: {
      ...AUCTION,
      status: 'payment_expired',
      second_chance_offered_to: 'bidder_2',
      payment_deadline_at: new Date(Date.now() + 3600_000).toISOString(),
      winner_bid_id: 77,
      current_bid_gbp: '50.00', // the flaked winner's higher bid
    },
    bids: [{ id: 77, bidder_id: 'bidder_2', amount_gbp: '40.00' }],
  });

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => ({ statusCode: 200, body: { ok: true } }),
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('POST /auctions/:auctionId/second-chance/accept');
  assert.ok(handler);
  const result = await handler(
    makeRequest({ authUser: { userId: 'bidder_2', role: 'user' } }),
    createReply(),
  );

  assert.equal(result.ok, true);
  const update = statements.find(
    (sql) => sql.startsWith('UPDATE auctions') && sql.includes("status = 'awaiting_payment'"),
  );
  assert.ok(update);
  assert.ok(
    update!.includes('current_bid_gbp'),
    'the accepting bidder must be charged THEIR bid, not the flaked winner’s',
  );
  assert.ok(update!.includes('winner_bidder_id'));
});

// ── SEP21-FIN-C — canonical order-bound settlement ─────────────────────
// New winner-pay provisions the pending commerce order + auction-source
// reservation BEFORE minting and binds payment_intents.order_id post-mint,
// so the verified capture walks the canonical commerce branch in
// settlePaymentIntent() (order paid → escrow hold → fulfilment → release).
// The auction helper then resolves the bound paid order and writes NO
// auction-specific ledger legs. Only pre-binding intents (order_id IS NULL)
// still take the compatibility path — now currency-correct and escrow-held.

test('bound-order capture settles via the canonical order — no auction ledger legs, no order insert', async () => {
  const state = {
    // The intent carries the canonical order binding written post-mint;
    // settlePaymentIntent() already transitioned it to 'paid' inside the
    // same capture transaction before this helper runs.
    intent: { ...SUCCEEDED_INTENT, order_id: 'ord_win_1' },
    auction: { ...AUCTION },
    order: { id: 'ord_win_1', status: 'paid' },
    ledgerEnabled: true,
  };
  const { client, statements } = makeSettlementClient(state);

  const result = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(result.kind, 'settled');
  assert.equal(result.kind === 'settled' && result.settlement.orderId, 'ord_win_1');
  assert.ok(statements.some((sql) => sql.includes("SET status = 'settled'")));
  assert.equal(
    statements.some((sql) => sql.startsWith('INSERT INTO orders')),
    false,
    'the canonical order already exists and is paid — no after-the-fact insert',
  );
  assert.equal(
    statements.some((sql) => sql.startsWith('INSERT INTO ledger_accounts')),
    false,
    'order-bound capture must not post auction-specific ledger accounts',
  );
  assert.equal(
    statements.some((sql) => sql.startsWith('INSERT INTO ledger_entries')),
    false,
    'the escrow-hold ledger was already posted by the canonical commerce branch',
  );
});

test('bound order that is not paid refuses settlement — captured funds left for reconciliation', async () => {
  const state = {
    intent: { ...SUCCEEDED_INTENT, order_id: 'ord_win_1' },
    auction: { ...AUCTION },
    order: { id: 'ord_win_1', status: 'created' },
  };
  const { client, statements } = makeSettlementClient(state);

  const result = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(result.kind, 'skipped');
  assert.equal(
    result.kind === 'skipped' && result.reason,
    'order_not_payable:created',
  );
  assert.equal(
    statements.some((sql) => sql.startsWith('UPDATE auctions')),
    false,
    'an unpaid bound order means the capture is orphaned — never settled',
  );
});

test('legacy unbound capture posts currency-consistent, escrow-held ledger legs', async () => {
  const state = {
    // order_id IS NULL — an intent minted before the canonical binding.
    intent: { ...SUCCEEDED_INTENT },
    auction: { ...AUCTION },
    order: null as Record<string, unknown> | null,
    ledgerEnabled: true,
  };
  const { client, calls } = makeSettlementClient(state);

  const result = await settleAuctionWinForVerifiedIntent(client as any, 'pi_1');
  assert.equal(result.kind, 'settled');

  const accountCalls = calls.filter((c) => c.sql.startsWith('INSERT INTO ledger_accounts'));
  const entryCalls = calls.filter((c) => c.sql.startsWith('INSERT INTO ledger_entries'));
  assert.ok(accountCalls.length > 0, 'ledger accounts must be ensured');
  assert.ok(entryCalls.length > 0, 'ledger entries must be posted');

  // Currency consistency: the seller is never parked on an ize_wallet
  // account, and every account and entry posts in GBP — the pre-fix helper
  // created an IZE-denominated account while writing GBP-defaulted entries.
  assert.equal(
    accountCalls.some((c) => c.params[2] === 'ize_wallet'),
    false,
    'no seller ize_wallet account may be touched by auction settlement',
  );
  for (const c of accountCalls) {
    assert.equal(c.params[3], 'GBP', `ledger account ${c.params[2]} must be GBP`);
  }
  for (const c of entryCalls) {
    assert.equal(c.params[5], 'GBP', 'every ledger entry must post GBP');
  }

  // Escrow holds the seller-net: the helper posts buyer→escrow and the
  // platform-fee carve-out only. There is no seller-payable leg at capture
  // — seller funds become payable exclusively through the canonical
  // delivery/protection-hold release, so a refund or dispute before
  // delivery can never race already-released money.
  assert.equal(
    entryCalls.some((c) => String(c.params[12]).includes('seller_payable')),
    false,
    'seller-net must stay held in escrow until the delivery release',
  );
  assert.ok(
    entryCalls.some((c) => c.params[12] === 'auction_buyer_charge'),
    'the winning bid must move buyer → escrow',
  );
  assert.ok(
    entryCalls.some((c) => c.params[12] === 'auction_platform_fee_credit'),
    'the platform fee carve-out posts at capture',
  );
  // sourceId keys on the settled order so refund reversals and the
  // delivery release reconcile against the same source.
  assert.ok(
    entryCalls.every((c) => c.params[11] === 'auc-pay-auc_1-pi_1'),
    'ledger legs must key on the order id',
  );
});

test('retry after a terminal attempt reuses the pending order and re-arms its reservation', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements, calls } = makeRouteDb({
    auction: { ...AUCTION },
    latestIntent: {
      id: 'pi_dead',
      user_id: 'winner_1',
      status: 'failed',
      gateway_id: 'stripe_americas',
      client_secret: null,
      next_action_url: null,
      provider_status: 'canceled',
      failure_code: 'card_declined',
      failure_message: 'declined',
    },
    // The first attempt's pending order survived (intent failure did not
    // cancel it in this fixture) — the retry must reuse it rather than
    // stacking a second order row.
    orders: [{ id: 'ord_retry', buyer_id: 'winner_1', status: 'created' }],
  });

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => ({
      statusCode: 200,
      body: { ok: true, intent: { id: 'pi_new', status: 'requires_confirmation' } },
    }),
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('POST /auctions/:auctionId/payment');
  assert.ok(handler);
  const result = await handler(
    makeRequest({ body: { idempotencyKey: 'pay-key-2' } }),
    createReply(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.paymentStatus, 'pending');
  assert.equal(
    statements.some((sql) => sql.startsWith('INSERT INTO orders')),
    false,
    'a live pending order is reused — never duplicated',
  );

  // The reservation is re-armed for the reused order (order_id upsert).
  const resUpsert = calls.find(
    (c) => c.sql.startsWith('INSERT INTO listing_checkout_reservations'),
  );
  assert.ok(resUpsert, 'the auction reservation must be (re)armed');
  assert.equal(resUpsert.params[4], 'ord_retry');

  // The freshly-minted intent binds to the reused order.
  const bind = calls.find(
    (c) => c.sql.startsWith('UPDATE payment_intents') && c.sql.includes('order_id'),
  );
  assert.ok(bind);
  assert.equal(bind.params[2], 'ord_retry');
});

test('a second order does not claim orders.auction_id when a prior order holds it', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, calls } = makeRouteDb({
    auction: { ...AUCTION },
    // A cancelled first-attempt order still claims the partial unique
    // index slot — the retry order must insert with auction_id NULL.
    orders: [{ id: 'ord_dead', buyer_id: 'winner_1', status: 'cancelled' }],
  });

  registerAuctionLifecycleRoutes({
    app,
    db,
    queueUserNotification: async () => 'notif_1',
    createAuctionPaymentIntent: async () => ({
      statusCode: 200,
      body: { ok: true, intent: { id: 'pi_new', status: 'requires_confirmation' } },
    }),
    onAuctionSettled: async () => {},
  });

  const handler = handlers.get('POST /auctions/:auctionId/payment');
  assert.ok(handler);
  const result = await handler(makeRequest(), createReply());
  assert.equal(result.ok, true);

  const orderInsert = calls.find((c) => c.sql.startsWith('INSERT INTO orders'));
  assert.ok(orderInsert);
  assert.equal(
    orderInsert.params[7],
    null,
    'the retry order must not double-claim orders.auction_id',
  );

  // The dead order's drifted reservation is retired so the winner's
  // reservation upsert can never hit the listing-level unique index.
  const retired = calls.find(
    (c) =>
      c.sql.startsWith('UPDATE listing_checkout_reservations')
      && c.sql.includes("'cancelled'"),
  );
  assert.ok(retired, 'stale reservations on terminal orders must be retired');
});
