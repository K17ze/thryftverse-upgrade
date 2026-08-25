/**
 * Review integrity risk-assessment module (gate 14 — detection layer).
 *
 * Implements the **detection** portion of the review integrity system:
 * policy → risk assessment → **detection** → investigation → action →
 * effectiveness measurement.
 *
 * IMPORTANT — this module is a detection layer, NOT a trust layer:
 *   - It NEVER auto-removes or hides a review.
 *   - It only computes risk signals and persists them into the
 *     `review_integrity_signals` table (migration 168).
 *   - Downstream moderation queues / investigators consume the signals and
 *     decide on action.
 *
 * Failure mode is **fail-safe, not fail-closed**: on any query error the
 * affected check is logged and skipped, and `assessReviewIntegrity` returns
 * `0` rather than throwing. Removing a review is a trust-layer decision that
 * must never be triggered by a detection-layer failure.
 *
 * Design notes:
 *   - All queries use parameterised placeholders only — no string
 *     interpolation for user-supplied input.
 *   - `db` is typed as `Queryable` (Pool | PoolClient), mirroring the pattern
 *     in `sellerPerformance.ts` so the module works inside transactions and
 *     against read replicas.
 */

import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

/**
 * A database connection that supports parameterised queries — either a full
 * `Pool` or a checked-out `PoolClient` (transaction connection). Mirrors the
 * pattern used by `sellerPerformance.ts`.
 */
type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The set of signal types this module can emit. */
export type ReviewSignalType =
  | 'duplicate_text'
  | 'linked_accounts'
  | 'velocity_anomaly'
  | 'rating_inconsistency'
  | 'incentive_detected';

/** A single computed risk signal ready to persist. */
export interface ReviewIntegritySignal {
  id: string;
  reviewId: string;
  signalType: ReviewSignalType;
  signalValue: Record<string, unknown>;
  riskScore: number;
  assessedAt: string;
}

/** Row shape returned when fetching a review for assessment. */
type ReviewRow = {
  id: string;
  comment: string | null;
  rating: number;
  reviewer_id: string;
  seller_id: string;
  order_id: string;
};

/** Result row for the high-risk moderation queue. */
export interface HighRiskReviewRow {
  reviewId: string;
  sellerId: string;
  maxRiskScore: number;
  signalTypes: ReviewSignalType[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a unique id for a signal row, namespaced so it is easy to identify
 * in logs and foreign-key traces.
 */
function newSignalId(): string {
  return `risig_${crypto.randomUUID()}`;
}

/**
 * Persist a single signal row into `review_integrity_signals`.
 * Errors are caught and logged so one bad insert cannot abort the whole
 * assessment pass.
 */
async function persistSignal(
  db: Queryable,
  reviewId: string,
  signalType: ReviewSignalType,
  signalValue: Record<string, unknown>,
  riskScore: number,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO review_integrity_signals
         (id, review_id, signal_type, signal_value, risk_score, assessed_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [newSignalId(), reviewId, signalType, JSON.stringify(signalValue), riskScore],
    );
  } catch (err) {
    console.error(
      `[reviewIntegrity] persistSignal: failed to persist ` +
        `'${signalType}' for review ${reviewId}:`,
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// Signal checks
// ---------------------------------------------------------------------------

/**
 * Check whether the review text is substantially similar to other reviews for
 * the same seller. Uses pg_trgm `SIMILARITY()` with a 0.8 threshold.
 *
 * - Skipped when the review has no comment.
 * - risk_score = min(count * 20, 80) — capped because text similarity alone
 *   is not conclusive (legitimate buyers may reuse common phrases).
 *
 * @returns The risk score (0 if no duplicate or no comment), or `null` when
 *          the check was skipped (no comment).
 */
export async function checkDuplicateText(
  db: Queryable,
  reviewId: string,
  comment: string | null,
): Promise<number | null> {
  if (!comment || comment.trim() === '') {
    return null;
  }

  try {
    // We need the seller_id to scope the similarity search to the same seller.
    const reviewRow = await db.query<{ seller_id: string }>(
      `SELECT seller_id FROM order_reviews WHERE id = $1 LIMIT 1`,
      [reviewId],
    );
    if (!reviewRow.rowCount || !reviewRow.rows[0].seller_id) {
      return 0;
    }
    const sellerId = reviewRow.rows[0].seller_id;

    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM order_reviews
        WHERE seller_id = $1
          AND comment IS NOT NULL
          AND comment != ''
          AND SIMILARITY(comment, $2) > 0.8
          AND id != $3`,
      [sellerId, comment, reviewId],
    );

    const count = Number(result.rows[0]?.count ?? 0);
    if (count <= 0) {
      return 0;
    }

    const riskScore = Math.min(count * 20, 80);
    await persistSignal(db, reviewId, 'duplicate_text', {
      matchCount: count,
      threshold: 0.8,
      sellerId,
    }, riskScore);
    return riskScore;
  } catch (err) {
    console.error(
      `[reviewIntegrity] checkDuplicateText: failed for review ${reviewId}:`,
      err,
    );
    return 0;
  }
}

/**
 * Check whether the reviewer and seller share device identifiers — currently
 * a same-IP-address check within the last 30 days via `auth_sessions`.
 *
 * - risk_score = min(count * 30, 90) — shared IP alone is suggestive, not
 *   conclusive (NAT, shared households), so it is capped below 100.
 *
 * @returns The risk score (0 if no shared identifiers).
 */
export async function checkLinkedAccounts(
  db: Queryable,
  reviewId: string,
  reviewerId: string,
  sellerId: string,
): Promise<number> {
  if (!reviewerId || !sellerId || reviewerId === sellerId) {
    // Self-review is a separate, more severe signal — not handled here.
    return 0;
  }

  try {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(DISTINCT s1.ip_address)::text AS count
         FROM auth_sessions s1
         JOIN auth_sessions s2
           ON s1.ip_address = s2.ip_address
        WHERE s1.user_id = $1
          AND s2.user_id = $2
          AND s1.created_at > NOW() - INTERVAL '30 days'`,
      [reviewerId, sellerId],
    );

    const count = Number(result.rows[0]?.count ?? 0);
    if (count <= 0) {
      return 0;
    }

    const riskScore = Math.min(count * 30, 90);
    await persistSignal(db, reviewId, 'linked_accounts', {
      sharedIpCount: count,
      reviewerId,
      sellerId,
      windowDays: 30,
    }, riskScore);
    return riskScore;
  } catch (err) {
    console.error(
      `[reviewIntegrity] checkLinkedAccounts: failed for review ${reviewId}:`,
      err,
    );
    return 0;
  }
}

/**
 * Check for unusual review velocity for a seller — more than 5 reviews in the
 * last 24 hours is treated as anomalous.
 *
 * - Normal velocity (1–5 reviews/day) produces no signal.
 * - risk_score = min((count - 5) * 15, 75) — capped because a genuine viral
 *   moment can spike velocity without fraud.
 *
 * @returns The risk score (0 if velocity is normal).
 */
export async function checkVelocityAnomaly(
  db: Queryable,
  reviewId: string,
  sellerId: string,
): Promise<number> {
  if (!sellerId) {
    return 0;
  }

  try {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM order_reviews
        WHERE seller_id = $1
          AND created_at > NOW() - INTERVAL '24 hours'`,
      [sellerId],
    );

    const count = Number(result.rows[0]?.count ?? 0);
    if (count <= 5) {
      return 0;
    }

    const riskScore = Math.min((count - 5) * 15, 75);
    await persistSignal(db, reviewId, 'velocity_anomaly', {
      reviewCount24h: count,
      threshold: 5,
      sellerId,
    }, riskScore);
    return riskScore;
  } catch (err) {
    console.error(
      `[reviewIntegrity] checkVelocityAnomaly: failed for review ${reviewId}:`,
      err,
    );
    return 0;
  }
}

/**
 * Check whether this rating is inconsistent with the reviewer's other ratings.
 *
 * - Only runs when the reviewer has 3+ *other* reviews (enough baseline).
 * - If |this rating - average of other ratings| >= 2 stars:
 *   signal_type = 'rating_inconsistency', risk_score = 50.
 *
 * @returns The risk score (0 if consistent or insufficient history).
 */
export async function checkRatingInconsistency(
  db: Queryable,
  reviewId: string,
  reviewerId: string,
  rating: number,
): Promise<number> {
  if (!reviewerId) {
    return 0;
  }

  try {
    const result = await db.query<{ avg_rating: string | null; other_count: string }>(
      `SELECT
         AVG(rating)::text AS avg_rating,
         COUNT(*)::text AS other_count
       FROM order_reviews
       WHERE reviewer_id = $1
         AND id != $2`,
      [reviewerId, reviewId],
    );

    const row = result.rows[0];
    const otherCount = Number(row?.other_count ?? 0);
    if (otherCount < 3) {
      // Not enough baseline to call this inconsistent.
      return 0;
    }

    const avgRating = Number(row?.avg_rating ?? 0);
    const delta = Math.abs(rating - avgRating);
    if (delta < 2) {
      return 0;
    }

    const riskScore = 50;
    await persistSignal(db, reviewId, 'rating_inconsistency', {
      thisRating: rating,
      averageOtherRating: Number(avgRating.toFixed(2)),
      delta: Number(delta.toFixed(2)),
      otherReviewCount: otherCount,
      reviewerId,
    }, riskScore);
    return riskScore;
  } catch (err) {
    console.error(
      `[reviewIntegrity] checkRatingInconsistency: failed for review ${reviewId}:`,
      err,
    );
    return 0;
  }
}

/**
 * Check whether an incentive disclosure exists for this review.
 *
 * This is NOT a removal signal — a disclosure means the reviewer was
 * incentivized (e.g. free item) and disclosed it, which is legal but must be
 * displayed to readers. The signal exists so the moderation queue can verify
 * the disclosure is surfaced correctly.
 *
 * - risk_score = 40 — present but moderate, because disclosure is compliant
 *   behaviour; the risk is display/visibility, not fraud.
 *
 * @returns The risk score (0 if no disclosure).
 */
export async function checkIncentiveDetected(
  db: Queryable,
  reviewId: string,
): Promise<number> {
  try {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM review_incentive_disclosures
        WHERE review_id = $1`,
      [reviewId],
    );

    const count = Number(result.rows[0]?.count ?? 0);
    if (count <= 0) {
      return 0;
    }

    const riskScore = 40;
    await persistSignal(db, reviewId, 'incentive_detected', {
      disclosureCount: count,
      note: 'Disclosure present — verify display compliance, do not auto-remove.',
    }, riskScore);
    return riskScore;
  } catch (err) {
    console.error(
      `[reviewIntegrity] checkIncentiveDetected: failed for review ${reviewId}:`,
      err,
    );
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Assess the integrity of a single review: fetch it, run every signal check,
 * persist each signal, and return the overall weighted risk score.
 *
 * The overall score is a weighted average of the individual signal scores
 * (each signal contributes equally by default; weights can be tuned here).
 * This is the *detection* score — it does NOT remove or hide the review.
 *
 * Failure mode is **fail-safe**: on any error the function logs and returns
 * `0` rather than throwing, because a detection-layer failure must never
 * escalate into a trust-layer action.
 *
 * @param db       A pg Pool or PoolClient.
 * @param reviewId The id of the review to assess.
 * @returns Overall risk score (0–100). 0 means no signals or an error.
 */
export async function assessReviewIntegrity(
  db: Queryable,
  reviewId: string,
): Promise<number> {
  try {
    const reviewResult = await db.query<ReviewRow>(
      `SELECT id, comment, rating, reviewer_id, seller_id, order_id
         FROM order_reviews
        WHERE id = $1
        LIMIT 1`,
      [reviewId],
    );

    if (!reviewResult.rowCount || !reviewResult.rows[0]) {
      console.warn(
        `[reviewIntegrity] assessReviewIntegrity: review ${reviewId} not found`,
      );
      return 0;
    }

    const review = reviewResult.rows[0];

    // Run every check. Each is self-contained and swallows its own query
    // errors, so one failing check cannot abort the others.
    const [
      duplicateScore,
      linkedScore,
      velocityScore,
      inconsistencyScore,
      incentiveScore,
    ] = await Promise.all([
      checkDuplicateText(db, reviewId, review.comment),
      checkLinkedAccounts(db, reviewId, review.reviewer_id, review.seller_id),
      checkVelocityAnomaly(db, reviewId, review.seller_id),
      checkRatingInconsistency(db, reviewId, review.reviewer_id, review.rating),
      checkIncentiveDetected(db, reviewId),
    ]);

    // Collect the non-null scores for the weighted average.
    const scores: number[] = [];
    if (duplicateScore !== null) scores.push(duplicateScore);
    if (linkedScore > 0) scores.push(linkedScore);
    if (velocityScore > 0) scores.push(velocityScore);
    if (inconsistencyScore > 0) scores.push(inconsistencyScore);
    if (incentiveScore > 0) scores.push(incentiveScore);

    if (scores.length === 0) {
      return 0;
    }

    const overall = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    return Math.round(overall);
  } catch (err) {
    console.error(
      `[reviewIntegrity] assessReviewIntegrity: unhandled error for ` +
        `review ${reviewId}:`,
      err,
    );
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Read-side helpers
// ---------------------------------------------------------------------------

/**
 * Get the current risk score for a review, defined as the **maximum**
 * `risk_score` across all stored signals — the worst signal determines the
 * risk, not the average.
 *
 * @param db       A pg Pool or PoolClient.
 * @param reviewId The review id.
 * @returns The max risk score (0–100), or 0 if no signals exist.
 */
export async function getReviewRiskScore(
  db: Queryable,
  reviewId: string,
): Promise<number> {
  try {
    const result = await db.query<{ max_score: string | null }>(
      `SELECT MAX(risk_score)::text AS max_score
         FROM review_integrity_signals
        WHERE review_id = $1`,
      [reviewId],
    );

    const max = Number(result.rows[0]?.max_score ?? 0);
    return Number.isFinite(max) ? max : 0;
  } catch (err) {
    console.error(
      `[reviewIntegrity] getReviewRiskScore: failed for review ${reviewId}:`,
      err,
    );
    return 0;
  }
}

/**
 * Return the highest-risk reviews for the moderation queue.
 *
 * Joins `review_integrity_signals` with `order_reviews`, groups by review,
 * takes `MAX(risk_score)`, orders descending, and limits the result set.
 * Each row includes the array of signal types that contributed.
 *
 * This powers the investigation step of the integrity pipeline — humans
 * review the queue; this function does not action anything.
 *
 * @param db    A pg Pool or PoolClient.
 * @param limit Maximum number of rows to return (default 20).
 * @returns Array of high-risk review rows, highest risk first.
 */
export async function getHighRiskReviews(
  db: Queryable,
  limit: number = 20,
): Promise<HighRiskReviewRow[]> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit) || 20, 100));

  try {
    const result = await db.query<{
      review_id: string;
      seller_id: string;
      max_risk_score: string;
      signal_types: ReviewSignalType[];
      created_at: string;
    }>(
      `SELECT
         r.id AS review_id,
         r.seller_id,
         MAX(s.risk_score)::text AS max_risk_score,
         ARRAY_AGG(DISTINCT s.signal_type) AS signal_types,
         MIN(r.created_at) AS created_at
       FROM review_integrity_signals s
       JOIN order_reviews r ON r.id = s.review_id
       GROUP BY r.id, r.seller_id
       ORDER BY MAX(s.risk_score) DESC
       LIMIT $1`,
      [safeLimit],
    );

    return result.rows.map((row) => ({
      reviewId: row.review_id,
      sellerId: row.seller_id,
      maxRiskScore: Number(row.max_risk_score ?? 0),
      signalTypes: Array.isArray(row.signal_types) ? row.signal_types : [],
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error(
      `[reviewIntegrity] getHighRiskReviews: query failed:`,
      err,
    );
    return [];
  }
}
