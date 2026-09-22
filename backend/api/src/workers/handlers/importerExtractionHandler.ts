/**
 * Importer Assisted Extraction Worker Handler
 *
 * Processes a catalogue photo extraction job: downloads the image, calls the
 * extraction service, and stores the result in catalog_import_extractions.
 *
 * Anti-AI policy (per AGENTS.md and ML flagship report §6.5):
 * - Until a real extraction model is loaded and benchmarked, the placeholder
 *   returns empty fields with a logged "no model loaded" message. This is
 *   honest: extraction_status is set to 'completed', extracted_fields is {},
 *   confidence_scores is {}. The seller sees an empty extraction and must
 *   fill in the fields manually — exactly as they would without ML.
 * - No "AI-powered import" claims. This is "assisted extraction".
 * - The human confirmation gate is enforced by the domain service, not here.
 *   The worker only stores the model output; it never writes to listing
 *   drafts.
 *
 * Idempotency:
 * - If the extraction row is already 'completed', the handler is a no-op.
 * - If the extraction row has been 'superseded', the handler skips.
 *
 * @packageDocumentation
 */

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { fetchPinnedRemoteMedia } from '../../lib/safeRemoteMediaFetch.js';
import { importerExtractionService } from '../../domain/catalogImports/importerExtractionService.js';

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

// Re-export the queue's job data type (converged shape: runId/modelBundle).
// The old runId/modelId/modelVersion fields are replaced by the
// converged extraction intelligence domain.
export type { ImporterExtractionJobData } from '../../lib/queues.js';
import type { ImporterExtractionJobData } from '../../lib/queues.js';

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

/** Result from the extraction service. */
interface ExtractionResult {
  /** Extracted fields, e.g. {brand, category, condition, size, ...}. */
  fields: Record<string, unknown>;
  /** Per-field confidence in [0.0, 1.0]. */
  confidenceScores: Record<string, number>;
  /** True when no real model was loaded (placeholder). */
  placeholder: boolean;
}

interface MediaAssetUrlRow {
  canonical_url: string | null;
  original_object_url: string | null;
}

interface ExtractionStatusRow {
  extraction_status: string;
  /** Owning import item — cross-checked against the job payload so a
   *  mis-wired job cannot mix a runId from one item with another item's
   *  media binding. */
  item_id: string;
}

// ---------------------------------------------------------------------------
// Image download
// ---------------------------------------------------------------------------

/**
 * Download an image from a URL with a bounded timeout and size cap.
 * Returns the raw buffer or null on any failure.
 *
 * Security: delegates to `fetchPinnedRemoteMedia` — DNS is resolved once,
 * blocklist-checked, and the connection is pinned to the validated address
 * set (no validate-then-re-resolve TOCTOU), redirects are revalidated per
 * hop, and the single deadline covers DNS + redirects + body streaming.
 * The previous implementation called `fetch(url, { redirect: 'follow' })`
 * directly — an unpinned SSRF vector.
 */
async function downloadImage(url: string): Promise<Buffer | null> {
  const result = await fetchPinnedRemoteMedia({
    url,
    maxBytes: MAX_IMAGE_BYTES,
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
  });
  return result.ok ? result.buffer : null;
}

/**
 * Resolve the image URL for a media asset, BOUND through
 * catalog_import_media for the owned import item — the asset must be
 * associated with this item. This replaces the old global media_assets
 * SELECT, which let any caller who knew a mediaAssetId trigger extraction
 * (and its outbound fetch) on another user's media (cross-tenant IDOR).
 * Item ownership was verified by the route before the job was enqueued.
 * Prefers canonical_url, falls back to original_object_url.
 */
async function resolveMediaAssetUrl(
  itemId: string,
  mediaAssetId: string,
): Promise<string | null> {
  const result = await db.query<MediaAssetUrlRow>(
    `SELECT a.canonical_url, a.original_object_url
     FROM catalog_import_media m
     JOIN media_assets a ON a.id = m.media_asset_id
     WHERE m.import_item_id = $1 AND m.media_asset_id = $2
     LIMIT 1`,
    [itemId, mediaAssetId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return row.canonical_url ?? row.original_object_url ?? null;
}

// ---------------------------------------------------------------------------
// Placeholder extraction service
// ---------------------------------------------------------------------------

/**
 * Placeholder extraction service.
 *
 * Returns empty fields and empty confidence scores. No ML model is loaded.
 * This exists so the extraction pipeline, storage, and human confirmation
 * gate infrastructure can be built and tested before a real model (e.g. a
 * vision-language model for product attribute extraction) is deployed.
 *
 * When a real model is available, replace this function with a call to the
 * model serving endpoint. The model must be registered in the model_artifacts
 * table (migration 144) and its (model_id, model_version) must match the job
 * payload. The model should return structured JSON with per-field confidence
 * scores, following the patterns documented in the ML flagship report §6.5.
 */
async function generatePlaceholderExtraction(
  _imageBuffer: Buffer,
): Promise<ExtractionResult> {
  logger.info(
    {},
    'importer_extraction.placeholder_model_no_model_loaded',
  );

  return {
    fields: {},
    confidenceScores: {},
    placeholder: true,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Processes an importer assisted extraction BullMQ job.
 *
 * 1. Load the extraction row; skip if already completed or superseded
 *    (idempotency).
 * 2. Resolve the image URL from the media asset.
 * 3. Download the image with a bounded timeout.
 * 4. Call the (placeholder) extraction service.
 * 5. Store the result via the domain service.
 *
 * The handler never writes to listing drafts — that is the seller's
 * responsibility through the confirmation gate.
 */
export async function processImporterExtraction(
  data: ImporterExtractionJobData,
): Promise<void> {
  const { runId, itemId, mediaAssetId, modelBundleId, modelBundleVersion } = data;

  logger.info(
    { runId, itemId, mediaAssetId, modelBundleId, modelBundleVersion },
    'importerExtraction.job_started',
  );

  // ── 1. Idempotency check ─────────────────────────────────────────────
  const statusResult = await db.query<ExtractionStatusRow>(
    `SELECT extraction_status, item_id FROM catalog_import_extractions
     WHERE id = $1
     LIMIT 1`,
    [runId],
  );

  const extractionRow = statusResult.rows[0];
  const existingStatus = extractionRow?.extraction_status;
  if (!existingStatus) {
    logger.warn(
      { runId, itemId },
      'importerExtraction.extraction_not_found',
    );
    return;
  }

  if (existingStatus === 'completed') {
    logger.info(
      { runId, itemId },
      'importerExtraction.skipped_already_completed',
    );
    return;
  }

  if (existingStatus === 'superseded') {
    logger.info(
      { runId, itemId },
      'importerExtraction.skipped_superseded',
    );
    return;
  }

  // Defense-in-depth: the extraction row must belong to the job's item.
  if (extractionRow.item_id !== itemId) {
    logger.warn(
      { runId, itemId },
      'importerExtraction.item_mismatch',
    );
    return;
  }

  // ── 2. Resolve the image URL (scoped to the item's bound media) ──────
  let imageUrl: string | null = null;
  if (mediaAssetId) {
    imageUrl = await resolveMediaAssetUrl(itemId, mediaAssetId);
  }

  if (!imageUrl) {
    // No media asset or no URL — store an empty completed extraction.
    // This is honest: we cannot extract from a photo we cannot locate.
    logger.warn(
      { runId, itemId, mediaAssetId },
      'importerExtraction.no_image_url',
    );

    await importerExtractionService.processExtractionResult(
      runId,
      {},
      {},
      null,
    );
    return;
  }

  // ── 3. Download the image ────────────────────────────────────────────
  const imageBuffer = await downloadImage(imageUrl);
  if (!imageBuffer) {
    logger.warn(
      { runId, itemId, mediaAssetId },
      'importerExtraction.download_failed',
    );

    await importerExtractionService.processExtractionResult(
      runId,
      {},
      {},
      'image_download_failed',
    );
    return;
  }

  // ── 4. Generate extraction (placeholder) ─────────────────────────────
  const extractionResult = await generatePlaceholderExtraction(imageBuffer);

  // ── 5. Store the result ──────────────────────────────────────────────
  try {
    await importerExtractionService.processExtractionResult(
      runId,
      extractionResult.fields,
      extractionResult.confidenceScores,
      null,
    );

    logger.info(
      {
        runId,
        itemId,
        mediaAssetId,
        modelBundleId,
        modelBundleVersion,
        fieldCount: Object.keys(extractionResult.fields).length,
        placeholder: extractionResult.placeholder,
        byteSize: imageBuffer.length,
      },
      'importerExtraction.stored',
    );
  } catch (err) {
    logger.error(
      {
        runId,
        itemId,
        mediaAssetId,
        err: err instanceof Error ? err.message : String(err),
      },
      'importerExtraction.storage_failed',
    );
    throw err;
  }
}
