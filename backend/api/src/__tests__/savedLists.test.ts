import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { registerUserRoutes } from '../routes/users.js';

/**
 * /users/me/wishlist + /users/me/saved were called by the client for months
 * with no route behind them — every save was MMKV-local while the UI
 * announced persistence. These tests pin the contract the client consumes:
 * auth gate, itemIds + hydrated items (ListingSummary shape), idempotent
 * add/remove, and honest 404 on unknown listings.
 */

type RouteHandler = (request: any, reply: any) => Promise<any>;

function createRouteHarness() {
  const handlers = new Map<string, RouteHandler>();
  const app = {
    post(path: string, handler: RouteHandler) { handlers.set(`POST ${path}`, handler); },
    get(path: string, handler: RouteHandler) { handlers.set(`GET ${path}`, handler); },
    patch(path: string, handler: RouteHandler) { handlers.set(`PATCH ${path}`, handler); },
    put(path: string, handler: RouteHandler) { handlers.set(`PUT ${path}`, handler); },
    delete(path: string, handler: RouteHandler) { handlers.set(`DELETE ${path}`, handler); },
    log: { error() {}, warn() {} },
  } as unknown as FastifyInstance;
  return { app, handlers };
}

function createReply() {
  return {
    statusCode: 200,
    code(statusCode: number) { this.statusCode = statusCode; return this; },
    send(payload: unknown) { return payload; },
  };
}

interface SavedRow { user_id: string; listing_id: string; list: string; created_at: string }

/** In-memory pool answering the three queries the saved-list routes issue. */
function createFakePool(opts: { listings?: Set<string>; saved?: SavedRow[] }) {
  const saved = opts.saved ?? [];
  const knownListings = opts.listings ?? new Set<string>();
  const inserted: SavedRow[] = [];
  const pool = {
    async query(sql: string, params?: unknown[]) {
      const text = sql.replace(/\s+/g, ' ').trim();
      if (text.startsWith('SELECT listing_id FROM user_saved_listings')) {
        const [userId, list] = params as [string, string];
        const rows = saved.filter((r) => r.user_id === userId && r.list === list);
        return { rows, rowCount: rows.length };
      }
      if (text.includes('FROM user_saved_listings usl')) {
        const [userId, list] = params as [string, string];
        const rows = saved
          .filter((r) => r.user_id === userId && r.list === list && knownListings.has(r.listing_id))
          .map((r) => ({
            id: r.listing_id,
            seller_id: 'seller_1',
            title: 'Saved item',
            description: null,
            price_gbp: 42,
            image_url: 'https://cdn.test/img.jpg',
            status: 'active',
            category: 'tops',
            brand: null,
            size: null,
            condition: 'good',
            original_price_gbp: null,
            created_at: r.created_at,
          }));
        return { rows, rowCount: rows.length };
      }
      if (text.startsWith('SELECT id FROM listings')) {
        const [id] = params as [string];
        const hit = knownListings.has(id);
        return { rows: hit ? [{ id }] : [], rowCount: hit ? 1 : 0 };
      }
      if (text.startsWith('INSERT INTO user_saved_listings')) {
        const [userId, listingId, list] = params as [string, string, string];
        if (!saved.some((r) => r.user_id === userId && r.listing_id === listingId && r.list === list)) {
          const row = { user_id: userId, listing_id: listingId, list, created_at: '2026-09-15T00:00:00Z' };
          saved.push(row);
          inserted.push(row);
        }
        return { rows: [], rowCount: 0 };
      }
      if (text.startsWith('DELETE FROM user_saved_listings')) {
        const [userId, listingId, list] = params as [string, string, string];
        const idx = saved.findIndex((r) => r.user_id === userId && r.listing_id === listingId && r.list === list);
        if (idx >= 0) saved.splice(idx, 1);
        return { rows: [], rowCount: idx >= 0 ? 1 : 0 };
      }
      // loadListingMedia's image/derivative queries — no media in tests.
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  return { pool, saved, inserted };
}

function register(db: Pool) {
  const { app, handlers } = createRouteHarness();
  registerUserRoutes({
    app,
    db,
    readDb: db,
    resolveAuthenticatedUserId: () => 'user_1',
    ensureUserExists: async () => {},
    toProfilePayload: (row) => row as unknown as Record<string, unknown>,
    toPublicProfilePayload: (row) => row as unknown as Record<string, unknown>,
    queueUserNotification: async () => null,
  });
  return handlers;
}

const authed = (body?: unknown) => ({ authUser: { userId: 'user_1' }, body, params: {}, query: {} });
const anon = () => ({ params: {}, query: {} });

test('GET /users/me/wishlist requires auth', async () => {
  const { pool } = createFakePool({});
  const handlers = register(pool);
  const res = await handlers.get('GET /users/me/wishlist')!(anon(), createReply());
  assert.equal(res.ok, false);
});

test('GET returns itemIds plus hydrated ListingSummary items', async () => {
  const { pool } = createFakePool({
    listings: new Set(['l_1']),
    saved: [{ user_id: 'user_1', listing_id: 'l_1', list: 'wishlist', created_at: '2026-09-15T00:00:00Z' }],
  });
  const handlers = register(pool);
  const res = await handlers.get('GET /users/me/wishlist')!(authed(), createReply());
  assert.equal(res.ok, true);
  assert.deepEqual(res.itemIds, ['l_1']);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].id, 'l_1');
  assert.equal(res.items[0].priceGbp, 42);
  assert.equal(res.items[0].status, 'active');
  assert.ok(Array.isArray(res.items[0].images));
});

test('POST add inserts idempotently and returns the canonical list', async () => {
  const { pool } = createFakePool({ listings: new Set(['l_9']) });
  const handlers = register(pool);
  const post = handlers.get('POST /users/me/wishlist')!;
  const first = await post(authed({ listingId: 'l_9', action: 'add' }), createReply());
  const second = await post(authed({ listingId: 'l_9', action: 'add' }), createReply());
  assert.deepEqual(first.itemIds, ['l_9']);
  assert.deepEqual(second.itemIds, ['l_9']); // ON CONFLICT — no duplicate
});

test('POST remove deletes the row', async () => {
  const { pool } = createFakePool({
    listings: new Set(['l_1']),
    saved: [{ user_id: 'user_1', listing_id: 'l_1', list: 'saved', created_at: '2026-09-15T00:00:00Z' }],
  });
  const handlers = register(pool);
  const res = await handlers.get('POST /users/me/saved')!(authed({ listingId: 'l_1', action: 'remove' }), createReply());
  assert.deepEqual(res.itemIds, []);
});

test('POST add on a nonexistent listing returns 404', async () => {
  const { pool } = createFakePool({ listings: new Set() });
  const handlers = register(pool);
  const reply = createReply();
  const res = await handlers.get('POST /users/me/wishlist')!(authed({ listingId: 'l_missing', action: 'add' }), reply);
  assert.equal(reply.statusCode, 404);
  assert.equal(res.ok, false);
});

test('POST with a malformed body returns 400', async () => {
  const { pool } = createFakePool({});
  const handlers = register(pool);
  const reply = createReply();
  const res = await handlers.get('POST /users/me/wishlist')!(authed({ listingId: 'l_1' }), reply);
  assert.equal(reply.statusCode, 400);
  assert.equal(res.ok, false);
});

test('wishlist and saved are independent lists', async () => {
  const { pool } = createFakePool({
    listings: new Set(['l_1', 'l_2']),
    saved: [
      { user_id: 'user_1', listing_id: 'l_1', list: 'wishlist', created_at: '2026-09-15T00:00:00Z' },
      { user_id: 'user_1', listing_id: 'l_2', list: 'saved', created_at: '2026-09-15T00:00:00Z' },
    ],
  });
  const handlers = register(pool);
  const wishlist = await handlers.get('GET /users/me/wishlist')!(authed(), createReply());
  const saved = await handlers.get('GET /users/me/saved')!(authed(), createReply());
  assert.deepEqual(wishlist.itemIds, ['l_1']);
  assert.deepEqual(saved.itemIds, ['l_2']);
});
