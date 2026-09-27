import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { registerListingOfferRoutes } from '../routes/listingOffers.js';

/**
 * Seller reach distribution contract (lib/sellerReach.ts, migration 300):
 * a 'suspended' seller is excluded from distribution entirely — their
 * status='active' listings must not surface on browse/related/
 * recommendation/storefront rails and must NOT be purchasable through any
 * order-bind path. 'limited' only demotes ranked distribution — it never
 * blocks a purchase.
 *
 * Extracted route modules (listingOffers) get a mock-client route harness;
 * the inline index.ts handlers are pinned by source scan — the same
 * convention sellerAway.test.ts uses for its SELLER_AWAY gates.
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
    log: { error() {}, warn() {} },
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

function registerOffers(app: FastifyInstance, db: Pool, actorUserId = 'buyer_1') {
  registerListingOfferRoutes({
    app,
    db,
    resolveAuthenticatedUserId: () => actorUserId,
    calculatePlatformChargeGbp: () => 0,
    authorizeInternalServiceRequest: () => true,
    enqueueOutboxDrain: async () => {},
  });
}

const notAwayUserRow = {
  holiday_mode: false,
  holiday_mode_until: null,
  away_message: null,
};

function reachRow(state: string | null) {
  return { reach_state: state, reach_reason: null, reach_set_at: null };
}

// ── POST /listings/:listingId/offers — suspended seller gate ──

function buildOfferCreateClient(usersReachState: string | null) {
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.startsWith('UPDATE listing_offers SET status = \'expired\'')) {
        return { rowCount: 0, rows: [] };
      }
      if (normalized.startsWith('SELECT id, seller_id, price_gbp::text, status FROM listings')) {
        return {
          rowCount: 1,
          rows: [{ id: 'listing_1', seller_id: 'seller_1', price_gbp: '100.00', status: 'active' }],
        };
      }
      // fetchSellerAwayState
      if (normalized.startsWith('SELECT holiday_mode, holiday_mode_until::text, away_message FROM users')) {
        return { rowCount: 1, rows: [notAwayUserRow] };
      }
      // getSellerReach
      if (normalized.startsWith('SELECT reach_state, reach_reason, reach_set_at FROM users')) {
        return { rowCount: 1, rows: [reachRow(usersReachState)] };
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

test('offer creation against a suspended seller is rejected with SELLER_RESTRICTED', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements } = buildOfferCreateClient('suspended');
  registerOffers(app, db);

  const handler = handlers.get('POST /listings/:listingId/offers');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    {
      params: { listingId: 'listing_1' },
      body: { offerPriceGbp: 80 },
      id: 'req_1',
      log: { error() {}, warn() {} },
    },
    reply,
  );

  assert.equal(reply.statusCode, 409);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SELLER_RESTRICTED');
  // Rolled back before any offer write — purchase intent must not queue
  // for a seller whose listings cannot transact.
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(statements.some((sql) => sql.startsWith('INSERT INTO listing_offers')), false);
});

test('offer creation proceeds for a limited seller — limited demotes discovery only', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements } = buildOfferCreateClient('limited');
  registerOffers(app, db);

  const handler = handlers.get('POST /listings/:listingId/offers');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    {
      params: { listingId: 'listing_1' },
      body: { offerPriceGbp: 80 },
      id: 'req_1',
      log: { error() {}, warn() {} },
    },
    reply,
  );

  assert.equal(result.ok, true);
  assert.equal(reply.statusCode, 201);
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO listing_offers')));
});

// ── POST /offers/:offerId/accept — suspended seller blocks the order bind ──

function buildOfferAcceptClient(opts: {
  offeredBy: string;
  reachState: string | null;
}) {
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.startsWith('UPDATE listing_offers SET status = \'expired\'')) {
        return { rowCount: 0, rows: [] };
      }
      if (normalized.startsWith('SELECT seller_id, buyer_id, listing_id, offer_price_gbp::text,')) {
        return {
          rowCount: 1,
          rows: [{
            seller_id: 'seller_1',
            buyer_id: 'buyer_1',
            listing_id: 'listing_1',
            offer_price_gbp: '80.00',
            status: 'pending',
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            order_id: null,
            reservation_id: null,
            conversation_id: null,
            offered_by_user_id: opts.offeredBy,
          }],
        };
      }
      if (normalized.startsWith('SELECT holiday_mode, holiday_mode_until::text, away_message FROM users')) {
        return { rowCount: 1, rows: [notAwayUserRow] };
      }
      if (normalized.startsWith('SELECT reach_state, reach_reason, reach_set_at FROM users')) {
        return { rowCount: 1, rows: [reachRow(opts.reachState)] };
      }
      if (normalized.startsWith('SELECT status FROM listings')) {
        return { rowCount: 1, rows: [{ status: 'active' }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const db = { async connect() { return client; } } as unknown as Pool;
  return { db, statements };
}

test('buyer accepting a seller-authored counter on a suspended seller is rejected — no order binds', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements } = buildOfferAcceptClient({
    offeredBy: 'seller_1',
    reachState: 'suspended',
  });
  registerOffers(app, db, 'buyer_1');

  const handler = handlers.get('POST /offers/:offerId/accept');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    { params: { offerId: 'offer_1' }, id: 'req_1', log: { error() {}, warn() {} } },
    reply,
  );

  assert.equal(reply.statusCode, 409);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SELLER_RESTRICTED');
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(statements.some((sql) => sql.startsWith('INSERT INTO orders')), false);
  assert.equal(
    statements.some((sql) => sql.startsWith('INSERT INTO listing_checkout_reservations')),
    false,
  );
});

test('seller accepting a buyer offer while suspended is also rejected — Smart Sell auto-accept routes here', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements } = buildOfferAcceptClient({
    offeredBy: 'buyer_1',
    reachState: 'suspended',
  });
  // Actor is the seller — unlike SELLER_AWAY there is no "demonstrably
  // active" exemption: the accept still creates an order that binds the
  // buyer to pay a suspended seller.
  registerOffers(app, db, 'seller_1');

  const handler = handlers.get('POST /offers/:offerId/accept');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    { params: { offerId: 'offer_1' }, id: 'req_1', log: { error() {}, warn() {} } },
    reply,
  );

  assert.equal(reply.statusCode, 409);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SELLER_RESTRICTED');
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(statements.some((sql) => sql.startsWith('INSERT INTO orders')), false);
});

// ── index.ts wiring pins — inline handlers verified by source scan ──

const indexSource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.ts'),
  'utf8',
);

function sliceHandler(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `handler not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end > start ? end : source.length);
}

test('POST /orders gates on seller reach before the order row is written', () => {
  const handler = sliceHandler(indexSource, "app.post('/orders'", "\napp.post('/orders/");

  const reachGate = handler.indexOf('getSellerReach(client, listing.seller_id)');
  assert.ok(reachGate >= 0, 'orders handler does not call getSellerReach');
  const orderInsert = handler.indexOf('INSERT INTO orders');
  assert.ok(orderInsert >= 0 && reachGate < orderInsert,
    'reach gate must run before the order row is inserted');

  const gateBlock = handler.slice(reachGate, reachGate + 900);
  assert.match(gateBlock, /state === 'suspended'/);
  assert.match(gateBlock, /ROLLBACK/);
  assert.match(gateBlock, /reply\.code\(409\)/);
  assert.match(gateBlock, /code:\s*'SELLER_RESTRICTED'/);
});

test('POST /payments/intents gates a commerce order payment on seller reach', () => {
  const handler = sliceHandler(indexSource, "app.post('/payments/intents'", "\napp.post('/payments/");

  const reachGate = handler.indexOf('getSellerReach(client, orderRow.seller_id)');
  assert.ok(reachGate >= 0, 'payment-intent order path does not call getSellerReach');
  const gateBlock = handler.slice(reachGate, reachGate + 900);
  assert.match(gateBlock, /state === 'suspended'/);
  assert.match(gateBlock, /ROLLBACK/);
  assert.match(gateBlock, /reply\.code\(409\)/);
  assert.match(gateBlock, /code:\s*'SELLER_RESTRICTED'/);
});

test('POST /auctions/:auctionId/bids gates on seller reach before the bid row', () => {
  const handler = sliceHandler(
    indexSource,
    "app.post('/auctions/:auctionId/bids'",
    "\napp.post('/auctions/:auctionId/buy-now'",
  );

  const reachGate = handler.indexOf('getSellerReach(client, auction.seller_id)');
  assert.ok(reachGate >= 0, 'bids handler does not call getSellerReach');
  const bidInsert = handler.indexOf('INSERT INTO auction_bids');
  assert.ok(bidInsert >= 0 && reachGate < bidInsert,
    'reach gate must run before the bid row is inserted');

  const gateBlock = handler.slice(reachGate, reachGate + 900);
  assert.match(gateBlock, /state === 'suspended'/);
  assert.match(gateBlock, /ROLLBACK/);
  assert.match(gateBlock, /code:\s*'SELLER_RESTRICTED'/);
});

test('POST /auctions/:auctionId/buy-now gates on seller reach before bid + order writes', () => {
  const handler = sliceHandler(
    indexSource,
    "app.post('/auctions/:auctionId/buy-now'",
    "\napp.post('/auctions/:auctionId/watch'",
  );

  const reachGate = handler.indexOf('getSellerReach(client, auction.seller_id)');
  assert.ok(reachGate >= 0, 'buy-now handler does not call getSellerReach');
  const bidInsert = handler.indexOf('INSERT INTO auction_bids');
  assert.ok(bidInsert >= 0 && reachGate < bidInsert,
    'reach gate must run before the buy-now bid row');
  const orderInsert = handler.indexOf('INSERT INTO orders');
  assert.ok(orderInsert >= 0 && reachGate < orderInsert,
    'reach gate must run before the order row is inserted');

  const gateBlock = handler.slice(reachGate, reachGate + 900);
  assert.match(gateBlock, /state === 'suspended'/);
  assert.match(gateBlock, /ROLLBACK/);
  assert.match(gateBlock, /code:\s*'SELLER_RESTRICTED'/);
});

// ── Distribution-surface wiring pins ──

test('GET /listings browse query excludes suspended sellers', () => {
  const handler = sliceHandler(indexSource, "app.get('/listings'", "\napp.post('/listings'");
  assert.match(handler, /reachExcludedSql\('u'\)/);
});

test('GET /listings/:listingId/related excludes suspended sellers', () => {
  const handler = sliceHandler(
    indexSource,
    "app.get('/listings/:listingId/related'",
    "\napp.get('/listings/:listingId/recommendations'",
  );
  assert.match(handler, /reachExcludedSql\('u'\)/);
});

test('GET /listings/:listingId/recommendations excludes suspended sellers in every listing candidate query', () => {
  const handler = sliceHandler(
    indexSource,
    "app.get('/listings/:listingId/recommendations'",
    "\napp.patch('/listings/:listingId'",
  );
  // fetchCandidates (covers sections 1-6 + 8) plus the continue_exploring
  // keyset — both must carry the exclusion.
  const matches = handler.match(/reachExcludedSql\('u'\)/g) ?? [];
  assert.ok(matches.length >= 2, `expected >=2 reach exclusions, found ${matches.length}`);
  // Scored sections demote 'limited' sellers to 30%.
  assert.match(handler, /REACH_LIMITED_MULTIPLIER/);
});

test('GET /users/:userId/listings excludes suspended sellers for non-owner viewers', () => {
  const handler = sliceHandler(
    indexSource,
    "app.get('/users/:userId/listings'",
    "\napp.post('/listing-images'",
  );
  assert.match(handler, /reachExcludedSql\('u'\)/);
  // Owner inventory is not distribution — the seller still sees their own
  // listings (and admins do).
  assert.match(handler, /viewerIsOwner/);
});

test('GET /auctions and /auctions/home exclude suspended sellers from public rails', () => {
  const listHandler = sliceHandler(indexSource, "app.get('/auctions',", "\napp.post('/auctions',");
  // Exclusion appended to the public WHERE clause; seller=me (owner
  // inventory view) bypasses it.
  assert.match(listHandler, /reachExclusion = sellerMe \? '' :/);
  assert.match(listHandler, /reachExcludedSql\('u'\)/);

  const homeHandler = sliceHandler(indexSource, "app.get('/auctions/home'", "\napp.get('/auctions',");
  const exclusions = homeHandler.match(/reachExclusion|reachExcludedSql/g) ?? [];
  // live + upcoming + ended + both category-facet queries all carry it.
  assert.ok(exclusions.length >= 5, `expected >=5 reach exclusions in /auctions/home, found ${exclusions.length}`);
  // Owner rail and viewer watchlist deliberately stay unfiltered.
  assert.match(homeHandler, /a\.seller_id = \$1 ORDER BY a\.ends_at DESC LIMIT 20/);
  assert.match(homeHandler, /auction_watchlist aw WHERE aw\.auction_id = a\.id AND aw\.user_id = \$1/);
});

const routesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'routes');

test('auctions.ts settlement binds the order only after a reach check', () => {
  const source = fs.readFileSync(path.join(routesDir, 'auctions.ts'), 'utf8');

  // The order insert + paid transition live in
  // settleAuctionWinForVerifiedIntent — invoked by the provider webhook,
  // the winner-pay replay and the payment-status self-heal. The reach gate
  // must precede the order row write INSIDE that helper so a seller
  // suspended between intent mint and provider capture cannot settle.
  const settleHelper = sliceHandler(
    source,
    'export async function settleAuctionWinForVerifiedIntent',
    'export const registerAuctionLifecycleRoutes',
  );
  const settleReachGate = settleHelper.indexOf('getSellerReach(client, auction.seller_id)');
  assert.ok(
    settleReachGate >= 0,
    'verified settlement helper does not check seller reach',
  );
  const orderInsert = settleHelper.indexOf('INSERT INTO orders');
  assert.ok(
    orderInsert >= 0 && settleReachGate < orderInsert,
    'reach gate must run before the settlement order row is inserted',
  );
  const settleGateBlock = settleHelper.slice(settleReachGate, settleReachGate + 900);
  assert.match(settleGateBlock, /state === 'suspended'/);
  assert.match(settleGateBlock, /seller_suspended/);

  // The winner-pay route still gates intent MINTING on reach — a suspended
  // seller must not take money, so no capture may even be created.
  const handler = sliceHandler(
    source,
    "app.post('/auctions/:auctionId/payment'",
    "app.get('/auctions/:auctionId/payment-status'",
  );
  const reachGate = handler.indexOf('getSellerReach(client, auction.seller_id)');
  assert.ok(reachGate >= 0, 'auction payment handler does not call getSellerReach');
  const gateBlock = handler.slice(reachGate, reachGate + 900);
  assert.match(gateBlock, /state === 'suspended'/);
  assert.match(gateBlock, /ROLLBACK/);
  assert.match(gateBlock, /code:\s*'SELLER_RESTRICTED'/);
});

test('listingOffers.ts gates offer create, buyer counter and accept on reach', () => {
  const source = fs.readFileSync(path.join(routesDir, 'listingOffers.ts'), 'utf8');
  const gates = source.match(/getSellerReach\(client, /g) ?? [];
  assert.ok(gates.length >= 3, `expected >=3 reach gates, found ${gates.length}`);
});

test('recommendations.ts candidate pool excludes suspended sellers and demotes limited', () => {
  const source = fs.readFileSync(path.join(routesDir, 'recommendations.ts'), 'utf8');
  assert.match(source, /reachJoinSql\('reach_u', 'l\.seller_id'\)/);
  assert.match(source, /reachExcludedSql\('reach_u'\)/);
  assert.match(source, /seller_reach_state === 'limited'/);
  assert.match(source, /REACH_LIMITED_MULTIPLIER/);
});

test('visualSearch.ts candidate + facet count queries exclude suspended sellers', () => {
  const source = fs.readFileSync(path.join(routesDir, 'visualSearch.ts'), 'utf8');
  const exclusions = source.match(/reachExcludedSql\(/g) ?? [];
  assert.ok(exclusions.length >= 3, `expected >=3 reach exclusions, found ${exclusions.length}`);
  assert.match(source, /REACH_LIMITED_MULTIPLIER/);
});

test('storefronts.ts public featured listings exclude suspended sellers', () => {
  const source = fs.readFileSync(path.join(routesDir, 'storefronts.ts'), 'utf8');
  assert.match(source, /reachJoinSql\('reach_u', 'l\.seller_id'\)/);
  assert.match(source, /reachExcludedSql\('reach_u'\)/);
});

test('sellers.ts public profile passes the honest reach state through', () => {
  const source = fs.readFileSync(path.join(routesDir, 'sellers.ts'), 'utf8');
  assert.match(source, /reach_state/);
  assert.match(source, /reachState: user\.reach_state \?\? 'normal'/);
});
