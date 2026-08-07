/**
 * Performance-based seller program for the ThryftVerse marketplace.
 *
 * Tracks seller metrics on a rolling 90-day basis and qualifies sellers
 * for a performance program that provides visibility boosts and trust
 * signals — equivalent to Poshmark's October 2026 program.
 *
 * 2026 research (August 2026 latest):
 * - Poshmark's new Performance-Based Seller Program (October 2026):
 *   - One-time threshold: Shipped 20 lifetime orders
 *   - Rolling 90-day: 5+ orders OR $500+ in sales
 *   - Rolling 90-day: 2-day or less average ship time
 *   - Rolling 90-day: cancellation rate <= 2%
 *   - Rolling 90-day: approved return case rate <= 2%
 *   - Benefits: greater visibility, search filter, trust signal
 * - Facebook Marketplace launched a dedicated Seller app
 * - eBay acquired Depop ($1.4B, July 30 2026)
 * - Seller performance programs are table stakes for 2026 marketplaces
 *
 * Design principles (AGENTS.md §11 — Truthful):
 * - Metrics are derived from real order data — never fabricated
 * - Tier changes are auditable with full context
 * - Visibility boosts are applied transparently in search ranking
 */

import type { Redis } from 'ioredis';

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

/** Visibility boost multipliers by tier. */
export const VISIBILITY_BOOST: Record<SellerTier, number> = {
  STANDARD: 1.0,
  PERFORMER: 1.3,
  TOP_PERFORMER: 1.5,
};

const REDIS_KEY_PREFIX = 'seller_perf';

function redisKey(...parts: string[]): string {
  return [REDIS_KEY_PREFIX, ...parts].join(':');
}

// ---------------------------------------------------------------------------
// Metrics tracking
// ---------------------------------------------------------------------------

/**
 * Calculates and stores rolling 90-day seller metrics.
 *
 * In production, this would query the orders database for real data.
 * For now, it accepts pre-calculated metrics and stores them in Redis.
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
