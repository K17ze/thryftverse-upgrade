/**
 * Moderation triage service — ML-assisted triage with a human-in-the-loop gate.
 *
 * Bridges an advisory triage model's decision into the media lifecycle state
 * machine (`mediaLifecycle.ts`) while enforcing the cardinal rule of
 * ML-assisted moderation: **the ML never makes the final decision**.
 *
 * Three triage lanes:
 *   - `auto_approve` — high confidence safe. The asset is marked publishable,
 *     but the decision is logged and reversible. A human reviewer can
 *     overturn it at any time via `submitHumanReview`.
 *   - `human_review` — ambiguous or potentially violating. The default for
 *     anything the model is not confident about. Adds the asset to the human
 *     review queue (triage_status = 'triaged').
 *   - `auto_reject` — high confidence violation. The model NEVER actions
 *     this. The row sits at triage_status = 'triaged' awaiting explicit human
 *     confirmation (`confirmAutoReject`) before the asset is rejected.
 *
 * Anti-AI design policy (AGENTS.md §11 — Truthful):
 * - This is "assisted triage", not "AI-powered moderation". No model claims
 *   final authority.
 * - Auto-approve is logged but reversible.
 * - Auto-reject requires human confirmation.
 * - Human review is the default for ambiguous cases.
 * - The placeholder model (moderationTriageHandler.ts) is honest: no model is
 *   loaded, so everything routes to human_review with confidence 0.0.
 *
 * @packageDocumentation
 */

import { db } from '../../db/pool.js';
import { logger } from '../logger.js';
import type { MediaAssetStatus } from '../mediaLifecycle.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The advisory decision produced by the triage model. */
export type TriageDecision = 'auto_approve' | 'human_review' | 'auto_reject';

/** The lifecycle status of a triage row. */
export type TriageStatus =
  | 'pending'
  | 'triaged'
  | 'human_reviewed'
  | 'actioned'
  | 'superseded';

/** The authoritative decision recorded by a human reviewer. */
export type HumanDecision = 'approve' | 'reject' | 'escalate';

/** A normalised content-safety label emitted by the triage model. */
export interface TriageLabel {
  name: string;
  confidence: number;
  category:
    | 'nudity'
    | 'violence'
    | 'hate'
    | 'spam'
    | 'drugs'
    | 'alcohol'
    | 'weapon'
    | 'self_harm'
    | 'other';
}

/** Input for storing a triage result. */
export interface TriageResultInput {
  mediaAssetId: string;
  triageModelId: string;
  triageModelVersion: string;
  decision: TriageDecision;
  confidence: number;
  labels: TriageLabel[];
  categoryScores: Record<string, number>;
}

/** A row from the moderation_triage table. */
export interface TriageRow {
  id: string;
  media_asset_id: string;
  triage_model_id: string;
  triage_model_version: string;
  triage_decision: TriageDecision;
  confidence_score: string;
  category_scores: Record<string, unknown>;
  detected_labels: TriageLabel[];
  human_decision: HumanDecision | null;
  human_reviewer_id: string | null;
  human_reviewed_at: Date | null;
  human_reason: string | null;
  triage_status: TriageStatus;
  superseded_by_id: string | null;
  created_at: Date;
}

/** A queue item returned by `getTriageQueue`. */
export interface TriageQueueItem {
  triageId: string;
  mediaAssetId: string;
  triageDecision: TriageDecision;
  confidence: number;
  categoryScores: Record<string, unknown>;
  detectedLabels: TriageLabel[];
  triageModelId: string;
  triageModelVersion: string;
  createdAt: Date;
}

/** The outcome of acting on a triage decision. */
export interface AutoActionOutcome {
  triageId: string;
  mediaAssetId: string;
  triageDecision: TriageDecision;
  actioned: boolean;
  lifecycleStatus: MediaAssetStatus | null;
  reason: string;
}

// ---------------------------------------------------------------------------
// Row types for queries
// ---------------------------------------------------------------------------

type MediaAssetRow = {
  id: string;
  owner_id: string;
  status: MediaAssetStatus;
  moderation_status: string;
  canonical_url: string | null;
  original_object_url: string;
  media_kind: 'image' | 'video' | 'document';
};

type CurrentTriageRow = {
  id: string;
  triage_status: TriageStatus;
  triage_decision: TriageDecision;
};

// ---------------------------------------------------------------------------
// ModerationTriageService
// ---------------------------------------------------------------------------

/**
 * Service that orchestrates ML-assisted moderation triage with a
 * human-in-the-loop gate.
 *
 * All methods catch errors and log them; mutation methods rethrow so the
 * caller (route handler or worker) can surface the failure and schedule a
 * retry. The service uses the shared `db` pool singleton directly, matching
 * the existing handler pattern (see `mediaEmbeddingHandler.ts`).
 */
export class ModerationTriageService {
  /**
   * Store a triage result produced by the model.
   *
   * Supersedes any existing non-superseded triage for the same asset: the
   * previous row is marked `superseded` and linked to the new row via
   * `superseded_by_id`, preserving full lineage. The new row is inserted at
   * `triage_status = 'triaged'` (the model has decided; human action may or
   * may not be required depending on the decision).
   *
   * @returns The inserted triage row id.
   */
  async processTriageResult(
    input: TriageResultInput,
  ): Promise<string> {
    const {
      mediaAssetId,
      triageModelId,
      triageModelVersion,
      decision,
      confidence,
      labels,
      categoryScores,
    } = input;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Supersede any existing active triage for this asset. We keep the
      // latest non-superseded row so lineage is a single hop.
      const existingResult = await client.query<CurrentTriageRow>(
        `SELECT id, triage_status, triage_decision
         FROM moderation_triage
         WHERE media_asset_id = $1
           AND triage_status <> 'superseded'
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [mediaAssetId],
      );
      const existingId = existingResult.rows[0]?.id ?? null;

      const insertResult = await client.query<{ id: string }>(
        `INSERT INTO moderation_triage (
            media_asset_id, triage_model_id, triage_model_version,
            triage_decision, confidence_score, category_scores, detected_labels,
            triage_status
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'triaged')
          RETURNING id`,
        [
          mediaAssetId,
          triageModelId,
          triageModelVersion,
          decision,
          confidence,
          JSON.stringify(categoryScores),
          JSON.stringify(labels),
        ],
      );
      const newId = insertResult.rows[0].id;

      if (existingId) {
        await client.query(
          `UPDATE moderation_triage
             SET triage_status = 'superseded',
                 superseded_by_id = $2
           WHERE id = $1`,
          [existingId, newId],
        );
      }

      await client.query('COMMIT');

      logger.info(
        {
          mediaAssetId,
          triageId: newId,
          triageModelId,
          triageModelVersion,
          decision,
          confidence,
          supersededId: existingId,
        },
        'moderationTriage.result_stored',
      );

      return newId;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(
        {
          mediaAssetId,
          triageModelId,
          triageModelVersion,
          err: error instanceof Error ? error.message : String(error),
        },
        'moderationTriage.store_failed',
      );
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Action a triage decision according to the human-in-the-loop gate.
   *
   * - `auto_approve`: marks the asset as `publishable` (with an audit log).
   *   The decision is reversible — a human reviewer can overturn it later.
   * - `auto_reject`: does NOT action. The row stays at `triaged` awaiting
   *   explicit human confirmation (`confirmAutoReject`). This is the gate.
   * - `human_review`: no action — the row is already at `triaged` and visible
   *   in the review queue (`getTriageQueue`).
   *
   * @returns An {@link AutoActionOutcome} describing what happened.
   */
  async autoActionTriage(triageId: string): Promise<AutoActionOutcome> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const triageResult = await client.query<TriageRow>(
        `SELECT id, media_asset_id, triage_decision, triage_status,
                confidence_score
         FROM moderation_triage
         WHERE id = $1
         FOR UPDATE`,
        [triageId],
      );
      const triage = triageResult.rows[0];
      if (!triage) {
        await client.query('ROLLBACK');
        return {
          triageId,
          mediaAssetId: '',
          triageDecision: 'human_review',
          actioned: false,
          lifecycleStatus: null,
          reason: 'Triage row not found',
        };
      }

      const mediaAssetId = triage.media_asset_id;
      const decision = triage.triage_decision;

      if (triage.triage_status === 'superseded') {
        await client.query('ROLLBACK');
        return {
          triageId,
          mediaAssetId,
          triageDecision: decision,
          actioned: false,
          lifecycleStatus: null,
          reason: 'Triage row has been superseded',
        };
      }

      // auto_reject NEVER actions without human confirmation. This is the
      // human-in-the-loop gate. The row stays at 'triaged' and surfaces in
      // the review queue for explicit confirmation.
      if (decision === 'auto_reject') {
        await client.query('ROLLBACK');
        logger.info(
          { triageId, mediaAssetId, decision },
          'moderationTriage.auto_reject_awaiting_confirmation',
        );
        return {
          triageId,
          mediaAssetId,
          triageDecision: decision,
          actioned: false,
          lifecycleStatus: null,
          reason:
            'Auto-reject requires human confirmation before action (human-in-the-loop gate)',
        };
      }

      // human_review: no action. The row is already at 'triaged' and visible
      // in the review queue. Nothing to do.
      if (decision === 'human_review') {
        await client.query('ROLLBACK');
        logger.info(
          { triageId, mediaAssetId, decision },
          'moderationTriage.human_review_queued',
        );
        return {
          triageId,
          mediaAssetId,
          triageDecision: decision,
          actioned: false,
          lifecycleStatus: null,
          reason: 'Asset added to the human review queue',
        };
      }

      // auto_approve: mark the asset publishable. Reversible — a human can
      // overturn this later via submitHumanReview.
      const assetResult = await client.query<MediaAssetRow>(
        `SELECT id, owner_id, status, moderation_status, canonical_url,
                original_object_url, media_kind
         FROM media_assets
         WHERE id = $1
         FOR UPDATE`,
        [mediaAssetId],
      );
      const asset = assetResult.rows[0];
      if (!asset) {
        await client.query('ROLLBACK');
        return {
          triageId,
          mediaAssetId,
          triageDecision: decision,
          actioned: false,
          lifecycleStatus: null,
          reason: 'Media asset not found',
        };
      }

      await client.query(
        `UPDATE media_assets
           SET moderation_status = 'approved',
               status = 'publishable',
               publishable_at = COALESCE(publishable_at, NOW())
         WHERE id = $1`,
        [mediaAssetId],
      );

      await client.query(
        `UPDATE moderation_triage
           SET triage_status = 'actioned'
         WHERE id = $1`,
        [triageId],
      );

      await client.query('COMMIT');

      logger.info(
        { triageId, mediaAssetId, decision, lifecycleStatus: 'publishable' },
        'moderationTriage.auto_approve_actioned',
      );

      return {
        triageId,
        mediaAssetId,
        triageDecision: decision,
        actioned: true,
        lifecycleStatus: 'publishable',
        reason: 'Asset auto-approved (logged, reversible by human review)',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(
        {
          triageId,
          err: error instanceof Error ? error.message : String(error),
        },
        'moderationTriage.auto_action_failed',
      );
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Return the human review queue: triaged items awaiting human review,
   * ordered by confidence ascending (lowest confidence = most ambiguous =
   * highest priority for human attention).
   *
   * Includes both `human_review` decisions and `auto_reject` decisions
   * (auto-reject items need human confirmation before action).
   */
  async getTriageQueue(
    limit = 50,
    offset = 0,
  ): Promise<{ items: TriageQueueItem[]; total: number }> {
    const clampedLimit = Math.max(1, Math.min(200, limit));
    const clampedOffset = Math.max(0, offset);

    const itemsResult = await db.query<TriageRow>(
      `SELECT id, media_asset_id, triage_model_id, triage_model_version,
              triage_decision, confidence_score, category_scores,
              detected_labels, triage_status, created_at
       FROM moderation_triage
       WHERE triage_status = 'triaged'
         AND triage_decision IN ('human_review', 'auto_reject')
       ORDER BY confidence_score ASC, created_at ASC
       LIMIT $1 OFFSET $2`,
      [clampedLimit, clampedOffset],
    );

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM moderation_triage
       WHERE triage_status = 'triaged'
         AND triage_decision IN ('human_review', 'auto_reject')`,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const items: TriageQueueItem[] = itemsResult.rows.map((row) => ({
      triageId: row.id,
      mediaAssetId: row.media_asset_id,
      triageDecision: row.triage_decision,
      confidence: parseFloat(row.confidence_score),
      categoryScores: row.category_scores,
      detectedLabels: row.detected_labels,
      triageModelId: row.triage_model_id,
      triageModelVersion: row.triage_model_version,
      createdAt: row.created_at,
    }));

    return { items, total };
  }

  /**
   * Record a human review decision and action it.
   *
   * - `approve`: marks the asset `publishable`.
   * - `reject`: marks the asset `rejected`.
   * - `escalate`: keeps the asset in `moderation_pending` for a senior
   *   reviewer; the triage row is marked `human_reviewed` but not actioned.
   *
   * This is the authoritative decision — the model decision is advisory
   * only. A human reviewer can overturn a prior auto_approve by submitting
   * a `reject` decision here.
   */
  async submitHumanReview(
    triageId: string,
    decision: HumanDecision,
    reviewerId: string,
    reason?: string,
  ): Promise<TriageRow> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const triageResult = await client.query<TriageRow>(
        `SELECT id, media_asset_id, triage_decision, triage_status
         FROM moderation_triage
         WHERE id = $1
         FOR UPDATE`,
        [triageId],
      );
      const triage = triageResult.rows[0];
      if (!triage) {
        await client.query('ROLLBACK');
        throw new Error(`MODERATION_TRIAGE_NOT_FOUND:${triageId}`);
      }
      if (triage.triage_status === 'superseded') {
        await client.query('ROLLBACK');
        throw new Error(`MODERATION_TRIAGE_SUPERSEDED:${triageId}`);
      }

      const mediaAssetId = triage.media_asset_id;

      const assetResult = await client.query<MediaAssetRow>(
        `SELECT id, status, moderation_status
         FROM media_assets
         WHERE id = $1
         FOR UPDATE`,
        [mediaAssetId],
      );
      const asset = assetResult.rows[0];
      if (!asset) {
        await client.query('ROLLBACK');
        throw new Error(`MEDIA_ASSET_NOT_FOUND:${mediaAssetId}`);
      }

      let newLifecycleStatus: MediaAssetStatus | null = null;
      let newModerationStatus = asset.moderation_status;
      let actioned = false;

      if (decision === 'approve') {
        newLifecycleStatus = 'publishable';
        newModerationStatus = 'approved';
        actioned = true;
      } else if (decision === 'reject') {
        newLifecycleStatus = 'rejected';
        newModerationStatus = 'rejected';
        actioned = true;
      }
      // escalate: no lifecycle transition — the asset stays in its current
      // state for a senior reviewer. The triage row is marked human_reviewed.

      if (actioned) {
        await client.query(
          `UPDATE media_assets
             SET moderation_status = $2,
                 status = $3,
                 publishable_at = CASE WHEN $3 = 'publishable'
                                       THEN COALESCE(publishable_at, NOW())
                                       ELSE publishable_at END
           WHERE id = $1`,
          [mediaAssetId, newModerationStatus, newLifecycleStatus],
        );
      }

      const newTriageStatus: TriageStatus = actioned
        ? 'actioned'
        : 'human_reviewed';

      const updated = await client.query<TriageRow>(
        `UPDATE moderation_triage
           SET human_decision = $2,
               human_reviewer_id = $3,
               human_reviewed_at = NOW(),
               human_reason = $4,
               triage_status = $5
         WHERE id = $1
         RETURNING id, media_asset_id, triage_model_id, triage_model_version,
                   triage_decision, confidence_score, category_scores,
                   detected_labels, human_decision, human_reviewer_id,
                   human_reviewed_at, human_reason, triage_status,
                   superseded_by_id, created_at`,
        [triageId, decision, reviewerId, reason ?? null, newTriageStatus],
      );

      await client.query('COMMIT');

      logger.info(
        {
          triageId,
          mediaAssetId,
          humanDecision: decision,
          reviewerId,
          actioned,
          lifecycleStatus: newLifecycleStatus,
        },
        'moderationTriage.human_review_recorded',
      );

      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(
        {
          triageId,
          decision,
          reviewerId,
          err: error instanceof Error ? error.message : String(error),
        },
        'moderationTriage.human_review_failed',
      );
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Confirm an auto-reject decision.
   *
   * This is the human-in-the-loop gate for auto-reject: the model flagged the
   * asset as a high-confidence violation, but the asset is NOT rejected until
   * a human explicitly confirms. This method records the human decision as
   * `reject` and actions it (marks the asset `rejected`).
   *
   * Equivalent to `submitHumanReview(triageId, 'reject', reviewerId, reason)`
   * but semantically distinct: it can only be called on an `auto_reject`
   * triage row, making the confirmation intent explicit in the audit trail.
   */
  async confirmAutoReject(
    triageId: string,
    reviewerId: string,
    reason?: string,
  ): Promise<TriageRow> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const triageResult = await client.query<TriageRow>(
        `SELECT id, media_asset_id, triage_decision, triage_status
         FROM moderation_triage
         WHERE id = $1
         FOR UPDATE`,
        [triageId],
      );
      const triage = triageResult.rows[0];
      if (!triage) {
        await client.query('ROLLBACK');
        throw new Error(`MODERATION_TRIAGE_NOT_FOUND:${triageId}`);
      }
      if (triage.triage_status === 'superseded') {
        await client.query('ROLLBACK');
        throw new Error(`MODERATION_TRIAGE_SUPERSEDED:${triageId}`);
      }
      if (triage.triage_decision !== 'auto_reject') {
        await client.query('ROLLBACK');
        throw new Error(
          `MODERATION_TRIAGE_NOT_AUTO_REJECT:${triage.triage_decision}`,
        );
      }

      const mediaAssetId = triage.media_asset_id;

      await client.query(
        `UPDATE media_assets
           SET moderation_status = 'rejected',
               status = 'rejected'
         WHERE id = $1`,
        [mediaAssetId],
      );

      const updated = await client.query<TriageRow>(
        `UPDATE moderation_triage
           SET human_decision = 'reject',
               human_reviewer_id = $2,
               human_reviewed_at = NOW(),
               human_reason = $3,
               triage_status = 'actioned'
         WHERE id = $1
         RETURNING id, media_asset_id, triage_model_id, triage_model_version,
                   triage_decision, confidence_score, category_scores,
                   detected_labels, human_decision, human_reviewer_id,
                   human_reviewed_at, human_reason, triage_status,
                   superseded_by_id, created_at`,
        [triageId, reviewerId, reason ?? null],
      );

      await client.query('COMMIT');

      logger.info(
        {
          triageId,
          mediaAssetId,
          reviewerId,
          triageDecision: 'auto_reject',
          humanDecision: 'reject',
        },
        'moderationTriage.auto_reject_confirmed',
      );

      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(
        {
          triageId,
          reviewerId,
          err: error instanceof Error ? error.message : String(error),
        },
        'moderationTriage.confirm_auto_reject_failed',
      );
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Return the full triage history for a media asset, newest first.
   *
   * Includes superseded rows so an auditor can reconstruct the complete
   * decision lineage: what the model said at each pass, what the human
   * ultimately decided, and which row superseded which.
   */
  async getTriageSummary(mediaAssetId: string): Promise<TriageRow[]> {
    const result = await db.query<TriageRow>(
      `SELECT id, media_asset_id, triage_model_id, triage_model_version,
              triage_decision, confidence_score, category_scores,
              detected_labels, human_decision, human_reviewer_id,
              human_reviewed_at, human_reason, triage_status,
              superseded_by_id, created_at
       FROM moderation_triage
       WHERE media_asset_id = $1
       ORDER BY created_at DESC`,
      [mediaAssetId],
    );
    return result.rows;
  }
}

/**
 * Shared singleton instance. The service is stateless beyond the shared `db`
 * pool, so a single instance is safe across the API and worker processes.
 */
export const moderationTriageService = new ModerationTriageService();
