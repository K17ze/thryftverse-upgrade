/**
 * Performance-based seller program for the ThryftVerse marketplace.
 *
 * Tracks seller metrics on a rolling 90-day basis and qualifies sellers
 * for a performance programme.
 *
 * STATUS: The visibility multipliers and public badge outputs of this module
 * are DISABLED for production use (Phase 0 contract-truth repair). Metrics are
 * now recomputed from authoritative order/carrier facts via
 * `recomputeSellerMetrics` / `persistSellerMetrics`. The legacy
 * `trackSellerMetrics` function that accepted caller-supplied values is
 * DEPRECATED and must not be called in production.
 *
 * Design principles (AGENTS.md §11 — Truthful):
 * - Metrics must be derived from real order data — never fabricated
 * - Tier changes must be auditable with full context
 * - Visibility boosts must be applied transparently in search ranking
 * - No public badge without a persisted, current programme decision (fail-closed)
 */

import type { Redis } from 'ioredis';
import type { Pool, PoolClient } from 'pg';

/**
 * A database connection that supports parameterised queries — either a full
 * `Pool` or a checked-out `PoolClient` (transaction connection). Mirrors the
 * pattern used by `sellerRiskTiering.ts`.
 */
type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SellerTier = 'STANDARD' | 'PERFORMER' | 'TOP_PERFORMER';

export interface SellerMetrics {
  userId: string;
  /** Rolling 90-day metrics */
  ordersShipped90d: number;
  salesVolume90d: number; // in GBP
  averageShipTimeHours90d: number;
  cancellationRate90d: number; // 0-1
  approvedReturnCaseRate90d: number; // 0-1
  /** Lifetime metrics */
  lifetimeOrdersShipped: number;
  /** Metadata */
  calculatedAt: string;
}

export interface ProgramQualification {
  userId: string;
  qualified: boolean;
  tier: SellerTier;
  criteria: {
    lifetimeOrders: { met: boolean; value: number; required: number };
    orders90d: { met: boolean; value: number; required: number };
    sales90d: { met: boolean; value: number; required: number };
    shipTime90d: { met: boolean; value: number; requiredHours: number };
    cancellationRate90d: { met: boolean; value: number; maxRate: number };
    returnCaseRate90d: { met: boolean; value: number; maxRate: number };
  };
  failingCriteria: string[];
  nextEvaluationDate: string;
  evaluatedAt: string;
}

export interface SellerTrustSignal {
  userId: string;
  tier: SellerTier;
  qualifiedDate?: string;
  metricsSummary: {
    lifetimeOrders: number;
    averageShipTimeHours: number;
    cancellationRate: number;
  };
  badgeLevel: 'none' | 'performer' | 'top_performer';
}

export interface SellerDashboardData {
  userId: string;
  tier: SellerTier;
  qualified: boolean;
  metrics: SellerMetrics;
  qualification: ProgramQualification;
  progressTowardQualification: {
    lifetimeOrdersProgress: number; // 0-1
    orders90dProgress: number; // 0-1
    shipTimeStatus: 'good' | 'needs_improvement' | 'critical';
    cancellationStatus: 'good' | 'needs_improvement' | 'critical';
    returnCaseStatus: 'good' | 'needs_improvement' | 'critical';
  };
  areasNeedingImprovement: string[];
  lifetimeStats: {
    totalOrders: number;
    totalSales: number;
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const PROGRAM_CRITERIA = {
  /** One-time threshold: lifetime orders shipped */
  lifetimeOrdersRequired: 20,
  /** Rolling 90-day: orders OR sales */
  orders90dRequired: 5,
  sales90dRequired: 500, // GBP
  /** Rolling 90-day: average ship time in hours (2 days = 48 hours) */
  maxShipTimeHours: 48,
  /** Rolling 90-day: cancellation rate (2% = 0.02) */
  maxCancellationRate: 0.02,
  /** Rolling 90-day: approved return case rate (2% = 0.02) */
  maxReturnCaseRate: 0.02,
  /** TOP_PERFORMER additional criteria */
  topPerformerLifetimeOrders: 100,
  topPerformerMaxShipTimeHours: 24,
  topPerformerMaxCancellationRate: 0.01,
} as const;

/**
 * Visibility boost multipliers by tier.
 *
 * DISABLED — all tiers return 1.0 (no boost). The previous 1.3×/1.5×
 * multipliers were unvalidated product policy that could distort ranking
 * without a versioned experiment. They must not be re-enabled until:
 *   1. Metrics are recomputed from authoritative order/carrier/case facts
 *      (not caller-supplied values).
 *   2. A versioned experiment passes with fairness and gaming guardrails.
 *   3. New-seller exposure guardrails and automatic rollback are in place.
 */
export const VISIBILITY_BOOST: Record<SellerTier, number> = {
  STANDARD: 1.0,
  PERFORMER: 1.0,
  TOP_PERFORMER: 1.0,
};

const REDIS_KEY_PREFIX = 'seller_perf';

function redisKey(...parts: string[]): string {
  return [REDIS_KEY_PREFIX, ...parts].join(':');
}

// ---------------------------------------------------------------------------
// Metrics recomputation from authoritative facts
// ---------------------------------------------------------------------------

/**
 * Recomputes rolling 90-day seller metrics directly from the orders database
 * and carrier parcel events — the authoritative source of truth.
 *
 * Denominators:
 * - Only orders **placed** (created_at) within the rolling 90-day window are
 *   counted.
 * - Orders still pending payment (status = 'created') are excluded — they are
 *   not yet committed commercial events.
 *
 * Ship time is derived from the first carrier 'picked_up' event when
 * available (order_parcel_events), falling back to the order's `shipped_at`
 * timestamp. Both are measured from `paid_at` so the metric reflects
 * post-payment dispatch latency.
 *
 * Returns `null` when the seller has no committed orders in the window (new
 * seller) — we never fabricate zero-valued metrics that could falsely pass
 * qualification thresholds.
 *
 * @param db    A pg Pool or PoolClient (primary or read-replica).
 * @param sellerId The seller (user) id to recompute for.
 */
export async function recomputeSellerMetrics(
  db: Queryable,
  sellerId: string
): Promise<SellerMetrics | null> {
  try {
    // ── 90-day window aggregates ──────────────────────────────────────────
    // Denominator = committed orders placed in the window (excludes 'created').
    const windowResult = await db.query<{
      total_orders: string;
      shipped_orders: string;
      cancelled_orders: string;
      sales_volume: string | null;
      lifetime_shipped: string;
    }>(
      `SELECT
         COUNT(*)::text AS total_orders,
         COUNT(*) FILTER (WHERE o.status IN ('shipped', 'delivered'))::text AS shipped_orders,
         COUNT(*) FILTER (WHERE o.status = 'cancelled')::text AS cancelled_orders,
         COALESCE(
           SUM(o.total_gbp) FILTER (WHERE o.status IN ('paid', 'shipped', 'delivered')),
           0
         )::text AS sales_volume,
         (SELECT COUNT(*)::text
            FROM orders
           WHERE seller_id = $1
             AND status IN ('shipped', 'delivered')) AS lifetime_shipped
       FROM orders o
       WHERE o.seller_id = $1
         AND o.created_at >= NOW() - INTERVAL '90 days'
         AND o.status <> 'created'`,
      [sellerId]
    );

    const row = windowResult.rows[0];
    const totalOrders = Number(row?.total_orders ?? 0);
    const shippedOrders = Number(row?.shipped_orders ?? 0);
    const cancelledOrders = Number(row?.cancelled_orders ?? 0);
    const salesVolume = Number(row?.sales_volume ?? 0);
    const lifetimeShipped = Number(row?.lifetime_shipped ?? 0);

    // New seller — no committed orders in the window. Return null rather than
    // fabricating zeros that could falsely satisfy <= thresholds.
    if (totalOrders === 0) {
      console.warn(
        `[sellerPerformance] recomputeSellerMetrics: seller ${sellerId} has ` +
          `0 committed orders in the 90-day window — returning null (new seller)`
      );
      return null;
    }

    // ── Average ship time (carrier data first, order timestamps fallback) ─
    let averageShipTimeHours = 0;
    if (shippedOrders > 0) {
      const shipTimeResult = await db.query<{ avg_ship_hours: string | null }>(
        `SELECT AVG(ship_hours)::float AS avg_ship_hours
         FROM (
           SELECT
             EXTRACT(EPOCH FROM (
               COALESCE(pickup.occurred_at, o.shipped_at) - o.paid_at
             )) / 3600 AS ship_hours
           FROM orders o
           LEFT JOIN LATERAL (
             SELECT MIN(e.occurred_at) AS occurred_at
               FROM order_parcel_events e
              WHERE e.order_id = o.id
                AND e.event_type = 'picked_up'
           ) pickup ON TRUE
           WHERE o.seller_id = $1
             AND o.created_at >= NOW() - INTERVAL '90 days'
             AND o.status IN ('shipped', 'delivered')
             AND o.paid_at IS NOT NULL
             AND (pickup.occurred_at IS NOT NULL OR o.shipped_at IS NOT NULL)
         ) t`,
        [sellerId]
      );
      averageShipTimeHours = Number(shipTimeResult.rows[0]?.avg_ship_hours ?? 0);
    } else {
      console.warn(
        `[sellerPerformance] recomputeSellerMetrics: seller ${sellerId} has ` +
          `${totalOrders} committed orders but 0 shipped — avg ship time set to 0`
      );
    }

    // ── Return case rate (carrier 'returned' events) ──────────────────────
    const returnResult = await db.query<{ returned_orders: string }>(
      `SELECT COUNT(DISTINCT e.order_id)::text AS returned_orders
         FROM order_parcel_events e
         JOIN orders o ON o.id = e.order_id
        WHERE o.seller_id = $1
          AND o.created_at >= NOW() - INTERVAL '90 days'
          AND o.status <> 'created'
          AND e.event_type = 'returned'`,
      [sellerId]
    );
    const returnedOrders = Number(returnResult.rows[0]?.returned_orders ?? 0);

    const cancellationRate = cancelledOrders / totalOrders;
    const returnCaseRate = returnedOrders / totalOrders;

    return {
      userId: sellerId,
      ordersShipped90d: shippedOrders,
      salesVolume90d: salesVolume,
      averageShipTimeHours90d: averageShipTimeHours,
      cancellationRate90d: cancellationRate,
      approvedReturnCaseRate90d: returnCaseRate,
      lifetimeOrdersShipped: lifetimeShipped,
      calculatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(
      `[sellerPerformance] recomputeSellerMetrics: query failed for seller ` +
        `${sellerId}:`,
      err
    );
    return null;
  }
}

/**
 * Recomputes authoritative seller metrics, persists them to Redis (with TTL)
 * and upserts a projection into the `seller_trust` table (migration 166).
 *
 * The optional `metrics` parameter is **ignored** — metrics are always
 * recomputed from the orders database. The parameter is retained only for
 * signature stability during the migration period.
 *
 * @returns The persisted metrics, or `null` if the seller has no committed
 *          orders in the 90-day window or a query failed.
 */
export async function persistSellerMetrics(
  db: Queryable,
  redis: Redis,
  sellerId: string,
  _metrics?: SellerMetrics
): Promise<SellerMetrics | null> {
  const metrics = await recomputeSellerMetrics(db, sellerId);
  if (!metrics) {
    return null;
  }

  // ── Redis cache (24-hour TTL) ───────────────────────────────────────────
  await redis.setex(
    redisKey('metrics', sellerId),
    86400,
    JSON.stringify(metrics)
  );

  // Time-series snapshot for trend analysis (90-day retention).
  const dayKey = new Date().toISOString().split('T')[0];
  await redis.setex(
    redisKey('metrics_history', sellerId, dayKey),
    86400 * 90,
    JSON.stringify(metrics)
  );

  // ── seller_trust upsert (migration 166) ─────────────────────────────────
  // We only overwrite fields derivable from order/carrier data, preserving
  // response_rate and positive_rating_pct if they were set by another process.
  try {
    const shipWithinDays = metrics.averageShipTimeHours90d > 0
      ? Math.max(1, Math.round(metrics.averageShipTimeHours90d / 24))
      : null;

    await db.query(
      `INSERT INTO seller_trust
         (user_id, ship_within_days, total_sales, calculated_at, source_watermark)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         ship_within_days = EXCLUDED.ship_within_days,
         total_sales      = EXCLUDED.total_sales,
         calculated_at    = NOW(),
         source_watermark = NOW()`,
      [sellerId, shipWithinDays, metrics.lifetimeOrdersShipped]
    );
  } catch (err) {
    // The seller_trust upsert is a read-optimised projection — a failure here
    // must not invalidate the authoritative Redis cache we just wrote.
    console.error(
      `[sellerPerformance] persistSellerMetrics: seller_trust upsert failed ` +
        `for seller ${sellerId}:`,
      err
    );
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// Metrics tracking (LEGACY)
// ---------------------------------------------------------------------------

/**
 * @deprecated DO NOT call this function in production. It accepts
 * pre-calculated metrics from the caller and stores them in Redis without
 * recomputing from authoritative order/carrier/case facts — a P0 trust defect.
 *
 * All callers must migrate to {@link persistSellerMetrics}, which recomputes
 * from the orders database. This function will be removed once all callers
 * have migrated.
 *
 * @param redis   Redis client.
 * @param userId  Seller user id.
 * @param metrics Caller-supplied (untrusted) metrics — DO NOT USE.
 */
export async function trackSellerMetrics(
  redis: Redis,
  userId: string,
  metrics: Omit<SellerMetrics, 'userId' | 'calculatedAt'>
): Promise<SellerMetrics> {
  const fullMetrics: SellerMetrics = {
    userId,
    ...metrics,
    calculatedAt: new Date().toISOString(),
  };

  await redis.setex(
    redisKey('metrics', userId),
    86400, // 24-hour TTL
    JSON.stringify(fullMetrics)
  );

  // Also store in time-series for trend analysis
  const dayKey = new Date().toISOString().split('T')[0];
  await redis.setex(
    redisKey('metrics_history', userId, dayKey),
    86400 * 90,
    JSON.stringify(fullMetrics)
  );

  return fullMetrics;
}

/**
 * Retrieves cached seller metrics.
 */
export async function getSellerMetrics(
  redis: Redis,
  userId: string
): Promise<SellerMetrics | null> {
  const json = await redis.get(redisKey('metrics', userId));
  if (!json) return null;
  return JSON.parse(json);
}

// ---------------------------------------------------------------------------
// Program qualification
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a seller qualifies for the performance program.
 */
export async function evaluateSellerProgramQualification(
  redis: Redis,
  userId: string
): Promise<ProgramQualification> {
  const metrics = await getSellerMetrics(redis, userId);

  // If no metrics, seller hasn't sold anything yet
  const m: SellerMetrics = metrics ?? {
    userId,
    ordersShipped90d: 0,
    salesVolume90d: 0,
    averageShipTimeHours90d: 0,
    cancellationRate90d: 0,
    approvedReturnCaseRate90d: 0,
    lifetimeOrdersShipped: 0,
    calculatedAt: new Date().toISOString(),
  };

  const lifetimeOrdersMet = m.lifetimeOrdersShipped >= PROGRAM_CRITERIA.lifetimeOrdersRequired;
  const orders90dMet = m.ordersShipped90d >= PROGRAM_CRITERIA.orders90dRequired;
  const sales90dMet = m.salesVolume90d >= PROGRAM_CRITERIA.sales90dRequired;
  const ordersOrSalesMet = orders90dMet || sales90dMet;
  const shipTimeMet = m.averageShipTimeHours90d <= PROGRAM_CRITERIA.maxShipTimeHours;
  const cancellationMet = m.cancellationRate90d <= PROGRAM_CRITERIA.maxCancellationRate;
  const returnCaseMet = m.approvedReturnCaseRate90d <= PROGRAM_CRITERIA.maxReturnCaseRate;

  const qualified = lifetimeOrdersMet && ordersOrSalesMet && shipTimeMet && cancellationMet && returnCaseMet;

  const failingCriteria: string[] = [];
  if (!lifetimeOrdersMet) failingCriteria.push(`Lifetime orders: ${m.lifetimeOrdersShipped}/${PROGRAM_CRITERIA.lifetimeOrdersRequired}`);
  if (!ordersOrSalesMet) failingCriteria.push(`90-day activity: ${m.ordersShipped90d} orders / £${m.salesVolume90d} sales (need ${PROGRAM_CRITERIA.orders90dRequired} orders or £${PROGRAM_CRITERIA.sales90dRequired})`);
  if (!shipTimeMet) failingCriteria.push(`Ship time: ${m.averageShipTimeHours90d.toFixed(1)}h (max ${PROGRAM_CRITERIA.maxShipTimeHours}h)`);
  if (!cancellationMet) failingCriteria.push(`Cancellation rate: ${(m.cancellationRate90d * 100).toFixed(1)}% (max ${PROGRAM_CRITERIA.maxCancellationRate * 100}%)`);
  if (!returnCaseMet) failingCriteria.push(`Return case rate: ${(m.approvedReturnCaseRate90d * 100).toFixed(1)}% (max ${PROGRAM_CRITERIA.maxReturnCaseRate * 100}%)`);

  // Determine tier
  let tier: SellerTier = 'STANDARD';
  if (qualified) {
    tier = 'PERFORMER';
    // Check for TOP_PERFORMER
    if (
      m.lifetimeOrdersShipped >= PROGRAM_CRITERIA.topPerformerLifetimeOrders &&
      m.averageShipTimeHours90d <= PROGRAM_CRITERIA.topPerformerMaxShipTimeHours &&
      m.cancellationRate90d <= PROGRAM_CRITERIA.topPerformerMaxCancellationRate
    ) {
      tier = 'TOP_PERFORMER';
    }
  }

  const now = new Date().toISOString();
  const nextEval = new Date(Date.now() + 86400000).toISOString(); // 24 hours

  const qualification: ProgramQualification = {
    userId,
    qualified,
    tier,
    criteria: {
      lifetimeOrders: { met: lifetimeOrdersMet, value: m.lifetimeOrdersShipped, required: PROGRAM_CRITERIA.lifetimeOrdersRequired },
      orders90d: { met: orders90dMet, value: m.ordersShipped90d, required: PROGRAM_CRITERIA.orders90dRequired },
      sales90d: { met: sales90dMet, value: m.salesVolume90d, required: PROGRAM_CRITERIA.sales90dRequired },
      shipTime90d: { met: shipTimeMet, value: m.averageShipTimeHours90d, requiredHours: PROGRAM_CRITERIA.maxShipTimeHours },
      cancellationRate90d: { met: cancellationMet, value: m.cancellationRate90d, maxRate: PROGRAM_CRITERIA.maxCancellationRate },
      returnCaseRate90d: { met: returnCaseMet, value: m.approvedReturnCaseRate90d, maxRate: PROGRAM_CRITERIA.maxReturnCaseRate },
    },
    failingCriteria,
    nextEvaluationDate: nextEval,
    evaluatedAt: now,
  };

  // Store qualification
  await redis.setex(
    redisKey('qualification', userId),
    86400,
    JSON.stringify(qualification)
  );

  // Store tier for fast lookup
  await redis.setex(redisKey('tier', userId), 86400, tier);

  // If tier changed, store the change
  const previousTier = await redis.get(redisKey('tier_prev', userId));
  if (previousTier !== tier) {
    await redis.setex(redisKey('tier_prev', userId), 86400, tier);
    await redis.lpush(
      redisKey('tier_changes', userId),
      JSON.stringify({ from: previousTier ?? 'STANDARD', to: tier, timestamp: now })
    );
  }

  return qualification;
}

/**
 * Gets the current seller tier.
 */
export async function getSellerTier(
  redis: Redis,
  userId: string
): Promise<SellerTier> {
  const tier = await redis.get(redisKey('tier', userId));
  return (tier as SellerTier) ?? 'STANDARD';
}

// ---------------------------------------------------------------------------
// Visibility boost
// ---------------------------------------------------------------------------

/**
 * Gets the visibility boost multiplier for a listing based on seller tier.
 */
export async function applyVisibilityBoost(
  redis: Redis,
  listingId: string,
  sellerTier: SellerTier
): Promise<{ listingId: string; boost: number; tier: SellerTier }> {
  return {
    listingId,
    boost: VISIBILITY_BOOST[sellerTier],
    tier: sellerTier,
  };
}

// ---------------------------------------------------------------------------
// Trust signal
// ---------------------------------------------------------------------------

/**
 * Gets the seller trust signal for display on listings and profile.
 */
export async function getSellerTrustSignal(
  redis: Redis,
  userId: string
): Promise<SellerTrustSignal> {
  const metrics = await getSellerMetrics(redis, userId);
  const qualification = await evaluateSellerProgramQualification(redis, userId);
  const tier = qualification.tier;

  return {
    userId,
    tier,
    qualifiedDate: qualification.qualified ? qualification.evaluatedAt : undefined,
    metricsSummary: {
      lifetimeOrders: metrics?.lifetimeOrdersShipped ?? 0,
      averageShipTimeHours: metrics?.averageShipTimeHours90d ?? 0,
      cancellationRate: metrics?.cancellationRate90d ?? 0,
    },
    badgeLevel: tier === 'TOP_PERFORMER' ? 'top_performer' : tier === 'PERFORMER' ? 'performer' : 'none',
  };
}

// ---------------------------------------------------------------------------
// Seller dashboard
// ---------------------------------------------------------------------------

/**
 * Gets comprehensive dashboard data for a seller.
 */
export async function getSellerDashboardData(
  redis: Redis,
  userId: string
): Promise<SellerDashboardData> {
  const metrics = await getSellerMetrics(redis, userId);
  const qualification = await evaluateSellerProgramQualification(redis, userId);

  const m: SellerMetrics = metrics ?? {
    userId,
    ordersShipped90d: 0,
    salesVolume90d: 0,
    averageShipTimeHours90d: 0,
    cancellationRate90d: 0,
    approvedReturnCaseRate90d: 0,
    lifetimeOrdersShipped: 0,
    calculatedAt: new Date().toISOString(),
  };

  const lifetimeOrdersProgress = Math.min(1, m.lifetimeOrdersShipped / PROGRAM_CRITERIA.lifetimeOrdersRequired);
  const orders90dProgress = Math.min(1, m.ordersShipped90d / PROGRAM_CRITERIA.orders90dRequired);

  const shipTimeStatus: 'good' | 'needs_improvement' | 'critical' =
    m.averageShipTimeHours90d <= PROGRAM_CRITERIA.maxShipTimeHours ? 'good' :
    m.averageShipTimeHours90d <= PROGRAM_CRITERIA.maxShipTimeHours * 1.5 ? 'needs_improvement' : 'critical';

  const cancellationStatus: 'good' | 'needs_improvement' | 'critical' =
    m.cancellationRate90d <= PROGRAM_CRITERIA.maxCancellationRate ? 'good' :
    m.cancellationRate90d <= PROGRAM_CRITERIA.maxCancellationRate * 2 ? 'needs_improvement' : 'critical';

  const returnCaseStatus: 'good' | 'needs_improvement' | 'critical' =
    m.approvedReturnCaseRate90d <= PROGRAM_CRITERIA.maxReturnCaseRate ? 'good' :
    m.approvedReturnCaseRate90d <= PROGRAM_CRITERIA.maxReturnCaseRate * 2 ? 'needs_improvement' : 'critical';

  const areasNeedingImprovement: string[] = [];
  if (!qualification.criteria.lifetimeOrders.met) areasNeedingImprovement.push(`Ship ${PROGRAM_CRITERIA.lifetimeOrdersRequired - m.lifetimeOrdersShipped} more lifetime orders to qualify`);
  if (!qualification.criteria.shipTime90d.met) areasNeedingImprovement.push(`Reduce average ship time to ${PROGRAM_CRITERIA.maxShipTimeHours}h or less`);
  if (!qualification.criteria.cancellationRate90d.met) areasNeedingImprovement.push(`Reduce cancellation rate to ${(PROGRAM_CRITERIA.maxCancellationRate * 100).toFixed(0)}% or less`);
  if (!qualification.criteria.returnCaseRate90d.met) areasNeedingImprovement.push(`Reduce return case rate to ${(PROGRAM_CRITERIA.maxReturnCaseRate * 100).toFixed(0)}% or less`);

  return {
    userId,
    tier: qualification.tier,
    qualified: qualification.qualified,
    metrics: m,
    qualification,
    progressTowardQualification: {
      lifetimeOrdersProgress,
      orders90dProgress,
      shipTimeStatus,
      cancellationStatus,
      returnCaseStatus,
    },
    areasNeedingImprovement,
    lifetimeStats: {
      totalOrders: m.lifetimeOrdersShipped,
      totalSales: m.salesVolume90d,
    },
  };
}

// ---------------------------------------------------------------------------
// Daily evaluation
// ---------------------------------------------------------------------------

/**
 * Runs daily evaluation for all active sellers.
 * In production, this would be called by a cron job.
 */
export async function runDailyEvaluation(
  redis: Redis,
  sellerIds: string[]
): Promise<{ evaluated: number; tierChanges: Array<{ userId: string; from: SellerTier; to: SellerTier }> }> {
  const tierChanges: Array<{ userId: string; from: SellerTier; to: SellerTier }> = [];

  for (const userId of sellerIds) {
    const previousTier = await getSellerTier(redis, userId);
    const qualification = await evaluateSellerProgramQualification(redis, userId);
    if (qualification.tier !== previousTier) {
      tierChanges.push({ userId, from: previousTier, to: qualification.tier });
    }
  }

  return { evaluated: sellerIds.length, tierChanges };
}

// ---------------------------------------------------------------------------
// Mock Redis for testing
// ---------------------------------------------------------------------------

export function createMockRedis(): Redis {
  const store = new Map<string, string>();
  const lists = new Map<string, string[]>();

  const mockRedis = {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async setex(key: string, _seconds: number, value: string): Promise<string> {
      store.set(key, value);
      return 'OK';
    },
    async lpush(key: string, ...values: string[]): Promise<number> {
      let list = lists.get(key);
      if (!list) {
        list = [];
        lists.set(key, list);
      }
      list.unshift(...values);
      return list.length;
    },
  } as unknown as Redis;

  return mockRedis;
}
