import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { isEffectivelyAway } from '../lib/sellerAway.js';
import { registerListingOfferRoutes } from '../routes/listingOffers.js';
import { registerUserRoutes } from '../routes/users.js';
import { registerSellerHubRoutes } from '../routes/sellerHub.js';

/**
 * Holiday mode is a hard pause — the product tells buyers "listings are
 * paused" on the away seller's profile, so commerce must refuse new
 * purchase intent (409 SELLER_AWAY) rather than queue it silently.
 * These tests pin the effective-away definition (a published return date
 * auto-expires the pause) and the offer-create gate.
 */

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
    patch(path: string, handler: RouteHandler) {
      handlers.set(`PATCH ${path}`, handler);
    },
    put(path: string, handler: RouteHandler) {
      handlers.set(`PUT ${path}`, handler);
    },
    delete(path: string, handler: RouteHandler) {
      handlers.set(`DELETE ${path}`, handler);
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

// ── isEffectivelyAway — the single definition shared by gates + projections ──

test('away state requires holiday_mode on and an unexpired return date', () => {
  const now = new Date('2026-03-01T12:00:00Z');
  // Flag off — never away, even with a future return date.
  assert.equal(isEffectivelyAway(false, null, now), false);
  assert.equal(isEffectivelyAway(false, '2026-03-10T00:00:00Z', now), false);
  assert.equal(isEffectivelyAway(null, null, now), false);
  // Flag on, no declared return — open-ended pause.
  assert.equal(isEffectivelyAway(true, null, now), true);
  // Flag on, future return — away until that instant.
  assert.equal(isEffectivelyAway(true, '2026-03-10T00:00:00Z', now), true);
  // Flag on, return date in the past — the pause already ended; a stale
  // flag can never hold the shop closed past the published date.
  assert.equal(isEffectivelyAway(true, '2026-02-20T00:00:00Z', now), false);
  assert.equal(
    isEffectivelyAway(true, new Date('2026-02-20T00:00:00Z'), now),
    false,
  );
});

// ── POST /listings/:listingId/offers — SELLER_AWAY gate ──

function buildOfferClient(usersRow: Record<string, unknown> | null) {
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.startsWith('SELECT id, seller_id, price_gbp::text, status FROM listings')) {
        return {
          rowCount: 1,
          rows: [{ id: 'listing_1', seller_id: 'seller_1', price_gbp: '100.00', status: 'active' }],
        };
      }
      if (normalized.startsWith('SELECT holiday_mode, holiday_mode_until::text, away_message FROM users')) {
        return usersRow
          ? { rowCount: 1, rows: [usersRow] }
          : { rowCount: 0, rows: [] };
      }
      if (normalized.startsWith('INSERT INTO domain_outbox')) {
        return { rowCount: 1, rows: [{ id: 'evt_1' }] };
      }
      if (normalized.startsWith('INSERT INTO listing_offers')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'offer_1',
            listing_id: 'listing_1',
            buyer_id: 'buyer_1',
            seller_id: 'seller_1',
            offer_price_gbp: '80.00',
            original_price_gbp: '100.00',
            counter_round: 0,
            status: 'pending',
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            accepted_at: null,
            declined_at: null,
            expired_at: null,
            cancelled_at: null,
            conversation_id: null,
            parent_offer_id: null,
            metadata: {},
            offered_by_user_id: 'buyer_1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const db = { async connect() { return client; } } as unknown as Pool;
  return { db, statements };
}

test('offer creation is rejected with SELLER_AWAY while the seller is away', async () => {
  const { app, handlers } = createRouteHarness();
  const awayUntil = new Date(Date.now() + 48 * 3_600_000).toISOString();
  const { db, statements } = buildOfferClient({
    holiday_mode: true,
    holiday_mode_until: awayUntil,
    away_message: 'Back Monday',
  });

  registerListingOfferRoutes({
    app,
    db,
    resolveAuthenticatedUserId: () => 'buyer_1',
    calculatePlatformChargeGbp: () => 0,
    authorizeInternalServiceRequest: () => true,
    enqueueOutboxDrain: async () => {},
  });

  const handler = handlers.get('POST /listings/:listingId/offers');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    {
      params: { listingId: 'listing_1' },
      body: { offerPriceGbp: 80 },
    },
    reply,
  );

  assert.equal(reply.statusCode, 409);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SELLER_AWAY');
  assert.equal(result.sellerAwayUntil, new Date(awayUntil).toISOString());
  assert.equal(result.awayMessage, 'Back Monday');
  // Rolled back before any offer write — nothing was queued for a seller
  // who is not watching.
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(statements.some((sql) => sql.startsWith('INSERT INTO listing_offers')), false);
});

test('offer creation proceeds when the seller away flag is off', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements } = buildOfferClient({
    holiday_mode: false,
    holiday_mode_until: null,
    away_message: null,
  });

  registerListingOfferRoutes({
    app,
    db,
    resolveAuthenticatedUserId: () => 'buyer_1',
    calculatePlatformChargeGbp: () => 0,
    authorizeInternalServiceRequest: () => true,
    enqueueOutboxDrain: async () => {},
  });

  const handler = handlers.get('POST /listings/:listingId/offers');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    { params: { listingId: 'listing_1' }, body: { offerPriceGbp: 80 } },
    reply,
  );

  assert.equal(result.ok, true);
  assert.equal(reply.statusCode, 201);
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO listing_offers')));
});

test('a published return date in the past ends the away state — offers proceed', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements } = buildOfferClient({
    holiday_mode: true,
    holiday_mode_until: new Date(Date.now() - 60_000).toISOString(),
    away_message: 'Back Monday',
  });

  registerListingOfferRoutes({
    app,
    db,
    resolveAuthenticatedUserId: () => 'buyer_1',
    calculatePlatformChargeGbp: () => 0,
    authorizeInternalServiceRequest: () => true,
    enqueueOutboxDrain: async () => {},
  });

  const handler = handlers.get('POST /listings/:listingId/offers');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    { params: { listingId: 'listing_1' }, body: { offerPriceGbp: 80 } },
    reply,
  );

  assert.equal(result.ok, true);
  assert.equal(reply.statusCode, 201);
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO listing_offers')));
});

// ── PATCH /users/me/preferences — holidayModeUntil contract ──

function buildPreferencesDb(updateCapture: { sql?: string; params?: unknown[] }) {
  const db = {
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('UPDATE users')) {
        updateCapture.sql = normalized;
        updateCapture.params = params;
        return {
          rowCount: 1,
          rows: [{
            holiday_mode: true,
            private_profile: false,
            holiday_mode_until: '2026-03-10T00:00:00.000Z',
            away_message: 'Back Monday',
          }],
        };
      }
      return { rowCount: 0, rows: [] };
    },
  } as unknown as Pool;
  return db;
}

function registerUserRoutesForPreferences(app: FastifyInstance, db: Pool) {
  registerUserRoutes({
    app,
    db,
    readDb: db,
    resolveAuthenticatedUserId: (request) => request.authUser!.userId,
    ensureUserExists: async () => {},
    toProfilePayload: (row) => row,
    toPublicProfilePayload: (row) => row,
    queueUserNotification: async () => null,
  });
}

test('PATCH preferences stores a future holidayModeUntil and returns it', async () => {
  const { app, handlers } = createRouteHarness();
  const capture: { sql?: string; params?: unknown[] } = {};
  const db = buildPreferencesDb(capture);
  registerUserRoutesForPreferences(app, db);

  const handler = handlers.get('PATCH /users/me/preferences');
  assert.ok(handler);
  const until = new Date(Date.now() + 72 * 3_600_000).toISOString();
  const result = await handler(
    {
      authUser: { userId: 'seller_1' },
      body: { holidayMode: true, holidayModeUntil: until, awayMessage: 'Back Monday' },
    },
    createReply(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.preferences.holidayMode, true);
  assert.equal(result.preferences.holidayModeUntil, '2026-03-10T00:00:00.000Z');
  assert.equal(result.preferences.awayMessage, 'Back Monday');
  assert.ok(capture.sql?.includes('holiday_mode_until'));
  assert.ok(capture.sql?.includes('away_message'));
  // The stored value is the normalised ISO instant, not the raw input.
  // Params are bound as [userId, ...values] so $N resolves to params[N-1].
  const untilParamIdx = capture.sql!.indexOf('holiday_mode_until = $');
  const paramPosition = Number(
    capture.sql!.slice(untilParamIdx).match(/\$(\d+)/)![1],
  );
  assert.equal(capture.params![paramPosition - 1], new Date(until).toISOString());
});

test('PATCH preferences rejects a past holidayModeUntil — a past date can never hold the shop paused', async () => {
  const { app, handlers } = createRouteHarness();
  const capture: { sql?: string; params?: unknown[] } = {};
  const db = buildPreferencesDb(capture);
  registerUserRoutesForPreferences(app, db);

  const handler = handlers.get('PATCH /users/me/preferences');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    {
      authUser: { userId: 'seller_1' },
      body: { holidayMode: true, holidayModeUntil: '2020-01-01T00:00:00Z' },
    },
    reply,
  );

  assert.equal(reply.statusCode, 400);
  assert.equal(result.ok, false);
  assert.equal(capture.sql, undefined);
});

test('PATCH preferences with holidayMode:false clears the stored return date', async () => {
  const { app, handlers } = createRouteHarness();
  const capture: { sql?: string; params?: unknown[] } = {};
  const db = buildPreferencesDb(capture);
  registerUserRoutesForPreferences(app, db);

  const handler = handlers.get('PATCH /users/me/preferences');
  assert.ok(handler);
  const result = await handler(
    { authUser: { userId: 'seller_1' }, body: { holidayMode: false } },
    createReply(),
  );

  assert.equal(result.ok, true);
  assert.ok(capture.sql?.includes('holiday_mode = $2'));
  assert.ok(capture.sql?.includes('holiday_mode_until = $'));
  // The until clause binds NULL — leaving holiday mode always clears the
  // return date so it cannot resurrect a stale away state.
  const untilParamIdx = capture.sql!.indexOf('holiday_mode_until = $');
  const paramPosition = Number(
    capture.sql!.slice(untilParamIdx).match(/\$(\d+)/)![1],
  );
  assert.equal(capture.params![paramPosition - 1], null);
});

// ── POST /orders — SELLER_AWAY gate wiring ──
// The order route is registered inline in the monolithic index.ts, so it
// cannot be route-harnessed like the extracted routers. The gate itself is
// covered by the offer-route tests above (same fetchSellerAwayState call);
// this pins the wiring: the check must run inside the transaction, after
// the listing seller is known, and before the order row is written —
// rolling back so nothing is queued for a seller who is not watching.

test('POST /orders consults the shared away gate before inserting the order', () => {
  const indexPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'index.ts',
  );
  const source = fs.readFileSync(indexPath, 'utf8');
  const handlerStart = source.indexOf("app.post('/orders'");
  assert.ok(handlerStart >= 0, 'POST /orders handler not found');
  // Bound the scan to the orders handler: up to the next top-level route.
  const handlerEnd = source.indexOf("\napp.post('/orders/", handlerStart);
  const handler = source.slice(
    handlerStart,
    handlerEnd > handlerStart ? handlerEnd : source.length,
  );

  const awayGate = handler.indexOf('fetchSellerAwayState(client, listing.seller_id)');
  assert.ok(awayGate >= 0, 'orders handler does not call fetchSellerAwayState');
  const selfPurchaseCheck = handler.indexOf('Buyer cannot purchase their own listing');
  assert.ok(selfPurchaseCheck >= 0 && selfPurchaseCheck < awayGate,
    'away gate must run after the seller id is known (self-purchase check)');
  const orderInsert = handler.indexOf('INSERT INTO orders');
  assert.ok(orderInsert >= 0 && awayGate < orderInsert,
    'away gate must run before the order row is inserted');

  // The rejection is a real rollback + 409 + stable code, not a silent skip.
  const gateBlock = handler.slice(awayGate, awayGate + 1200);
  assert.match(gateBlock, /ROLLBACK/);
  assert.match(gateBlock, /reply\.code\(409\)/);
  assert.match(gateBlock, /code:\s*'SELLER_AWAY'/);
  // The wire payload exposes the real return date for buyer-facing copy.
  assert.match(gateBlock, /sellerAwayUntil/);
});

// ── POST /auctions/:auctionId/buy-now — SELLER_AWAY gate wiring ──
// Buy Now creates an order directly inside the auction transaction — new
// purchase intent identical to POST /orders, so it must consult the same
// gate before the bid/order rows are written. The handler is inline in
// index.ts, so this pins the wiring by source scan (same convention as
// the POST /orders pin above).

test('POST /auctions/:auctionId/buy-now consults the shared away gate before inserting the order', () => {
  const indexPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'index.ts',
  );
  const source = fs.readFileSync(indexPath, 'utf8');
  const handlerStart = source.indexOf("app.post('/auctions/:auctionId/buy-now'");
  assert.ok(handlerStart >= 0, 'buy-now handler not found');
  // Bound the scan to the buy-now handler: up to the next top-level route.
  const handlerEnd = source.indexOf("\napp.get('/auctions/:auctionId'", handlerStart);
  const handler = source.slice(
    handlerStart,
    handlerEnd > handlerStart ? handlerEnd : source.length,
  );

  const awayGate = handler.indexOf('fetchSellerAwayState(client, auction.seller_id)');
  assert.ok(awayGate >= 0, 'buy-now handler does not call fetchSellerAwayState');
  const bidInsert = handler.indexOf('INSERT INTO auction_bids');
  assert.ok(bidInsert >= 0 && awayGate < bidInsert,
    'away gate must run before the buy-now bid row is inserted');
  const orderInsert = handler.indexOf('INSERT INTO orders');
  assert.ok(orderInsert >= 0 && awayGate < orderInsert,
    'away gate must run before the order row is inserted');

  // The rejection is a real rollback + 409 + stable code, not a silent skip.
  const gateBlock = handler.slice(awayGate, awayGate + 1200);
  assert.match(gateBlock, /ROLLBACK/);
  assert.match(gateBlock, /reply\.code\(409\)/);
  assert.match(gateBlock, /code:\s*'SELLER_AWAY'/);
  assert.match(gateBlock, /sellerAwayUntil/);
  assert.match(gateBlock, /awayMessage/);
});

// ── POST /auctions/:auctionId/bids — SELLER_AWAY gate wiring ──
// A bid is a binding commitment to purchase — new purchase intent that can
// bind an away seller to fulfil once the lot is won. Same gate, same
// source-scan pinning.

test('POST /auctions/:auctionId/bids consults the shared away gate before inserting the bid', () => {
  const indexPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'index.ts',
  );
  const source = fs.readFileSync(indexPath, 'utf8');
  const handlerStart = source.indexOf("app.post('/auctions/:auctionId/bids'");
  assert.ok(handlerStart >= 0, 'bids handler not found');
  // Bound the scan to the bids handler: up to the next top-level route.
  const handlerEnd = source.indexOf("\napp.post('/auctions/:auctionId/buy-now'", handlerStart);
  const handler = source.slice(
    handlerStart,
    handlerEnd > handlerStart ? handlerEnd : source.length,
  );

  const awayGate = handler.indexOf('fetchSellerAwayState(client, auction.seller_id)');
  assert.ok(awayGate >= 0, 'bids handler does not call fetchSellerAwayState');
  const bidInsert = handler.indexOf('INSERT INTO auction_bids');
  assert.ok(bidInsert >= 0 && awayGate < bidInsert,
    'away gate must run before the bid row is inserted');

  const gateBlock = handler.slice(awayGate, awayGate + 1200);
  assert.match(gateBlock, /ROLLBACK/);
  assert.match(gateBlock, /reply\.code\(409\)/);
  assert.match(gateBlock, /code:\s*'SELLER_AWAY'/);
  assert.match(gateBlock, /sellerAwayUntil/);
  assert.match(gateBlock, /awayMessage/);
});

// ── GET /seller-hub/overview — dispatch deadline shift ──
// An order paid inside the away window (holiday_mode_since <= paid_at <=
// holiday_mode_until) is due return-date + ship_within_days. An order paid
// before the seller left keeps paid_at + ship_within_days — going away
// does not excuse orders already sold. A NULL since (pre-migration 293
// rows) counts as "away since before the payment". The dueAt math runs in
// JS; the overdue count runs in SQL. Both are pinned here.

function buildSellerHubReadDb(opts: {
  shipWithinDays: number | null;
  holidayModeUntil: string | null;
  holidayModeSince?: string | null;
  oldestPaid: string | null;
}) {
  const statements: string[] = [];
  const readDb = {
    async query(sql: string, _params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.includes('information_schema.tables')) {
        return { rowCount: 1, rows: [{ exists: true }] };
      }
      // Trust + away-window read (users LEFT JOIN seller_trust).
      if (normalized.startsWith('SELECT st.ship_within_days, u.holiday_mode_until')) {
        return {
          rowCount: 1,
          rows: [{
            ship_within_days: opts.shipWithinDays,
            holiday_mode_until: opts.holidayModeUntil,
            holiday_mode_since: opts.holidayModeSince ?? null,
          }],
        };
      }
      // Ship-orders aggregate (orders o LEFT JOIN users u LEFT JOIN seller_trust st).
      if (normalized.startsWith('SELECT COUNT(*) AS count, MIN(o.paid_at)::text AS oldest_paid')) {
        return {
          rowCount: 1,
          rows: [{
            count: '1',
            oldest_paid: opts.oldestPaid,
            overdue_count: '0',
          }],
        };
      }
      // Inventory aggregate.
      if (normalized.startsWith('SELECT COUNT(*) FILTER (WHERE status = ')) {
        return {
          rowCount: 1,
          rows: [{ active: '1', drafts: '0', paused: '0', sold: '0', active_value: '100' }],
        };
      }
      return { rowCount: 0, rows: [] };
    },
  } as unknown as Pool;
  return { readDb, statements };
}

async function fetchSellerHubOverview(readDb: Pool) {
  const { app, handlers } = createRouteHarness();
  registerSellerHubRoutes({ app, readDb, db: readDb });
  const handler = handlers.get('GET /seller-hub/overview');
  assert.ok(handler);
  const result = await handler(
    { authUser: { userId: 'seller_1' }, log: { error() {}, warn() {} } },
    createReply(),
  );
  return result.overview as {
    tasks: { type: string; dueAt: string | null; priority: string }[];
  };
}

test('seller hub shifts the dispatch deadline to the seller return date when it is later', async () => {
  const paidAt = '2026-02-20T10:00:00.000Z';
  const until = '2026-03-05T10:00:00.000Z';
  const { readDb, statements } = buildSellerHubReadDb({
    shipWithinDays: 3,
    holidayModeUntil: until,
    oldestPaid: paidAt,
  });

  const overview = await fetchSellerHubOverview(readDb);
  const shipTask = overview.tasks.find((task) => task.type === 'ship_order');
  assert.ok(shipTask, 'ship_order task expected for a paid unshipped order');
  // NULL since = away before the payment — until + 3d wins because the
  // away seller cannot ship before returning.
  assert.equal(shipTask!.dueAt, '2026-03-08T10:00:00.000Z');
  // The SQL overdue count uses the same shifted deadline — pinned so the
  // count and dueAt can never disagree. The shift is gated on the away
  // window: paid_at <= until AND (since IS NULL OR paid_at >= since).
  const ordersAggregate = statements.find((sql) => sql.includes('AS overdue_count'));
  assert.ok(ordersAggregate);
  assert.match(ordersAggregate!, /holiday_mode_until/);
  assert.match(ordersAggregate!, /holiday_mode_since/);
  assert.match(ordersAggregate!, /o\.paid_at <= u\.holiday_mode_until/);
});

test('seller hub keeps paid_at + handling for an order paid before the seller went away', async () => {
  // Seller left on 2026-03-01, back 2026-03-05 — but this order was paid
  // on 2026-02-20, before the pause began. Its deadline was already
  // running; going away must not move it.
  const { readDb } = buildSellerHubReadDb({
    shipWithinDays: 3,
    holidayModeUntil: '2026-03-05T10:00:00.000Z',
    holidayModeSince: '2026-03-01T10:00:00.000Z',
    oldestPaid: '2026-02-20T10:00:00.000Z',
  });

  const overview = await fetchSellerHubOverview(readDb);
  const shipTask = overview.tasks.find((task) => task.type === 'ship_order');
  assert.ok(shipTask);
  assert.equal(shipTask!.dueAt, '2026-02-23T10:00:00.000Z');
});

test('seller hub shifts the deadline for an order paid inside the away window', async () => {
  // Same window, but the order was paid while the seller was away — the
  // deadline rebases to return-date + handling.
  const { readDb } = buildSellerHubReadDb({
    shipWithinDays: 3,
    holidayModeUntil: '2026-03-05T10:00:00.000Z',
    holidayModeSince: '2026-03-01T10:00:00.000Z',
    oldestPaid: '2026-03-03T10:00:00.000Z',
  });

  const overview = await fetchSellerHubOverview(readDb);
  const shipTask = overview.tasks.find((task) => task.type === 'ship_order');
  assert.ok(shipTask);
  assert.equal(shipTask!.dueAt, '2026-03-08T10:00:00.000Z');
});

test('seller hub keeps paid_at + handling when the return date is earlier or absent', async () => {
  const paidAt = '2026-03-20T10:00:00.000Z';
  // Case A: return date already passed relative to payment — paid_at wins.
  const earlier = buildSellerHubReadDb({
    shipWithinDays: 3,
    holidayModeUntil: '2026-03-01T10:00:00.000Z',
    oldestPaid: paidAt,
  });
  const overviewA = await fetchSellerHubOverview(earlier.readDb);
  const shipTaskA = overviewA.tasks.find((task) => task.type === 'ship_order');
  assert.ok(shipTaskA);
  assert.equal(shipTaskA!.dueAt, '2026-03-23T10:00:00.000Z');

  // Case B: no declared return date — no fabricated extension.
  const none = buildSellerHubReadDb({
    shipWithinDays: 2,
    holidayModeUntil: null,
    oldestPaid: paidAt,
  });
  const overviewB = await fetchSellerHubOverview(none.readDb);
  const shipTaskB = overviewB.tasks.find((task) => task.type === 'ship_order');
  assert.ok(shipTaskB);
  assert.equal(shipTaskB!.dueAt, '2026-03-22T10:00:00.000Z');
});
