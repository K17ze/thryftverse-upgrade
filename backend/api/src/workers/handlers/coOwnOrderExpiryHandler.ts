/**
 * Co-Own order expiry sweep handler.
 *
 * B06: A scheduled transactional expiration job that runs periodically (every
 * 30 seconds by default) and expires GFD (Good For Day) and GTC90 (Good Till
 * Canceled 90 days) orders whose `expires_at` deadline has passed.
 *
 * Before this handler, expiry cleanup only ran inline inside a new-order
 * transaction (coOwn.ts). Quiet markets with no incoming orders never expired
 * resting orders, so stale GFD/GTC90 orders lingered in the book indefinitely.
 *
 * For each expired order the handler atomically:
 *   1. Sets status = 'cancelled', cancel_reason = 'expired', remaining_units = 0
 *   2. Releases the associated reservation (status = 'expired', reserved units = 0)
 *   3. Appends a domain outbox event for real-time client propagation
 *   4. Publishes a realtime book-updated event
 *   5. Logs the expiration
 *
 * The handler is idempotent — the UPDATE only affects orders whose status is
 * still 'open' or 'partially_filled', so re-running the sweep is a no-op for
 * orders that have already been expired by a prior sweep or an inline expiry.
 *
 * B09: Expiration events are emitted through the domain outbox so connected
 * clients receive real-time updates. The event payload includes asset_id,
 * order_id, side, expired_quantity, reason, and timestamp.
 */
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { publishRealtimeEvent } from '../../lib/realtime.js';
import { appendDomainEvent } from '../../lib/domainOutbox.js';

export type CoOwnOrderExpiryHandlerDeps = {
  /** Uses shared db singleton + domain outbox + realtime helpers. */
};

interface ExpiredOrderRow {
  id: number;
  asset_id: string;
  user_id: string;
  side: 'buy' | 'sell';
  remaining_units: number;
  unit_price_gbp: string;
}

export async function sweepExpiredCoOwnOrders(reason: 'interval' | 'manual'): Promise<number> {
  const client = await db.connect();
  let processed = 0;

  try {
    await client.query('BEGIN');

    // Lock and claim expired orders. FOR UPDATE SKIP LOCKED prevents
    // concurrent sweeps (or the inline expiry inside a new-order transaction)
    // from processing the same row. The WHERE clause restricts to non-terminal
    // orders whose deadline has passed, making the operation idempotent.
    const expired = await client.query<ExpiredOrderRow>(
      `
        SELECT
          id,
          asset_id,
          user_id,
          side,
          remaining_units,
          unit_price_gbp::text
        FROM coOwn_orders
        WHERE status IN ('open', 'partially_filled')
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()
        ORDER BY expires_at ASC
        LIMIT 500
        FOR UPDATE SKIP LOCKED
      `,
    );

    if (!expired.rowCount || expired.rows.length === 0) {
      await client.query('COMMIT');
      return 0;
    }

    const orderIds = expired.rows.map((row) => row.id);

    // Atomically expire all claimed orders in a single UPDATE.
    await client.query(
      `
        UPDATE coOwn_orders
        SET remaining_units = 0,
            status = 'cancelled',
            cancel_reason = 'expired',
            updated_at = NOW()
        WHERE id = ANY($1::bigint[])
          AND status IN ('open', 'partially_filled')
      `,
      [orderIds],
    );

    // Release all associated placed reservations.
    await client.query(
      `
        UPDATE coown_order_reservations
        SET status = 'expired',
            reserved_1ze_units = 0,
            reserved_units = 0,
            updated_at = NOW()
        WHERE placed_order_id = ANY($1::bigint[])
          AND status = 'placed'
      `,
      [orderIds],
    );

    // Emit a domain outbox event for each expired order so connected clients
    // receive real-time updates through the outbox drain pipeline.
    const nowIso = new Date().toISOString();
    for (const order of expired.rows) {
      await appendDomainEvent(client, {
        aggregateType: 'coown_order',
        aggregateId: `coown_order:${order.asset_id}:${order.id}`,
        eventType: 'coown.order.expired',
        payload: {
          assetId: order.asset_id,
          orderId: order.id,
          side: order.side,
          expiredQuantity: order.remaining_units,
          reason: 'expired',
          timestamp: nowIso,
        },
        actorId: order.user_id,
        idempotencyKey: `coown_order_expired_${order.id}`,
        deduplicationKey: `coown_order_expired_${order.id}`,
      });

      logger.info(
        {
          orderId: order.id,
          assetId: order.asset_id,
          userId: order.user_id,
          side: order.side,
          expiredQuantity: order.remaining_units,
          unitPriceGbp: Number(order.unit_price_gbp),
          reason,
        },
        'Co-Own order expired by sweep',
      );

      processed += 1;
    }

    await client.query('COMMIT');

    // Publish realtime events after commit so clients only see the final
    // state. One book-updated event per asset is sufficient to trigger a
    // book refetch; individual order-expired events are carried by the
    // outbox drain.
    const assetIds = [...new Set(expired.rows.map((row) => row.asset_id))];
    for (const assetId of assetIds) {
      publishRealtimeEvent({
        topic: `co-own.asset:${assetId}`,
        type: 'co-own.book-updated',
        payload: {
          assetId,
          reason: 'expired',
        },
        seq: true,
        version: 1,
      }).catch((err) => {
        logger.warn({ err: err instanceof Error ? err.message : String(err), assetId }, 'Failed to publish co-own expiry realtime event');
      });
    }

    return processed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
