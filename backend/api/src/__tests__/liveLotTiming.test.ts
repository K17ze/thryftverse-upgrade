// Live-lot server timing — tests for the open deadline, the auto-close sweep
// and the bounded anti-snipe extension in the in-stream bid endpoint.
//
// Coverage:
//   - POST /lots/:lotId/open stamps closes_at from durationSeconds
//   - sweepDueLiveLots closes due lots through the shared closeLiveLot path
//     (sold above reserve / passed otherwise) and skips non-due rows by SQL
//   - closeLiveLot refuses non-open lots (LOT_NOT_CLOSABLE)
//   - bid inside the 30s window extends closes_at by 30s and writes
//     lot.extension to live_lot_events
//   - bid outside the window does not extend
//   - extension cap (5) blocks further extensions
//   - bid at/after closes_at is rejected (LOT_BIDDING_CLOSED) even though the
//     lot row still reads 'open' — the deadline is authoritative
//   - auto_close re-verifies closes_at under the lock (LOT_NOT_DUE) so a
//     pre-deadline anti-snipe extension is never truncated by the sweep
//   - a failing lot is isolated — the sweep reports it and keeps going
//   - re-opening a passed lot resets high bid / winner / extension state
//   - settlement charges the winning bid (high_bid_minor), not the list price
//   - the lot seller cannot bid on their own lot (SELLER_RESTRICTED)
//   - the first bid must clear start_price (BID_TOO_LOW floor)
//
// Uses `node:test` with mock Fastify/pg per the codebase test runner
// (mirrors bidTransaction.test.ts).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Substitute no-op modules for the realtime transport (Redis) and the order
// chat-card emitter (db pool + message encryption) before the dynamic import
// so the lot engine can be exercised without infrastructure.
const loaderSource = [
  'export async function load(url, context, nextLoad) {',
  "  if (url.includes('/lib/realtime')) {",
  '    return {',
  '      format: "module",',
  "      source: 'export async function publishRealtimeEvent() { return 0; }',",
  '      shortCircuit: true,',
  '    };',
  '  }',
  "  if (url.includes('/lib/orderChatCards')) {",
  '    return {',
  '      format: "module",',
  "      source: 'export async function emitOrderCommerceCard() { return null; }',",
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

const {
  registerLiveLotEngineRoutes,
  closeLiveLot,
  sweepDueLiveLots,
  LIVE_LOT_ANTI_SNIPE_WINDOW_MS,
  LIVE_LOT_ANTI_SNIPE_EXTENSION_SECONDS,
  LIVE_LOT_ANTI_SNIPE_MAX_EXTENSIONS,
} = await import('../routes/liveLotEngine.js');
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

// ── Row factories ────────────────────────────────────────────────────────────

const SESSION_ROW = (overrides: Record<string, unknown> = {}) => ({
  id: 'sess-1',
  title: 'Live auction',
  host_user_id: 'host-1',
  status: 'live',
  ...overrides,
});

const LIVE_LOT_ROW = (overrides: Record<string, unknown> = {}) => ({
  id: 'lot-1',
  session_id: 'sess-1',
  listing_id: 'listing-1',
  lot_number: 1,
  position: 0,
  status: 'open',
  currency: 'GBP',
  start_price_minor: '0',
  reserve_price_minor: null,
  min_increment_minor: '100',
  high_bid_id: null,
  high_bid_minor: '5000',
  high_bidder_id: 'bidder-1',
  winner_id: null,
  order_id: null,
  version: 1,
  opens_at: new Date().toISOString(),
  closes_at: null,
  closed_at: null,
  extension_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  // Joined listings.status the bid path re-checks — the listing must stay
  // biddable ('active'/'paused') for a bid to land.
  listing_status: 'active',
  ...overrides,
});

const CURRENT_LOT_ROW = (overrides: Record<string, unknown> = {}) => ({
  session_id: 'sess-1',
  listing_id: 'listing-1',
  lot_number: 1,
  current_price: '50',
  bid_count: 0,
  high_bidder_id: null,
  updated_at: new Date().toISOString(),
  lot_closes_at: null,
  lot_extension_count: 0,
  ...overrides,
});

// ── Mock Fastify app ─────────────────────────────────────────────────────────

function createMockApp() {
  const handlers = new Map<string, RouteHandler>();
  const capture = (path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler) => {
    handlers.set(path, maybeHandler ?? (optsOrHandler as RouteHandler));
  };
  const app = {
    post: (p: string, o: unknown, h?: RouteHandler) => capture(p, o, h),
    get: (p: string, o: unknown, h?: RouteHandler) => capture(p, o, h),
    put: (p: string, o: unknown, h?: RouteHandler) => capture(p, o, h),
    delete: (p: string, o: unknown, h?: RouteHandler) => capture(p, o, h),
    patch: (p: string, o: unknown, h?: RouteHandler) => capture(p, o, h),
  };
  return { app, handlers };
}

function createMockReply(): MockReply {
  const reply: MockReply = { _sentCode: 200, code: () => reply };
  reply.code = (c: number) => {
    reply._sentCode = c;
    return reply;
  };
  return reply;
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
  const result = await handler({ params, body, authUser }, reply);
  return { result, reply };
}

const createApiError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });
const resolveUser = (request: CapturedRequest) =>
  request.authUser?.userId ?? 'user-1';

// ── Engine-route client mock ─────────────────────────────────────────────────
// Routes the per-transaction queries the engine issues (BEGIN, FOR UPDATE
// lock on live_lots, UPDATE ... RETURNING *, live_lot_events INSERT, COMMIT).

function createEngineClient(lotRows: Record<string, unknown>[]) {
  const queries: QueryCall[] = [];
  const lotById = new Map(lotRows.map((r) => [String(r.id), r]));
  const closed: Record<string, unknown>[] = [];
  const client: PoolClient = {
    query: async (sql: string, args: unknown[] = []) => {
      queries.push({ sql, args });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      if (sql.includes('FROM live_lots') && sql.includes('FOR UPDATE')) {
        const row = lotById.get(String(args[0]));
        if (!row) return { rows: [] };
        // Mirror the `(closes_at IS NOT NULL AND closes_at <= NOW()) AS
        // due_now` column the closeLiveLot lock select computes on the DB
        // clock.
        const closesAt = row.closes_at ? Date.parse(String(row.closes_at)) : null;
        return {
          rows: [{ ...row, due_now: closesAt !== null && closesAt <= Date.now() }],
        };
      }
      // closeLiveLot's transition sets status from a bound parameter
      // (`SET status = $2`); the re-open transition sets the 'open' literal
      // plus the bid-state resets — `winner_id` alone no longer
      // discriminates because re-open clears it too.
      if (sql.includes('UPDATE live_lots') && sql.includes('SET status = $2')) {
        const row = lotById.get(String(args[0]))!;
        const updated = {
          ...row,
          status: String(args[1]),
          winner_id: (args[2] as string | null) ?? null,
          closed_at: new Date().toISOString(),
          version: Number(row.version) + 1,
        };
        lotById.set(String(args[0]), updated);
        closed.push(updated);
        return { rows: [updated] };
      }
      if (sql.includes('UPDATE live_lots') && sql.includes('opens_at')) {
        const row = lotById.get(String(args[0]))!;
        const updated = {
          ...row,
          status: 'open',
          opens_at: new Date().toISOString(),
          closes_at: args[1] ?? null,
          // Re-open resets every trace of the previous bidding round.
          high_bid_id: null,
          high_bid_minor: '0',
          high_bidder_id: null,
          winner_id: null,
          order_id: null,
          closed_at: null,
          extension_count: 0,
          version: Number(row.version) + 1,
        };
        lotById.set(String(args[0]), updated);
        return { rows: [updated] };
      }
      if (sql.includes('UPDATE live_lots')) {
        return { rows: [] };
      }
      // The open route re-verifies the lot's listing is still
      // auction-eligible before opening a bidding window.
      if (sql.includes('FROM listings')) {
        return { rows: [{ status: 'active' }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  return { client, queries, closed, lotById };
}

function createEngineDb(client: PoolClient, opts: {
  dueLotIds?: { id: string; session_id: string }[];
  sessionRow?: Record<string, unknown> | null;
} = {}) {
  const queries: QueryCall[] = [];
  const db = {
    query: async (sql: string, args: unknown[] = []) => {
      queries.push({ sql, args });
      if (sql.includes('FROM live_lots') && sql.includes("closes_at <= NOW()")) {
        return { rows: opts.dueLotIds ?? [] };
      }
      if (sql.includes('live_shopping_sessions')) {
        return { rows: opts.sessionRow === null ? [] : [opts.sessionRow ?? SESSION_ROW()] };
      }
      if (sql.includes('live_lot_snapshots')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
    connect: async () => client,
  };
  return { db, queries };
}

// ── Streaming bid-route mock ─────────────────────────────────────────────────

function createBidClient(opts: {
  lot: Record<string, unknown>;
  extensionRow?: Record<string, unknown> | null;
  currentLot?: Record<string, unknown>;
}) {
  const queries: QueryCall[] = [];
  const client: PoolClient = {
    query: async (sql: string, args: unknown[] = []) => {
      queries.push({ sql, args });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      if (sql.includes('FROM live_lots') && sql.includes('FOR UPDATE')) {
        return { rows: [opts.lot] };
      }
      if (sql.includes('FROM live_shopping_current_lots')) {
        return { rows: opts.currentLot ? [opts.currentLot] : [CURRENT_LOT_ROW()] };
      }
      if (sql.includes('SELECT id FROM live_shopping_bids')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO live_shopping_bids')) {
        return { rows: [] };
      }
      if (sql.includes('UPDATE live_lots') && sql.includes('make_interval')) {
        return { rows: opts.extensionRow ? [opts.extensionRow] : [] };
      }
      if (sql.includes('UPDATE live_lots')) {
        return { rows: [] };
      }
      if (sql.includes('UPDATE live_shopping_current_lots')) {
        return { rows: [CURRENT_LOT_ROW({ current_price: String(args[1]), bid_count: 1 })] };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  return { client, queries };
}

function setupBidRoute(client: PoolClient) {
  const { app, handlers } = createMockApp();
  const db = {
    query: async (sql: string) => {
      if (sql.includes('live_shopping_sessions')) return { rows: [SESSION_ROW()] };
      if (sql.includes('live_shopping_current_lots')) return { rows: [CURRENT_LOT_ROW()] };
      return { rows: [] };
    },
    connect: async () => client,
  };
  registerStreamingRoutes({
    app: app as never,
    db: db as never,
    createApiError: createApiError as never,
    resolveAuthenticatedUserId: resolveUser as never,
  });
  return { handlers };
}

// ── 1. Open stamps closes_at ─────────────────────────────────────────────────

describe('open lot deadline', () => {
  it('sets closes_at = now + durationSeconds and returns it in the lot DTO', async () => {
    const scheduled = LIVE_LOT_ROW({ status: 'scheduled', opens_at: null });
    const engine = createEngineClient([scheduled]);
    const { db } = createEngineDb(engine.client);
    const { app, handlers } = createMockApp();
    registerLiveLotEngineRoutes({
      app: app as never,
      db: db as never,
      resolveAuthenticatedUserId: resolveUser as never,
      createApiError: createApiError as never,
      calculateCommercePlatformChargeGbp: (() => 0) as never,
    });

    const before = Date.now();
    const { result } = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/lots/:lotId/open',
      { sessionId: 'sess-1', lotId: 'lot-1' },
      { durationSeconds: 60 },
      { userId: 'host-1' },
    );
    const lot = (result as { lot: { closesAt: string; status: string } }).lot;
    assert.equal(lot.status, 'open');
    assert.ok(lot.closesAt, 'open must stamp closes_at');
    const closes = Date.parse(lot.closesAt);
    assert.ok(closes > before + 55_000 && closes <= before + 61_000,
      'closes_at should be ~60s out');

    // The UPDATE carried the computed deadline as a parameter.
    const update = engine.queries.find((q) => q.sql.includes('UPDATE live_lots'));
    assert.ok(update && update.args[1] instanceof Date, 'closes_at param must be a Date');
  });

  it('leaves closes_at NULL when neither closesAt nor durationSeconds is sent', async () => {
    const scheduled = LIVE_LOT_ROW({ status: 'scheduled', opens_at: null });
    const engine = createEngineClient([scheduled]);
    const { db } = createEngineDb(engine.client);
    const { app, handlers } = createMockApp();
    registerLiveLotEngineRoutes({
      app: app as never,
      db: db as never,
      resolveAuthenticatedUserId: resolveUser as never,
      createApiError: createApiError as never,
      calculateCommercePlatformChargeGbp: (() => 0) as never,
    });

    const { result } = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/lots/:lotId/open',
      { sessionId: 'sess-1', lotId: 'lot-1' },
      {},
      { userId: 'host-1' },
    );
    const lot = (result as { lot: { closesAt: string | null } }).lot;
    assert.equal(lot.closesAt, null, 'host-manual lots keep closes_at NULL');
  });
});

// ── 2. Shared close path ─────────────────────────────────────────────────────

describe('closeLiveLot', () => {
  it('closes an open lot as sold when high bid meets reserve', async () => {
    const lot = LIVE_LOT_ROW({
      reserve_price_minor: '4000',
      high_bid_minor: '5000',
      high_bidder_id: 'bidder-1',
    });
    const engine = createEngineClient([lot]);
    const { db } = createEngineDb(engine.client);

    const result = await closeLiveLot(db as never, {
      sessionId: 'sess-1',
      lotId: 'lot-1',
      actorId: 'host-1',
      reason: 'host',
    });
    assert.equal(result.closed, true);
    if (result.closed) {
      assert.equal(result.outcome, 'sold');
      assert.equal(result.winnerId, 'bidder-1');
    }
    const eventTypes = engine.queries
      .filter((q) => q.sql.includes('INSERT INTO live_lot_events'))
      .map((q) => String(q.args[3]));
    assert.deepEqual(eventTypes, ['lot.closed', 'lot.sold']);
  });

  it('closes as passed when bids exist but reserve is not met', async () => {
    const lot = LIVE_LOT_ROW({
      reserve_price_minor: '9000',
      high_bid_minor: '5000',
      high_bidder_id: 'bidder-1',
    });
    const engine = createEngineClient([lot]);
    const { db } = createEngineDb(engine.client);

    const result = await closeLiveLot(db as never, {
      sessionId: 'sess-1',
      lotId: 'lot-1',
      actorId: 'host-1',
      reason: 'host',
    });
    assert.equal(result.closed, true);
    if (result.closed) {
      assert.equal(result.outcome, 'passed');
      assert.equal(result.winnerId, null);
    }
  });

  it('refuses to close a terminal lot', async () => {
    const lot = LIVE_LOT_ROW({ status: 'sold' });
    const engine = createEngineClient([lot]);
    const { db } = createEngineDb(engine.client);

    const result = await closeLiveLot(db as never, {
      sessionId: 'sess-1',
      lotId: 'lot-1',
      actorId: null,
      reason: 'auto_close',
    });
    assert.equal(result.closed, false);
    if (!result.closed) {
      assert.equal(result.code, 'LOT_NOT_CLOSABLE');
      assert.equal(result.status, 'sold');
    }
    const statusUpdates = engine.queries.filter(
      (q) => q.sql.includes('UPDATE live_lots') && q.sql.includes('SET status'),
    );
    assert.equal(statusUpdates.length, 0, 'terminal lot must not be updated');
  });

  it('auto_close aborts when the locked row is no longer due (LOT_NOT_DUE)', async () => {
    // The due-scan saw closes_at <= NOW(), but a pre-deadline bid applied an
    // anti-snipe extension before the lock — the locked row now carries a
    // future deadline. The close must be abandoned, not truncate it.
    const lot = LIVE_LOT_ROW({
      closes_at: new Date(Date.now() + 30_000).toISOString(),
    });
    const engine = createEngineClient([lot]);
    const { db } = createEngineDb(engine.client);

    const result = await closeLiveLot(db as never, {
      sessionId: 'sess-1',
      lotId: 'lot-1',
      actorId: null,
      reason: 'auto_close',
    });
    assert.equal(result.closed, false);
    if (!result.closed) {
      assert.equal(result.code, 'LOT_NOT_DUE');
    }
    assert.ok(
      engine.queries.some((q) => q.sql === 'ROLLBACK'),
      'not-due close must roll back',
    );
    assert.equal(
      engine.queries.filter(
        (q) => q.sql.includes('UPDATE live_lots') && q.sql.includes('SET status'),
      ).length,
      0,
      'a not-due lot must not be transitioned',
    );
  });

  it('auto_close still closes a lot whose locked deadline has passed', async () => {
    const lot = LIVE_LOT_ROW({
      closes_at: new Date(Date.now() - 1_000).toISOString(),
      high_bid_minor: '5000',
      high_bidder_id: 'bidder-1',
    });
    const engine = createEngineClient([lot]);
    const { db } = createEngineDb(engine.client);

    const result = await closeLiveLot(db as never, {
      sessionId: 'sess-1',
      lotId: 'lot-1',
      actorId: null,
      reason: 'auto_close',
    });
    assert.equal(result.closed, true);
    if (result.closed) assert.equal(result.outcome, 'sold');
  });

  it('host close bypasses the deadline re-verify (manual close anytime)', async () => {
    const lot = LIVE_LOT_ROW({
      closes_at: new Date(Date.now() + 300_000).toISOString(),
    });
    const engine = createEngineClient([lot]);
    const { db } = createEngineDb(engine.client);

    const result = await closeLiveLot(db as never, {
      sessionId: 'sess-1',
      lotId: 'lot-1',
      actorId: 'host-1',
      reason: 'host',
    });
    assert.equal(result.closed, true, 'host must be able to close early');
  });
});

// ── 3. Auto-close sweep ──────────────────────────────────────────────────────

describe('sweepDueLiveLots', () => {
  it('closes each due lot through the shared close path and reports outcomes', async () => {
    const pastDeadline = new Date(Date.now() - 1_000).toISOString();
    const dueA = LIVE_LOT_ROW({
      id: 'lot-a',
      closes_at: pastDeadline,
      high_bid_minor: '5000',
      high_bidder_id: 'bidder-1',
      reserve_price_minor: '4000',
    });
    const dueB = LIVE_LOT_ROW({
      id: 'lot-b',
      closes_at: pastDeadline,
      high_bid_minor: '0',
      high_bidder_id: null,
    });
    const engine = createEngineClient([dueA, dueB]);
    const { db, queries } = createEngineDb(engine.client, {
      dueLotIds: [
        { id: 'lot-a', session_id: 'sess-1' },
        { id: 'lot-b', session_id: 'sess-1' },
      ],
    });

    const { closedLots } = await sweepDueLiveLots(db as never);
    assert.equal(closedLots.length, 2);
    assert.equal(closedLots[0].status, 'sold');
    assert.equal(closedLots[0].winnerId, 'bidder-1');
    assert.equal(closedLots[1].status, 'passed');
    assert.equal(closedLots[1].winnerId, null);

    // The due-scan itself filters closable statuses AND closes_at <= NOW() —
    // non-due and already-terminal rows never reach the close path.
    const scan = queries.find((q) => q.sql.includes('FROM live_lots'));
    assert.ok(scan);
    assert.ok(scan!.sql.includes("'open'"), 'scan covers open lots');
    assert.ok(scan!.sql.includes('closes_at <= NOW()'));
    assert.ok(scan!.sql.includes('closes_at IS NOT NULL'));
  });

  it('skips a due-scanned lot a racing closer already closed', async () => {
    // Scan reports the lot due, but the FOR UPDATE lock reveals it is
    // already 'sold' — closeLiveLot reports not-closed and the sweep moves on.
    const raced = LIVE_LOT_ROW({ id: 'lot-raced', status: 'sold' });
    const engine = createEngineClient([raced]);
    const { db } = createEngineDb(engine.client, {
      dueLotIds: [{ id: 'lot-raced', session_id: 'sess-1' }],
    });

    const { closedLots } = await sweepDueLiveLots(db as never);
    assert.equal(closedLots.length, 0);
  });

  it('skips a due-scanned lot whose deadline was extended before the lock', async () => {
    // The anti-snipe window: a bid committed pre-deadline pushed closes_at
    // out between the autocommit due-scan and the FOR UPDATE lock. The
    // close path must re-verify the deadline on the locked row and leave
    // the lot open rather than truncating the legitimate extension.
    const extended = LIVE_LOT_ROW({
      id: 'lot-ext',
      closes_at: new Date(Date.now() + 30_000).toISOString(),
    });
    const engine = createEngineClient([extended]);
    const { db } = createEngineDb(engine.client, {
      dueLotIds: [{ id: 'lot-ext', session_id: 'sess-1' }],
    });

    const { closedLots, failedLots } = await sweepDueLiveLots(db as never);
    assert.equal(closedLots.length, 0, 'extended lot must not be closed');
    assert.equal(failedLots.length, 0, 'a not-due skip is not a failure');
    assert.equal(
      engine.queries.filter(
        (q) => q.sql.includes('UPDATE live_lots') && q.sql.includes('SET status'),
      ).length,
      0,
      'no status transition may run for a not-due lot',
    );
  });

  it('isolates a failing lot so the rest of the sweep still closes', async () => {
    const pastDeadline = new Date(Date.now() - 1_000).toISOString();
    const good = LIVE_LOT_ROW({
      id: 'lot-good',
      closes_at: pastDeadline,
      high_bid_minor: '5000',
      high_bidder_id: 'bidder-1',
    });
    const engine = createEngineClient([good]);
    // Force the lock select to throw for the bad lot — the sweep must record
    // the failure and keep going instead of aborting the whole pass.
    const baseQuery = engine.client.query;
    engine.client.query = async (sql: string, args: unknown[] = []) => {
      if (
        sql.includes('FROM live_lots')
        && sql.includes('FOR UPDATE')
        && String(args[0]) === 'lot-bad'
      ) {
        throw new Error('lock timeout');
      }
      return baseQuery(sql, args);
    };
    const { db } = createEngineDb(engine.client, {
      dueLotIds: [
        { id: 'lot-bad', session_id: 'sess-1' },
        { id: 'lot-good', session_id: 'sess-1' },
      ],
    });

    const { closedLots, failedLots } = await sweepDueLiveLots(db as never);
    assert.equal(closedLots.length, 1);
    assert.equal(closedLots[0].lotId, 'lot-good');
    assert.equal(failedLots.length, 1);
    assert.equal(failedLots[0].lotId, 'lot-bad');
  });
});

// ── 4. Anti-snipe extension in the bid route ─────────────────────────────────

describe('anti-snipe extension', () => {
  const bidPath = '/streaming/sessions/:sessionId/bids';
  const bidParams = { sessionId: 'sess-1' };

  it('extends closes_at and writes lot.extension when the bid lands inside the window', async () => {
    const closesAt = new Date(Date.now() + LIVE_LOT_ANTI_SNIPE_WINDOW_MS - 5_000);
    const extendedClosesAt = new Date(closesAt.getTime() + LIVE_LOT_ANTI_SNIPE_EXTENSION_SECONDS * 1000);
    const lot = LIVE_LOT_ROW({ closes_at: closesAt.toISOString(), extension_count: 0 });
    const bidClient = createBidClient({
      lot,
      extensionRow: {
        closes_at: extendedClosesAt.toISOString(),
        extension_count: 1,
        version: 3,
      },
    });
    const { handlers } = setupBidRoute(bidClient.client);

    const { result, reply } = await invoke(handlers, bidPath, bidParams, { amount: 60 });
    assert.equal(reply._sentCode, 201);

    const extensionUpdate = bidClient.queries.find(
      (q) => q.sql.includes('make_interval'),
    );
    assert.ok(extensionUpdate, 'extension UPDATE must run inside the window');
    assert.ok(
      extensionUpdate!.sql.includes('closes_at = closes_at'),
      'extension must grow from the prior deadline, not reset from NOW()',
    );
    assert.equal(extensionUpdate!.args[1], LIVE_LOT_ANTI_SNIPE_EXTENSION_SECONDS);

    // The route writes 'lot.extension' as a SQL literal; the params are
    // (id, lot_id, session_id, version, actor_id, payload).
    const eventInserts = bidClient.queries.filter(
      (q) => q.sql.includes('INSERT INTO live_lot_events'),
    );
    assert.equal(eventInserts.length, 1);
    assert.ok(eventInserts[0].sql.includes("'lot.extension'"));
    const eventPayload = JSON.parse(String(eventInserts[0].args[5])) as {
      closesAt: string;
      extensionCount: number;
      trigger: string;
    };
    assert.equal(eventPayload.trigger, 'anti_snipe_bid');
    assert.equal(eventPayload.extensionCount, 1);

    const lotState = (result as { lot: { closesAt: string; extensionCount: number } }).lot;
    assert.equal(lotState.closesAt, extendedClosesAt.toISOString());
    assert.equal(lotState.extensionCount, 1);
  });

  it('does not extend when the bid lands outside the window', async () => {
    const closesAt = new Date(Date.now() + LIVE_LOT_ANTI_SNIPE_WINDOW_MS + 60_000);
    const lot = LIVE_LOT_ROW({ closes_at: closesAt.toISOString(), extension_count: 0 });
    const bidClient = createBidClient({ lot });
    const { handlers } = setupBidRoute(bidClient.client);

    const { result, reply } = await invoke(handlers, bidPath, bidParams, { amount: 60 });
    assert.equal(reply._sentCode, 201);
    assert.equal(
      bidClient.queries.filter((q) => q.sql.includes('make_interval')).length,
      0,
      'no extension outside the window',
    );
    const lotState = (result as { lot: { closesAt: string; extensionCount: number } }).lot;
    assert.equal(lotState.closesAt, closesAt.toISOString());
    assert.equal(lotState.extensionCount, 0);
  });

  it('does not extend past the max-extensions cap', async () => {
    const closesAt = new Date(Date.now() + 10_000);
    const lot = LIVE_LOT_ROW({
      closes_at: closesAt.toISOString(),
      extension_count: LIVE_LOT_ANTI_SNIPE_MAX_EXTENSIONS,
    });
    const bidClient = createBidClient({ lot });
    const { handlers } = setupBidRoute(bidClient.client);

    const { result, reply } = await invoke(handlers, bidPath, bidParams, { amount: 60 });
    assert.equal(reply._sentCode, 201);
    assert.equal(
      bidClient.queries.filter((q) => q.sql.includes('make_interval')).length,
      0,
      'cap reached — no further extension',
    );
    const lotState = (result as { lot: { extensionCount: number } }).lot;
    assert.equal(lotState.extensionCount, LIVE_LOT_ANTI_SNIPE_MAX_EXTENSIONS);
  });

  it('rejects a bid at/after closes_at even while the row still reads open', async () => {
    const lot = LIVE_LOT_ROW({
      closes_at: new Date(Date.now() - 1_000).toISOString(),
    });
    const bidClient = createBidClient({ lot });
    const { handlers } = setupBidRoute(bidClient.client);

    const { result, reply } = await invoke(handlers, bidPath, bidParams, { amount: 60 });
    assert.equal(reply._sentCode, 409);
    assert.equal((result as { code: string }).code, 'LOT_BIDDING_CLOSED');
    assert.equal(
      bidClient.queries.filter((q) => q.sql.includes('INSERT INTO live_shopping_bids')).length,
      0,
      'a post-deadline bid must never be recorded',
    );
    assert.equal(
      bidClient.queries.filter((q) => q.sql.includes('make_interval')).length,
      0,
      'a post-deadline bid must never extend',
    );
  });
});

// ── 5. Re-open resets stale bid state ───────────────────────────────────────

describe('lot re-open', () => {
  const openPath = '/streaming/sessions/:sessionId/lots/:lotId/open';

  function setupEngine(client: PoolClient) {
    const { db } = createEngineDb(client);
    const { app, handlers } = createMockApp();
    registerLiveLotEngineRoutes({
      app: app as never,
      db: db as never,
      resolveAuthenticatedUserId: resolveUser as never,
      createApiError: createApiError as never,
      calculateCommercePlatformChargeGbp: (() => 0) as never,
    });
    return handlers;
  }

  it('resets high bid, bidder, winner, order and extension state on re-open', async () => {
    const passed = LIVE_LOT_ROW({
      status: 'passed',
      high_bid_minor: '5000',
      high_bid_id: 'bid-old',
      high_bidder_id: 'bidder-1',
      extension_count: 3,
      closed_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const engine = createEngineClient([passed]);
    const handlers = setupEngine(engine.client);

    const { result, reply } = await invoke(
      handlers,
      openPath,
      { sessionId: 'sess-1', lotId: 'lot-1' },
      { durationSeconds: 60 },
      { userId: 'host-1' },
    );
    assert.equal(reply._sentCode, 200);
    const lot = (result as { lot: Record<string, unknown> }).lot;
    assert.equal(lot.status, 'open');
    assert.equal(lot.highBidMinor, 0, 'stale high bid must be cleared');
    assert.equal(lot.highBidId, null);
    assert.equal(lot.highBidderId, null);
    assert.equal(lot.winnerId, null);
    assert.equal(lot.orderId, null);
    assert.equal(lot.closedAt, null);
    assert.equal(lot.extensionCount, 0, 'extension budget must reset');

    const update = engine.queries.find(
      (q) => q.sql.includes('UPDATE live_lots') && q.sql.includes('opens_at'),
    );
    assert.ok(update);
    for (const clause of [
      'high_bid_id = NULL',
      'high_bid_minor = 0',
      'high_bidder_id = NULL',
      'winner_id = NULL',
      'closed_at = NULL',
      'extension_count = 0',
    ]) {
      assert.ok(update!.sql.includes(clause), `re-open UPDATE must include ${clause}`);
    }
  });

  it('rejects re-open for a status outside the allow-list', async () => {
    // 'closed' is not a valid live_lots status (CHECK constraint) — any
    // non-scheduled/non-passed row must fail LOT_NOT_OPENABLE.
    const engine = createEngineClient([LIVE_LOT_ROW({ status: 'sold' })]);
    const handlers = setupEngine(engine.client);

    const { result, reply } = await invoke(
      handlers,
      openPath,
      { sessionId: 'sess-1', lotId: 'lot-1' },
      {},
      { userId: 'host-1' },
    );
    assert.equal(reply._sentCode, 409);
    assert.equal((result as { code: string }).code, 'LOT_NOT_OPENABLE');
  });
});

// ── 6. Settlement charges the winning bid ──────────────────────────────────

describe('lot settlement pricing', () => {
  const settlePath = '/streaming/sessions/:sessionId/lots/:lotId/settle';

  function createSettleClient(opts: {
    lot: Record<string, unknown>;
    listing?: Record<string, unknown> | null;
  }) {
    const queries: QueryCall[] = [];
    let orderInsertArgs: unknown[] | null = null;
    const client: PoolClient = {
      query: async (sql: string, args: unknown[] = []) => {
        queries.push({ sql, args });
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('FROM live_lots') && sql.includes('FOR UPDATE')) {
          return { rows: [opts.lot] };
        }
        if (sql.includes('FROM listings')) {
          return {
            rows: opts.listing === null
              ? []
              : [opts.listing ?? {
                  id: 'listing-1',
                  seller_id: 'seller-1',
                  price_gbp: 999, // list price — must NOT be what is charged
                  status: 'active',
                }],
          };
        }
        if (sql.includes('INSERT INTO orders')) {
          orderInsertArgs = args;
          return {
            rows: [{
              id: args[0],
              buyer_id: args[1],
              seller_id: args[2],
              listing_id: args[3],
              subtotal_gbp: args[4],
              buyer_protection_fee_gbp: args[5],
              postage_fee_gbp: args[6],
              total_gbp: args[7],
              status: 'created',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }],
          };
        }
        if (sql.includes('UPDATE live_lots')) {
          return {
            rows: [{
              ...opts.lot,
              order_id: args[1],
              version: Number(opts.lot.version) + 1,
            }],
          };
        }
        return { rows: [] };
      },
      release: () => {},
    };
    return {
      client,
      queries,
      get orderInsertArgs() {
        return orderInsertArgs;
      },
    };
  }

  function setupSettle(client: PoolClient, platformCharge: (s: number) => number) {
    const { db } = createEngineDb(client);
    const { app, handlers } = createMockApp();
    registerLiveLotEngineRoutes({
      app: app as never,
      db: db as never,
      resolveAuthenticatedUserId: resolveUser as never,
      createApiError: createApiError as never,
      calculateCommercePlatformChargeGbp: platformCharge as never,
    });
    return handlers;
  }

  it('charges the winning bid (high_bid_minor), not the listing list price', async () => {
    const soldLot = LIVE_LOT_ROW({
      status: 'sold',
      winner_id: 'bidder-1',
      high_bid_minor: '7200', // £72 winning bid vs £999 list price
      high_bidder_id: 'bidder-1',
      closed_at: new Date().toISOString(),
    });
    const settle = createSettleClient({ lot: soldLot });
    const handlers = setupSettle(settle.client, () => 5);

    const { result, reply } = await invoke(
      handlers,
      settlePath,
      { sessionId: 'sess-1', lotId: 'lot-1' },
      {},
      { userId: 'host-1' },
    );
    assert.equal(reply._sentCode, 201);

    // Order INSERT args: [id, buyer, seller, listing, subtotal, fee, postage, total, ...]
    const args = settle.orderInsertArgs!;
    assert.ok(args, 'order INSERT must run');
    assert.equal(args[4], 72, 'subtotal must be the winning bid in GBP');
    assert.equal(args[5], 5, 'platform charge computed on the bid amount');
    assert.equal(args[7], 77, 'total = bid subtotal + charge');

    const order = (result as { order: { subtotalGbp: number; totalGbp: number } }).order;
    assert.equal(order.subtotalGbp, 72);
    assert.equal(order.totalGbp, 77);
  });

  it('refuses to settle a sold lot with no winning bid amount', async () => {
    const brokenLot = LIVE_LOT_ROW({
      status: 'sold',
      winner_id: 'bidder-1',
      high_bid_minor: '0',
      high_bidder_id: 'bidder-1',
    });
    const settle = createSettleClient({ lot: brokenLot });
    const handlers = setupSettle(settle.client, () => 5);

    const { result, reply } = await invoke(
      handlers,
      settlePath,
      { sessionId: 'sess-1', lotId: 'lot-1' },
      {},
      { userId: 'host-1' },
    );
    assert.equal(reply._sentCode, 409);
    assert.equal((result as { code: string }).code, 'LOT_NO_WINNING_BID');
    assert.equal(settle.orderInsertArgs, null, 'no £0 order may be created');
  });
});

// ── 7. Bid integrity: self-bid block + start-price floor ───────────────────

describe('bid integrity guards', () => {
  const bidPath = '/streaming/sessions/:sessionId/bids';
  const bidParams = { sessionId: 'sess-1' };

  it('rejects a bid from the lot seller (SELLER_RESTRICTED)', async () => {
    // resolveUser defaults to 'user-1' — make the lot seller that user.
    const lot = LIVE_LOT_ROW({ seller_id: 'user-1' });
    const bidClient = createBidClient({ lot });
    const { handlers } = setupBidRoute(bidClient.client);

    const { result, reply } = await invoke(handlers, bidPath, bidParams, { amount: 60 });
    assert.equal(reply._sentCode, 403);
    assert.equal((result as { code: string }).code, 'SELLER_RESTRICTED');
    assert.equal(
      bidClient.queries.filter((q) => q.sql.includes('INSERT INTO live_shopping_bids')).length,
      0,
      'a self-bid must never be recorded',
    );
    assert.ok(bidClient.queries.some((q) => q.sql === 'ROLLBACK'));
  });

  it('rejects a first bid below start_price (BID_TOO_LOW)', async () => {
    const lot = LIVE_LOT_ROW({
      start_price_minor: '6000', // £60 start
      high_bid_minor: '0',
      high_bidder_id: null,
      min_increment_minor: '100',
    });
    const bidClient = createBidClient({ lot });
    const { handlers } = setupBidRoute(bidClient.client);

    const { result, reply } = await invoke(handlers, bidPath, bidParams, { amount: 50 });
    assert.equal(reply._sentCode, 422);
    assert.equal((result as { code: string }).code, 'BID_TOO_LOW');
    assert.equal(
      bidClient.queries.filter((q) => q.sql.includes('INSERT INTO live_shopping_bids')).length,
      0,
    );
  });

  it('accepts a first bid exactly at start_price', async () => {
    const lot = LIVE_LOT_ROW({
      start_price_minor: '6000',
      high_bid_minor: '0',
      high_bidder_id: null,
      min_increment_minor: '100',
    });
    const bidClient = createBidClient({ lot });
    const { handlers } = setupBidRoute(bidClient.client);

    const { reply } = await invoke(handlers, bidPath, bidParams, { amount: 60 });
    assert.equal(reply._sentCode, 201, 'bid at the start-price floor must be accepted');
  });
});
