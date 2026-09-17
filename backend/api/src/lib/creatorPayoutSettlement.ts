import type { PoolClient } from 'pg';

/**
 * Creator-earnings settlement for bank-destination payouts.
 *
 * POST /creators/me/payouts with destination='bank' inserts a negative
 * 'payout' entry and moves the source entries to 'held' (linked back via
 * reversed_entry_id), while the payout_request is only 'requested'. When
 * the rail later settles:
 *
 *   paid      → payout entry + held sources flip to 'paid'
 *   failed    → sources release back to 'available', payout entry 'reversed'
 *   cancelled → same as failed — the money never moved, creator can re-request
 *
 * Idempotent: only 'held' rows are touched, so replaying a settlement is a
 * no-op. Safe on partially-migrated databases: if migration 308 has not run,
 * related_payout_request_id is absent and the function returns without
 * touching earnings.
 */
export async function settleCreatorEarningEntries(
  client: PoolClient,
  payoutRequestId: string,
  targetStatus: 'paid' | 'failed' | 'cancelled'
): Promise<{ settled: boolean }> {
  const linkColumn = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'creator_earning_entries'
         AND column_name = 'related_payout_request_id'
     ) AS present`
  );
  if (!linkColumn.rows[0]?.present) {
    return { settled: false };
  }

  const linked = await client.query<{ id: string }>(
    `SELECT id FROM creator_earning_entries
     WHERE related_payout_request_id = $1 AND entry_type = 'payout'
     LIMIT 1`,
    [payoutRequestId]
  );
  const payoutEntryId = linked.rows[0]?.id;
  if (!payoutEntryId) {
    return { settled: false };
  }

  if (targetStatus === 'paid') {
    await client.query(
      `UPDATE creator_earning_entries SET status = 'paid'
       WHERE (id = $1 OR reversed_entry_id = $1) AND status = 'held'`,
      [payoutEntryId]
    );
  } else {
    // failed / cancelled — money never moved; release the sources so the
    // creator can re-request, and mark the payout entry reversed.
    await client.query(
      `UPDATE creator_earning_entries
       SET status = 'available', reversed_entry_id = NULL
       WHERE reversed_entry_id = $1 AND status = 'held'`,
      [payoutEntryId]
    );
    await client.query(
      `UPDATE creator_earning_entries SET status = 'reversed'
       WHERE id = $1 AND status = 'held'`,
      [payoutEntryId]
    );
  }
  return { settled: true };
}
