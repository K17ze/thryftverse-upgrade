/**
 * Moderation Triage — ML-assisted triage REST routes with a human-in-the-loop gate.
 *
 * Exposes endpoints for triggering ML-assisted moderation triage, inspecting
 * the human review queue, reviewing triage history, and submitting human
 * review decisions.
 *
 * Anti-AI design policy (AGENTS.md §11 — Truthful):
 * - This is "assisted triage", not "AI-powered moderation". The ML never
 *   makes the final decision.
 * - Auto-approve is logged but reversible (a human can overturn it via the
 *   review endpoint).
 * - Auto-reject requires human confirmation via the dedicated
 *   `confirm-reject` endpoint — it is NEVER actioned automatically.
 * - Human review is the default for ambiguous cases.
 * - The placeholder model is honest: no model is loaded, everything routes
 *   to human_review.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { enqueueModerationTriageJob } from '../lib/queues.js';
import {
  moderationTriageService,
  type HumanDecision,
  type TriageDecision,
  type TriageQueueItem,
  type TriageRow,
} from '../lib/moderation/moderationTriageService.js';

type ModerationTriageRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

type MediaAssetRow = {
  id: string;
  owner_id: string;
  status: string;
  media_kind: 'image' | 'video' | 'document';
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const assetIdParamSchema = z.object({
  assetId: z.string().trim().min(2).max(120),
});

const triageIdParamSchema = z.object({
  triageId: z.string().trim().min(2).max(120),
});

const triggerBodySchema = z.object({
  modelId: z.string().trim().min(2).max(120).default('moderation-triage-placeholder'),
  modelVersion: z.string().trim().min(1).max(120).default('v0.0.0-placeholder'),
});

const queueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const reviewBodySchema = z.object({
  decision: z.enum(['approve', 'reject', 'escalate']),
  reason: z.string().trim().min(1).max(500).optional(),
});

const confirmRejectBodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureAdmin(
  request: FastifyRequest,
  createApiError: ModerationTriageRouteDependencies['createApiError'],
): void {
  if (!request.authUser || request.authUser.role !== 'admin') {
    throw createApiError('FORBIDDEN', 'Admin access required');
  }
}

function mapTriageRowToDto(row: TriageRow) {
  return {
    triageId: row.id,
    mediaAssetId: row.media_asset_id,
    triageModelId: row.triage_model_id,
    triageModelVersion: row.triage_model_version,
    triageDecision: row.triage_decision,
    confidence: parseFloat(row.confidence_score),
    categoryScores: row.category_scores,
    detectedLabels: row.detected_labels,
    humanDecision: row.human_decision,
    humanReviewerId: row.human_reviewer_id,
    humanReviewedAt: row.human_reviewed_at,
    humanReason: row.human_reason,
    triageStatus: row.triage_status,
    supersededById: row.superseded_by_id,
    createdAt: row.created_at,
  };
}

function mapQueueItemToDto(item: TriageQueueItem) {
  return {
    triageId: item.triageId,
    mediaAssetId: item.mediaAssetId,
    triageDecision: item.triageDecision,
    confidence: item.confidence,
    categoryScores: item.categoryScores,
    detectedLabels: item.detectedLabels,
    triageModelId: item.triageModelId,
    triageModelVersion: item.triageModelVersion,
    createdAt: item.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerModerationTriageRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: ModerationTriageRouteDependencies) => {
  // POST /moderation/triage/:assetId — trigger triage (admin or asset owner).
  //
  // Queues a moderation triage job for the asset. The job runs offline: it
  // downloads the image, calls the (placeholder) triage model, stores the
  // result, and actions it according to the human-in-the-loop gate.
  app.post('/moderation/triage/:assetId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { assetId } = assetIdParamSchema.parse(request.params);
    const payload = triggerBodySchema.parse(request.body ?? {});

    const result = await db.query<MediaAssetRow>(
      `SELECT id, owner_id, status, media_kind
       FROM media_assets
       WHERE id = $1
       LIMIT 1`,
      [assetId],
    );
    const asset = result.rows[0];
    if (!asset) {
      reply.code(404);
      return { ok: false, error: 'Media asset not found' };
    }
    const isAdmin = request.authUser?.role === 'admin';
    if (asset.owner_id !== actorUserId && !isAdmin) {
      reply.code(403);
      return { ok: false, error: 'Only the asset owner or an admin can trigger triage' };
    }
    if (asset.media_kind !== 'image') {
      reply.code(422);
      return { ok: false, error: 'Triage is only available for image assets' };
    }

    await enqueueModerationTriageJob({
      mediaAssetId: assetId,
      modelId: payload.modelId,
      modelVersion: payload.modelVersion,
    });

    reply.code(202);
    return {
      ok: true,
      assetId,
      modelId: payload.modelId,
      modelVersion: payload.modelVersion,
      message: 'Triage job queued',
    };
  });

  // GET /moderation/triage/queue — get the human review queue (admin-only).
  //
  // Returns triaged items awaiting human review, ordered by confidence
  // ascending (lowest confidence = most ambiguous = highest priority).
  // Includes both human_review decisions and auto_reject decisions
  // (auto-reject items need human confirmation before action).
  app.get('/moderation/triage/queue', async (request, reply) => {
    ensureAdmin(request, createApiError);

    const query = queueQuerySchema.parse(request.query ?? {});

    const { items, total } = await moderationTriageService.getTriageQueue(
      query.limit,
      query.offset,
    );

    return {
      ok: true,
      items: items.map(mapQueueItemToDto),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  });

  // GET /moderation/triage/:assetId — get triage history for an asset
  // (admin or owner).
  //
  // Returns the full triage history for the asset, newest first, including
  // superseded rows so the complete decision lineage is visible.
  app.get('/moderation/triage/:assetId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { assetId } = assetIdParamSchema.parse(request.params);

    const result = await db.query<MediaAssetRow>(
      `SELECT id, owner_id, status, media_kind
       FROM media_assets
       WHERE id = $1
       LIMIT 1`,
      [assetId],
    );
    const asset = result.rows[0];
    if (!asset) {
      reply.code(404);
      return { ok: false, error: 'Media asset not found' };
    }
    const isAdmin = request.authUser?.role === 'admin';
    if (asset.owner_id !== actorUserId && !isAdmin) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const history = await moderationTriageService.getTriageSummary(assetId);

    return {
      ok: true,
      assetId,
      history: history.map(mapTriageRowToDto),
    };
  });

  // POST /moderation/triage/:triageId/review — submit human review (admin-only).
  //
  // Records the authoritative human decision and actions it:
  //   approve   → asset becomes publishable
  //   reject    → asset becomes rejected
  //   escalate  → asset stays in moderation_pending for a senior reviewer
  //
  // This is the authoritative decision — the model decision is advisory
  // only. A human reviewer can overturn a prior auto_approve by submitting
  // a reject decision here.
  app.post('/moderation/triage/:triageId/review', async (request, reply) => {
    ensureAdmin(request, createApiError);

    const actorUserId = resolveAuthenticatedUserId(request);
    const { triageId } = triageIdParamSchema.parse(request.params);
    const payload = reviewBodySchema.parse(request.body ?? {});

    try {
      const updated = await moderationTriageService.submitHumanReview(
        triageId,
        payload.decision as HumanDecision,
        actorUserId,
        payload.reason,
      );
      return {
        ok: true,
        triage: mapTriageRowToDto(updated),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('MODERATION_TRIAGE_NOT_FOUND')) {
        reply.code(404);
        return { ok: false, error: 'Triage row not found' };
      }
      if (message.startsWith('MODERATION_TRIAGE_SUPERSEDED')) {
        reply.code(409);
        return { ok: false, error: 'Triage row has been superseded' };
      }
      if (message.startsWith('MEDIA_ASSET_NOT_FOUND')) {
        reply.code(404);
        return { ok: false, error: 'Media asset not found' };
      }
      throw error;
    }
  });

  // POST /moderation/triage/:triageId/confirm-reject — confirm an auto-reject
  // decision (admin-only).
  //
  // This is the human-in-the-loop gate for auto-reject: the model flagged the
  // asset as a high-confidence violation, but the asset is NOT rejected until
  // a human explicitly confirms here. Can only be called on an auto_reject
  // triage row.
  app.post('/moderation/triage/:triageId/confirm-reject', async (request, reply) => {
    ensureAdmin(request, createApiError);

    const actorUserId = resolveAuthenticatedUserId(request);
    const { triageId } = triageIdParamSchema.parse(request.params);
    const payload = confirmRejectBodySchema.parse(request.body ?? {});

    try {
      const updated = await moderationTriageService.confirmAutoReject(
        triageId,
        actorUserId,
        payload.reason,
      );
      return {
        ok: true,
        triage: mapTriageRowToDto(updated),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('MODERATION_TRIAGE_NOT_FOUND')) {
        reply.code(404);
        return { ok: false, error: 'Triage row not found' };
      }
      if (message.startsWith('MODERATION_TRIAGE_SUPERSEDED')) {
        reply.code(409);
        return { ok: false, error: 'Triage row has been superseded' };
      }
      if (message.startsWith('MODERATION_TRIAGE_NOT_AUTO_REJECT')) {
        reply.code(409);
        return {
          ok: false,
          error: 'Confirm-reject can only be called on an auto_reject triage row',
        };
      }
      throw error;
    }
  });
};
