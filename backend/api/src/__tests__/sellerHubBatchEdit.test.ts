import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { registerSellerHubRoutes } from '../routes/sellerHub.js';

/**
 * POST /seller-hub/batch-command — 'edit' command.
 *
 * Pins the bulk field-edit contract: the patch whitelist is the same one
 * PATCH /listings/:listingId accepts (status and cover media excluded),
 * each item gets an independent applied/rejected/conflict receipt, and the
 * durable listing_batch_items rows make an idempotent replay return the
 * identical per-item outcomes.
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

interface MockListingRow {
  seller_id: string;
  price_gbp: string;
  status: string;
}

function buildBatchDb(options: {
  listings: Record<string, MockListingRow>;
  existingJob?: {
    id: string;
    request_hash: string;
    status: string;
    applied_count: number;
    rejected_count: number;
    conflict_count: number;
    total_items: number;
  } | null;
  existingItems?: {
    listing_id: string;
    status: string;
    reason: string | null;
    current_status: string | null;
    detail: { appliedFields?: string[] } | null;
  }[];
}) {
  const statements: string[] = [];
  const itemInserts: unknown[][] = [];
  const jobUpdates: unknown[][] = [];
  const listingUpdates: { sql: string; params: unknown[] }[] = [];

  const client = {
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        return { rowCount: 0, rows: [] };
      }
      if (
        normalized.startsWith('SELECT id, seller_id, price_gbp, status')
        && normalized.includes('FROM listings')
      ) {
        const row = options.listings[String(params?.[0])];
        return row
          ? { rowCount: 1, rows: [{ id: params![0], ...row }] }
          : { rowCount: 0, rows: [] };
      }
      if (normalized.startsWith('UPDATE listings SET')) {
        listingUpdates.push({ sql: normalized, params: params ?? [] });
        return { rowCount: 1, rows: [] };
      }
      if (normalized.startsWith('INSERT INTO listing_price_events')) {
        return { rowCount: 1, rows: [{ id: 42 }] };
      }
      if (normalized.startsWith('INSERT INTO domain_outbox')) {
        return { rowCount: 1, rows: [{ id: 'evt_1' }] };
      }
      if (normalized.startsWith('INSERT INTO admin_audit_logs')) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };

  const db = {
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.startsWith('SELECT id, request_hash, status, applied_count')) {
        return options.existingJob
          ? { rowCount: 1, rows: [options.existingJob] }
          : { rowCount: 0, rows: [] };
      }
      if (normalized.startsWith('SELECT listing_id, status, reason, current_status, detail FROM listing_batch_items')) {
        const rows = options.existingItems ?? [];
        return { rowCount: rows.length, rows };
      }
      if (normalized.startsWith('INSERT INTO listing_batch_jobs')) {
        return { rowCount: 1, rows: [] };
      }
      if (normalized.startsWith('SELECT id, seller_id FROM listings WHERE id = ANY')) {
        const ids = (params?.[0] as string[]) ?? [];
        const rows = ids
          .filter((id) => options.listings[id])
          .map((id) => ({ id, seller_id: options.listings[id].seller_id }));
        return { rowCount: rows.length, rows };
      }
      if (normalized.startsWith('INSERT INTO listing_batch_items')) {
        itemInserts.push(params ?? []);
        return { rowCount: 1, rows: [] };
      }
      if (normalized.startsWith('UPDATE listing_batch_jobs')) {
        jobUpdates.push(params ?? []);
        return { rowCount: 1, rows: [] };
      }
      // Post-commit searchSync re-sync SELECT — return no row so the
      // in-memory adapter removes nothing and resolves cleanly.
      return { rowCount: 0, rows: [] };
    },
    async connect() {
      return client;
    },
  } as unknown as Pool;

  return { db, statements, itemInserts, jobUpdates, listingUpdates };
}

function register(app: FastifyInstance, db: Pool) {
  registerSellerHubRoutes({ app, readDb: db, db });
}

const AUTH_REQUEST = { authUser: { userId: 'seller_1' }, id: 'req_1' };

// ── Validation ─────────────────────────────────────────────────────────

test('edit command is accepted by the command whitelist', async () => {
  const { app, handlers } = createRouteHarness();
  const { db } = buildBatchDb({ listings: {} });
  register(app, db);

  const handler = handlers.get('POST /seller-hub/batch-command');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    {
      ...AUTH_REQUEST,
      body: {
        idempotencyKey: 'edit-key-1',
        command: 'edit',
        items: [{ listingId: 'l_missing', patch: { priceGbp: 10 } }],
      },
    },
    reply,
  );
  // Not a 400 — the command is whitelisted; the item is rejected not_found.
  assert.equal(reply.statusCode, 200);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].state, 'rejected');
  assert.equal(result.results[0].reason, 'not_found');
});

test('unknown commands are still rejected', async () => {
  const { app, handlers } = createRouteHarness();
  const { db } = buildBatchDb({ listings: {} });
  register(app, db);

  const handler = handlers.get('POST /seller-hub/batch-command');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    {
      ...AUTH_REQUEST,
      body: { idempotencyKey: 'k', command: 'explode', items: [{ listingId: 'l1' }] },
    },
    reply,
  );
  assert.equal(reply.statusCode, 400);
  assert.equal(result.ok, false);
});

// ── Applied path ───────────────────────────────────────────────────────

test('edit applies a valid patch and records the durable price-change trail', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements, itemInserts, listingUpdates } = buildBatchDb({
    listings: {
      l1: { seller_id: 'seller_1', price_gbp: '100.00', status: 'active' },
    },
  });
  register(app, db);

  const handler = handlers.get('POST /seller-hub/batch-command');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    {
      ...AUTH_REQUEST,
      body: {
        idempotencyKey: 'edit-key-2',
        command: 'edit',
        items: [{ listingId: 'l1', patch: { priceGbp: 80, brand: 'Nike' } }],
      },
    },
    reply,
  );

  assert.equal(result.ok, true);
  assert.equal(result.state, 'complete');
  assert.equal(result.appliedCount, 1);
  const receipt = result.results[0];
  assert.equal(receipt.listingId, 'l1');
  assert.equal(receipt.state, 'applied');
  assert.deepEqual(receipt.appliedFields, ['priceGbp', 'brand']);
  assert.equal(receipt.currentStatus, 'active');

  // The UPDATE writes the whitelisted columns only.
  assert.equal(listingUpdates.length, 1);
  assert.match(listingUpdates[0].sql, /price_gbp = \$1, brand = \$2, updated_at = NOW\(\)/);
  assert.deepEqual(listingUpdates[0].params, [80, 'Nike', 'l1']);

  // Price changed 100 → 80: durable price event + outbox event, in-transaction.
  assert.ok(statements.some((s) => s.startsWith('INSERT INTO listing_price_events')));
  assert.ok(statements.some((s) => s.startsWith('INSERT INTO domain_outbox')));
  // Audit row recorded (best-effort, inside the transaction).
  assert.ok(statements.some((s) => s.startsWith('INSERT INTO admin_audit_logs')));

  // Per-item receipt persisted with the applied-field detail.
  const appliedInsert = itemInserts.find((p) => p[1] === 'l1');
  assert.ok(appliedInsert);
  assert.equal(appliedInsert[2], 'applied');
  assert.deepEqual(JSON.parse(String(appliedInsert[5])), { appliedFields: ['priceGbp', 'brand'] });
});

test('edit with unchanged price does not emit a price event', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements } = buildBatchDb({
    listings: {
      l1: { seller_id: 'seller_1', price_gbp: '100.00', status: 'active' },
    },
  });
  register(app, db);

  const handler = handlers.get('POST /seller-hub/batch-command');
  assert.ok(handler);
  const result = await handler(
    {
      ...AUTH_REQUEST,
      body: {
        idempotencyKey: 'edit-key-3',
        command: 'edit',
        items: [{ listingId: 'l1', patch: { priceGbp: 100 } }],
      },
    },
    createReply(),
  );

  assert.equal(result.results[0].state, 'applied');
  assert.equal(statements.some((s) => s.startsWith('INSERT INTO listing_price_events')), false);
  assert.equal(statements.some((s) => s.startsWith('INSERT INTO domain_outbox')), false);
});

// ── Rejected paths ─────────────────────────────────────────────────────

test('edit rejects a patch that fails the shared whitelist validation', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, listingUpdates, itemInserts } = buildBatchDb({
    listings: {
      l1: { seller_id: 'seller_1', price_gbp: '100.00', status: 'active' },
    },
  });
  register(app, db);

  const handler = handlers.get('POST /seller-hub/batch-command');
  assert.ok(handler);
  const result = await handler(
    {
      ...AUTH_REQUEST,
      body: {
        idempotencyKey: 'edit-key-4',
        command: 'edit',
        items: [{ listingId: 'l1', patch: { priceGbp: -5 } }],
      },
    },
    createReply(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.state, 'partial');
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.results[0].state, 'rejected');
  assert.equal(result.results[0].reason, 'invalid_patch');
  // No listing mutation was attempted.
  assert.equal(listingUpdates.length, 0);
  const rejectedInsert = itemInserts.find((p) => p[1] === 'l1');
  assert.equal(rejectedInsert?.[2], 'rejected');
  assert.equal(rejectedInsert?.[3], 'invalid_patch');
});

test('edit rejects a patch containing non-whitelisted fields', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, listingUpdates } = buildBatchDb({
    listings: {
      l1: { seller_id: 'seller_1', price_gbp: '100.00', status: 'active' },
    },
  });
  register(app, db);

  const handler = handlers.get('POST /seller-hub/batch-command');
  assert.ok(handler);
  const result = await handler(
    {
      ...AUTH_REQUEST,
      body: {
        idempotencyKey: 'edit-key-5',
        command: 'edit',
        items: [{ listingId: 'l1', patch: { status: 'sold' } }],
      },
    },
    createReply(),
  );

  // `status` is stripped by the edit schema (it is in the single-PATCH
  // whitelist but excluded from bulk edit) — leaving an empty patch.
  assert.equal(result.results[0].state, 'rejected');
  assert.equal(result.results[0].reason, 'empty_patch');
  assert.equal(listingUpdates.length, 0);
});

test('edit rejects a listing owned by another seller', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, statements, listingUpdates, itemInserts } = buildBatchDb({
    listings: {
      l1: { seller_id: 'seller_2', price_gbp: '100.00', status: 'active' },
    },
  });
  register(app, db);

  const handler = handlers.get('POST /seller-hub/batch-command');
  assert.ok(handler);
  const result = await handler(
    {
      ...AUTH_REQUEST,
      body: {
        idempotencyKey: 'edit-key-6',
        command: 'edit',
        items: [{ listingId: 'l1', patch: { priceGbp: 50 } }],
      },
    },
    createReply(),
  );

  assert.equal(result.results[0].state, 'rejected');
  assert.equal(result.results[0].reason, 'forbidden');
  assert.equal(listingUpdates.length, 0);
  // The forbidden receipt was persisted (status/reason are SQL literals
  // in the early-return insert; params carry [batchId, listingId]).
  assert.ok(itemInserts.some((p) => p[1] === 'l1'));
  assert.ok(statements.some(
    (s) => s.startsWith('INSERT INTO listing_batch_items') && s.includes("'forbidden'"),
  ));
});

test('edit mixes per-item outcomes truthfully across a batch', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, jobUpdates } = buildBatchDb({
    listings: {
      l1: { seller_id: 'seller_1', price_gbp: '100.00', status: 'active' },
      l2: { seller_id: 'seller_2', price_gbp: '40.00', status: 'active' },
    },
  });
  register(app, db);

  const handler = handlers.get('POST /seller-hub/batch-command');
  assert.ok(handler);
  const result = await handler(
    {
      ...AUTH_REQUEST,
      body: {
        idempotencyKey: 'edit-key-7',
        command: 'edit',
        items: [
          { listingId: 'l1', patch: { priceGbp: 90 } },
          { listingId: 'l2', patch: { priceGbp: 30 } },
          { listingId: 'l_missing', patch: { priceGbp: 10 } },
        ],
      },
    },
    createReply(),
  );

  assert.equal(result.state, 'partial');
  assert.equal(result.appliedCount, 1);
  assert.equal(result.rejectedCount, 2);
  assert.deepEqual(
    result.results.map((r: { listingId: string; state: string }) => [r.listingId, r.state]),
    [['l1', 'applied'], ['l2', 'rejected'], ['l_missing', 'rejected']],
  );
  // Finalize wrote the truthful tallies onto the durable job row.
  const finalize = jobUpdates.at(-1);
  assert.deepEqual(finalize?.slice(1), [1, 2, 0]);
});

// ── Idempotent replay ──────────────────────────────────────────────────

test('a replayed idempotency key returns the persisted edit receipts', async () => {
  const { app, handlers } = createRouteHarness();
  const { db, listingUpdates } = buildBatchDb({
    listings: {
      l1: { seller_id: 'seller_1', price_gbp: '100.00', status: 'active' },
    },
    existingJob: {
      id: 'job_1',
      request_hash: 'hash_abc',
      status: 'completed',
      applied_count: 1,
      rejected_count: 0,
      conflict_count: 0,
      total_items: 1,
    },
    existingItems: [
      {
        listing_id: 'l1',
        status: 'applied',
        reason: null,
        current_status: 'active',
        detail: { appliedFields: ['priceGbp'] },
      },
    ],
  });
  register(app, db);

  const handler = handlers.get('POST /seller-hub/batch-command');
  assert.ok(handler);
  const result = await handler(
    {
      ...AUTH_REQUEST,
      body: {
        idempotencyKey: 'edit-key-8',
        command: 'edit',
        requestHash: 'hash_abc',
        items: [{ listingId: 'l1', patch: { priceGbp: 90 } }],
      },
    },
    createReply(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.batchId, 'job_1');
  assert.equal(result.state, 'complete');
  assert.equal(result.results[0].state, 'applied');
  // The durable applied-field detail survived the replay.
  assert.deepEqual(result.results[0].appliedFields, ['priceGbp']);
  // No mutation re-ran.
  assert.equal(listingUpdates.length, 0);
});
