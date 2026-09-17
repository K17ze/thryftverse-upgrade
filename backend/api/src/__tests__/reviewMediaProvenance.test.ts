import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { registerSupportReviewRoutes } from '../routes/supportReviews.js';

/**
 * photoUrls / evidenceMediaUrls previously accepted arbitrary external URLs
 * into surfaces rendered publicly (review_media on seller profiles) and in
 * support tickets. Both are now gated on the requester's own
 * upload_finalizations (public_url or the linked media_asset canonical_url).
 * These tests pin the gate: external URLs → 422 MEDIA_NOT_OWNED, owned URLs
 * pass through.
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

/**
 * Fake pool answering the pre-transaction queries on both routes:
 * order lookup, existing-review check, and the upload_finalizations
 * provenance join. `ownedUrls` simulates the caller's own uploads.
 */
function createFakePool(opts: { ownedUrls?: string[]; orderExists?: boolean; orderStatus?: string }) {
  const owned = new Set(opts.ownedUrls ?? []);
  const pool = {
    async query(sql: string, params?: unknown[]) {
      const text = sql.replace(/\s+/g, ' ').trim();
      if (text.startsWith('SELECT id FROM orders WHERE')) {
        if (opts.orderExists === false) return { rows: [], rowCount: 0 };
        return { rows: [{ id: 'order_1234' }], rowCount: 1 };
      }
      if (text.startsWith('SELECT buyer_id, seller_id, status FROM orders')) {
        if (opts.orderExists === false) return { rows: [], rowCount: 0 };
        return {
          rows: [{ buyer_id: 'user_1', seller_id: 'seller_1', status: opts.orderStatus ?? 'delivered' }],
          rowCount: 1,
        };
      }
      if (text.startsWith('SELECT id, is_auto FROM order_reviews')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.startsWith('SELECT uf.public_url, ma.canonical_url')) {
        const submitted = (params?.[1] as string[]) ?? [];
        const rows = submitted
          .filter((u) => owned.has(u))
          .map((u) => ({ public_url: u, canonical_url: null }));
        return { rows, rowCount: rows.length };
      }
      if (text.startsWith('SELECT id FROM support_tickets')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.startsWith('SELECT buyer_id, seller_id FROM orders')) {
        return { rows: [{ buyer_id: 'user_1', seller_id: 'seller_1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    // The provenance gate runs before the transaction — if it passes, the
    // route checks out a client. Returning a stub lets the "owned" case
    // proceed far enough to prove the gate didn't fire; the insert itself
    // is covered elsewhere.
    async connect() {
      return {
        async query() { return { rows: [], rowCount: 0 }; },
        release() {},
      };
    },
  } as unknown as Pool;
  return pool;
}

function register(db: Pool) {
  const { app, handlers } = createRouteHarness();
  registerSupportReviewRoutes({
    app,
    db,
    createApiError: (code: string, message: string) => Object.assign(new Error(message), { code }),
    queueUserNotification: async () => null,
  });
  return handlers;
}

const authed = (body?: unknown) => ({
  authUser: { userId: 'user_1' },
  body,
  params: {},
  query: {},
  headers: {},
});

const reviewParams = (orderId: string) => ({
  authUser: { userId: 'user_1' },
  params: { orderId },
  body: undefined as unknown,
  query: {},
  headers: {},
});

test('review POST rejects external photo URLs with MEDIA_NOT_OWNED', async () => {
  const handlers = register(createFakePool({ ownedUrls: [] }));
  const req = reviewParams('order_1234');
  req.body = { rating: 5, photoUrls: ['https://evil.example.com/x.jpg'] };
  const reply = createReply();
  const res = await handlers.get('POST /orders/:orderId/review')!(req, reply);
  assert.equal(reply.statusCode, 422);
  assert.equal(res.code, 'MEDIA_NOT_OWNED');
});

test('review POST accepts URLs owned by the requester', async () => {
  const handlers = register(createFakePool({ ownedUrls: ['https://cdn.app/u1/photo.jpg'] }));
  const req = reviewParams('order_1234');
  req.body = { rating: 5, photoUrls: ['https://cdn.app/u1/photo.jpg'] };
  const reply = createReply();
  const res = await handlers.get('POST /orders/:orderId/review')!(req, reply);
  // The gate passed — the request proceeded into the transaction stub.
  assert.notEqual(reply.statusCode, 422);
  assert.notEqual(res.code, 'MEDIA_NOT_OWNED');
});

test('review POST with no photos skips the gate entirely', async () => {
  const handlers = register(createFakePool({}));
  const req = reviewParams('order_1234');
  req.body = { rating: 4, comment: 'Great' };
  const reply = createReply();
  const res = await handlers.get('POST /orders/:orderId/review')!(req, reply);
  assert.notEqual(reply.statusCode, 422);
  assert.notEqual(res.code, 'MEDIA_NOT_OWNED');
});

test('support ticket POST rejects external evidence URLs', async () => {
  const handlers = register(createFakePool({ ownedUrls: [] }));
  const req = authed({
    orderId: 'order_1234',
    topicId: 'item_not_as_described',
    topicLabel: 'Item not as described',
    details: 'The item arrived damaged.',
    evidenceMediaUrls: ['https://evil.example.com/fake.jpg'],
  });
  const reply = createReply();
  const res = await handlers.get('POST /support/tickets')!(req, reply);
  assert.equal(reply.statusCode, 422);
  assert.equal(res.code, 'MEDIA_NOT_OWNED');
});

test('support ticket POST accepts owned evidence URLs', async () => {
  const handlers = register(createFakePool({ ownedUrls: ['https://cdn.app/u1/evidence.jpg'] }));
  const req = authed({
    orderId: 'order_1234',
    topicId: 'item_not_as_described',
    topicLabel: 'Item not as described',
    details: 'The item arrived damaged.',
    evidenceMediaUrls: ['https://cdn.app/u1/evidence.jpg'],
  });
  const reply = createReply();
  const res = await handlers.get('POST /support/tickets')!(req, reply);
  assert.equal(res.ok, true);
});
