import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { settleCreatorEarningEntries } from '../lib/creatorPayoutSettlement.js';

/**
 * Bank-destination creator payouts park sources + payout entry in 'held'.
 * These tests pin the settlement contract: 'paid' flips held → paid,
 * 'failed'/'cancelled' release sources and reverse the payout entry, and
 * everything is a no-op when the link column or payout entry is missing.
 */

type RecordedQuery = { sql: string; params?: unknown[] };

function createClient(opts: {
  linkColumnPresent?: boolean;
  payoutEntryId?: string | null;
}) {
  const queries: RecordedQuery[] = [];
  const client = {
    async query(sql: string, params?: unknown[]) {
      const text = sql.replace(/\s+/g, ' ').trim();
      queries.push({ sql: text, params });
      if (text.includes('information_schema.columns')) {
        return { rows: [{ present: opts.linkColumnPresent ?? true }], rowCount: 1 };
      }
      if (text.startsWith('SELECT id FROM creator_earning_entries')) {
        return {
          rows: opts.payoutEntryId ? [{ id: opts.payoutEntryId }] : [],
          rowCount: opts.payoutEntryId ? 1 : 0,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as PoolClient;
  return { client, queries };
}

test('paid: flips payout entry and held sources to paid', async () => {
  const { client, queries } = createClient({ payoutEntryId: 'pay_1' });
  const result = await settleCreatorEarningEntries(client, 'req_1', 'paid');

  assert.equal(result.settled, true);
  const updates = queries.filter((q) => q.sql.startsWith('UPDATE creator_earning_entries'));
  assert.equal(updates.length, 1);
  assert.match(updates[0].sql, /SET status = 'paid'/);
  assert.match(updates[0].sql, /reversed_entry_id = \$1/);
  assert.match(updates[0].sql, /status = 'held'/);
  assert.deepEqual(updates[0].params, ['pay_1']);
});

test('failed: releases sources to available and reverses payout entry', async () => {
  const { client, queries } = createClient({ payoutEntryId: 'pay_1' });
  const result = await settleCreatorEarningEntries(client, 'req_1', 'failed');

  assert.equal(result.settled, true);
  const updates = queries.filter((q) => q.sql.startsWith('UPDATE creator_earning_entries'));
  assert.equal(updates.length, 2);
  assert.match(updates[0].sql, /SET status = 'available', reversed_entry_id = NULL/);
  assert.match(updates[0].sql, /WHERE reversed_entry_id = \$1 AND status = 'held'/);
  assert.match(updates[1].sql, /SET status = 'reversed'/);
  assert.match(updates[1].sql, /WHERE id = \$1 AND status = 'held'/);
});

test('cancelled: same release semantics as failed', async () => {
  const { client, queries } = createClient({ payoutEntryId: 'pay_1' });
  await settleCreatorEarningEntries(client, 'req_1', 'cancelled');

  const updates = queries.filter((q) => q.sql.startsWith('UPDATE creator_earning_entries'));
  assert.equal(updates.length, 2);
  assert.match(updates[0].sql, /SET status = 'available'/);
  assert.match(updates[1].sql, /SET status = 'reversed'/);
});

test('no-op when link column is absent (pre-migration database)', async () => {
  const { client, queries } = createClient({ linkColumnPresent: false });
  const result = await settleCreatorEarningEntries(client, 'req_1', 'paid');

  assert.equal(result.settled, false);
  assert.equal(queries.length, 1);
});

test('no-op when no payout entry links to the request', async () => {
  const { client, queries } = createClient({ payoutEntryId: null });
  const result = await settleCreatorEarningEntries(client, 'req_1', 'paid');

  assert.equal(result.settled, false);
  assert.equal(
    queries.filter((q) => q.sql.startsWith('UPDATE')).length,
    0
  );
});

test('lookup is scoped to the payout request id and payout entries', async () => {
  const { client, queries } = createClient({ payoutEntryId: 'pay_1' });
  await settleCreatorEarningEntries(client, 'req_9', 'paid');

  const lookup = queries.find(
    (q) => q.sql.startsWith('SELECT id FROM creator_earning_entries')
  );
  assert.ok(lookup);
  assert.match(lookup.sql, /related_payout_request_id = \$1/);
  assert.match(lookup.sql, /entry_type = 'payout'/);
  assert.deepEqual(lookup.params, ['req_9']);
});
