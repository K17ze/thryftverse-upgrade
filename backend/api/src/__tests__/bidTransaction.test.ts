// Bid transaction correctness — tests for the in-stream bid endpoint and
// viewer-count membership logic registered by `registerStreamingRoutes`.
//
// The bid route handler is inline in `registerStreamingRoutes` and drives a
// pg transaction (`BEGIN` → `SELECT ... FOR UPDATE` → `INSERT` → `UPDATE
// ... GREATEST` → `COMMIT`) with `client.release()` in a `finally` block.
// These tests exercise that flow against a mock Fastify app and a mock pg
// pool/client, verifying the concurrency-correctness contract:
//   - `GREATEST(current_price, $2)` prevents price regression under reorder
//   - `SELECT ... FOR UPDATE` serializes concurrent bids
//   - `clientBidId` provides idempotent inserts
//   - `BID_TOO_LOW` rejects bids at or below the locked price
//   - serialization conflicts (SQLSTATE 40001/40P01) surface as BID_CONFLICT
//   - viewer count is mutated only via the leave route for known members
//
// Uses `node:test` (no vitest dependency) per the codebase test runner.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// `registerStreamingRoutes` transitively imports `lib/realtime.js`, whose
// `publishRealtimeEvent` is fire-and-forget in the bid route but still
// initialises a shared Redis client (`getRedisClient`) that retries forever
// and keeps the process alive. `node:test` has no `vi.mock`, so we register
// an ESM `load` hook (before the dynamic import below) that substitutes a
// no-op `publishRealtimeEvent` for `lib/realtime`. This isolates the bid
// transaction logic from the realtime/Redis transport without touching the
// route code under test.
const loaderSource = [
  'export async function load(url, context, nextLoad) {',
  "  if (url.includes('/lib/realtime')) {",
  '    return {',
  '      format: "module",',
  "      source: 'export async function publishRealtimeEvent() { return 0; }',",
  '      shortCircuit: true,',
  '    };',
  '  }',
  '  return nextLoad(url, context);',
  '}',
].join('\n');
const loaderUrl =
  'data:text/javascript;base64,' +
  Buffer.from(loaderSource).toString('base64');
register(loaderUrl, import.meta.url);

const { registerStreamingRoutes } = await import('../routes/streaming.js');

// ── Types ────────────────────────────────────────────────────────────────────

interface CapturedRequest {
  body: unknown;
  params: Record<string, string>;
  authUser?: { userId?: string; role?: string };
}

interface MockReply {
  code: (c: number) => MockReply;
  _sentCode: number;
}

type RouteHandler = (
  request: CapturedRequest,
  reply: MockReply,
) => Promise<unknown> | unknown;

interface QueryCall {
  sql: string;
  args: unknown[];
}

interface PoolClient {
  query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[] }>;
  release: () => void;
}

interface MockDb {
  query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[] }>;
  connect: () => Promise<PoolClient>;
  queryCalls: QueryCall[];
}

// ── Mock Fastify app ─────────────────────────────────────────────────────────
// Captures handlers by route path. Supports both the 2-arg
// `app.post(path, handler)` and 3-arg `app.post(path, opts, handler)` forms.

function createMockApp() {
  const handlers = new Map<string, RouteHandler>();
  // `registerStreamingRoutes` registers post/get/put routes; only the ones we
  // assert on are actually invoked. All capture the last argument as the
  // handler, supporting both 2-arg and 3-arg (opts) registration forms.
  const capture = (path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler) => {
    const handler = maybeHandler ?? (optsOrHandler as RouteHandler);
    handlers.set(path, handler);
  };
  const app = {
    post: (path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler) =>
      capture(path, optsOrHandler, maybeHandler),
    get: (path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler) =>
      capture(path, optsOrHandler, maybeHandler),
    put: (path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler) =>
      capture(path, optsOrHandler, maybeHandler),
    delete: (path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler) =>
      capture(path, optsOrHandler, maybeHandler),
    patch: (path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler) =>
      capture(path, optsOrHandler, maybeHandler),
  };
  return {
    app: app as unknown as Parameters<typeof registerStreamingRoutes>[0]['app'],
    handlers,
  };
}

function createMockReply(): MockReply {
  const reply: MockReply = { _sentCode: 200, code: () => reply };
  reply.code = (c: number) => {
    reply._sentCode = c;
    return reply;
  };
  return reply;
}

function makeRequest(
  params: Record<string, string>,
  body: unknown,
  authUser?: { userId?: string; role?: string },
): CapturedRequest {
  return { params, body, authUser };
}

async function invoke(
  handlers: Map<string, RouteHandler>,
  path: string,
  params: Record<string, string>,
  body: unknown,
  authUser?: { userId?: string; role?: string },
): Promise<{ result: unknown; reply: MockReply }> {
  const handler = handlers.get(path);
  assert.ok(handler, `route ${path} was not registered`);
  const reply = createMockReply();
  const result = await handler(makeRequest(params, body, authUser), reply);
  return { result, reply };
}

// ── Mock pg Pool / PoolClient ────────────────────────────────────────────────

const LOT_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  session_id: 'sess-1',
  listing_id: 'listing-1',
  lot_number: 1,
  current_price: '50',
  bid_count: 0,
  updated_at: new Date().toISOString(),
  ...overrides,
});

const LIVE_LOT_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'lot_sess-1',
  session_id: 'sess-1',
  listing_id: 'listing-1',
  lot_number: 1,
  position: 0,
  status: 'open',
  currency: 'GBP',
  start_price_minor: 0,
  reserve_price_minor: null,
  min_increment_minor: 100,
  high_bid_id: null,
  high_bid_minor: 5000,
  high_bidder_id: null,
  winner_id: null,
  order_id: null,
  version: 1,
  opens_at: null,
  closes_at: null,
  closed_at: null,
  extension_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const SESSION_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'sess-1',
  title: 'Live auction',
  host_user_id: 'host-1',
  status: 'live',
  room_url: 'ws://localhost:7880',
  recording_url: null,
  recording_enabled: false,
  max_viewers: 100,
  viewer_count: 5,
  metadata: {},
  created_at: new Date().toISOString(),
  started_at: null,
  ended_at: null,
  ...overrides,
});

/**
 * Build a mock PoolClient whose `query` responses are driven by a list of
 * per-step handlers keyed off the SQL text. The `clientQueries` array records
 * every call in order so tests can assert transaction flow.
 */
function createMockClient(options: {
  begin?: () => Promise<void>;
  selectForUpdate?: (sessionId: string) => Promise<{ rows: unknown[] }>;
  selectExistingBid?: (bidId: string) => Promise<{ rows: unknown[] }>;
  insertBid?: (args: unknown[]) => Promise<{ rows: unknown[] }>;
  updateLotPrice?: (args: unknown[]) => Promise<{ rows: unknown[] }>;
  updatePrice?: (args: unknown[]) => Promise<{ rows: unknown[] }>;
  commit?: () => Promise<void>;
  rollback?: () => Promise<void>;
}): {
  client: PoolClient;
  clientQueries: QueryCall[];
  releaseCalls: number;
} {
  const clientQueries: QueryCall[] = [];
  let releaseCalls = 0;

  const client: PoolClient = {
    query: async (sql: string, args: unknown[] = []) => {
      clientQueries.push({ sql, args });
      if (sql === 'BEGIN') {
        if (options.begin) await options.begin();
        return { rows: [] };
      }
      if (sql === 'COMMIT') {
        if (options.commit) await options.commit();
        return { rows: [] };
      }
      if (sql === 'ROLLBACK') {
        if (options.rollback) await options.rollback();
        return { rows: [] };
      }
      if (sql.includes('FOR UPDATE') && sql.includes('live_lots')) {
        return options.selectForUpdate
          ? options.selectForUpdate(String(args[0]))
          : { rows: [LIVE_LOT_ROW()] };
      }
      if (sql.includes('FOR UPDATE')) {
        return options.selectForUpdate
          ? options.selectForUpdate(String(args[0]))
          : { rows: [LOT_ROW()] };
      }
      if (sql.includes('SELECT id FROM live_shopping_bids')) {
        return options.selectExistingBid
          ? options.selectExistingBid(String(args[0]))
          : { rows: [] };
      }
      if (sql.includes('INSERT INTO live_shopping_bids')) {
        return options.insertBid ? options.insertBid(args) : { rows: [] };
      }
      if (sql.includes('UPDATE live_lots') && sql.includes('GREATEST')) {
        return options.updateLotPrice ? options.updateLotPrice(args) : { rows: [LIVE_LOT_ROW()] };
      }
      if (sql.includes('UPDATE live_lots')) {
        return { rows: [] };
      }
      if (sql.includes('UPDATE live_shopping_current_lots')) {
        return options.updatePrice ? options.updatePrice(args) : { rows: [LOT_ROW()] };
      }
      return { rows: [] };
    },
    release: () => {
      releaseCalls++;
    },
  };

  return {
    client,
    clientQueries,
    // Getter so tests read the live count after the handler runs, rather
    // than a primitive snapshot taken at mock-creation time.
    get releaseCalls() {
      return releaseCalls;
    },
  };
}

/**
 * Build a mock Pool. `db.query` serves `fetchSessionRow` / `fetchCurrentLotRow`
 * (SELECTs against `live_shopping_sessions` / `live_shopping_current_lots`).
 * `db.connect` returns the provided mock client.
 */
function createMockDb(
  client: PoolClient,
  sessionRow: Record<string, unknown> | null = SESSION_ROW(),
  lotRow: Record<string, unknown> | null = LOT_ROW(),
): MockDb {
  const queryCalls: QueryCall[] = [];
  const db: MockDb = {
    query: async (sql: string, args: unknown[] = []) => {
      queryCalls.push({ sql, args });
      if (sql.includes('live_shopping_sessions')) {
        return { rows: sessionRow ? [sessionRow] : [] };
      }
      if (sql.includes('live_shopping_current_lots')) {
        return { rows: lotRow ? [lotRow] : [] };
      }
      return { rows: [] };
    },
    connect: async () => client,
    queryCalls,
  };
  return db;
}

// ── Shared deps ──────────────────────────────────────────────────────────────

function createDeps(db: MockDb): Parameters<typeof registerStreamingRoutes>[0] {
  return {
    app: undefined as unknown as Parameters<typeof registerStreamingRoutes>[0]['app'],
    db: db as unknown as Parameters<typeof registerStreamingRoutes>[0]['db'],
    createApiError: ((code: string, message: string) =>
      Object.assign(new Error(message), { code })) as Parameters<
      typeof registerStreamingRoutes
    >[0]['createApiError'],
    resolveAuthenticatedUserId: ((request: CapturedRequest) =>
      request.authUser?.userId ?? 'user-1') as Parameters<
      typeof registerStreamingRoutes
    >[0]['resolveAuthenticatedUserId'],
  };
}

// ── Test setup ───────────────────────────────────────────────────────────────
// `registerStreamingRoutes` is invoked once per test with a fresh mock app/db
// so query-call assertions are isolated.

function setup(options: {
  sessionRow?: Record<string, unknown> | null;
  lotRow?: Record<string, unknown> | null;
  clientOptions?: Parameters<typeof createMockClient>[0];
}) {
  const { app, handlers } = createMockApp();
  const clientState = createMockClient(options.clientOptions ?? {});
  const db = createMockDb(
    clientState.client,
    options.sessionRow ?? SESSION_ROW(),
    options.lotRow ?? LOT_ROW(),
  );
  const deps = createDeps(db);
  deps.app = app;
  registerStreamingRoutes(deps);
  return {
    handlers,
    db,
    client: clientState.client,
    clientQueries: clientState.clientQueries,
    // Live counter (function reference) so tests read the value AFTER the
    // handler has run, not a primitive snapshot captured at setup time.
    releaseCount: () => clientState.releaseCalls,
  };
}

beforeEach(() => {
  // `publishRealtimeEvent` is fire-and-forget (`void`) in the bid route and
  // degrades gracefully without Redis, so no module mock is required. The
  // module-level `activeViewersBySession` map persists across tests, but each
  // test uses distinct session/user identifiers where membership matters.
});

// ── 1. GREATEST prevents price regression ────────────────────────────────────

describe('GREATEST prevents price regression', () => {
  it('keeps the higher price when a lower bid is applied after a higher one', async () => {
    // Simulate two concurrent bids that both read the same baseline price
    // (£50) before either UPDATE commits — i.e. the window `FOR UPDATE`
    // closes in production, but which the `GREATEST(current_price, $2)`
    // clause defends against as belt-and-suspenders. The mock `selectForUpdate`
    // always returns the fixed baseline so both bids pass the
    // `amount > lockedPrice` check and reach the UPDATE. The `updatePrice`
    // mock applies `Math.max(current, amount)` to mirror the SQL
    // `GREATEST(current_price, $2)` semantics against shared row state.
    const baseline = LOT_ROW({ current_price: '50', bid_count: 0 });
    const sharedRow = { ...baseline };

    const clientState = createMockClient({
      selectForUpdate: async () => ({ rows: [{ ...baseline }] }),
      updatePrice: async (args) => {
        const amount = Number(args[1]);
        const current = Number(sharedRow.current_price);
        const next = Math.max(current, amount); // mirrors GREATEST
        sharedRow.current_price = String(next);
        sharedRow.bid_count = Number(sharedRow.bid_count) + 1;
        return { rows: [{ ...sharedRow }] };
      },
    });

    const db = createMockDb(clientState.client);
    const { app, handlers } = createMockApp();
    const deps = createDeps(db);
    deps.app = app;
    registerStreamingRoutes(deps);

    // Bid £60 — price rises from £50 to £60.
    const r1 = await invoke(handlers, '/streaming/sessions/:sessionId/bids', { sessionId: 'sess-1' }, { amount: 60 });
    assert.equal(r1.reply._sentCode, 201);
    assert.equal((r1.result as { lot: { currentPrice: number } }).lot.currentPrice, 60);

    // Bid £55 — concurrent read saw £50 so it passes the check, but the
    // GREATEST UPDATE must NOT regress the row back to £55.
    const r2 = await invoke(handlers, '/streaming/sessions/:sessionId/bids', { sessionId: 'sess-1' }, { amount: 55 });
    assert.equal(r2.reply._sentCode, 201);
    assert.equal((r2.result as { lot: { currentPrice: number } }).lot.currentPrice, 60);

    // The shared row state (what the DB would hold) is £60, not £55.
    assert.equal(Number(sharedRow.current_price), 60);

    // The UPDATE SQL must use GREATEST(current_price, $2), not a plain
    // assignment that would overwrite with the lower amount.
    const updateCalls = clientState.clientQueries.filter((c) =>
      c.sql.includes('UPDATE live_shopping_current_lots'),
    );
    assert.equal(updateCalls.length, 2);
    assert.ok(
      updateCalls.every((c) => c.sql.includes('GREATEST(current_price, $2)')),
      'UPDATE must use GREATEST(current_price, $2)',
    );

    // Both transactions released their clients.
    assert.equal(clientState.releaseCalls, 2);
  });
});

// ── 2. FOR UPDATE serializes concurrent bids ─────────────────────────────────

describe('FOR UPDATE serializes concurrent bids', () => {
  it('issues BEGIN, then SELECT ... FOR UPDATE, then UPDATE, then COMMIT, and releases in finally', async () => {
    const { handlers, clientQueries, releaseCount } = setup({
      clientOptions: {
        selectForUpdate: async () => ({ rows: [LOT_ROW({ current_price: '50' })] }),
        updatePrice: async (args) => ({
          rows: [LOT_ROW({ current_price: String(args[1]), bid_count: 1 })],
        }),
      },
    });

    await invoke(handlers, '/streaming/sessions/:sessionId/bids', { sessionId: 'sess-1' }, { amount: 60 });

    // BEGIN must be the first client query.
    assert.equal(clientQueries[0].sql, 'BEGIN');

    // SELECT ... FOR UPDATE must be the first query after BEGIN.
    assert.ok(
      clientQueries[1].sql.includes('FOR UPDATE'),
      'second query must be the locking SELECT',
    );
    assert.ok(
      clientQueries[1].sql.includes('live_lots'),
      'lock must be on live_lots',
    );

    // COMMIT must come after the UPDATE.
    const updateIdx = clientQueries.findIndex((c) =>
      c.sql.includes('UPDATE live_shopping_current_lots'),
    );
    const commitIdx = clientQueries.findIndex((c) => c.sql === 'COMMIT');
    assert.ok(updateIdx > -1, 'UPDATE must be issued');
    assert.ok(commitIdx > -1, 'COMMIT must be issued');
    assert.ok(commitIdx > updateIdx, 'COMMIT must follow the UPDATE');

    // client.release() must be called exactly once (finally block).
    assert.equal(releaseCount(), 1);
  });
});

// ── 3. clientBidId idempotency ───────────────────────────────────────────────

describe('clientBidId idempotency', () => {
  it('inserts on first call and returns idempotent success on duplicate clientBidId', async () => {
    const seenBidIds = new Set<string>();
    const lotRow = LOT_ROW({ current_price: '60', bid_count: 1 });

    const { client, clientQueries } = createMockClient({
      selectForUpdate: async () => ({ rows: [LOT_ROW({ current_price: '50' })] }),
      selectExistingBid: async (bidId) => ({
        rows: seenBidIds.has(bidId) ? [{ id: bidId }] : [],
      }),
      insertBid: async (args) => {
        seenBidIds.add(String(args[0]));
        return { rows: [] };
      },
      updatePrice: async (args) => ({
        rows: [LOT_ROW({ current_price: String(args[1]), bid_count: 1 })],
      }),
    });
    const db = createMockDb(client, SESSION_ROW(), lotRow);
    const { app, handlers } = createMockApp();
    const deps = createDeps(db);
    deps.app = app;
    registerStreamingRoutes(deps);

    const clientBidId = '11111111-1111-1111-1111-111111111111';

    // First call: INSERT succeeds, returns 201.
    const r1 = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/bids',
      { sessionId: 'sess-1' },
      { amount: 60, clientBidId },
    );
    assert.equal(r1.reply._sentCode, 201);
    assert.equal((r1.result as { ok: boolean }).ok, true);

    const insertCalls = clientQueries.filter((c) =>
      c.sql.includes('INSERT INTO live_shopping_bids'),
    );
    assert.equal(insertCalls.length, 1, 'first call must INSERT exactly once');

    // Second call: existing bid found → idempotent success, no INSERT.
    const r2 = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/bids',
      { sessionId: 'sess-1' },
      { amount: 60, clientBidId },
    );
    const body2 = r2.result as { ok: boolean; success: boolean; idempotent: boolean };
    assert.equal(body2.ok, true);
    assert.equal(body2.success, true);
    assert.equal(body2.idempotent, true);

    const insertCallsAfterDup = clientQueries.filter((c) =>
      c.sql.includes('INSERT INTO live_shopping_bids'),
    );
    assert.equal(
      insertCallsAfterDup.length,
      1,
      'duplicate clientBidId must not INSERT again',
    );

    // The duplicate path must ROLLBACK (it acquired a lock but took no action).
    const rollbackCalls = clientQueries.filter((c) => c.sql === 'ROLLBACK');
    assert.ok(rollbackCalls.length >= 1, 'idempotent path must ROLLBACK');
  });
});

// ── 4. BID_TOO_LOW rejection ─────────────────────────────────────────────────

describe('BID_TOO_LOW rejection', () => {
  it('rejects a bid at or below the locked price with 422 and ROLLBACK', async () => {
    const { handlers, clientQueries, releaseCount } = setup({
      lotRow: LOT_ROW({ current_price: '50' }),
      clientOptions: {
        selectForUpdate: async () => ({ rows: [LIVE_LOT_ROW({ high_bid_minor: 5000, min_increment_minor: 100 })] }),
      },
    });

    const { result, reply } = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/bids',
      { sessionId: 'sess-1' },
      { amount: 45 },
    );

    assert.equal(reply._sentCode, 422);
    const body = result as { ok: boolean; code: string; currentPrice: number };
    assert.equal(body.ok, false);
    assert.equal(body.code, 'BID_TOO_LOW');
    assert.equal(body.currentPrice, 50);

    // ROLLBACK must be issued before returning.
    const rollbackIdx = clientQueries.findIndex((c) => c.sql === 'ROLLBACK');
    assert.ok(rollbackIdx > -1, 'BID_TOO_LOW must ROLLBACK');

    // No INSERT or UPDATE should have run.
    assert.ok(
      !clientQueries.some((c) => c.sql.includes('INSERT INTO live_shopping_bids')),
      'must not INSERT on a too-low bid',
    );
    assert.ok(
      !clientQueries.some((c) => c.sql.includes('UPDATE live_shopping_current_lots')),
      'must not UPDATE price on a too-low bid',
    );

    // Client still released in finally.
    assert.equal(releaseCount(), 1);
  });
});

// ── 5. Serialization conflict returns BID_CONFLICT ───────────────────────────

describe('serialization conflict returns BID_CONFLICT', () => {
  it('maps a COMMIT failure with SQLSTATE 40001 to 409 BID_CONFLICT', async () => {
    const conflictError = Object.assign(new Error('could not serialize access'), {
      code: '40001',
    });

    const { handlers, releaseCount } = setup({
      clientOptions: {
        selectForUpdate: async () => ({ rows: [LOT_ROW({ current_price: '50' })] }),
        updatePrice: async (args) => ({
          rows: [LOT_ROW({ current_price: String(args[1]), bid_count: 1 })],
        }),
        commit: async () => {
          throw conflictError;
        },
      },
    });

    const { result, reply } = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/bids',
      { sessionId: 'sess-1' },
      { amount: 60 },
    );

    assert.equal(reply._sentCode, 409);
    const body = result as { ok: boolean; error: string; code: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, 'BID_CONFLICT');
    assert.equal(body.code, 'BID_CONFLICT');

    // The client must still be released despite the thrown COMMIT.
    assert.equal(releaseCount(), 1);
  });

  it('maps a deadlock SQLSTATE 40P01 to 409 BID_CONFLICT', async () => {
    const deadlockError = Object.assign(new Error('deadlock detected'), {
      code: '40P01',
    });

    const { handlers, releaseCount } = setup({
      clientOptions: {
        selectForUpdate: async () => ({ rows: [LOT_ROW({ current_price: '50' })] }),
        updatePrice: async (args) => ({
          rows: [LOT_ROW({ current_price: String(args[1]), bid_count: 1 })],
        }),
        commit: async () => {
          throw deadlockError;
        },
      },
    });

    const { result, reply } = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/bids',
      { sessionId: 'sess-1' },
      { amount: 60 },
    );

    assert.equal(reply._sentCode, 409);
    assert.equal((result as { code: string }).code, 'BID_CONFLICT');
    assert.equal(releaseCount(), 1);
  });
});

// ── 6. Viewer count not incremented on token issuance ────────────────────────

describe('viewer count not incremented on token issuance', () => {
  it('does not UPDATE viewer_count and tracks membership in-memory', async () => {
    // Use a unique session/user so the module-level activeViewersBySession map
    // is not polluted by other tests.
    const sessionId = 'sess-token-6';
    const userId = 'viewer-6';
    const sessionRow = SESSION_ROW({
      id: sessionId,
      host_user_id: 'host-6',
      status: 'live',
      viewer_count: 7,
    });

    const { client } = createMockClient({});
    const db = createMockDb(client, sessionRow, null);
    const { app, handlers } = createMockApp();
    const deps = createDeps(db);
    deps.app = app;
    registerStreamingRoutes(deps);

    const { result, reply } = await invoke(
      handlers,
      '/streaming/sessions/:roomId/token',
      { roomId: sessionId },
      { role: 'viewer' },
      { userId, role: 'viewer' },
    );

    assert.equal(reply._sentCode, 200);
    assert.equal((result as { ok: boolean }).ok, true);

    // No query against the primary pool may increment viewer_count.
    const viewerIncrementCalls = db.queryCalls.filter((c) =>
      c.sql.includes('viewer_count = viewer_count + 1'),
    );
    assert.equal(
      viewerIncrementCalls.length,
      0,
      'token issuance must not increment viewer_count in DB',
    );

    // Membership is recorded in-memory: a subsequent leave for this user must
    // proceed to the decrement UPDATE (proving the user was added to the set).
    const leaveResult = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/leave',
      { sessionId },
      {},
      { userId, role: 'viewer' },
    );
    const leaveBody = leaveResult.result as { ok: boolean };
    assert.equal(leaveBody.ok, true);

    const decrementCalls = db.queryCalls.filter((c) =>
      c.sql.includes('viewer_count = GREATEST(0, viewer_count - 1)'),
    );
    assert.equal(
      decrementCalls.length,
      1,
      'leave after token issuance must decrement viewer_count (proves set membership)',
    );
  });
});

// ── 7. Leave route requires membership ───────────────────────────────────────

describe('leave route requires membership', () => {
  it('does not decrement viewer_count for a user not in activeViewersBySession', async () => {
    const sessionId = 'sess-leave-7';
    const userId = 'lonely-viewer-7';
    const sessionRow = SESSION_ROW({
      id: sessionId,
      host_user_id: 'host-7',
      status: 'live',
      viewer_count: 3,
    });

    const { client } = createMockClient({});
    const db = createMockDb(client, sessionRow, null);
    const { app, handlers } = createMockApp();
    const deps = createDeps(db);
    deps.app = app;
    registerStreamingRoutes(deps);

    // The user never obtained a token, so they are not in the in-memory set.
    const { result, reply } = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/leave',
      { sessionId },
      {},
      { userId, role: 'viewer' },
    );

    assert.equal(reply._sentCode, 200);
    const body = result as { ok: boolean; viewerCount: number };
    assert.equal(body.ok, true);
    assert.equal(body.viewerCount, 3, 'must return the unchanged viewer_count');

    const decrementCalls = db.queryCalls.filter((c) =>
      c.sql.includes('viewer_count = GREATEST(0, viewer_count - 1)'),
    );
    assert.equal(
      decrementCalls.length,
      0,
      'leave for a non-member must not decrement viewer_count',
    );
  });

  it('does not decrement viewer_count for the host', async () => {
    const sessionId = 'sess-leave-host';
    const hostUserId = 'host-7b';
    const sessionRow = SESSION_ROW({
      id: sessionId,
      host_user_id: hostUserId,
      status: 'live',
      viewer_count: 4,
    });

    const { client } = createMockClient({});
    const db = createMockDb(client, sessionRow, null);
    const { app, handlers } = createMockApp();
    const deps = createDeps(db);
    deps.app = app;
    registerStreamingRoutes(deps);

    const { result, reply } = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/leave',
      { sessionId },
      {},
      { userId: hostUserId, role: 'host' },
    );

    assert.equal(reply._sentCode, 200);
    assert.equal((result as { viewerCount: number }).viewerCount, 4);

    const decrementCalls = db.queryCalls.filter((c) =>
      c.sql.includes('viewer_count = GREATEST(0, viewer_count - 1)'),
    );
    assert.equal(decrementCalls.length, 0, 'host leave must not decrement');
  });
});
