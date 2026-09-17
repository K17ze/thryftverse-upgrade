import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { registerCoOwnRoutes } from '../routes/coOwn.js';

/**
 * GET /co-own/seller/:userId/verification-demands feeds
 * SellerVerificationScreen; POST .../verification-demand/:demandId/respond
 * is the submit action behind VerificationResponseScreen. Both were dead
 * callers — these tests pin the auth gating, the recourse-agreement join
 * (the liable seller is ra.seller_id, not the asset issuer), and the exact
 * camelCase response contract the client consumes unmodified.
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
    send(payload: unknown) {
      return payload;
    },
  };
}

function register(handlersDb: Pool, notifications: unknown[] = []) {
  const { app, handlers } = createRouteHarness();
  registerCoOwnRoutes({
    app,
    db: handlersDb,
    resolveAuthenticatedUserId: () => 'user_1',
    ensureUserExists: async () => {},
    createApiError: (code: string, message: string) =>
      Object.assign(new Error(message), { code }),
    getApiError: () => null,
    createRuntimeId: (prefix: string) => `${prefix}_test`,
    toJsonString: (value: unknown) => JSON.stringify(value),
    roundTo: (value: number, decimals: number) => {
      const factor = 10 ** decimals;
      return Math.round(value * factor) / factor;
    },
    parseQueryBoolean: () => false,
    appendComplianceAuditSafe: async () => {},
    queueUserNotification: async (input: unknown) => {
      notifications.push(input);
      return 'notif_1';
    },
    getOnezeMintBurnHaltState: async () => ({ halted: false }),
    ledgerTablesAvailable: async () => false,
    ensureLedgerAccount: async () => 1,
    appendLedgerEntry: async () => {},
  });
  return handlers;
}

const DEMAND_ROW = {
  id: '7',
  asset_id: 'asset_1',
  requested_by: 'buyer_9',
  demand_type: 'authenticity',
  deadline: '2026-04-01T00:00:00.000Z',
  status: 'pending',
  responded_at: null,
  evidence_url: null,
  evidence_notes: null,
  inspector_verdict: null,
  created_at: '2026-03-01T00:00:00.000Z',
  asset_title: 'Rolex Submariner',
  asset_image_url: 'https://cdn.example.com/rolex.jpg',
};

// ── GET /co-own/seller/:userId/verification-demands ──

test('seller verification-demands requires auth', async () => {
  const handlers = register({ query: async () => ({ rows: [], rowCount: 0 }) } as unknown as Pool);
  const handler = handlers.get('GET /co-own/seller/:userId/verification-demands');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler({ params: { userId: 'seller_1' }, log: { error() {} } }, reply);
  assert.equal(reply.statusCode, 401);
  assert.equal(result.ok, false);
});

test('seller verification-demands rejects other users, allows admin', async () => {
  const handlers = register({ query: async () => ({ rows: [], rowCount: 0 }) } as unknown as Pool);
  const handler = handlers.get('GET /co-own/seller/:userId/verification-demands');
  assert.ok(handler);

  const forbiddenReply = createReply();
  const forbidden = await handler(
    {
      authUser: { userId: 'seller_2', role: 'seller' },
      params: { userId: 'seller_1' },
      log: { error() {} },
    },
    forbiddenReply,
  );
  assert.equal(forbiddenReply.statusCode, 403);
  assert.equal(forbidden.ok, false);

  const adminReply = createReply();
  const admin = await handler(
    {
      authUser: { userId: 'admin_1', role: 'admin' },
      params: { userId: 'seller_1' },
      log: { error() {} },
    },
    adminReply,
  );
  assert.equal(adminReply.statusCode, 200);
  assert.equal(admin.ok, true);
  assert.deepEqual(admin.demands, []);
});

test('seller verification-demands joins via recourse agreement seller and serialises the client contract', async () => {
  const statements: string[] = [];
  const db = {
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      assert.deepEqual(params, ['seller_1']);
      return { rows: [DEMAND_ROW], rowCount: 1 };
    },
  } as unknown as Pool;
  const handlers = register(db);
  const handler = handlers.get('GET /co-own/seller/:userId/verification-demands');
  assert.ok(handler);

  const result = await handler(
    {
      authUser: { userId: 'seller_1', role: 'seller' },
      params: { userId: 'seller_1' },
      log: { error() {} },
    },
    createReply(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.demands.length, 1);
  const demand = result.demands[0];
  // Exact field names the client type SellerVerificationDemand requires.
  assert.deepEqual(Object.keys(demand).sort(), [
    'assetId',
    'assetImageUrl',
    'assetTitle',
    'createdAt',
    'deadline',
    'demandType',
    'evidenceNotes',
    'evidenceUrl',
    'id',
    'inspectorVerdict',
    'requestedBy',
    'respondedAt',
    'status',
  ]);
  assert.equal(demand.id, 7);
  assert.equal(demand.assetId, 'asset_1');
  assert.equal(demand.assetTitle, 'Rolex Submariner');
  assert.equal(demand.assetImageUrl, 'https://cdn.example.com/rolex.jpg');
  assert.equal(demand.deadline, '2026-04-01T00:00:00.000Z');

  const sql = statements[0];
  // Liable custodian join — same as the seller-hub task query.
  assert.match(sql, /JOIN coown_recourse_agreements ra ON ra\.asset_id = d\.asset_id/);
  assert.match(sql, /ra\.seller_id = \$1/);
  // Pending demands first, ordered by nearest deadline.
  assert.match(sql, /CASE WHEN d\.status = 'pending' THEN 0 ELSE 1 END/);
});

// ── POST /co-own/assets/:assetId/verification-demand/:demandId/respond ──

function buildRespondDb(opts: {
  demandRow?: Record<string, unknown> | null;
  updatedRow?: Record<string, unknown> | null;
}) {
  const statements: string[] = [];
  const client = {
    async query(sql: string, _params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.startsWith('UPDATE coown_verification_demands')) {
        return { rows: opts.updatedRow ? [opts.updatedRow] : [], rowCount: opts.updatedRow ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  } as unknown as PoolClient;
  const db = {
    async query(sql: string, _params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.startsWith('SELECT d.id, d.status, d.requested_by, ra.seller_id')) {
        return { rows: opts.demandRow ? [opts.demandRow] : [], rowCount: opts.demandRow ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      return client;
    },
  } as unknown as Pool;
  return { db, statements };
}

function respondRequest(authUser: unknown) {
  return {
    authUser,
    params: { assetId: 'asset_1', demandId: '7' },
    body: { evidenceUrl: 'https://cdn.example.com/evidence.jpg', evidenceNotes: 'Serial verified' },
    log: { error() {} },
  };
}

test('verification respond 404s when the demand does not exist', async () => {
  const { db } = buildRespondDb({ demandRow: null });
  const handlers = register(db);
  const handler = handlers.get('POST /co-own/assets/:assetId/verification-demand/:demandId/respond');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(respondRequest({ userId: 'seller_1', role: 'seller' }), reply);
  assert.equal(reply.statusCode, 404);
  assert.equal(result.ok, false);
});

test('verification respond 403s for anyone but the liable seller or admin', async () => {
  const { db } = buildRespondDb({
    demandRow: { id: '7', status: 'pending', requested_by: 'buyer_9', seller_id: 'seller_1' },
  });
  const handlers = register(db);
  const handler = handlers.get('POST /co-own/assets/:assetId/verification-demand/:demandId/respond');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(respondRequest({ userId: 'buyer_9', role: 'user' }), reply);
  assert.equal(reply.statusCode, 403);
  assert.equal(result.ok, false);
});

test('verification respond 409s when the demand is no longer pending', async () => {
  const { db } = buildRespondDb({
    demandRow: { id: '7', status: 'responded', requested_by: 'buyer_9', seller_id: 'seller_1' },
  });
  const handlers = register(db);
  const handler = handlers.get('POST /co-own/assets/:assetId/verification-demand/:demandId/respond');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(respondRequest({ userId: 'seller_1', role: 'seller' }), reply);
  assert.equal(reply.statusCode, 409);
  assert.equal(result.ok, false);
});

test('verification respond transitions a pending demand, logs the audit event and notifies the requester', async () => {
  const updatedRow = {
    ...DEMAND_ROW,
    status: 'responded',
    responded_at: '2026-03-05T12:00:00.000Z',
    evidence_url: 'https://cdn.example.com/evidence.jpg',
    evidence_notes: 'Serial verified',
  };
  const { db, statements } = buildRespondDb({
    demandRow: { id: '7', status: 'pending', requested_by: 'buyer_9', seller_id: 'seller_1' },
    updatedRow,
  });
  const notifications: unknown[] = [];
  const handlers = register(db, notifications);
  const handler = handlers.get('POST /co-own/assets/:assetId/verification-demand/:demandId/respond');
  assert.ok(handler);

  const reply = createReply();
  const result = await handler(respondRequest({ userId: 'seller_1', role: 'seller' }), reply);

  assert.equal(reply.statusCode, 200);
  assert.equal(result.ok, true);
  assert.equal(result.demand.status, 'responded');
  assert.equal(result.demand.evidenceUrl, 'https://cdn.example.com/evidence.jpg');
  assert.equal(result.demand.respondedAt, '2026-03-05T12:00:00.000Z');

  // Transactional: BEGIN → conditional UPDATE → audit event → counter → COMMIT.
  assert.ok(statements.includes('BEGIN'));
  assert.ok(statements.includes('COMMIT'));
  assert.ok(statements.some((s) => s.includes("WHERE id = $1 AND asset_id = $2 AND status = 'pending'")));
  assert.ok(statements.some((s) => s.includes("'verification_demand_responded'")));
  assert.ok(statements.some((s) => s.includes('active_verification_demands = GREATEST(0')));

  assert.equal(notifications.length, 1);
  assert.equal((notifications[0] as { userId: string }).userId, 'buyer_9');
});

test('verification respond does not notify platform-requested demands', async () => {
  const updatedRow = { ...DEMAND_ROW, status: 'responded', responded_at: '2026-03-05T12:00:00.000Z' };
  const { db } = buildRespondDb({
    demandRow: { id: '7', status: 'pending', requested_by: 'platform', seller_id: 'seller_1' },
    updatedRow,
  });
  const notifications: unknown[] = [];
  const handlers = register(db, notifications);
  const handler = handlers.get('POST /co-own/assets/:assetId/verification-demand/:demandId/respond');
  assert.ok(handler);
  const result = await handler(respondRequest({ userId: 'seller_1', role: 'seller' }), createReply());
  assert.equal(result.ok, true);
  assert.equal(notifications.length, 0);
});

// ── GET /co-own/assets/:assetId/recourse ──

test('asset recourse returns null agreement gracefully and serialises demands', async () => {
  const db = {
    async query(sql: string, _params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT id FROM coOwn_assets')) {
        return { rows: [{ id: 'asset_1' }], rowCount: 1 };
      }
      if (normalized.includes('FROM coown_recourse_agreements')) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.includes('FROM coown_verification_demands')) {
        return { rows: [DEMAND_ROW], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  const handlers = register(db);
  const handler = handlers.get('GET /co-own/assets/:assetId/recourse');
  assert.ok(handler);

  const result = await handler(
    {
      authUser: { userId: 'seller_1', role: 'seller' },
      params: { assetId: 'asset_1' },
      log: { error() {} },
    },
    createReply(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.agreement, null);
  assert.equal(result.sellerLiability, null);
  assert.equal(result.verificationDemands.length, 1);
  assert.equal(result.verificationDemands[0].demandType, 'authenticity');
  assert.deepEqual(result.events, []);
});

test('asset recourse 404s for an unknown asset', async () => {
  const db = {
    async query() {
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  const handlers = register(db);
  const handler = handlers.get('GET /co-own/assets/:assetId/recourse');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    {
      authUser: { userId: 'buyer_9', role: 'user' },
      params: { assetId: 'missing' },
      log: { error() {} },
    },
    reply,
  );
  assert.equal(reply.statusCode, 404);
  assert.equal(result.ok, false);
});
