/**
 * Wave-3 regression coverage — payment-intent /confirm metadata injection
 * (W3-1) and domain-outbox stale-claim reaping (W3-2).
 *
 * Invariants under test (each fails on the pre-fix behavior):
 *
 *   W3-1 — `POST /payments/intents/:intentId/confirm` accepted a free-form
 *     `payload` record and merged it verbatim into `payment_intents.metadata`
 *     via `transitionPaymentIntentStatus`'s `metadata || patch` jsonb merge.
 *     That bypassed `sanitizePaymentIntentClientMetadata`, letting a caller
 *     plant server-owned keys (auctionId, winnerBidderId, initiatedByRole)
 *     on an intent they own — griefing auction winner-pay replay and
 *     defeating the payer_not_winner guard. The route must sanitize the
 *     client record before merging, and the audit `rawPayload` must keep the
 *     server provenance label unshadowable.
 *
 *   W3-2 — `claimDomainOutboxBatch` flipped events to 'processing' with only
 *     `status = 'pending'` in the claimable set: a worker crash stranded the
 *     event forever. The claim transaction must now first reap 'processing'
 *     rows whose locked_at lease expired — back to 'pending' for retry, or
 *     'dead' once the attempt ceiling is reached.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/test';
process.env.PAYMENT_METADATA_HMAC_SECRET ??= 'test-hmac-secret-for-wave3';

const {
  sanitizePaymentIntentClientMetadata,
  SERVER_OWNED_PAYMENT_INTENT_METADATA_KEYS,
} = await import('../lib/paymentIntentMetadata.js');
const { claimDomainOutboxBatch } = await import('../lib/domainOutbox.js');

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const INDEX_SOURCE = fs.readFileSync(path.join(TEST_DIR, '..', 'index.ts'), 'utf8');

// ─── W3-1: /confirm metadata sanitization ───────────────────────────────────

test('W3-1: sanitizer strips every server-owned key, keeps client keys', () => {
  const forged: Record<string, unknown> = {
    auctionId: 'auc_victim',
    winnerBidderId: 'victim_user',
    initiatedBy: 'victim_user',
    initiatedByRole: 'admin',
    expectedAmountGbp: 0.01,
    paymentMethodId: 'pm_forge',
    listingId: 'lst_forge',
    sellerId: 'seller_forge',
    source: 'provider_webhook',
    mintOperationId: 'mint_forge',
    mintQuote: { izeAmountUnits: '999999999' },
    mintQuoteMac: 'f'.repeat(64),
    quoteHash: 'x',
    canonicalMoney: { minorAmount: '1' },
    targetAssetAmount: '999',
    quoteRateSource: 'forged',
    userId: 'victim_user',
    orderId: 'ord_forge',
    coOwnOrderId: 'co_forge',
    platformFeeAmountGbp: 0,
    // Benign client keys that must survive.
    clientNote: 'user-supplied annotation',
    checkoutUiVersion: 3,
  };

  const clean = sanitizePaymentIntentClientMetadata(forged);

  for (const key of SERVER_OWNED_PAYMENT_INTENT_METADATA_KEYS) {
    assert.equal(
      clean[key],
      undefined,
      `server-owned key '${key}' must be stripped`,
    );
  }
  assert.equal(clean.clientNote, 'user-supplied annotation');
  assert.equal(clean.checkoutUiVersion, 3);
});

test('W3-1: sanitizer tolerates non-object input', () => {
  assert.deepEqual(sanitizePaymentIntentClientMetadata(undefined), {});
  assert.deepEqual(sanitizePaymentIntentClientMetadata(null), {});
  assert.deepEqual(
    sanitizePaymentIntentClientMetadata(['a'] as unknown as Record<string, unknown>),
    {},
  );
});

test('W3-1: /confirm route sanitizes client payload before metadata merge', () => {
  // Extract the confirm handler region and assert the ingest order:
  // sanitize(...) output is what gets spread into metadataPatch — not the
  // raw payload.record. Pre-fix source spread `payload.payload` verbatim.
  const routeStart = INDEX_SOURCE.indexOf("app.post('/payments/intents/:intentId/confirm'");
  assert.notEqual(routeStart, -1, 'confirm route not found');
  const routeEnd = INDEX_SOURCE.indexOf('app.', routeStart + 10);
  const route = INDEX_SOURCE.slice(routeStart, routeEnd === -1 ? undefined : routeEnd);

  assert.match(
    route,
    /metadataPatch:\s*\{[^}]*sanitizePaymentIntentClientMetadata\(payload\.payload\)/s,
    'metadataPatch must merge sanitizePaymentIntentClientMetadata(payload.payload)',
  );
  // The verbatim spread must be gone.
  assert.doesNotMatch(
    route,
    /\.\.\.\(payload\.payload \?\? \{\}\)[^}]*metadataPatch|metadataPatch:\s*\{[^}]*\.\.\.\(payload\.payload \?\? \{\}\)/s,
    'metadataPatch must not spread the raw client record',
  );
});

test('W3-1: /confirm audit rawPayload keeps server provenance label unshadowable', () => {
  const routeStart = INDEX_SOURCE.indexOf("app.post('/payments/intents/:intentId/confirm'");
  const routeEnd = INDEX_SOURCE.indexOf('app.', routeStart + 10);
  const route = INDEX_SOURCE.slice(routeStart, routeEnd === -1 ? undefined : routeEnd);

  // The client spread must come BEFORE `source: 'manual_confirm'` so a
  // client-supplied `source` key cannot relabel the audit record. (The
  // literal contains a nested `?? {}`, so slice a window rather than regex
  // the brace-balanced body.)
  const rawIdx = route.indexOf('rawPayload:');
  assert.notEqual(rawIdx, -1, 'rawPayload literal not found in confirm route');
  const window = route.slice(rawIdx, rawIdx + 600);
  const spreadIdx = window.indexOf('...(payload.payload ?? {})');
  const sourceIdx = window.indexOf("source: 'manual_confirm'");
  assert.ok(spreadIdx !== -1 && sourceIdx !== -1, 'expected spread + source label');
  assert.ok(
    spreadIdx < sourceIdx,
    'client spread must precede the server source label so it cannot shadow it',
  );
});

// ─── W3-2: domain-outbox stale-claim reaper ─────────────────────────────────

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
  status: 'pending' | 'processing' | 'completed' | 'dead';
  attempts: number;
  available_at: Date;
  locked_at: Date | null;
  last_error: string | null;
}

function outboxRow(overrides: Partial<OutboxRow> & { id: string }): OutboxRow {
  return {
    aggregate_type: 'test',
    aggregate_id: 'agg_1',
    event_type: 'test_event',
    event_version: 1,
    payload: {},
    actor_id: null,
    correlation_id: null,
    causation_id: null,
    idempotency_key: null,
    status: 'pending',
    attempts: 0,
    available_at: new Date(Date.now() - 60_000),
    locked_at: null,
    last_error: null,
    ...overrides,
  };
}

function createOutboxPool(rows: OutboxRow[]) {
  const state = { rows };
  const queries: string[] = [];

  async function query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    const sql = text.replace(/\s+/g, ' ').trim();
    queries.push(sql);

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }

    // Stale-claim reaper (runs before the claim inside the same txn).
    if (
      sql.startsWith('UPDATE domain_outbox') &&
      sql.includes("WHERE status = 'processing'") &&
      sql.includes('locked_at')
    ) {
      const leaseMs = Number(values![1]);
      const now = Date.now();
      let reaped = 0;
      for (const row of state.rows) {
        if (
          row.status === 'processing' &&
          row.locked_at !== null &&
          row.locked_at.getTime() < now - leaseMs
        ) {
          reaped += 1;
          if (row.attempts >= 10) {
            row.status = 'dead';
            row.last_error = 'processing lease expired; attempt ceiling reached';
          } else {
            row.status = 'pending';
            row.available_at = new Date(now);
          }
          row.locked_at = null;
        }
      }
      return { rows: [], rowCount: reaped };
    }

    // claimDomainOutboxBatch — CTE claim.
    if (sql.startsWith('WITH claimable AS')) {
      const limit = Number(values![0]);
      const now = Date.now();
      const claimable = state.rows
        .filter((r) => r.status === 'pending' && r.available_at.getTime() <= now)
        .slice(0, limit);
      for (const row of claimable) {
        row.status = 'processing';
        row.attempts += 1;
        row.locked_at = new Date(now);
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

    throw new Error(`Unexpected query in test double: ${sql.slice(0, 140)}`);
  }

  const client = { query, release() {} };
  return {
    connect: async () => client,
    rows: state.rows,
    queries,
  };
}

test('W3-2: stale processing claim is reaped and re-claimed', async () => {
  const stale = outboxRow({
    id: 'evt_stale',
    status: 'processing',
    attempts: 1,
    locked_at: new Date(Date.now() - 15 * 60 * 1000), // past the 10min lease
  });
  const pool = createOutboxPool([stale]);

  const claimed = await claimDomainOutboxBatch(pool as never, 50);

  assert.equal(claimed.length, 1, 'reaped event should be claimable');
  assert.equal(claimed[0].id, 'evt_stale');
  assert.equal(claimed[0].attempts, 2, 're-claim counts as an attempt');
});

test('W3-2: fresh processing claim within lease is NOT reaped', async () => {
  const fresh = outboxRow({
    id: 'evt_fresh',
    status: 'processing',
    attempts: 1,
    locked_at: new Date(Date.now() - 60_000), // 1min — well inside the lease
  });
  const pool = createOutboxPool([fresh]);

  const claimed = await claimDomainOutboxBatch(pool as never, 50);

  assert.equal(claimed.length, 0, 'live claim must not be double-processed');
  assert.equal(pool.rows[0].status, 'processing', 'live claim untouched');
});

test('W3-2: stale claim at the attempt ceiling dead-letters instead of looping', async () => {
  const poisoned = outboxRow({
    id: 'evt_poison',
    status: 'processing',
    attempts: 10,
    locked_at: new Date(Date.now() - 30 * 60 * 1000),
  });
  const pool = createOutboxPool([poisoned]);

  const claimed = await claimDomainOutboxBatch(pool as never, 50);

  assert.equal(claimed.length, 0, 'dead-lettered event is not re-claimed');
  assert.equal(pool.rows[0].status, 'dead');
  assert.match(pool.rows[0].last_error ?? '', /lease expired/i);
});

test('W3-2: reaper runs before the claim inside the claim transaction', async () => {
  const pool = createOutboxPool([outboxRow({ id: 'evt_pending' })]);

  await claimDomainOutboxBatch(pool as never, 50);

  const beginIdx = pool.queries.findIndex((q) => q === 'BEGIN');
  const reaperIdx = pool.queries.findIndex(
    (q) => q.startsWith('UPDATE domain_outbox') && q.includes("WHERE status = 'processing'"),
  );
  const claimIdx = pool.queries.findIndex((q) => q.startsWith('WITH claimable AS'));
  const commitIdx = pool.queries.findIndex((q) => q === 'COMMIT');

  assert.ok(beginIdx !== -1 && reaperIdx !== -1 && claimIdx !== -1 && commitIdx !== -1);
  assert.ok(
    beginIdx < reaperIdx && reaperIdx < claimIdx && claimIdx < commitIdx,
    `expected BEGIN → reap → claim → COMMIT, got: ${pool.queries.join(' | ')}`,
  );
});

test('W3-2: custom lease duration is honored', async () => {
  const stale = outboxRow({
    id: 'evt_short_lease',
    status: 'processing',
    attempts: 1,
    locked_at: new Date(Date.now() - 5_000), // 5s stale
  });
  const pool = createOutboxPool([stale]);

  // Default 10min lease: not stale.
  const withDefault = await claimDomainOutboxBatch(pool as never, 50);
  assert.equal(withDefault.length, 0);
  assert.equal(pool.rows[0].status, 'processing');

  // 1s lease: stale.
  const withShortLease = await claimDomainOutboxBatch(pool as never, 50, 1_000);
  assert.equal(withShortLease.length, 1);
  assert.equal(withShortLease[0].id, 'evt_short_lease');
});
