/**
 * Media Embedding Worker Handler
 *
 * Offline, versioned embedding generation for approved media assets.
 *
 * Pipeline:
 *   1. Receive a job with (media_asset_id, image_url, model_id,
 *      model_version, preprocessing_version).
 *   2. Download the image with a bounded timeout.
 *   3. Compute the SHA-256 checksum of the downloaded bytes.
 *   4. Check if an embedding already exists for this
 *      (media_asset_id, model_id, model_version, preprocessing_version,
 *      checksum) — skip if so (idempotency).
 *   5. Call the embedding service. Until a real model is loaded and
 *      benchmarked (Phase 3 GPU work), the service returns a zero vector
 *      and logs that no model is loaded. This is honest: the row is
 *      written with quality_flags.placeholder = true so downstream
 *      consumers never mistake it for a real embedding.
 *   6. Store the embedding in media_embeddings.
 *   7. Log the result.
 *
 * Idempotency:
 * - The primary key is (media_asset_id, model_id, model_version,
 *   preprocessing_version). A replayed job with the same key and checksum
 *   is a no-op. If the checksum differs (asset was re-encoded), the old
 *   row is preserved and a new one is not written — the job logs a
 *   checksum_mismatch and returns, because the image_url may have changed
 *   out from under us. A future migration may add checksum to the PK if
 *   multi-checksum lineage is needed.
 *
 * Anti-AI policy:
 * - This is infrastructure, not a user-facing surface. The placeholder
 *   embedding service is explicitly honest: it returns a zero vector and
 *   sets quality_flags.placeholder = true. No "AI-powered visual search"
 *   claims are made. The existing colour-histogram heuristic
 *   (visualSimilarity.ts) remains the user-facing visual search method
 *   until a real model is benchmarked and promoted via the model artifact
 *   registry.
 *
 * @packageDocumentation
 */

import crypto from 'node:crypto';
import sharp from 'sharp';

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import type { MediaEmbeddingJobData } from '../../lib/queues.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-image download timeout (ms). */
const DOWNLOAD_TIMEOUT_MS = 15_000;
/** Maximum image size we will download (50 MB). */
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
/** Embedding dimensionality for the placeholder model. */
const PLACEHOLDER_DIMENSIONS = 512;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result from the embedding service. */
interface EmbeddingResult {
  /** The embedding vector (float32 values). */
  vector: number[];
  /** Dimensionality of the vector. */
  dimensions: number;
  /** Quality flags from preprocessing + inference. */
  qualityFlags: Record<string, unknown>;
  /** True when no real model was loaded (placeholder zero vector). */
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
// Quality assessment
// ---------------------------------------------------------------------------

/**
 * Lightweight quality assessment of the downloaded image using sharp.
 * Returns flags that are stored alongside the embedding for filtering.
 */
async function assessImageQuality(
  buffer: Buffer,
): Promise<Record<string, unknown>> {
  try {
    const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    return {
      width,
      height,
      format: metadata.format ?? null,
      // Minimum resolution for a usable embedding (256px on the short side).
      min_resolution_met: Math.min(width, height) >= 256,
      // Space for future quality checks: blur, exposure, occlusion.
      // These require a dedicated model or heuristic and are not yet
      // implemented — the flags are present so the schema is ready.
      blur_score: null,
      exposure: null,
      occlusion_detected: null,
    };
  } catch {
    return {
      width: 0,
      height: 0,
      format: null,
      min_resolution_met: false,
      blur_score: null,
      exposure: null,
      occlusion_detected: null,
      decode_failed: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Placeholder embedding service
// ---------------------------------------------------------------------------

/**
 * Placeholder embedding service.
 *
 * Returns a zero vector of PLACEHOLDER_DIMENSIONS. No ML model is loaded.
 * This exists so the offline pipeline, storage, and lineage infrastructure
 * can be built and tested before a real model (e.g. SigLIP 2) is deployed.
 *
 * When a real model is available, replace this function with a call to the
 * model serving endpoint. The model must be registered in the
 * model_artifacts table (migration 144) and its (model_id, model_version)
 * must match the job payload.
 */
async function generatePlaceholderEmbedding(
  qualityFlags: Record<string, unknown>,
): Promise<EmbeddingResult> {
  logger.info(
    { dimensions: PLACEHOLDER_DIMENSIONS },
    'mediaEmbedding.placeholder_model_no_model_loaded',
  );

  const vector = new Array<number>(PLACEHOLDER_DIMENSIONS).fill(0);
  return {
    vector,
    dimensions: PLACEHOLDER_DIMENSIONS,
    qualityFlags: {
      ...qualityFlags,
      placeholder: true,
      model_loaded: false,
    },
    placeholder: true,
  };
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/**
 * Serialise a float32 array into a little-endian BYTEA payload.
 * Each value is written as a 4-byte IEEE 754 float.
 */
function serialiseEmbedding(vector: number[]): Buffer {
  const buffer = Buffer.alloc(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buffer.writeFloatLE(vector[i], i * 4);
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Idempotency check
// ---------------------------------------------------------------------------

interface ExistingEmbeddingRow {
  checksum_sha256: string;
}

/**
 * Check whether an embedding already exists for this
 * (media_asset_id, model_id, model_version, preprocessing_version).
 * Returns the existing checksum if found, null otherwise.
 */
async function findExistingEmbedding(
  mediaAssetId: string,
  modelId: string,
  modelVersion: string,
  preprocessingVersion: string,
): Promise<string | null> {
  const result = await db.query<ExistingEmbeddingRow>(
    `SELECT checksum_sha256
     FROM media_embeddings
     WHERE media_asset_id = $1
       AND model_id = $2
       AND model_version = $3
       AND preprocessing_version = $4
     LIMIT 1`,
    [mediaAssetId, modelId, modelVersion, preprocessingVersion],
  );
  return result.rows[0]?.checksum_sha256 ?? null;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Processes a media embedding BullMQ job.
 *
 * Downloads the image, computes a checksum, checks for an existing
 * embedding, calls the (placeholder) embedding service, and stores the
 * result. The handler is idempotent: re-running with the same input
 * produces the same result without duplicating rows.
 */
export async function processMediaEmbeddingJob(
  data: MediaEmbeddingJobData,
): Promise<void> {
  const { mediaAssetId, imageUrl, modelId, modelVersion, preprocessingVersion } =
    data;

  logger.info(
    { mediaAssetId, modelId, modelVersion, preprocessingVersion },
    'mediaEmbedding.job_started',
  );

  // ── 1. Download the image ────────────────────────────────────────────
  const imageBuffer = await downloadImage(imageUrl);
  if (!imageBuffer) {
    logger.warn(
      { mediaAssetId, modelId, modelVersion },
      'mediaEmbedding.download_failed',
    );
    return;
  }

  // ── 2. Compute SHA-256 checksum ──────────────────────────────────────
  const checksum = crypto.createHash('sha256').update(imageBuffer).digest('hex');

  // ── 3. Idempotency check ─────────────────────────────────────────────
  const existingChecksum = await findExistingEmbedding(
    mediaAssetId,
    modelId,
    modelVersion,
    preprocessingVersion,
  );

  if (existingChecksum !== null) {
    if (existingChecksum === checksum) {
      logger.info(
        { mediaAssetId, modelId, modelVersion, checksumPrefix: checksum.slice(0, 12) },
        'mediaEmbedding.skipped_already_exists',
      );
      return;
    }
    // The asset bytes changed since the last embedding was stored. The old
    // row is preserved (lineage). We do not overwrite — a new model version
    // or explicit re-queue with a different key is required to produce a
    // new row. This prevents silent drift.
    logger.warn(
      {
        mediaAssetId,
        modelId,
        modelVersion,
        existingChecksumPrefix: existingChecksum.slice(0, 12),
        newChecksumPrefix: checksum.slice(0, 12),
      },
      'mediaEmbedding.checksum_mismatch_skipped',
    );
    return;
  }

  // ── 4. Assess image quality ──────────────────────────────────────────
  const qualityFlags = await assessImageQuality(imageBuffer);

  // ── 5. Generate embedding (placeholder) ──────────────────────────────
  const embeddingResult = await generatePlaceholderEmbedding(qualityFlags);

  // ── 6. Serialise and store ───────────────────────────────────────────
  const embeddingBytes = serialiseEmbedding(embeddingResult.vector);

  try {
    await db.query(
      `INSERT INTO media_embeddings (
         media_asset_id, model_id, model_version, preprocessing_version,
         checksum_sha256, dimensions, embedding, generated_at, quality_flags
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8::jsonb)
       ON CONFLICT (media_asset_id, model_id, model_version, preprocessing_version)
       DO NOTHING`,
      [
        mediaAssetId,
        modelId,
        modelVersion,
        preprocessingVersion,
        checksum,
        embeddingResult.dimensions,
        embeddingBytes,
        JSON.stringify(embeddingResult.qualityFlags),
      ],
    );

    logger.info(
      {
        mediaAssetId,
        modelId,
        modelVersion,
        preprocessingVersion,
        dimensions: embeddingResult.dimensions,
        checksumPrefix: checksum.slice(0, 12),
        placeholder: embeddingResult.placeholder,
        byteSize: imageBuffer.length,
      },
      'mediaEmbedding.stored',
    );
  } catch (err) {
    logger.error(
      {
        mediaAssetId,
        modelId,
        modelVersion,
        err: err instanceof Error ? err.message : String(err),
      },
      'mediaEmbedding.storage_failed',
    );
    throw err;
  }
}
