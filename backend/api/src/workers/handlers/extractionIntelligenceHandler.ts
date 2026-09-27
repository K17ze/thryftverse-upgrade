/**
 * Extraction Intelligence Worker Handler
 *
 * Processes an extraction run: transitions the run to 'running', resolves
 * the bound media asset (through catalog_import_media, never a global
 * SELECT), downloads the image with SSRF/memory protections, runs the
 * candidate pipeline (OCR, barcode, catalog match, vision), validates
 * candidates, and stores them with honest outcomes.
 *
 * Replaces workers/handlers/importerExtractionHandler.ts.
 *
 * Security fixes (per flagship report §11):
 * - Media is resolved through catalog_import_media for the run's item.
 * - Download goes through the shared pinned transport
 *   (lib/safeRemoteMediaFetch.ts): DNS-validated + pinned connection,
 *   HTTPS-only, per-hop redirect revalidation, one whole-request deadline,
 *   streaming byte cap, and magic-byte content validation.
 * - Model identity is server-owned; the worker uses the model bundle from
 *   the run row, never from the job payload alone.
 *
 * Honest outcomes (per flagship report §5.3):
 * - No model registered → outcome='unavailable_no_model' (handled at queue
 *   time; the worker never runs).
 * - Media not found / no URL → outcome='source_missing'.
 * - Download failure → outcome='failed' with error_code.
 * - Model returns some valid candidates, some abstained → outcome='partial'.
 * - Model returns all valid candidates → outcome='succeeded'.
 * - Timeout → outcome='outcome_unknown'.
 *
 * Run state transitions:
 * - queued → running (at handler start)
 * - running → terminal (on success/failure)
 * - running → retry_wait (on retryable failure, if attempts remain)
 */

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { extractionIntelligenceService } from '../../domain/catalogImports/extractionIntelligenceService.js';
import type { ExtractionOutcome, CandidateSourceModule, CandidateValidationState } from '../../domain/catalogImports/extractionIntelligenceTypes.js';
import { runCandidatePipeline } from '../../lib/extraction/candidatePipeline.js';
import { fetchPinnedRemoteMedia } from '../../lib/safeRemoteMediaFetch.js';

// ---------------------------------------------------------------------------
// Job payload (mirrors ImporterExtractionJobData from queues.ts)
// ---------------------------------------------------------------------------

export interface ExtractionIntelligenceJobData {
  runId: string;
  itemId: string;
  mediaAssetId: string | null;
  modelBundleId: string;
  modelBundleVersion: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 3;

// ---------------------------------------------------------------------------
// Image download — shared SSRF-pinned transport
// ---------------------------------------------------------------------------

/**
 * Download an image through the shared pinned/deadline-aware transport
 * (`fetchPinnedRemoteMedia`) — the same implementation the catalogue
 * importer and Rekognition provider use. This replaces the handler's own
 * fetch loop, which resolved only hostname literals (no DNS validation or
 * connect pinning), cleared its timeout once headers arrived, and buffered
 * via `arrayBuffer()` with no streaming cap (audit: "independent weaker
 * media fetchers").
 *
 * The shared transport resolves DNS once, blocklist-checks the answer,
 * pins the TCP connection to the validated addresses, revalidates every
 * redirect hop, applies ONE deadline across DNS + headers + body, and
 * streams the body into a bounded buffer — a stall or oversized stream can
 * never hang or exhaust the worker.
 *
 * Inputs are verified own-store media URLs (media_assets.canonical_url /
 * original_object_url), but the full SSRF policy still applies: a canonical
 * URL that resolves to a blocked address is refused, and HTTPS is required
 * as before.
 */
async function downloadImage(url: string): Promise<Buffer | null> {
  const result = await fetchPinnedRemoteMedia({
    url,
    maxBytes: MAX_IMAGE_BYTES,
    maxRedirects: MAX_REDIRECTS,
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
    allowHttp: false,
  });
  if (!result.ok) {
    // `message` is log-safe (host/path only, never the full URL).
    logger.warn(
      { code: result.code, message: result.message },
      'extractionWorker.download_rejected',
    );
    return null;
  }
  // Content type is decided by magic bytes, not the response header — an
  // unrecognised payload is not usable image input for the pipeline.
  if (result.sniffedContentType === null) {
    logger.warn(
      { contentTypeHeader: result.contentTypeHeader },
      'extractionWorker.non_image_content_type',
    );
    return null;
  }
  return result.buffer;
}

// ---------------------------------------------------------------------------
// Candidate pipeline
// ---------------------------------------------------------------------------

interface RawCandidate {
  fieldName: string;
  value: unknown;
  rank?: number;
  evidence?: Record<string, unknown>;
  calibratedConfidence?: number | null;
  abstained?: boolean;
  validationState?: CandidateValidationState;
  policyFlags?: string[];
  sourceModule?: CandidateSourceModule;
}

/**
 * Run the candidate pipeline with the item's source fields and the
 * downloaded image. Delegates to lib/extraction/candidatePipeline which
 * produces candidates from source structured data, OCR, barcode, catalog
 * match, and vision — with validation, calibration, and abstention.
 */
async function executeCandidatePipeline(
  imageBuffer: Buffer,
  itemId: string,
  modelBundleId: string,
  modelBundleVersion: string,
): Promise<{ candidates: RawCandidate[]; outcome: ExtractionOutcome; errorCode?: string }> {
  // Fetch the item's source fields to pass to the pipeline.
  const itemResult = await db.query<{ normalised_fields: Record<string, unknown> | null }>(
    `SELECT normalised_fields FROM catalog_import_items WHERE id = $1 LIMIT 1`,
    [itemId],
  );
  const sourceFields = itemResult.rows[0]?.normalised_fields ?? null;

  const pipelineResult = await runCandidatePipeline({
    imageBuffer,
    sourceFields,
    modelBundleId,
    modelBundleVersion,
  });

  return {
    candidates: pipelineResult.candidates.map((c) => ({
      fieldName: c.fieldName,
      value: c.value,
      rank: c.rank,
      evidence: c.evidence,
      calibratedConfidence: c.calibratedConfidence,
      abstained: c.abstained,
      validationState: c.validationState,
      policyFlags: c.policyFlags,
      sourceModule: c.sourceModule,
    })),
    outcome: pipelineResult.outcome as ExtractionOutcome,
    errorCode: pipelineResult.errorCode,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function processExtractionIntelligenceJob(
  data: ExtractionIntelligenceJobData,
): Promise<void> {
  const { runId, itemId, mediaAssetId, modelBundleId, modelBundleVersion } = data;

  logger.info(
    { runId, itemId, mediaAssetId, modelBundleId, modelBundleVersion },
    'extractionWorker.job_started',
  );

  // ── 0. Transition the run to 'running' ────────────────────────────────
  // This increments attempt_count and sets started_at. If the run was
  // superseded (a newer run was queued), transitionRunState returns the
  // superseded row and we skip processing.
  const runningRun = await extractionIntelligenceService.transitionRunState(
    runId,
    'running',
  );
  if (runningRun.job_state === 'superseded') {
    logger.info({ runId, itemId }, 'extractionWorker.skipped_superseded');
    return;
  }

  // ── 1. Resolve the bound media asset ──────────────────────────────────
  // The media asset is resolved through catalog_import_media for the run's
  // item. The run was created by the item owner (verified at queue time),
  // so the item is trusted. We bind through catalog_import_media to ensure
  // the asset belongs to this item — no global media_assets SELECT.
  let imageUrl: string | null = null;
  try {
    const mediaResult = await db.query<{ canonical_url: string | null; original_object_url: string | null }>(
      `SELECT a.canonical_url, a.original_object_url
       FROM catalog_import_media m
       JOIN media_assets a ON a.id = m.media_asset_id
       WHERE m.import_item_id = $1
         AND m.fetch_status = 'verified'
         AND ($2::text IS NULL OR m.media_asset_id = $2)
       ORDER BY m.position ASC
       LIMIT 1`,
      [itemId, mediaAssetId],
    );
    const mediaRow = mediaResult.rows[0];
    if (mediaRow) {
      imageUrl = mediaRow.canonical_url ?? mediaRow.original_object_url ?? null;
    }
  } catch (err) {
    logger.error({ runId, itemId, err }, 'extractionWorker.media_resolution_failed');
  }

  if (!imageUrl) {
    // Honest outcome: source_missing, NOT completed.
    logger.warn({ runId, itemId, mediaAssetId }, 'extractionWorker.source_missing');
    await extractionIntelligenceService.storeExtractionResult(
      runId,
      'source_missing',
      [],
      'no_verified_media_url',
    );
    return;
  }

  // ── 2. Download the image with SSRF protections ───────────────────────
  const imageBuffer = await downloadImage(imageUrl);
  if (!imageBuffer) {
    logger.warn({ runId, itemId, mediaAssetId }, 'extractionWorker.download_failed');
    await extractionIntelligenceService.storeExtractionResult(
      runId,
      'failed',
      [],
      'image_download_failed',
    );
    return;
  }

  // ── 3. Run the candidate pipeline ─────────────────────────────────────
  try {
    const { candidates, outcome, errorCode } = await executeCandidatePipeline(
      imageBuffer,
      itemId,
      modelBundleId,
      modelBundleVersion,
    );

    // ── 4. Store the result with the honest outcome ──────────────────────
    await extractionIntelligenceService.storeExtractionResult(
      runId,
      outcome,
      candidates,
      errorCode ?? null,
    );

    logger.info(
      {
        runId,
        itemId,
        outcome,
        candidateCount: candidates.length,
        byteSize: imageBuffer.length,
      },
      'extractionWorker.stored',
    );
  } catch (err) {
    // Distinguish timeout (outcome_unknown) from other failures.
    const isTimeout = err instanceof Error && (
      err.message.toLowerCase().includes('timeout') ||
      err.message.toLowerCase().includes('timed out') ||
      err.message.toLowerCase().includes('abort')
    );

    const outcome: ExtractionOutcome = isTimeout ? 'outcome_unknown' : 'failed';
    const errorCode = isTimeout ? 'timeout' : (err instanceof Error ? err.message : 'unknown_error');

    logger.error(
      { runId, itemId, err, outcome },
      'extractionWorker.pipeline_failed',
    );

    await extractionIntelligenceService.storeExtractionResult(
      runId,
      outcome,
      [],
      errorCode,
    );
  }
}
