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
  let bindConflictArmed = opts.bindConflictOnce === true;
  const query = async (sql: string) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    statements.push(normalized);
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
  return { db, statements };
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
  const { db, statements } = makeRouteDb({ auction: { ...AUCTION } });
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
    statements.some((sql) => sql.startsWith('INSERT INTO orders')),
    false,
    'no paid order may be inserted before verified provider capture',
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
}) {
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
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
        state.order = { id: 'auc-pay-auc_1-pi_1' };
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
        return { rowCount: 1, rows: [{ exists: false }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  return { client, statements };
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
