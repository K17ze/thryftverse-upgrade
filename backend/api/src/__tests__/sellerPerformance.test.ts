import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMockRedis,
  trackSellerMetrics,
  getSellerMetrics,
  evaluateSellerProgramQualification,
  getSellerTier,
  applyVisibilityBoost,
  getSellerTrustSignal,
  getSellerDashboardData,
  runDailyEvaluation,
  PROGRAM_CRITERIA,
  VISIBILITY_BOOST,
} from '../lib/sellerPerformance.js';

describe('sellerPerformance', () => {
  describe('trackSellerMetrics', () => {
    test('stores and retrieves metrics', async () => {
      const redis = createMockRedis();
      await trackSellerMetrics(redis, 'seller_1', {
        ordersShipped90d: 10,
        salesVolume90d: 800,
        averageShipTimeHours90d: 36,
        cancellationRate90d: 0.01,
        approvedReturnCaseRate90d: 0.005,
        lifetimeOrdersShipped: 50,
      });
      const metrics = await getSellerMetrics(redis, 'seller_1');
      assert.ok(metrics);
      assert.equal(metrics!.ordersShipped90d, 10);
      assert.equal(metrics!.lifetimeOrdersShipped, 50);
    });
  });

  describe('evaluateSellerProgramQualification', () => {
    test('qualified seller meets all criteria', async () => {
      const redis = createMockRedis();
      await trackSellerMetrics(redis, 'seller_qualified', {
        ordersShipped90d: 10,
        salesVolume90d: 800,
        averageShipTimeHours90d: 36,
        cancellationRate90d: 0.01,
        approvedReturnCaseRate90d: 0.005,
        lifetimeOrdersShipped: 25,
      });
      const qual = await evaluateSellerProgramQualification(redis, 'seller_qualified');
      assert.equal(qual.qualified, true);
      assert.equal(qual.tier, 'PERFORMER');
      assert.equal(qual.failingCriteria.length, 0);
    });

    test('unqualified seller with no orders', async () => {
      const redis = createMockRedis();
      const qual = await evaluateSellerProgramQualification(redis, 'seller_new');
      assert.equal(qual.qualified, false);
      assert.equal(qual.tier, 'STANDARD');
      assert.ok(qual.failingCriteria.length > 0);
    });

    test('seller with high cancellation rate fails', async () => {
      const redis = createMockRedis();
      await trackSellerMetrics(redis, 'seller_cancel', {
        ordersShipped90d: 10,
        salesVolume90d: 800,
        averageShipTimeHours90d: 36,
        cancellationRate90d: 0.05, // 5% — above 2% threshold
        approvedReturnCaseRate90d: 0.005,
        lifetimeOrdersShipped: 25,
      });
      const qual = await evaluateSellerProgramQualification(redis, 'seller_cancel');
      assert.equal(qual.qualified, false);
      assert.ok(qual.failingCriteria.some((c) => c.includes('Cancellation rate')));
    });

    test('seller with slow ship time fails', async () => {
      const redis = createMockRedis();
      await trackSellerMetrics(redis, 'seller_slow', {
        ordersShipped90d: 10,
        salesVolume90d: 800,
        averageShipTimeHours90d: 72, // 3 days — above 2-day threshold
        cancellationRate90d: 0.01,
        approvedReturnCaseRate90d: 0.005,
        lifetimeOrdersShipped: 25,
      });
      const qual = await evaluateSellerProgramQualification(redis, 'seller_slow');
      assert.equal(qual.qualified, false);
      assert.ok(qual.failingCriteria.some((c) => c.includes('Ship time')));
    });

    test('seller meeting only sales threshold (not orders) still qualifies', async () => {
      const redis = createMockRedis();
      await trackSellerMetrics(redis, 'seller_sales', {
        ordersShipped90d: 3, // Below 5-order threshold
        salesVolume90d: 600, // Above £500 threshold
        averageShipTimeHours90d: 36,
        cancellationRate90d: 0.01,
        approvedReturnCaseRate90d: 0.005,
        lifetimeOrdersShipped: 25,
      });
      const qual = await evaluateSellerProgramQualification(redis, 'seller_sales');
      assert.equal(qual.qualified, true);
    });
  });

  describe('TOP_PERFORMER tier', () => {
    test('seller with 100+ lifetime orders and 1-day ship qualifies for TOP_PERFORMER', async () => {
      const redis = createMockRedis();
      await trackSellerMetrics(redis, 'seller_top', {
        ordersShipped90d: 30,
        salesVolume90d: 2000,
        averageShipTimeHours90d: 20, // Under 24h
        cancellationRate90d: 0.005, // Under 1%
        approvedReturnCaseRate90d: 0.005,
        lifetimeOrdersShipped: 120, // Over 100
      });
      const qual = await evaluateSellerProgramQualification(redis, 'seller_top');
      assert.equal(qual.qualified, true);
      assert.equal(qual.tier, 'TOP_PERFORMER');
    });

    test('PERFORMER with 50 orders does not get TOP_PERFORMER', async () => {
      const redis = createMockRedis();
      await trackSellerMetrics(redis, 'seller_mid', {
        ordersShipped90d: 10,
        salesVolume90d: 800,
        averageShipTimeHours90d: 36,
        cancellationRate90d: 0.01,
        approvedReturnCaseRate90d: 0.005,
        lifetimeOrdersShipped: 50, // Under 100
      });
      const qual = await evaluateSellerProgramQualification(redis, 'seller_mid');
      assert.equal(qual.tier, 'PERFORMER');
    });
  });

  describe('getSellerTier', () => {
    test('returns STANDARD for unknown seller', async () => {
      const redis = createMockRedis();
      const tier = await getSellerTier(redis, 'unknown_seller');
      assert.equal(tier, 'STANDARD');
    });

    test(' returns stored tier after evaluation', async () => {
      const redis = createMockRedis();
      await trackSellerMetrics(redis, 'seller_tier', {
        ordersShipped90d: 10,
        salesVolume90d: 800,
        averageShipTimeHours90d: 36,
        cancellationRate90d: 0.01,
        approvedReturnCaseRate90d: 0.005,
        lifetimeOrdersShipped: 25,
      });
      const qual = await evaluateSellerProgramQualification(redis, 'seller_tier');
      assert.equal(qual.tier, 'PERFORMER');
      const tier = await getSellerTier(redis, 'seller_tier');
      assert.equal(tier, 'PERFORMER');
    });
  });

  describe('applyVisibilityBoost', () => {
    test('STANDARD tier has 1.0x boost', async () => {
      const redis = createMockRedis();
      const result = await applyVisibilityBoost(redis, 'listing_1', 'STANDARD');
      assert.equal(result.boost, 1.0);
    });

    test('PERFORMER tier has 1.3x boost', async () => {
      const redis = createMockRedis();
      const result = await applyVisibilityBoost(redis, 'listing_1', 'PERFORMER');
      assert.equal(result.boost, 1.3);
    });

    test('TOP_PERFORMER tier has 1.5x boost', async () => {
      const redis = createMockRedis();
      const result = await applyVisibilityBoost(redis, 'listing_1', 'TOP_PERFORMER');
      assert.equal(result.boost, 1.5);
    });
  });

  describe('getSellerTrustSignal', () => {
    test('returns trust signal with badge level', async () => {
      const redis = createMockRedis();
      await trackSellerMetrics(redis, 'seller_signal', {
        ordersShipped90d: 10,
        salesVolume90d: 800,
        averageShipTimeHours90d: 36,
        cancellationRate90d: 0.01,
        approvedReturnCaseRate90d: 0.005,
        lifetimeOrdersShipped: 25,
      });
      const signal = await getSellerTrustSignal(redis, 'seller_signal');
      assert.equal(signal.tier, 'PERFORMER');
      assert.equal(signal.badgeLevel, 'performer');
      assert.ok(signal.metricsSummary.lifetimeOrders > 0);
    });

    test('new seller has no badge', async () => {
      const redis = createMockRedis();
      const signal = await getSellerTrustSignal(redis, 'new_seller');
      assert.equal(signal.tier, 'STANDARD');
      assert.equal(signal.badgeLevel, 'none');
    });
  });

  describe('getSellerDashboardData', () => {
    test('returns comprehensive dashboard data for qualified seller', async () => {
      const redis = createMockRedis();
      await trackSellerMetrics(redis, 'seller_dash', {
        ordersShipped90d: 10,
        salesVolume90d: 800,
        averageShipTimeHours90d: 36,
        cancellationRate90d: 0.01,
        approvedReturnCaseRate90d: 0.005,
        lifetimeOrdersShipped: 25,
      });
      const dash = await getSellerDashboardData(redis, 'seller_dash');
      assert.equal(dash.tier, 'PERFORMER');
      assert.equal(dash.qualified, true);
      assert.equal(dash.progressTowardQualification.lifetimeOrdersProgress, 1);
      assert.equal(dash.progressTowardQualification.shipTimeStatus, 'good');
      assert.equal(dash.areasNeedingImprovement.length, 0);
    });

    test('returns improvement areas for unqualified seller', async () => {
      const redis = createMockRedis();
      await trackSellerMetrics(redis, 'seller_improve', {
        ordersShipped90d: 3,
        salesVolume90d: 100,
        averageShipTimeHours90d: 96, // > 72 (48*1.5) → critical
        cancellationRate90d: 0.05,
        approvedReturnCaseRate90d: 0.005,
        lifetimeOrdersShipped: 5,
      });
      const dash = await getSellerDashboardData(redis, 'seller_improve');
      assert.equal(dash.qualified, false);
      assert.ok(dash.areasNeedingImprovement.length > 0);
      assert.equal(dash.progressTowardQualification.shipTimeStatus, 'critical');
      assert.equal(dash.progressTowardQualification.cancellationStatus, 'critical');
    });
  });

  describe('runDailyEvaluation', () => {
    test('evaluates multiple sellers and detects tier changes', async () => {
      const redis = createMockRedis();
      // Seller who qualifies
      await trackSellerMetrics(redis, 'seller_a', {
        ordersShipped90d: 10,
        salesVolume90d: 800,
        averageShipTimeHours90d: 36,
        cancellationRate90d: 0.01,
        approvedReturnCaseRate90d: 0.005,
        lifetimeOrdersShipped: 25,
      });
      // Seller who doesn't
      await trackSellerMetrics(redis, 'seller_b', {
        ordersShipped90d: 1,
        salesVolume90d: 50,
        averageShipTimeHours90d: 72,
        cancellationRate90d: 0.05,
        approvedReturnCaseRate90d: 0.01,
        lifetimeOrdersShipped: 3,
      });

      const result = await runDailyEvaluation(redis, ['seller_a', 'seller_b']);
      assert.equal(result.evaluated, 2);
      // seller_a should have changed from STANDARD to PERFORMER
      assert.ok(result.tierChanges.some((c) => c.userId === 'seller_a' && c.to === 'PERFORMER'));
    });
  });

  describe('PROGRAM_CRITERIA', () => {
    test('criteria values match Poshmark October 2026 program', () => {
      assert.equal(PROGRAM_CRITERIA.lifetimeOrdersRequired, 20);
      assert.equal(PROGRAM_CRITERIA.orders90dRequired, 5);
      assert.equal(PROGRAM_CRITERIA.sales90dRequired, 500);
      assert.equal(PROGRAM_CRITERIA.maxShipTimeHours, 48); // 2 days
      assert.equal(PROGRAM_CRITERIA.maxCancellationRate, 0.02); // 2%
      assert.equal(PROGRAM_CRITERIA.maxReturnCaseRate, 0.02); // 2%
    });
  });

  describe('VISIBILITY_BOOST', () => {
    test('boost multipliers are correct', () => {
      assert.equal(VISIBILITY_BOOST.STANDARD, 1.0);
      assert.equal(VISIBILITY_BOOST.PERFORMER, 1.3);
      assert.equal(VISIBILITY_BOOST.TOP_PERFORMER, 1.5);
    });
  });
});
