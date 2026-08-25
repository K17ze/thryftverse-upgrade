import type { Pool, QueryResult } from 'pg';
import { logger } from './logger.js';

/**
 * Load multiple rows from `table` keyed by their `id` column in a single
 * query using `WHERE id = ANY($1::text[])`. Returns a Map from id to the
 * row so callers can look up each row without issuing a per-id query.
 *
 * This is the batch replacement for the N+1 pattern:
 *   for (const id of ids) { await db.query(`SELECT ... FROM t WHERE id = $1`, [id]) }
 *
 * Only the requested `columns` are selected. Never throws — on error an
 * empty Map is returned and the error is logged so callers can degrade
 * gracefully.
 */
export async function batchLoadByIds<T extends Record<string, unknown>>(
  dbPool: Pool,
  table: string,
  ids: string[],
  columns: string[] = ['*'],
): Promise<Map<string, T>> {
  const result = new Map<string, T>();
  if (ids.length === 0) {
    return result;
  }

  const uniqueIds = Array.from(new Set(ids));
  const columnList = columns.map((c) => `"${c}"`).join(', ');

  try {
    const res: QueryResult<T> = await dbPool.query<T>(
      `SELECT ${columnList} FROM ${table} WHERE id = ANY($1::text[])`,
      [uniqueIds],
    );
    for (const row of res.rows) {
      const id = (row as Record<string, unknown>).id;
      if (typeof id === 'string') {
        result.set(id, row);
      }
    }
  } catch (error) {
    logger.error(
      { err: error, table, count: uniqueIds.length },
      'batchLoadByIds failed',
    );
  }

  return result;
}

/**
 * Load related rows from `table` for multiple parent ids in a single
 * query using `WHERE ${foreignKey} = ANY($1::text[])`. Returns a Map
 * from each parent id to the array of related rows. Parents with no
 * related rows are present as an empty array so callers can safely
 * `map.get(parentId) ?? []` without a second query.
 *
 * This is the batch replacement for the N+1 pattern:
 *   for (const parentId of parentIds) {
 *     await db.query(`SELECT ... FROM t WHERE fk = $1`, [parentId]);
 *   }
 *
 * Never throws — on error an empty Map is returned and the error is
 * logged.
 */
export async function batchLoadRelation<T extends Record<string, unknown>>(
  dbPool: Pool,
  table: string,
  foreignKey: string,
  parentIds: string[],
  columns: string[] = ['*'],
): Promise<Map<string, T[]>> {
  const result = new Map<string, T[]>();
  if (parentIds.length === 0) {
    return result;
  }

  const uniqueParentIds = Array.from(new Set(parentIds));
  for (const parentId of uniqueParentIds) {
    result.set(parentId, []);
  }

  const columnList = columns.map((c) => `"${c}"`).join(', ');

  try {
    const res: QueryResult<T & Record<string, unknown>> = await dbPool.query<T & Record<string, unknown>>(
      `SELECT ${columnList} FROM ${table} WHERE "${foreignKey}" = ANY($1::text[])`,
      [uniqueParentIds],
    );
    for (const row of res.rows) {
      const parentId = row[foreignKey];
      if (typeof parentId === 'string') {
        const bucket = result.get(parentId);
        if (bucket) {
          bucket.push(row as T);
        }
      }
    }
  } catch (error) {
    logger.error(
      { err: error, table, foreignKey, count: uniqueParentIds.length },
      'batchLoadRelation failed',
    );
  }

  return result;
}

/**
 * Batch-load a single top bid per auction in one query instead of
 * issuing a per-auction `SELECT ... ORDER BY amount_gbp DESC LIMIT 1`.
 *
 * Returns a Map from auction_id to the winning bid row. Used by the
 * auction settlement sweep (sweepExpiredAuctions in index.ts) which
 * currently issues one query per expiring auction.
 */
export async function batchLoadTopBidsByAuction(
  dbPool: Pool,
  auctionIds: string[],
): Promise<Map<string, { id: number; bidder_id: string; amount_gbp: string }>> {
  const result = new Map<string, { id: number; bidder_id: string; amount_gbp: string }>();
  if (auctionIds.length === 0) {
    return result;
  }

  const uniqueIds = Array.from(new Set(auctionIds));

  try {
    const res = await dbPool.query<{
      auction_id: string;
      id: number;
      bidder_id: string;
      amount_gbp: string;
    }>(
      `
        SELECT DISTINCT ON (b.auction_id)
          b.auction_id, b.id, b.bidder_id, b.amount_gbp::text
        FROM auction_bids b
        WHERE b.auction_id = ANY($1::text[])
        ORDER BY b.auction_id, b.amount_gbp DESC, b.created_at ASC, b.id ASC
      `,
      [uniqueIds],
    );
    for (const row of res.rows) {
      result.set(row.auction_id, {
        id: row.id,
        bidder_id: row.bidder_id,
        amount_gbp: row.amount_gbp,
      });
    }
  } catch (error) {
    logger.error(
      { err: error, count: uniqueIds.length },
      'batchLoadTopBidsByAuction failed',
    );
  }

  return result;
}

/**
 * Batch-check existence of open disputes for multiple order ids in a
 * single query instead of issuing a per-order EXISTS subquery. Returns
 * a Set of order ids that have an open dispute. Used by the escrow
 * release sweep (release-sweep in index.ts) which currently issues one
 * EXISTS query per due order.
 */
export async function batchOrdersWithOpenDisputes(
  dbPool: Pool,
  orderIds: string[],
): Promise<Set<string>> {
  const result = new Set<string>();
  if (orderIds.length === 0) {
    return result;
  }

  const uniqueIds = Array.from(new Set(orderIds));

  try {
    const res = await dbPool.query<{ order_id: string }>(
      `
        SELECT DISTINCT i.order_id
        FROM payment_disputes d
        JOIN payment_intents i ON i.id = d.intent_id
        WHERE i.order_id = ANY($1::text[])
          AND d.status IN ('open', 'warning', 'needs_response')
          AND d.evidence_submitted_at IS NULL
      `,
      [uniqueIds],
    );
    for (const row of res.rows) {
      result.add(row.order_id);
    }
  } catch (error) {
    logger.error(
      { err: error, count: uniqueIds.length },
      'batchOrdersWithOpenDisputes failed',
    );
  }

  return result;
}

/**
 * Batch-load available seller_payable balances for multiple user ids in
 * a single query instead of issuing a per-user SUM query. Returns a Map
 * from user_id to the available GBP balance. Used by the payout
 * schedule sweep (schedule-sweep in index.ts) which currently issues one
 * balance query per due payout account.
 */
export async function batchLoadSellerPayableBalances(
  dbPool: Pool,
  userIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (userIds.length === 0) {
    return result;
  }

  const uniqueIds = Array.from(new Set(userIds));
  for (const userId of uniqueIds) {
    result.set(userId, 0);
  }

  try {
    const res = await dbPool.query<{ owner_id: string; available_gbp: string }>(
      `
        SELECT la.owner_id, COALESCE(SUM(le.amount_gbp), 0)::text AS available_gbp
        FROM ledger_entries le
        JOIN ledger_accounts la ON la.id = le.account_id
        WHERE la.owner_type = 'user'
          AND la.code = 'seller_payable'
          AND la.owner_id = ANY($1::text[])
          AND le.direction = 'credit'
        GROUP BY la.owner_id
      `,
      [uniqueIds],
    );
    for (const row of res.rows) {
      result.set(row.owner_id, Number(row.available_gbp) || 0);
    }
  } catch (error) {
    logger.error(
      { err: error, count: uniqueIds.length },
      'batchLoadSellerPayableBalances failed',
    );
  }

  return result;
}

/**
 * ───────────────────────────────────────────────────────────────────────────
 * N+1 QUERY FIX WIRING GUIDE — index.ts
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The following N+1 queries in src/index.ts should be replaced with the
 * batch utilities above. DO NOT modify index.ts from this module — wire
 * these in from a follow-up refactor.
 *
 * 1. sweepExpiredAuctions() — index.ts ~line 9145
 *    Current: for (const auction of expiring.rows) { await client.query(
 *      `SELECT id, bidder_id, amount_gbp FROM auction_bids WHERE auction_id = $1
 *       ORDER BY amount_gbp DESC LIMIT 1`, [auction.id]) }
 *    Fix: const topBids = await batchLoadTopBidsByAuction(client, auctionIds);
 *         then look up topBids.get(auction.id) inside the loop.
 *
 * 2. /ops/escrow/release-sweep — index.ts ~line 11669
 *    Current: for (const order of dueOrders.rows) {
 *      await client.query(`SELECT EXISTS (... payment_disputes ... WHERE i.order_id = $1)`, [order.id]) }
 *    Fix: const disputed = await batchOrdersWithOpenDisputes(client, orderIds);
 *         then `if (disputed.has(order.id)) continue;` inside the loop.
 *
 * 3. /ops/payouts/schedule-sweep — index.ts ~line 32114
 *    Current: for (const account of dueAccounts.rows) {
 *      await db.query(`SELECT COALESCE(SUM(amount_gbp),0) FROM ledger_entries
 *        WHERE account_id = (SELECT id FROM ledger_accounts WHERE owner_id = $1 ...)`, [account.user_id]) }
 *    Fix: const balances = await batchLoadSellerPayableBalances(db, userIds);
 *         then `const availableGbp = balances.get(account.user_id) ?? 0;` inside the loop.
 *
 * 4. rewrapDomainRows() — index.ts ~line 8227
 *    Current: for (const row of rows.rows) { await db.query(
 *      `UPDATE ... WHERE user_id = $3`, [rewrapped, version, row.user_id]) }
 *    Note: each UPDATE depends on a per-row rewrapCiphertext() call, so this
 *    cannot be fully batched. Consider batching the ciphertext rewraps with
 *    Promise.all (CPU-bound, no DB) and issuing a single multi-VALUES UPDATE.
 */
