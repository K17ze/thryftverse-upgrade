/**
 * Seller Trust Recompute Worker Handler
 *
 * Daily recompute of the backend-owned seller_trust projection for every
 * seller with paid orders in the trailing 90 days. This is the producer
 * that keeps the Seller Hub trust strip honest: without it, trust signals
 * are seed data or months-stale rows presented as live facts.
 *
 * Bounded (1000 sellers/run, per-seller try/catch) so one bad seller never
 * fails the sweep. Failures go to the DLQ via the standard worker path.
 *
 * @packageDocumentation
 */

import { db } from '../../db/pool.js';
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import { persistSellerMetrics } from '../../lib/sellerPerformance.js';

export interface SellerTrustRecomputeJobData {
  reason: 'scheduled' | 'manual';
}

const MAX_SELLERS_PER_RUN = 1000;

export async function processSellerTrustRecompute(
  data: SellerTrustRecomputeJobData,
): Promise<void> {
  const { reason } = data;
  logger.info({ reason }, 'sellerTrustRecompute.start');

  const sellers = await db.query<{ seller_id: string }>(
    `SELECT DISTINCT seller_id
     FROM orders
     WHERE paid_at >= NOW() - INTERVAL '90 days'
     ORDER BY seller_id
     LIMIT $1`,
    [MAX_SELLERS_PER_RUN],
  );

  let recomputed = 0;
  let failed = 0;
  for (const row of sellers.rows) {
    try {
      await persistSellerMetrics(db, redis, row.seller_id);
      recomputed += 1;
    } catch (err) {
      failed += 1;
      logger.warn(
        { reason, sellerId: row.seller_id, err: err instanceof Error ? err.message : err },
        'sellerTrustRecompute.sellerFailed',
      );
    }
  }

  logger.info(
    { reason, sellers: sellers.rows.length, recomputed, failed },
    'sellerTrustRecompute.complete',
  );
}
