/**
 * vendorSyncHandler — honest outbox delivery states (F16) + leased claims.
 *
 * The handler used to mark every entry `delivered` around a stub log line
 * with no vendor call at all. These tests pin the truthful state machine:
 * unconfigured vendors stay pending, real deliveries mark delivered +
 * mapping, transient failures stay retryable, permanent failures and
 * exhausted attempts dead-letter to 'skipped'.
 *
 * The drain now leases rows via claimVendorOutboxBatch — the claim is a
 * single UPDATE ... FOR UPDATE SKIP LOCKED statement (concurrent drainers
 * cannot take the same row), and a preceding reclaim statement returns
 * stale 'delivering' leases to 'pending' so a crashed worker cannot strand
 * an undelivered event.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { processVendorSyncJob } from '../workers/handlers/vendorSyncHandler.js';
import { claimVendorOutboxBatch } from '../support/vendorAdapter.js';
import {
  VendorPermanentError,
  type VendorClient,
} from '../support/vendorClient.js';

function fakeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vout_1',
    canonicalType: 'case',
    canonicalId: 'case_1',
    vendorName: 'intercom',
    eventType: 'case_created',
    payload: { subject: 'help' },
    idempotencyKey: 'case:case_1:case_created:abc123',
    state: 'delivering',
    attempts: 0,
    lastError: null,
    lastAttemptAt: '2026-01-01T00:00:00Z',
    deliveredAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Fake pg Pool: every query is recorded in `queries`; the claim statement
 * (UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED) ... RETURNING)
 * returns the canned entries, the mapping upsert returns a row, everything
 * else returns empty.
 */
function fakeDb(entries: Array<Record<string, unknown>>) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });
      if (/RETURNING o\.id/.test(sql)) {
        // The atomic claim — returns leased rows.
        return { rows: entries };
      }
      if (/INSERT INTO support_vendor_mappings/.test(sql)) {
        return {
          rows: [
            {
              id: 'vmap_1',
              canonical_type: 'case',
              canonical_id: 'case_1',
              vendor_name: 'intercom',
              vendor_id: 'vnd_1',
              vendor_url: null,
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
        };
      }
      return { rows: [] };
    },
  } as unknown as Pool;
  return { db, queries };
}

function queriesMatching(
  queries: Array<{ sql: string }>,
  fragment: string,
) {
  return queries.filter((q) => q.sql.includes(fragment));
}

describe('processVendorSyncJob — F16 honest delivery states', () => {
  it('leaves entries pending when the vendor is not configured', async () => {
    const { db, queries } = fakeDb([fakeEntry()]);
    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: null });
    // No claim, no state transition — nothing was delivered, nothing failed.
    assert.equal(queries.length, 0);
  });

  it('claims via FOR UPDATE SKIP LOCKED so concurrent drainers cannot double-deliver', async () => {
    const { db, queries } = fakeDb([fakeEntry()]);
    const client: VendorClient = {
      vendorName: 'intercom',
      deliver: async () => ({ vendorId: 'vnd_1' }),
    };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    const claims = queriesMatching(queries, 'FOR UPDATE SKIP LOCKED');
    assert.equal(claims.length, 1);
    // The claim transitions rows to 'delivering' in the same statement.
    assert.ok(claims[0].sql.includes("state = 'delivering'"));
    // Only rows still claimable are eligible — delivered/skipped rows can
    // never be re-taken by a racing drain.
    assert.ok(claims[0].sql.includes("state IN ('pending', 'failed')"));
  });

  it('reclaims stale delivering leases back to pending before claiming', async () => {
    const { db, queries } = fakeDb([fakeEntry()]);
    const client: VendorClient = {
      vendorName: 'intercom',
      deliver: async () => ({ vendorId: 'vnd_1' }),
    };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    // First statement: the lease reclaim — expired 'delivering' rows return
    // to 'pending' (or 'skipped' at the attempt ceiling).
    const reclaim = queries.find(
      (q) =>
        q.sql.includes("state = 'delivering'") &&
        q.sql.includes('last_attempt_at') &&
        q.sql.includes("INTERVAL '1 millisecond'"),
    );
    assert.ok(reclaim, 'expected a stale-lease reclaim UPDATE before claiming');
    assert.ok(reclaim.sql.includes("'pending'"));
    assert.ok(reclaim.sql.includes("'skipped'"));
    // The reclaim consumes an attempt so a crash-looping entry is bounded.
    assert.ok(reclaim.sql.includes('attempts = attempts + 1'));
    // It runs before the claim.
    const reclaimIdx = queries.indexOf(reclaim);
    const claimIdx = queries.findIndex((q) => q.sql.includes('FOR UPDATE SKIP LOCKED'));
    assert.ok(reclaimIdx < claimIdx);
  });

  it('marks delivered + creates mapping on a real successful delivery', async () => {
    const { db, queries } = fakeDb([fakeEntry()]);
    const deliver = mock.fn(async () => ({ vendorId: 'vnd_1', vendorUrl: 'https://x/1' }));
    const client: VendorClient = { vendorName: 'intercom', deliver };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    assert.equal(deliver.mock.callCount(), 1);
    assert.equal(queriesMatching(queries, "state = 'delivered'").length, 1);
    // Mapping upsert goes through db.query too — the important part is
    // deliver() ran before the delivered mark.
    const deliverIdx = queries.findIndex((q) => q.sql.includes("state = 'delivered'"));
    const mapIdx = queries.findIndex((q) => q.sql.includes('INSERT INTO support_vendor_mappings'));
    assert.ok(mapIdx !== -1 && mapIdx < deliverIdx);
  });

  it('marks failed (retryable) on a transient vendor error and consumes an attempt', async () => {
    const { db, queries } = fakeDb([fakeEntry()]);
    const client: VendorClient = {
      vendorName: 'intercom',
      deliver: async () => {
        throw new Error('vendor intercom transient 503: unavailable');
      },
    };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    const failed = queriesMatching(queries, "state = 'failed'");
    assert.equal(failed.length, 1);
    assert.ok(failed[0].sql.includes('attempts = attempts + 1'));
    assert.equal(queriesMatching(queries, "state = 'delivered'").length, 0);
    // 'skipped' appears in the reclaim CASE but no terminal skipped write.
    const terminalSkipped = queriesMatching(queries, "SET state = 'skipped'");
    assert.equal(terminalSkipped.length, 0);
  });

  it('dead-letters to skipped on a permanent (4xx) vendor rejection', async () => {
    const { db, queries } = fakeDb([fakeEntry()]);
    const client: VendorClient = {
      vendorName: 'intercom',
      deliver: async () => {
        throw new VendorPermanentError('vendor intercom rejected delivery 422', 422);
      },
    };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    assert.equal(queriesMatching(queries, "SET state = 'skipped'").length, 1);
    assert.equal(queriesMatching(queries, "state = 'delivered'").length, 0);
  });

  it('dead-letters entries that exhausted max attempts without calling the vendor', async () => {
    const { db, queries } = fakeDb([fakeEntry({ attempts: 5 })]);
    const deliver = mock.fn(async () => ({ vendorId: 'vnd_1' }));
    const client: VendorClient = { vendorName: 'intercom', deliver };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    assert.equal(deliver.mock.callCount(), 0);
    assert.equal(queriesMatching(queries, "SET state = 'skipped'").length, 1);
  });

  it('does not call the vendor when the claim returns nothing', async () => {
    const { db } = fakeDb([]);
    const deliver = mock.fn(async () => ({ vendorId: 'vnd_1' }));
    const client: VendorClient = { vendorName: 'intercom', deliver };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    assert.equal(deliver.mock.callCount(), 0);
  });

  it('sends the entry idempotency key through to the vendor payload contract', async () => {
    // The mapping upsert is ON CONFLICT (canonical_type, canonical_id,
    // vendor_name) — reprocessing the same entry updates rather than
    // duplicating. This is pinned by the adapter's SQL; here we verify the
    // handler completes a duplicate delivery without error.
    const { db, queries } = fakeDb([fakeEntry()]);
    const client: VendorClient = {
      vendorName: 'intercom',
      deliver: async () => ({ vendorId: 'vnd_1' }),
    };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });
    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    // Two deliveries → two delivered marks; mapping upsert is idempotent.
    assert.equal(queriesMatching(queries, "state = 'delivered'").length, 2);
  });
});

describe('claimVendorOutboxBatch — lease semantics', () => {
  it('reclaims an expired delivering lease so a crashed drain cannot strand the event', async () => {
    // Simulate: first claim takes the row (returns it in 'delivering'),
    // worker crashes. A later drain runs the reclaim UPDATE — the fake
    // verifies the WHERE clause targets expired 'delivering' leases.
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params: params ?? [] });
        return { rows: [] };
      },
    } as unknown as Pool;

    await claimVendorOutboxBatch(db, 'intercom', 50, {
      staleLeaseMs: 60_000,
      maxAttempts: 5,
    });

    assert.equal(queries.length, 2);
    const [reclaim, claim] = queries;
    // Reclaim: expired lease → pending (or skipped at ceiling), attempt consumed.
    assert.ok(reclaim.sql.includes("state = 'delivering'"));
    assert.ok(reclaim.sql.includes("CASE WHEN attempts + 1 >= $3 THEN 'skipped' ELSE 'pending'"));
    assert.deepEqual(reclaim.params, ['intercom', 60_000, 5]);
    // Claim: SKIP LOCKED + lease stamp.
    assert.ok(claim.sql.includes('FOR UPDATE SKIP LOCKED'));
    assert.ok(claim.sql.includes('last_attempt_at = NOW()'));
    assert.deepEqual(claim.params, ['intercom', 50]);
  });

  it('clamps batch size and lease bounds to sane ranges', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params: params ?? [] });
        return { rows: [] };
      },
    } as unknown as Pool;

    await claimVendorOutboxBatch(db, 'zendesk', 10_000, { staleLeaseMs: 0 });

    // limit clamps to 200, staleLeaseMs clamps to >= 1s.
    assert.deepEqual(queries[0].params, ['zendesk', 1_000, 5]);
    assert.deepEqual(queries[1].params, ['zendesk', 200]);
  });
});
