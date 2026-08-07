/**
 * Per-seller sale velocity tracking and risk tiering.
 *
 * Tracks the 24-hour and 7-day sale velocity for each seller and assigns
 * a risk tier. High-velocity sellers are flagged for review.
 *
 * Risk tiers:
 * - standard: normal velocity, no flags
 * - elevated: velocity above 1.5x the seller's historical average
 * - high: velocity above 3x the historical average or above the
 *        platform threshold
 */

import type { Pool, PoolClient } from 'pg';

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export type SellerRiskTier = 'standard' | 'elevated' | 'high';

export interface SellerVelocityMetrics {
  sellerId: string;
  salesCount24h: number;
  salesCount7d: number;
  salesGbp24h: number;
  salesGbp7d: number;
  avgSalesPerDay7d: number;
  riskTier: SellerRiskTier;
  flaggedAt: string | null;
}

export interface VelocityThresholds {
  // Absolute thresholds for high risk
  highRiskSalesCount24h: number;
  highRiskSalesGbp24h: number;
  // Relative thresholds for elevated risk (multiplier of 7d average)
  elevatedRiskMultiplier: number;
  highRiskMultiplier: number;
}

export const DEFAULT_VELOCITY_THRESHOLDS: VelocityThresholds = {
  highRiskSalesCount24h: 50,
  highRiskSalesGbp24h: 5000,
  elevatedRiskMultiplier: 1.5,
  highRiskMultiplier: 3.0,
};

/**
 * Compute the seller's risk tier based on sale velocity.
 */
export function computeRiskTier(
  metrics: { salesCount24h: number; salesGbp24h: number; avgSalesPerDay7d: number },
  thresholds: VelocityThresholds = DEFAULT_VELOCITY_THRESHOLDS
): SellerRiskTier {
  // Check absolute thresholds first
  if (
    metrics.salesCount24h >= thresholds.highRiskSalesCount24h
    || metrics.salesGbp24h >= thresholds.highRiskSalesGbp24h
  ) {
    return 'high';
  }

  // Check relative thresholds (velocity vs historical average)
  if (metrics.avgSalesPerDay7d > 0) {
    const velocityRatio = metrics.salesCount24h / metrics.avgSalesPerDay7d;
    if (velocityRatio >= thresholds.highRiskMultiplier) {
      return 'high';
    }
    if (velocityRatio >= thresholds.elevatedRiskMultiplier) {
      return 'elevated';
    }
  }

  return 'standard';
}

/**
 * Get the seller's velocity metrics and risk tier.
 */
export async function getSellerVelocityMetrics(
  db: Queryable,
  sellerId: string,
  thresholds: VelocityThresholds = DEFAULT_VELOCITY_THRESHOLDS
): Promise<SellerVelocityMetrics> {
  const result = await db.query<{
    sales_count_24h: string;
    sales_count_7d: string;
    sales_gbp_24h: string;
    sales_gbp_7d: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::text AS sales_count_24h,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS sales_count_7d,
       COALESCE(SUM(total_gbp) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'), 0)::text AS sales_gbp_24h,
       COALESCE(SUM(total_gbp) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::text AS sales_gbp_7d
     FROM orders
     WHERE seller_id = $1
       AND status IN ('paid', 'shipped', 'delivered')`,
    [sellerId]
  );

  const row = result.rows[0];
  const salesCount24h = Number(row?.sales_count_24h ?? 0);
  const salesCount7d = Number(row?.sales_count_7d ?? 0);
  const salesGbp24h = Number(row?.sales_gbp_24h ?? 0);
  const salesGbp7d = Number(row?.sales_gbp_7d ?? 0);
  const avgSalesPerDay7d = salesCount7d / 7;

  const riskTier = computeRiskTier(
    { salesCount24h, salesGbp24h, avgSalesPerDay7d },
    thresholds
  );

  return {
    sellerId,
    salesCount24h,
    salesCount7d,
    salesGbp24h,
    salesGbp7d,
    avgSalesPerDay7d,
    riskTier,
    flaggedAt: riskTier !== 'standard' ? new Date().toISOString() : null,
  };
}

/**
 * Resolve the reserve percentage for a risk tier.
 * Standard = 0, elevated = elevatedPct, high = highPct.
 */
export function reservePercentageForTier(
  tier: SellerRiskTier,
  elevatedPct: number,
  highPct: number
): number {
  if (tier === 'high') return highPct;
  if (tier === 'elevated') return elevatedPct;
  return 0;
}

/**
 * Compute the seller's velocity metrics, assign a risk tier, and persist
 * the result into the seller_risk_tiers table. Returns the persisted tier.
 */
export async function refreshAndPersistSellerRiskTier(
  db: Queryable,
  sellerId: string,
  thresholds: VelocityThresholds = DEFAULT_VELOCITY_THRESHOLDS,
  elevatedReservePct: number = 5,
  highReservePct: number = 15
): Promise<SellerVelocityMetrics> {
  const metrics = await getSellerVelocityMetrics(db, sellerId, thresholds);
  const reservePct = reservePercentageForTier(
    metrics.riskTier,
    elevatedReservePct,
    highReservePct
  );

  await db.query(
    `INSERT INTO seller_risk_tiers
       (seller_id, risk_tier, sales_count_24h, sales_gbp_24h,
        sales_count_7d, sales_gbp_7d, avg_sales_per_day_7d,
        reserve_percentage, computed_at, flagged_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
     ON CONFLICT (seller_id) DO UPDATE SET
       risk_tier = EXCLUDED.risk_tier,
       sales_count_24h = EXCLUDED.sales_count_24h,
       sales_gbp_24h = EXCLUDED.sales_gbp_24h,
       sales_count_7d = EXCLUDED.sales_count_7d,
       sales_gbp_7d = EXCLUDED.sales_gbp_7d,
       avg_sales_per_day_7d = EXCLUDED.avg_sales_per_day_7d,
       reserve_percentage = EXCLUDED.reserve_percentage,
       computed_at = NOW(),
       flagged_at = EXCLUDED.flagged_at`,
    [
      sellerId,
      metrics.riskTier,
      metrics.salesCount24h,
      metrics.salesGbp24h,
      metrics.salesCount7d,
      metrics.salesGbp7d,
      metrics.avgSalesPerDay7d,
      reservePct,
      metrics.flaggedAt,
    ]
  );

  return metrics;
}

/**
 * Read the persisted risk tier for a seller. Returns 'standard' if no
 * row exists (fail-safe: no extra reserve for unknown sellers).
 */
export async function getPersistedSellerRiskTier(
  db: Queryable,
  sellerId: string
): Promise<{ tier: SellerRiskTier; reservePercentage: number }> {
  const result = await db.query<{ risk_tier: string; reserve_percentage: string }>(
    `SELECT risk_tier, reserve_percentage::text
     FROM seller_risk_tiers
     WHERE seller_id = $1`,
    [sellerId]
  );
  const row = result.rows[0];
  if (!row) return { tier: 'standard', reservePercentage: 0 };
  const tier = (['standard', 'elevated', 'high'] as const).includes(
    row.risk_tier as SellerRiskTier
  )
    ? (row.risk_tier as SellerRiskTier)
    : 'standard';
  return { tier, reservePercentage: Number(row.reserve_percentage ?? 0) };
}
