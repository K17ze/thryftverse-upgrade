/**
 * Auto-feedback defaults — the evaluation engine behind the
 * `feedback_evaluation` infra-queue job (autoFeedbackHandler).
 *
 * Two artifacts, deliberately different in kind:
 *
 * 1. BUYER SILENCE → auto-positive review row.
 *    When an order has been delivered/completed for longer than the
 *    configured window and the buyer never reviewed, the platform records
 *    a positive review row with `is_auto = TRUE` and
 *    `auto_reason = 'buyer_silence'` (migration 284). The row is still
 *    attributed to the order's buyer — they are the reviewer of record —
 *    but every read surface must render it as automatic feedback, not a
 *    buyer-authored review.
 *
 *    Safety rails (never auto-review when):
 *      - a review already exists (UNIQUE(order_id) + NOT EXISTS guard —
 *        a buyer review written between sweeps wins, the insert no-ops);
 *      - the order left the reviewable statuses (cancelled / refunded /
 *        refunding are excluded by the status filter);
 *      - a support ticket is open on the order, or a PSP dispute is open —
 *        auto-positive feedback while a dispute is live would be untruthful.
 *
 * 2. SELLER SLA BREACH → defect flag, NOT a review.
 *    A `order_sla_breaches` row is written when a 'paid' order passes its
 *    effective ship-by (latest accepted dispatch extension wins; otherwise
 *    paid_at + dispatch_sla_days from the purchase-time rights snapshot,
 *    falling back to the configurable platform default when the order
 *    predates the snapshot). A fabricated negative review under the
 *    buyer's name would be a trust defect — this is a flag record that
 *    seller-performance surfaces consume.
 *
 * Idempotence: both inserts are keyed (UNIQUE(order_id) on order_reviews,
 * UNIQUE(order_id, breach_type) on order_sla_breaches) and every
 * order_events write carries a deterministic deduplication_key, so
 * overlapping sweeps and job retries are no-ops.
 *
 * The module takes a `Queryable` (Pool | PoolClient) and an injectable
 * clock so the whole evaluation is unit-testable without a database.
 */

import type { Pool, PoolClient } from 'pg';
import { createRuntimeId, toJsonString } from './workerHelpers.js';

export type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export const AUTO_FEEDBACK_REASON_BUYER_SILENCE = 'buyer_silence';
export const SLA_BREACH_TYPE_DISPATCH = 'dispatch_sla';

export interface AutoFeedbackPolicy {
  /** Days after delivery before silence becomes auto-positive feedback. */
  windowDays: number;
  /** Rating recorded on the auto-positive review (platform convention: 5). */
  autoRating: number;
  /** Fallback dispatch SLA when an order has no purchase-time snapshot. */
  defaultDispatchSlaDays: number;
  /** Max orders evaluated per sweep per rule. */
  batchSize: number;
  /** Injectable clock — tests pin this to evaluate boundary conditions. */
  now?: Date;
}

export const DEFAULT_AUTO_FEEDBACK_POLICY: AutoFeedbackPolicy = {
  windowDays: 14,
  autoRating: 5,
  defaultDispatchSlaDays: 3,
  batchSize: 200,
};

export interface AutoReviewRecord {
  orderId: string;
  reviewId: string;
  buyerId: string;
  sellerId: string;
  rating: number;
}

export interface SlaBreachRecord {
  orderId: string;
  breachId: string;
  buyerId: string;
  sellerId: string;
  shipBy: string;
}

export interface AutoFeedbackResult {
  autoReviews: AutoReviewRecord[];
  slaBreaches: SlaBreachRecord[];
  /** Candidates seen but skipped (e.g. insert raced an existing review). */
  autoReviewsSkipped: number;
}

// ---------------------------------------------------------------------------
// Ship-by resolution — mirrors computeBaseShipByDate in src/index.ts plus the
// accepted-extension override. Kept pure so tests pin the clock.
// ---------------------------------------------------------------------------

export function resolveDispatchShipBy(input: {
  paidAt: string | null;
  createdAt: string;
  dispatchSlaDays: number | null;
  acceptedShipBy: string | null;
  defaultSlaDays: number;
}): string | null {
  if (input.acceptedShipBy) {
    const ms = new Date(input.acceptedShipBy).getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  const slaDays = input.dispatchSlaDays ?? input.defaultSlaDays;
  const anchorMs = new Date(input.paidAt ?? input.createdAt).getTime();
  if (!Number.isFinite(anchorMs) || !Number.isFinite(slaDays)) return null;
  return new Date(anchorMs + slaDays * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Buyer silence → auto-positive review
// ---------------------------------------------------------------------------

async function evaluateBuyerSilence(
  client: Queryable,
  policy: AutoFeedbackPolicy,
  now: Date,
): Promise<{ autoReviews: AutoReviewRecord[]; skipped: number }> {
  const cutoff = new Date(
    now.getTime() - policy.windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Anchor on delivered_at; fall back to updated_at for rows that reached a
  // terminal state before delivered_at existed. Open support tickets, open
  // return cases and non-terminal PSP disputes exclude the order —
  // auto-positive feedback while a claim is live would be untruthful. A
  // dispute stays suppressing until it reaches a terminal state
  // ('won'/'lost'/'closed'): submitting evidence does not end bank
  // adjudication, so the old evidence_submitted_at carve-out is gone.
  const candidates = await client.query<{
    id: string;
    buyer_id: string;
    seller_id: string;
  }>(
    `
      SELECT o.id, o.buyer_id, o.seller_id
      FROM orders o
      WHERE o.status IN ('delivered', 'completed')
        AND COALESCE(o.delivered_at, o.updated_at) <= $1
        AND NOT EXISTS (
          SELECT 1 FROM order_reviews r WHERE r.order_id = o.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM support_tickets st
          WHERE st.order_id = o.id AND st.status = 'open'
        )
        AND NOT EXISTS (
          SELECT 1 FROM return_cases rc
          WHERE rc.order_id = o.id AND rc.status <> 'closed'
        )
        AND NOT EXISTS (
          SELECT 1 FROM payment_disputes d
          JOIN payment_intents pi ON pi.id = d.intent_id
          WHERE pi.order_id = o.id
            AND d.status NOT IN ('won', 'lost', 'closed')
        )
      ORDER BY COALESCE(o.delivered_at, o.updated_at) ASC
      LIMIT $2
      FOR UPDATE OF o SKIP LOCKED
    `,
    [cutoff, policy.batchSize],
  );

  const autoReviews: AutoReviewRecord[] = [];
  let skipped = 0;

  for (const order of candidates.rows) {
    const reviewId = createRuntimeId('review_auto');
    // UNIQUE(order_id) is the idempotence backstop: if a buyer review (or a
    // concurrent sweep) landed first, the insert no-ops and nothing is
    // recorded or notified.
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO order_reviews (
         id, order_id, reviewer_id, seller_id, rating, comment,
         is_auto, auto_reason, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, NULL, TRUE, $6, NOW(), NOW())
       ON CONFLICT (order_id) DO NOTHING
       RETURNING id`,
      [
        reviewId,
        order.id,
        order.buyer_id,
        order.seller_id,
        policy.autoRating,
        AUTO_FEEDBACK_REASON_BUYER_SILENCE,
      ],
    );

    if (!inserted.rowCount) {
      skipped += 1;
      continue;
    }

    await client.query(
      `INSERT INTO order_events (order_id, event_type, actor_id, source, deduplication_key, metadata)
       VALUES ($1, 'order.auto_feedback', NULL, 'auto_feedback_sweep', $2, $3::jsonb)
       ON CONFLICT (order_id, deduplication_key)
         WHERE deduplication_key IS NOT NULL
       DO NOTHING`,
      [
        order.id,
        `order.auto_feedback:${order.id}`,
        toJsonString({
          reviewId,
          autoReason: AUTO_FEEDBACK_REASON_BUYER_SILENCE,
          rating: policy.autoRating,
          windowDays: policy.windowDays,
        }),
      ],
    );

    autoReviews.push({
      orderId: order.id,
      reviewId,
      buyerId: order.buyer_id,
      sellerId: order.seller_id,
      rating: policy.autoRating,
    });
  }

  return { autoReviews, skipped };
}

// ---------------------------------------------------------------------------
// Seller dispatch-SLA breach → defect flag
// ---------------------------------------------------------------------------

async function evaluateDispatchSlaBreaches(
  client: Queryable,
  policy: AutoFeedbackPolicy,
  now: Date,
): Promise<SlaBreachRecord[]> {
  // Only 'paid' orders can breach the dispatch SLA — once shipped there is
  // no dispatch obligation left, and cancelled/refunded orders are terminal.
  //
  // All accepted extensions are pulled chronologically so the deadline can
  // be folded forward in order: an extension only moves the ship-by if it
  // was ACCEPTED before the then-current deadline expired. An extension the
  // buyer accepts after the deadline already passed does NOT retroactively
  // erase the breach — that erasure window (deadline passes → hourly sweep
  // sees only the latest accepted ship-by) was the defect this fixes.
  const candidates = await client.query<{
    id: string;
    buyer_id: string;
    seller_id: string;
    paid_at: string | null;
    created_at: string;
    dispatch_sla_days: number | null;
    accepted_extensions: { shipBy: string | null; respondedAt: string | null }[] | null;
  }>(
    `
      SELECT o.id, o.buyer_id, o.seller_id,
             o.paid_at::text, o.created_at::text,
             srs.dispatch_sla_days,
             (SELECT json_agg(json_build_object(
                        'shipBy', e.proposed_ship_by::text,
                        'respondedAt', COALESCE(e.responded_at, e.created_at)::text
                      ) ORDER BY COALESCE(e.responded_at, e.created_at) ASC)
              FROM order_dispatch_extensions e
              WHERE e.order_id = o.id AND e.status = 'accepted'
             ) AS accepted_extensions
      FROM orders o
      LEFT JOIN order_seller_rights_snapshot srs ON srs.order_id = o.id
      WHERE o.status = 'paid'
        AND NOT EXISTS (
          SELECT 1 FROM order_sla_breaches b
          WHERE b.order_id = o.id AND b.breach_type = $2
        )
      ORDER BY COALESCE(o.paid_at, o.created_at) ASC
      LIMIT $1
      FOR UPDATE OF o SKIP LOCKED
    `,
    [policy.batchSize, SLA_BREACH_TYPE_DISPATCH],
  );

  const breaches: SlaBreachRecord[] = [];

  for (const order of candidates.rows) {
    // Effective ship-by: start from the un-extended deadline
    // (paid_at + dispatch_sla_days, snapshot or default), then fold forward
    // through each accepted extension — but only while the extension was
    // granted before the deadline it replaces had already expired.
    let shipBy = resolveDispatchShipBy({
      paidAt: order.paid_at,
      createdAt: order.created_at,
      dispatchSlaDays: order.dispatch_sla_days,
      acceptedShipBy: null,
      defaultSlaDays: policy.defaultDispatchSlaDays,
    });
    for (const extension of order.accepted_extensions ?? []) {
      const respondedMs = extension.respondedAt
        ? new Date(extension.respondedAt).getTime()
        : NaN;
      const currentDeadlineMs = shipBy ? new Date(shipBy).getTime() : NaN;
      if (!Number.isFinite(respondedMs)) break;
      if (!Number.isFinite(currentDeadlineMs) || respondedMs <= currentDeadlineMs) {
        // Granted before the deadline expired (or no base deadline existed
        // to compare against) — the deadline legitimately moves.
        const extMs = extension.shipBy
          ? new Date(extension.shipBy).getTime()
          : NaN;
        shipBy = Number.isFinite(extMs) ? new Date(extMs).toISOString() : shipBy;
      } else {
        // Accepted after the deadline had already passed — the breach
        // occurred at that deadline and later extensions cannot erase it.
        break;
      }
    }
    if (!shipBy || new Date(shipBy).getTime() > now.getTime()) {
      continue;
    }

    const breachId = createRuntimeId('slabreach');
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO order_sla_breaches (
         id, order_id, seller_id, breach_type, ship_by, detected_at
       )
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (order_id, breach_type) DO NOTHING
       RETURNING id`,
      [breachId, order.id, order.seller_id, SLA_BREACH_TYPE_DISPATCH, shipBy],
    );

    if (!inserted.rowCount) {
      continue;
    }

    await client.query(
      `INSERT INTO order_events (order_id, event_type, actor_id, source, deduplication_key, metadata)
       VALUES ($1, 'order.dispatch_sla_breached', NULL, 'auto_feedback_sweep', $2, $3::jsonb)
       ON CONFLICT (order_id, deduplication_key)
         WHERE deduplication_key IS NOT NULL
       DO NOTHING`,
      [
        order.id,
        `order.dispatch_sla_breached:${order.id}`,
        toJsonString({
          breachId,
          breachType: SLA_BREACH_TYPE_DISPATCH,
          shipBy,
          sellerId: order.seller_id,
        }),
      ],
    );

    breaches.push({
      orderId: order.id,
      breachId,
      buyerId: order.buyer_id,
      sellerId: order.seller_id,
      shipBy,
    });
  }

  return breaches;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Run one evaluation pass inside the caller's transaction. Exported
 * separately from `runAutoFeedbackSweep` so tests can exercise the logic
 * with a bare fake Queryable (no connect()/BEGIN machinery).
 */
export async function evaluateAutoFeedback(
  client: Queryable,
  policy: AutoFeedbackPolicy = DEFAULT_AUTO_FEEDBACK_POLICY,
): Promise<AutoFeedbackResult> {
  const now = policy.now ?? new Date();
  const { autoReviews, skipped } = await evaluateBuyerSilence(client, policy, now);
  const slaBreaches = await evaluateDispatchSlaBreaches(client, policy, now);
  return { autoReviews, slaBreaches, autoReviewsSkipped: skipped };
}

/**
 * Transactional entry point used by the worker handler: claim a connection,
 * evaluate both rules inside one transaction, commit, and return the
 * records whose notifications still need to be queued (post-commit).
 */
export async function runAutoFeedbackSweep(
  pool: Pick<Pool, 'connect'>,
  policy: AutoFeedbackPolicy = DEFAULT_AUTO_FEEDBACK_POLICY,
): Promise<AutoFeedbackResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await evaluateAutoFeedback(client, policy);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
