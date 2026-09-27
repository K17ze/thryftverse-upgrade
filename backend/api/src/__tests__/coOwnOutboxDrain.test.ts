/**
 * PKG-03 regression coverage — Co-Own outbox drain (alert + DRIP receipts).
 *
 * Invariants under test (each fails on the pre-fix behavior):
 *
 *   SEP20-FIN-11 — an alert event whose triggering mark came from the
 *     appraisal/reference price carries tradeId: null. The old schema
 *     (`z.string().optional()`) rejected the event → dead-letter retry loop
 *     → user never notified even though the alert was already marked
 *     triggered. The event must parse, notify, and complete — and the copy
 *     must disclose which mark source fired.
 *
 *   SEP20-FIN-12 — a re-armed alert emits a SECOND notification with a
 *     distinct idempotency key (per-activation). The old code keyed the
 *     notification by the lifetime alert id, so the second delivery was
 *     deduped away.
 *
 *   SEP20-FIN-14 — a 'retained_cash' DRIP receipt must not claim cash was
 *     credited ("stays in your balance as cash" / "paid as cash") when the
 *     worker only verified the balance was short and bought nothing.
 *
 * The notification pipeline (workerRuntime.queueUserNotification) is
 * stubbed via a module-loader hook — the drain's real zod parsing, copy
 * and idempotency-key construction run for real; only the final enqueue
 * is captured.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

// Stub workerRuntime before the dynamic import so queueUserNotification
// calls land on a global sink (workerRuntime also pulls redis/queues —
// the stub keeps this test hermetic).
const loaderSource = [
  'export async function load(url, context, nextLoad) {',
  "  if (url.includes('/lib/workerRuntime')) {",
  '    return {',
  '      format: "module",',
  "      source: 'globalThis.__notifSink = globalThis.__notifSink ?? []; export async function queueUserNotification(input) { globalThis.__notifSink.push(input); return \"notif_test\"; }',",
  '      shortCircuit: true,',
  '    };',
  '  }',
  '  return nextLoad(url, context);',
  '}',
].join('\n');
const loaderUrl =
  'data:text/javascript;base64,' + Buffer.from(loaderSource).toString('base64');
register(loaderUrl, import.meta.url);

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/test';

const { processDomainOutboxBatch } = await import(
  '../workers/handlers/outboxDrainHandler.js'
);
const { db } = await import('../db/pool.js');

type QueuedNotification = {
  userId: string;
  title: string;
  body: string;
  eventType?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
  route?: Record<string, unknown>;
};

function notifSink(): QueuedNotification[] {
  const g = globalThis as { __notifSink?: QueuedNotification[] };
  g.__notifSink = g.__notifSink ?? [];
  return g.__notifSink;
}

// ─── Fake outbox pool ───────────────────────────────────────────────────────

interface OutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_version: number;
  payload: Record<string, unknown>;
  actor_id: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  idempotency_key: string | null;
  status: string;
  attempts: number;
  last_error: string | null;
}

function createFakePool(rows: OutboxRow[]) {
  const state = { rows };

  async function query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    const sql = text.replace(/\s+/g, ' ').trim();

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }

    // claimDomainOutboxBatch — CTE claim.
    if (sql.startsWith('WITH claimable AS')) {
      const limit = Number(values![0]);
      const claimable = state.rows
        .filter((r) => r.status === 'pending')
        .slice(0, limit);
      for (const row of claimable) {
        row.status = 'processing';
        row.attempts += 1;
      }
      return {
        rows: claimable.map((r) => ({
          id: r.id,
          aggregate_type: r.aggregate_type,
          aggregate_id: r.aggregate_id,
          event_type: r.event_type,
          event_version: r.event_version,
          payload: r.payload,
          actor_id: r.actor_id,
          correlation_id: r.correlation_id,
          causation_id: r.causation_id,
          idempotency_key: r.idempotency_key,
          attempts: r.attempts,
        })) as T[],
        rowCount: claimable.length,
      };
    }

    // completeDomainOutboxEvent.
    if (sql.includes("SET status = 'completed'")) {
      const row = state.rows.find((r) => r.id === values![0]);
      if (row) row.status = 'completed';
      return { rows: [], rowCount: row ? 1 : 0 };
    }

    // failDomainOutboxEvent.
    if (sql.includes('SET status = CASE WHEN attempts >= 10')) {
      const row = state.rows.find((r) => r.id === values![0]);
      if (row) {
        row.status = row.attempts >= 10 ? 'dead' : 'pending';
        row.last_error = String(values![1]);
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }

    throw new Error(`Unexpected query in test double: ${sql.slice(0, 140)}`);
  }

  const client = { query, release() {} };
  return {
    query,
    connect: async () => client,
    rows: state.rows,
  };
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

function alertEvent(overrides: {
  id: string;
  alertId: string;
  activationSeq?: number;
  tradeId?: string | null;
  markSource?: string;
}): OutboxRow {
  return {
    id: overrides.id,
    aggregate_type: 'coown_price_alert',
    aggregate_id: overrides.alertId,
    event_type: 'coown_price_alert_triggered',
    event_version: 1,
    payload: {
      alertId: overrides.alertId,
      ...(overrides.activationSeq != null ? { activationSeq: overrides.activationSeq } : {}),
      userId: 'user_1',
      assetId: 'asset_1',
      condition: 'above',
      triggerPriceGbpMinor: 250,
      currentPriceGbpMinor: 300,
      tradeId: overrides.tradeId === undefined ? 'trade_9' : overrides.tradeId,
      ...(overrides.markSource ? { markSource: overrides.markSource } : {}),
      reason: 'interval',
      triggeredAt: '2026-03-01T00:00:00.000Z',
    },
    actor_id: 'user_1',
    correlation_id: null,
    causation_id: null,
    idempotency_key: `coown_price_alert:${overrides.alertId}`,
    status: 'pending',
    attempts: 0,
    last_error: null,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('SEP20-FIN-11: null-tradeId appraisal alert parses, notifies with mark provenance, completes', async () => {
  notifSink().length = 0;
  const fake = createFakePool([
    alertEvent({ id: 'evt_a1', alertId: 'alert_1', activationSeq: 1, tradeId: null, markSource: 'reference' }),
  ]);
  const restore = patchPool(fake);
  try {
    const claimed = await processDomainOutboxBatch();
    assert.equal(claimed, 1);

    // Old behavior: Zod rejected tradeId:null → event stayed pending, no
    // notification ever delivered.
    assert.equal(fake.rows[0].status, 'completed');
    const notice = notifSink().find((n) => n.eventType === 'coown_price_alert_triggered');
    assert.ok(notice, 'notification was not queued');
    assert.equal(notice!.userId, 'user_1');
    assert.match(notice!.body, /reference\/appraisal price/, 'copy must disclose the reference/appraisal mark');
    assert.match(notice!.body, /£2\.50/, 'trigger price formatting');
    assert.equal(notice!.idempotencyKey, 'coown_price_alert_notif_alert_1_1');
    assert.equal((notice!.payload as Record<string, unknown>).tradeId, null);
    assert.equal((notice!.payload as Record<string, unknown>).markSource, 'reference');
  } finally {
    restore();
  }
});

test('SEP20-FIN-11: settled-trade mark discloses trade provenance', async () => {
  notifSink().length = 0;
  const fake = createFakePool([
    alertEvent({ id: 'evt_a2', alertId: 'alert_2', activationSeq: 1, tradeId: 'trade_9', markSource: 'trade' }),
  ]);
  const restore = patchPool(fake);
  try {
    await processDomainOutboxBatch();
    const notice = notifSink().find((n) => n.eventType === 'coown_price_alert_triggered');
    assert.ok(notice);
    assert.match(notice!.body, /last settled trade/);
    assert.equal((notice!.payload as Record<string, unknown>).tradeId, 'trade_9');
  } finally {
    restore();
  }
});

test('SEP20-FIN-12: re-armed alert delivers a SECOND notification with a distinct key', async () => {
  notifSink().length = 0;
  // Same alert, two activations — the outbox holds one event per activation
  // (the evaluator keys dedup by alertId:activationSeq).
  const fake = createFakePool([
    alertEvent({ id: 'evt_r1', alertId: 'alert_9', activationSeq: 1, tradeId: 'trade_1', markSource: 'trade' }),
    alertEvent({ id: 'evt_r2', alertId: 'alert_9', activationSeq: 2, tradeId: null, markSource: 'reference' }),
  ]);
  const restore = patchPool(fake);
  try {
    const claimed = await processDomainOutboxBatch();
    assert.equal(claimed, 2);

    const notices = notifSink().filter((n) => n.eventType === 'coown_price_alert_triggered');
    assert.equal(notices.length, 2, 'each activation must deliver its own notification');
    const keys = notices.map((n) => n.idempotencyKey).sort();
    // Old code keyed by lifetime alert id — both deliveries collapsed to
    // 'coown_price_alert_notif_alert_9' and the second was deduped away.
    assert.notEqual(keys[0], keys[1]);
    assert.deepEqual(keys, [
      'coown_price_alert_notif_alert_9_1',
      'coown_price_alert_notif_alert_9_2',
    ]);
    assert.ok(fake.rows.every((r) => r.status === 'completed'));
  } finally {
    restore();
  }
});

test('SEP20-FIN-12: legacy event without activationSeq keeps the lifetime dedup key', async () => {
  notifSink().length = 0;
  const fake = createFakePool([
    alertEvent({ id: 'evt_l1', alertId: 'alert_7', tradeId: 'trade_5' }),
  ]);
  const restore = patchPool(fake);
  try {
    await processDomainOutboxBatch();
    const notice = notifSink().find((n) => n.eventType === 'coown_price_alert_triggered');
    assert.ok(notice);
    assert.equal(notice!.idempotencyKey, 'coown_price_alert_notif_alert_7');
  } finally {
    restore();
  }
});

test('SEP20-FIN-14: retained_cash receipt does not claim a cash credit that was never verified', async () => {
  notifSink().length = 0;
  const fake = createFakePool([{
    id: 'evt_d1',
    aggregate_type: 'coown_distribution',
    aggregate_id: 'dist_1',
    event_type: 'coown_drip_receipt',
    event_version: 1,
    payload: {
      distributionId: 'dist_1',
      userId: 'user_1',
      assetId: 'asset_1',
      outcome: 'retained_cash',
      amountGbpMinor: 1000,
      tradeId: null,
      cause: 'insufficient_balance',
      spendableUnits: 5000,
      requiredUnits: 12500,
      recordedAt: '2026-03-01T00:00:00.000Z',
    },
    actor_id: 'user_1',
    correlation_id: null,
    causation_id: null,
    idempotency_key: 'coown_drip_receipt:dist_1',
    status: 'pending',
    attempts: 0,
    last_error: null,
  }]);
  const restore = patchPool(fake);
  try {
    const claimed = await processDomainOutboxBatch();
    assert.equal(claimed, 1);
    assert.equal(fake.rows[0].status, 'completed');

    const notice = notifSink().find((n) => n.eventType === 'coown_drip_receipt');
    assert.ok(notice, 'receipt notification missing');
    // The worker verified nothing was purchased — copy must say exactly
    // that, not "paid as cash" / "stays in your balance as cash".
    assert.notEqual(notice!.title, 'Distribution paid as cash');
    assert.doesNotMatch(notice!.body, /stays in your balance as cash/i);
    assert.doesNotMatch(notice!.body, /paid as cash/i);
    assert.match(notice!.body, /not reinvested|no units were purchased|unchanged/i);
    assert.equal((notice!.payload as Record<string, unknown>).spendableUnits, 5000);
    assert.equal((notice!.payload as Record<string, unknown>).requiredUnits, 12500);
  } finally {
    restore();
  }
});

test('DRIP reinvested receipt still delivers', async () => {
  notifSink().length = 0;
  const fake = createFakePool([{
    id: 'evt_d2',
    aggregate_type: 'coown_distribution',
    aggregate_id: 'dist_2',
    event_type: 'coown_drip_receipt',
    event_version: 1,
    payload: {
      distributionId: 'dist_2',
      userId: 'user_1',
      assetId: 'asset_1',
      outcome: 'reinvested',
      amountGbpMinor: 1000,
      tradeId: 'trade_88',
      units: 5,
      unitPriceGbp: 2,
      notionalGbp: 10,
      recordedAt: '2026-03-01T00:00:00.000Z',
    },
    actor_id: 'user_1',
    correlation_id: null,
    causation_id: null,
    idempotency_key: 'coown_drip_receipt:dist_2',
    status: 'pending',
    attempts: 0,
    last_error: null,
  }]);
  const restore = patchPool(fake);
  try {
    await processDomainOutboxBatch();
    const notice = notifSink().find((n) => n.eventType === 'coown_drip_receipt');
    assert.ok(notice);
    assert.equal(notice!.title, 'Distribution reinvested');
    assert.match(notice!.body, /5 units/);
    assert.equal((notice!.payload as Record<string, unknown>).tradeId, 'trade_88');
  } finally {
    restore();
  }
});
