/**
 * Auto-feedback evaluation worker handler.
 *
 * Runs the periodic `feedback_evaluation` infra-queue job: for every order
 * past the review window with no buyer review, records an auto-positive
 * `order_reviews` row (is_auto/auto_reason — never presented as a
 * buyer-authored review); for every 'paid' order past its effective
 * ship-by, records a `order_sla_breaches` defect flag.
 *
 * Notifications are queued AFTER commit: the durable artifacts (review row,
 * breach row, order_events rows) are written transactionally by
 * `runAutoFeedbackSweep`, and each notification carries a deterministic
 * idempotency key so a job retry cannot re-notify.
 *
 * @packageDocumentation
 */

import type { Pool } from 'pg';
import { config } from '../../config.js';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { queueUserNotification } from '../../lib/workerRuntime.js';
import {
  runAutoFeedbackSweep,
  type AutoFeedbackPolicy,
  type AutoFeedbackResult,
} from '../../lib/autoFeedback.js';

export interface FeedbackEvaluationJobData {
  reason: 'scheduled' | 'manual';
}

type NotifyFn = typeof queueUserNotification;

function policyFromConfig(): AutoFeedbackPolicy {
  return {
    windowDays: config.autoFeedbackWindowDays,
    autoRating: config.autoFeedbackRating,
    defaultDispatchSlaDays: config.dispatchSlaDefaultDays,
    batchSize: 200,
  };
}

/**
 * Queue post-commit notifications for a completed sweep. Every send is
 * wrapped so one notification failure cannot fail the job or re-run the
 * sweep — the durable rows are already committed, and the idempotency
 * keys make a later retry safe.
 */
async function queueAutoFeedbackNotifications(
  result: AutoFeedbackResult,
  notify: NotifyFn,
): Promise<void> {
  for (const review of result.autoReviews) {
    try {
      await notify({
        userId: review.sellerId,
        title: 'Feedback recorded',
        body: `Automatic ${review.rating}-star feedback was recorded for this order — the buyer didn't submit a review.`,
        eventType: 'review_received',
        payload: {
          reviewId: review.reviewId,
          orderId: review.orderId,
          rating: review.rating,
          auto: true,
          autoReason: 'buyer_silence',
        },
        route: { screen: 'OrderDetail', params: { orderId: review.orderId } },
        idempotencyKey: `auto_feedback_${review.orderId}`,
        metadata: { source: 'auto_feedback', autoReason: 'buyer_silence' },
      });
    } catch (error) {
      logger.warn(
        { err: error, orderId: review.orderId },
        'autoFeedback.notifyFailed',
      );
    }
  }

  for (const breach of result.slaBreaches) {
    try {
      await notify({
        userId: breach.sellerId,
        title: 'Dispatch deadline missed',
        body: 'An order was not dispatched by its ship-by date. Dispatch now or propose an extension to limit the impact.',
        eventType: 'order_dispatch_sla_breach',
        payload: { orderId: breach.orderId, breachId: breach.breachId, shipBy: breach.shipBy },
        route: { screen: 'SellerFulfilment', params: { orderId: breach.orderId } },
        idempotencyKey: `order_dispatch_sla_breach_seller_${breach.orderId}`,
        metadata: { source: 'auto_feedback', breachType: 'dispatch_sla' },
      });
    } catch (error) {
      logger.warn(
        { err: error, orderId: breach.orderId },
        'autoFeedback.notifyFailed',
      );
    }

    try {
      await notify({
        userId: breach.buyerId,
        title: 'Order not yet dispatched',
        body: "Your order hasn't been dispatched — the seller's ship-by date has passed. You can wait, accept a new date, or open a support request.",
        eventType: 'order_dispatch_sla_breach',
        payload: { orderId: breach.orderId, shipBy: breach.shipBy },
        route: { screen: 'OrderDetail', params: { orderId: breach.orderId } },
        idempotencyKey: `order_dispatch_sla_breach_buyer_${breach.orderId}`,
        metadata: { source: 'auto_feedback', breachType: 'dispatch_sla' },
      });
    } catch (error) {
      logger.warn(
        { err: error, orderId: breach.orderId },
        'autoFeedback.notifyFailed',
      );
    }
  }
}

export async function processAutoFeedbackSweep(
  data: FeedbackEvaluationJobData,
  deps: { pool?: Pool; notify?: NotifyFn; policy?: AutoFeedbackPolicy } = {},
): Promise<AutoFeedbackResult> {
  const { reason } = data;
  const pool = deps.pool ?? db;
  const notify = deps.notify ?? queueUserNotification;
  const policy = deps.policy ?? policyFromConfig();

  logger.info({ reason, policy: { ...policy, now: undefined } }, 'autoFeedback.start');

  const result = await runAutoFeedbackSweep(pool, policy);

  await queueAutoFeedbackNotifications(result, notify);

  logger.info(
    {
      reason,
      autoReviews: result.autoReviews.length,
      autoReviewsSkipped: result.autoReviewsSkipped,
      slaBreaches: result.slaBreaches.length,
    },
    'autoFeedback.complete',
  );

  return result;
}
