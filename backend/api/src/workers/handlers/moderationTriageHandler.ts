/**
 * Moderation Triage Worker Handler
 *
 * Offline, ML-assisted moderation triage with a human-in-the-loop gate.
 *
 * Pipeline:
 *   1. Receive a job with (media_asset_id, model_id, model_version).
 *   2. Fetch the media asset row to resolve the image URL.
 *   3. Download the image with a bounded timeout.
 *   4. Call the triage model. Until a real model is loaded and benchmarked,
 *      the placeholder returns `human_review` with confidence 0.0 and logs
 *      that no model is loaded. This is honest: every asset routes to the
 *      human review queue until a model is promoted via the model artifact
 *      registry (migration 144).
 *   5. Store the result in moderation_triage (via the triage service).
 *   6. Call autoActionTriage — for the placeholder, this adds the asset to
 *      the human review queue (honest default).
 *
 * Anti-AI policy (AGENTS.md §11 — Truthful):
 * - This is "assisted triage", not "AI-powered moderation". The placeholder
 *   is explicitly honest: no model is loaded, everything routes to
 *   human_review. No "AI-powered moderation" claims are made.
 * - The ML never makes the final decision. Auto-approve is logged but
 *   reversible. Auto-reject requires human confirmation. Human review is the
 *   default for ambiguous cases.
 *
 * @packageDocumentation
 */

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import type { ModerationTriageJobData } from '../../lib/queues.js';
import {
  moderationTriageService,
  type TriageDecision,
  type TriageLabel,
} from '../../lib/moderation/moderationTriageService.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-image download timeout (ms). */
const DOWNLOAD_TIMEOUT_MS = 15_000;
/** Maximum image size we will download (50 MB). */
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MediaAssetRow = {
  id: string;
  canonical_url: string | null;
  original_object_url: string;
  media_kind: 'image' | 'video' | 'document';
  status: string;
};

/** Result from the triage model. */
interface TriageModelResult {
  decision: TriageDecision;
  confidence: number;
  labels: TriageLabel[];
  categoryScores: Record<string, number>;
  placeholder: boolean;
}

// ---------------------------------------------------------------------------
// Image download
// ---------------------------------------------------------------------------

/**
 * Download an image from a URL with a bounded timeout and size cap.
 * Returns the raw buffer or null on any failure.
 */
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
    return buffer;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Placeholder triage model
// ---------------------------------------------------------------------------

/**
 * Placeholder triage model.
 *
 * Returns `human_review` with confidence 0.0. No ML model is loaded. This
 * exists so the triage pipeline, storage, and human review queue
 * infrastructure can be built and tested before a real model is deployed.
 *
 * When a real model is available, replace this function with a call to the
 * model serving endpoint. The model must be registered in the
 * model_artifacts table (migration 144) and its (model_id, model_version)
 * must match the job payload. The model must NEVER be allowed to action an
 * auto_reject without human confirmation — that gate is enforced by
 * `ModerationTriageService.autoActionTriage`.
 */
async function runPlaceholderTriageModel(): Promise<TriageModelResult> {
  logger.info(
    {},
    'moderationTriage.placeholder_model_no_model_loaded',
  );

  return {
    decision: 'human_review',
    confidence: 0.0,
    labels: [],
    categoryScores: {},
    placeholder: true,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Processes a moderation triage BullMQ job.
 *
 * Fetches the media asset, downloads the image, calls the (placeholder)
 * triage model, stores the result, and calls autoActionTriage. The handler
 * is idempotent in the sense that re-running with the same input produces a
 * new triage row that supersedes the previous one (lineage preserved).
 */
export async function processModerationTriageJob(
  data: ModerationTriageJobData,
): Promise<void> {
  const { mediaAssetId, modelId, modelVersion } = data;

  logger.info(
    { mediaAssetId, modelId, modelVersion },
    'moderationTriage.job_started',
  );

  // ── 1. Fetch the media asset row ─────────────────────────────────────
  const assetResult = await db.query<MediaAssetRow>(
    `SELECT id, canonical_url, original_object_url, media_kind, status
     FROM media_assets
     WHERE id = $1
     LIMIT 1`,
    [mediaAssetId],
  );
  const asset = assetResult.rows[0];
  if (!asset) {
    logger.warn(
      { mediaAssetId, modelId, modelVersion },
      'moderationTriage.asset_not_found',
    );
    return;
  }

  if (asset.media_kind !== 'image') {
    logger.info(
      { mediaAssetId, mediaKind: asset.media_kind },
      'moderationTriage.skipped_non_image',
    );
    return;
  }

  const imageUrl = asset.canonical_url ?? asset.original_object_url;

  // ── 2. Download the image (bounded timeout) ──────────────────────────
  const imageBuffer = await downloadImage(imageUrl);
  if (!imageBuffer) {
    logger.warn(
      { mediaAssetId, modelId, modelVersion },
      'moderationTriage.download_failed',
    );
    // A download failure does not abort triage — the placeholder model does
    // not need the bytes. A real model would need them; for now we proceed
    // so the asset still enters the human review queue rather than silently
    // disappearing.
  }

  // ── 3. Call the triage model (placeholder) ───────────────────────────
  const triageResult = await runPlaceholderTriageModel();

  // ── 4. Store the result ──────────────────────────────────────────────
  const triageId = await moderationTriageService.processTriageResult({
    mediaAssetId,
    triageModelId: modelId,
    triageModelVersion: modelVersion,
    decision: triageResult.decision,
    confidence: triageResult.confidence,
    labels: triageResult.labels,
    categoryScores: triageResult.categoryScores,
  });

  // ── 5. Action the triage decision ────────────────────────────────────
  // For the placeholder (human_review), this adds the asset to the human
  // review queue. For a real model, auto_approve would mark the asset
  // publishable (reversible), and auto_reject would await human confirmation.
  const outcome = await moderationTriageService.autoActionTriage(triageId);

  logger.info(
    {
      mediaAssetId,
      triageId,
      modelId,
      modelVersion,
      decision: triageResult.decision,
      confidence: triageResult.confidence,
      placeholder: triageResult.placeholder,
      actioned: outcome.actioned,
      lifecycleStatus: outcome.lifecycleStatus,
      reason: outcome.reason,
    },
    'moderationTriage.job_completed',
  );
}
