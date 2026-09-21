/**
 * PKG-03 regression coverage — Co-Own price alert lifecycle + lockup gate.
 *
 * Invariants under test (each fails on the pre-fix behavior):
 *
 *   SEP20-FIN-12 — re-arming a triggered alert must allow a SECOND
 *     delivered trigger. The evaluator used to dedup its outbox event by
 *     the lifetime alert id, so activation 2's event collided with
 *     activation 1's dedup row and the user was never notified again.
 *     Now activation_seq (migration 331, bumped by PATCH re-arm) scopes
 *     the dedup key — exactly-once per activation.
 *
 *   SEP20-FIN-11 — an appraisal/reference-mark trigger legitimately
 *     carries tradeId: null; the payload must disclose markSource.
 *
 *   FIN-07 — the contractual lockup is enforced server-side: a reserve
 *     request during the lockup window is rejected 423
 *     CO_OWN_LOCKUP_ACTIVE BEFORE any transaction/wallet work. The old
 *     code serialized the lockup to clients but never enforced it.
 *
 * The route PATCH is exercised through the real registerCoOwnRoutes
 * closure against a matcher-driven fake pool — the UPDATE's CASE
 * semantics run against an in-memory alert row.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/test';

const { evaluateCoOwnPriceAlerts } = await import(
  '../workers/handlers/coOwnAlertEvaluatorHandler.js'
);
const { db } = await import('../db/pool.js');
const { registerCoOwnRoutes } = await import('../routes/coOwn.js');
const { createApiError } = await import('../lib/workerHelpers.js');

// ─── Alert evaluator fake ───────────────────────────────────────────────────

interface AlertRow {
  id: string;
  user_id: string;
  asset_id: string;
  condition: 'above' | 'below';
  target_price_gbp_minor: string;
  active: boolean;
  triggered_at: string | null;
  activation_seq: number;
  created_at: string;
}

interface FakeAlertState {
  alerts: AlertRow[];
  assets: Array<{ id: string; unit_price_gbp: string; appraisal_value_gbp: string | null }>;
  trades: Array<{ id: string; asset_id: string; unit_price_gbp: string; settlement_status: string }>;
  outbox: Array<{
    id: string;
    aggregate_type: string;
    aggregate_id: string;
    event_type: string;
    payload: Record<string, unknown>;
    deduplication_key: string;
    idempotency_key: string | null;
  }>;
}

function createAlertDb(state: FakeAlertState) {
  const committed = JSON.parse(JSON.stringify(state)) as FakeAlertState;
  let staging: FakeAlertState | null = null;
  let evtSeq = 0;
  const S = () => staging ?? committed;

  async function query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    const sql = text.replace(/\s+/g, ' ').trim();
    if (sql === 'BEGIN') {
      staging = JSON.parse(JSON.stringify(committed)) as FakeAlertState;
      return { rows: [], rowCount: 0 };
    }
    if (sql === 'COMMIT') {
      if (staging) {
        Object.assign(committed, staging);
        staging = null;
      }
      return { rows: [], rowCount: 0 };
    }
    if (sql === 'ROLLBACK') {
      staging = null;
      return { rows: [], rowCount: 0 };
    }

    const s = S();

    if (sql.includes('FROM coOwn_price_alerts') && sql.includes('active = TRUE') && sql.includes('triggered_at IS NULL') && !sql.includes('FOR UPDATE')) {
      const rows = s.alerts
        .filter((a) => a.active && a.triggered_at == null)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((a) => ({
          id: a.id,
          user_id: a.user_id,
          asset_id: a.asset_id,
          condition: a.condition,
          target_price_gbp_minor: a.target_price_gbp_minor,
          activation_seq: a.activation_seq,
        }));
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (sql.includes('FROM coOwn_price_alerts') && sql.includes('FOR UPDATE')) {
      const a = s.alerts.find(
        (x) => x.id === values![0] && x.active && x.triggered_at == null,
      );
      return {
        rows: (a ? [{ id: a.id, activation_seq: a.activation_seq }] : []) as T[],
        rowCount: a ? 1 : 0,
      };
    }
    if (sql.startsWith('UPDATE coOwn_price_alerts SET active = FALSE')) {
      const a = s.alerts.find((x) => x.id === values![0]);
      if (a) {
        a.active = false;
        a.triggered_at = new Date().toISOString();
      }
      return { rows: [], rowCount: a ? 1 : 0 };
    }
    if (sql.includes('FROM coOwn_trades') && sql.includes("settlement_status = 'settled'")) {
      const t = [...s.trades]
        .filter((x) => x.asset_id === values![0] && x.settlement_status === 'settled')
        .pop();
      return {
        rows: (t ? [{ id: t.id, unit_price_gbp: t.unit_price_gbp }] : []) as T[],
        rowCount: t ? 1 : 0,
      };
    }
    if (sql.includes('FROM coOwn_assets') && sql.includes('COALESCE(appraisal_value_gbp')) {
      const a = s.assets.find((x) => x.id === values![0]);
      const price = a ? (a.appraisal_value_gbp ?? a.unit_price_gbp) : null;
      return { rows: (price ? [{ unit_price_gbp: price }] : []) as T[], rowCount: price ? 1 : 0 };
    }
    if (sql.startsWith('INSERT INTO domain_outbox')) {
      const dedupKey = String(values![10]);
      const existing = s.outbox.find((o) => o.deduplication_key === dedupKey);
      if (existing) {
        // Real semantics: ON CONFLICT returns the EXISTING row's id — the
        // new event is silently swallowed.
        return { rows: [{ id: existing.id }] as T[], rowCount: 1 };
      }
      evtSeq += 1;
      const row = {
        id: String(values![0] ?? `evt_${evtSeq}`),
        aggregate_type: String(values![1]),
        aggregate_id: String(values![2]),
        event_type: String(values![3]),
        payload: JSON.parse(String(values![5] ?? '{}')),
        deduplication_key: dedupKey,
        idempotency_key: values![9] == null ? null : String(values![9]),
      };
      s.outbox.push(row);
      return { rows: [{ id: row.id }] as T[], rowCount: 1 };
    }

    throw new Error(`Unexpected query in test double: ${sql.slice(0, 140)}`);
  }

  const client = { query, release() {} };
  return { query, connect: async () => client, committed };
}

function patchPool(fake: { query: unknown; connect: unknown }) {
  const target = db as unknown as { query: unknown; connect: unknown };
  const original = { query: target.query, connect: target.connect };
  target.query = fake.query;
  target.connect = fake.connect;
  return () => {
    target.query = original.query;
    target.connect = original.connect;
  };
}

// ─── Route harness ──────────────────────────────────────────────────────────

type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;

function createRouteHarness() {
  const handlers = new Map<string, RouteHandler>();
  const app = {
    post(path: string, a: unknown, b?: unknown) {
      handlers.set(`POST ${path}`, (b ?? a) as RouteHandler);
    },
    get(path: string, a: unknown, b?: unknown) {
      handlers.set(`GET ${path}`, (b ?? a) as RouteHandler);
    },
    patch(path: string, a: unknown, b?: unknown) {
      handlers.set(`PATCH ${path}`, (b ?? a) as RouteHandler);
    },
    put(path: string, a: unknown, b?: unknown) {
      handlers.set(`PUT ${path}`, (b ?? a) as RouteHandler);
    },
    delete(path: string, a: unknown, b?: unknown) {
      handlers.set(`DELETE ${path}`, (b ?? a) as RouteHandler);
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
    header() {
      return this;
    },
  };
}

function registerRoutesWithDb(fakeDb: { query: unknown; connect: unknown }) {
  const { app, handlers } = createRouteHarness();
  registerCoOwnRoutes({
    app,
    db: fakeDb as never,
    resolveAuthenticatedUserId: (request) =>
      (request as { authUser?: { userId: string } }).authUser?.userId ?? 'user_1',
    ensureUserExists: async () => {},
    createApiError: createApiError as never,
    getApiError: (error: unknown) =>
      error instanceof Error && 'code' in error
        ? (error as { code: string; message: string } as never)
        : null,
    createRuntimeId: (prefix: string) => `${prefix}_test`,
    toJsonString: (v: unknown) => JSON.stringify(v ?? {}),
    roundTo: (v: number, d: number) => {
      const f = 10 ** d;
      return Math.round(v * f) / f;
    },
    parseQueryBoolean: (v: unknown, fallback?: boolean) =>
      v == null ? (fallback ?? false) : v === true || v === 'true',
    appendComplianceAuditSafe: async () => {},
    queueUserNotification: async () => null,
    getOnezeMintBurnHaltState: async () => ({ halted: false }),
    ledgerTablesAvailable: async () => true,
    ensureLedgerAccount: async () => 1,
    appendLedgerEntry: async () => {},
  });
  return handlers;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('SEP20-FIN-12/11: re-armed alert emits a SECOND distinct trigger event', async () => {
  const state: FakeAlertState = {
    alerts: [{
      id: 'alert_1',
      user_id: 'user_1',
      asset_id: 'asset_1',
      condition: 'below',
      target_price_gbp_minor: '300',
      active: true,
      triggered_at: null,
      activation_seq: 1,
      created_at: '2026-01-01T00:00:00.000Z',
    }],
    // No settled trades — the appraisal/reference mark fires the alert
    // (tradeId must be null + markSource 'reference').
    assets: [{ id: 'asset_1', unit_price_gbp: '2.00', appraisal_value_gbp: '2.50' }],
    trades: [],
    outbox: [],
  };
  const fake = createAlertDb(state);
  const restore = patchPool(fake);
  try {
    const first = await evaluateCoOwnPriceAlerts('manual');
    assert.equal(first.triggered, 1, JSON.stringify(first));

    assert.equal(fake.committed.outbox.length, 1);
    const evt1 = fake.committed.outbox[0];
    assert.equal(evt1.deduplication_key, 'coown_price_alert:alert_1:1');
    assert.equal(evt1.payload.tradeId, null, 'reference-mark trigger must carry tradeId null');
    assert.equal(evt1.payload.markSource, 'reference');
    assert.equal(evt1.payload.activationSeq, 1);
    assert.equal(fake.committed.alerts[0].active, false);
    assert.ok(fake.committed.alerts[0].triggered_at);

    // ── Re-arm (what PATCH active=true does now): clear triggered_at,
    // bump activation_seq. Simulated here as the committed row mutation. ──
    fake.committed.alerts[0].triggered_at = null;
    fake.committed.alerts[0].active = true;
    fake.committed.alerts[0].activation_seq = 2;

    const second = await evaluateCoOwnPriceAlerts('manual');
    assert.equal(second.triggered, 1, JSON.stringify(second));

    // Old code: dedup key 'coown_price_alert:alert_1' collides with the
    // first event → ON CONFLICT returns the OLD event → still 1 row and
    // the user is never notified of the second trigger.
    assert.equal(fake.committed.outbox.length, 2, 'second activation must produce a NEW event');
    const evt2 = fake.committed.outbox[1];
    assert.equal(evt2.deduplication_key, 'coown_price_alert:alert_1:2');
    assert.equal(evt2.payload.activationSeq, 2);
    assert.notEqual(evt1.id, evt2.id);
  } finally {
    restore();
  }
});

test('PATCH re-arm bumps activation_seq and clears triggered_at', async () => {
  const alert: AlertRow = {
    id: 'alert_2',
    user_id: 'user_1',
    asset_id: 'asset_1',
    condition: 'above',
    target_price_gbp_minor: '500',
    active: false,
    triggered_at: '2026-02-01T00:00:00.000Z',
    activation_seq: 1,
    created_at: '2026-01-01T00:00:00.000Z',
  };
  const issued: string[] = [];
  const fakeDb = {
    async query<T = Record<string, unknown>>(text: string, values?: unknown[]) {
      const sql = text.replace(/\s+/g, ' ').trim();
      issued.push(sql);
      if (sql.startsWith('UPDATE coown_price_alerts')) {
        // Emulate the UPDATE's CASE semantics against the row.
        const active = Boolean(values![2]);
        alert.active = active;
        if (active && alert.triggered_at != null) {
          alert.triggered_at = null;
          alert.activation_seq += 1;
        } else if (active) {
          alert.triggered_at = null;
        }
        return {
          rows: [{
            id: alert.id,
            asset_id: alert.asset_id,
            condition: alert.condition,
            target_price_gbp_minor: alert.target_price_gbp_minor,
            active: alert.active,
            triggered_at: alert.triggered_at,
            activation_seq: alert.activation_seq,
            created_at: alert.created_at,
          }] as T[],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected query: ${sql.slice(0, 120)}`);
    },
    async connect() {
      throw new Error('PATCH should not open a transaction');
    },
  };

  const handlers = registerRoutesWithDb(fakeDb);
  const handler = handlers.get('PATCH /co-own/price-alerts/:id');
  assert.ok(handler, 'PATCH handler not registered');

  const reply = createReply();
  const result = (await handler(
    {
      params: { id: 'alert_2' },
      body: { active: true },
      authUser: { userId: 'user_1' },
      headers: {},
      id: 'req_1',
      ip: '127.0.0.1',
      log: { error() {} },
    },
    reply,
  )) as { ok: boolean; alert: { activationSeq: number; triggeredAt: unknown; active: boolean } };

  // The SQL must carry the per-activation increment — a textual guard so a
  // refactor that drops the CASE cannot silently reintroduce the dedup bug.
  assert.ok(
    issued[0].includes('activation_seq'),
    're-arm UPDATE must advance activation_seq',
  );
  assert.equal(result.ok, true);
  assert.equal(result.alert.active, true);
  assert.equal(result.alert.triggeredAt, null);
  assert.equal(result.alert.activationSeq, 2);
});

test('FIN-07: reserve during lockup is rejected 423 CO_OWN_LOCKUP_ACTIVE before any tx', async () => {
  const futureLockup = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  let connectCalls = 0;
  const fakeDb = {
    async query<T = Record<string, unknown>>(text: string) {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.includes('FROM coOwn_assets') && sql.includes('effective_lockup_end')) {
        return {
          rows: [{
            is_open: true,
            available_units: 0, // 'allocated' → 'trading' → lockup pauses it
            effective_lockup_end: futureLockup,
          }] as T[],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM coown_corporate_actions')) {
        return { rows: [] as T[], rowCount: 0 };
      }
      throw new Error(`Unexpected query: ${sql.slice(0, 120)}`);
    },
    async connect() {
      connectCalls += 1;
      throw new Error('reserve must reject before opening a transaction');
    },
  };

  const handlers = registerRoutesWithDb(fakeDb);
  const handler = handlers.get('POST /co-own/assets/:assetId/orders/reserve');
  assert.ok(handler, 'reserve handler not registered');

  const reply = createReply();
  const result = (await handler(
    {
      params: { assetId: 'asset_locked' },
      body: {
        userId: 'user_1',
        side: 'buy',
        units: 1,
        orderType: 'protected_market',
        maxPriceGbp: 500,
      },
      authUser: { userId: 'user_1' },
      headers: {},
      id: 'req_2',
      ip: '127.0.0.1',
      log: { error() {} },
    },
    reply,
  )) as { ok: boolean; error: string; message: string };

  // Old code: no lockup in the market-status guard → the request proceeded
  // into the reservation transaction.
  assert.equal(reply.statusCode, 423);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'CO_OWN_LOCKUP_ACTIVE');
  assert.match(result.message, /lockup/i);
  assert.equal(connectCalls, 0, 'lockup rejection must precede any wallet tx');
});

test('FIN-07: expired lockup does not block the reserve gate', async () => {
  const pastLockup = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const fakeDb = {
    async query<T = Record<string, unknown>>(text: string) {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.includes('FROM coOwn_assets') && sql.includes('effective_lockup_end')) {
        return {
          rows: [{
            is_open: true,
            available_units: 0,
            effective_lockup_end: pastLockup,
          }] as T[],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM coown_corporate_actions')) {
        return { rows: [] as T[], rowCount: 0 };
      }
      throw new Error(`Unexpected pool query: ${sql.slice(0, 120)}`);
    },
    async connect() {
      return {
        async query<T = Record<string, unknown>>(text: string) {
          const sql = text.replace(/\s+/g, ' ').trim();
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return { rows: [], rowCount: 0 };
          }
          if (sql.startsWith('UPDATE coown_order_reservations')) {
            return { rows: [] as T[], rowCount: 0 };
          }
          if (sql.includes('FROM coOwn_assets') && sql.includes('FOR UPDATE')) {
            // Asset vanished between the guard and the tx — a clean 404
            // proves control flow reached past the lockup check.
            return { rows: [] as T[], rowCount: 0 };
          }
          throw new Error(`Unexpected tx query: ${sql.slice(0, 120)}`);
        },
        release() {},
      };
    },
  };

  const handlers = registerRoutesWithDb(fakeDb);
  const handler = handlers.get('POST /co-own/assets/:assetId/orders/reserve');
  assert.ok(handler);

  const reply = createReply();
  const result = (await handler(
    {
      params: { assetId: 'asset_unlocked' },
      body: {
        userId: 'user_1',
        side: 'buy',
        units: 1,
        orderType: 'protected_market',
        maxPriceGbp: 500,
      },
      authUser: { userId: 'user_1' },
      headers: {},
      id: 'req_3',
      ip: '127.0.0.1',
      log: { error() {} },
    },
    reply,
  )) as { ok: boolean; error: string };

  assert.equal(reply.statusCode, 404, `expected 404 past the lockup gate, got ${reply.statusCode}`);
  assert.equal(result.error, 'Co-Own asset not found');
});
