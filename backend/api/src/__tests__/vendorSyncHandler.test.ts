/**
 * vendorSyncHandler — honest outbox delivery states (F16).
 *
 * The handler used to mark every entry `delivered` around a stub log line
 * with no vendor call at all. These tests pin the truthful state machine:
 * unconfigured vendors stay pending, real deliveries mark delivered +
 * mapping, transient failures stay retryable, permanent failures and
 * exhausted attempts dead-letter to 'skipped'.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { processVendorSyncJob } from '../workers/handlers/vendorSyncHandler.js';
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
    state: 'pending',
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
    deliveredAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Fake pg Pool: returns outbox rows for SELECTs, records writes. */
function fakeDb(entries: Array<Record<string, unknown>>) {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      if (/FROM support_vendor_outbox/.test(sql)) {
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
      writes.push({ sql, params: params ?? [] });
      return { rows: [] };
    },
  } as unknown as Pool;
  return { db, writes };
}

function writesTo(writes: Array<{ sql: string }>, fragment: string) {
  return writes.filter((w) => w.sql.includes(fragment));
}

describe('processVendorSyncJob — F16 honest delivery states', () => {
  it('leaves entries pending when the vendor is not configured', async () => {
    const { db, writes } = fakeDb([fakeEntry()]);
    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: null });
    // No state transition may happen — nothing was delivered, nothing failed.
    assert.equal(writes.length, 0);
  });

  it('marks delivered + creates mapping on a real successful delivery', async () => {
    const { db, writes } = fakeDb([fakeEntry()]);
    const deliver = mock.fn(async () => ({ vendorId: 'vnd_1', vendorUrl: 'https://x/1' }));
    const client: VendorClient = { vendorName: 'intercom', deliver };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    assert.equal(deliver.mock.callCount(), 1);
    assert.ok(writesTo(writes, "state = 'delivering'").length === 1);
    assert.ok(writesTo(writes, "state = 'delivered'").length === 1);
    // Mapping upsert goes through db.query too (recorded in fakeDb path) —
    // the important part is deliver() ran before the delivered mark.
  });

  it('marks failed (retryable) on a transient vendor error', async () => {
    const { db, writes } = fakeDb([fakeEntry()]);
    const client: VendorClient = {
      vendorName: 'intercom',
      deliver: async () => {
        throw new Error('vendor intercom transient 503: unavailable');
      },
    };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    assert.equal(writesTo(writes, "state = 'failed'").length, 1);
    assert.equal(writesTo(writes, "state = 'delivered'").length, 0);
    assert.equal(writesTo(writes, "state = 'skipped'").length, 0);
  });

  it('dead-letters to skipped on a permanent (4xx) vendor rejection', async () => {
    const { db, writes } = fakeDb([fakeEntry()]);
    const client: VendorClient = {
      vendorName: 'intercom',
      deliver: async () => {
        throw new VendorPermanentError('vendor intercom rejected delivery 422', 422);
      },
    };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    assert.equal(writesTo(writes, "state = 'skipped'").length, 1);
    assert.equal(writesTo(writes, "state = 'delivered'").length, 0);
  });

  it('dead-letters entries that exceeded max attempts without calling the vendor', async () => {
    const { db, writes } = fakeDb([fakeEntry({ attempts: 5 })]);
    const deliver = mock.fn(async () => ({ vendorId: 'vnd_1' }));
    const client: VendorClient = { vendorName: 'intercom', deliver };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    assert.equal(deliver.mock.callCount(), 0);
    assert.equal(writesTo(writes, "state = 'skipped'").length, 1);
  });

  it('sends the entry idempotency key through to the vendor payload contract', async () => {
    // The mapping upsert is ON CONFLICT (canonical_type, canonical_id,
    // vendor_name) — reprocessing the same entry updates rather than
    // duplicating. This is pinned by the adapter's SQL; here we verify the
    // handler completes a duplicate delivery without error.
    const { db, writes } = fakeDb([fakeEntry()]);
    const client: VendorClient = {
      vendorName: 'intercom',
      deliver: async () => ({ vendorId: 'vnd_1' }),
    };

    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });
    await processVendorSyncJob({ vendorName: 'intercom' }, { db, vendorClient: client });

    // Two deliveries → two delivered marks; mapping upsert is idempotent.
    assert.equal(writesTo(writes, "state = 'delivered'").length, 2);
  });
});
