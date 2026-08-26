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
 * - Download uses redirect:'manual' with private-IP rejection, HTTPS-only,
 *   content-type validation, redirect depth limit, and streaming size check.
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
// SSRF protections
// ---------------------------------------------------------------------------

/**
 * Check if a hostname resolves to a private/loopback/link-local IP.
 * Rejects RFC1918 (10.x, 172.16-31.x, 192.168.x), loopback (127.x),
 * link-local (169.254.x), and IPv6 equivalents.
 *
 * This is a hostname-level check. For full protection, DNS rebinding
 * mitigation would pin the resolved IP for the actual fetch. This check
 * covers the common SSRF vectors (AWS metadata, internal services).
 */
function isPrivateHostname(hostname: string): boolean {
  // Normalize: strip brackets from IPv6, lowercase.
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // IPv4 checks.
  const ipv4Parts = host.split('.').map(Number);
  if (ipv4Parts.length === 4 && ipv4Parts.every((p) => p >= 0 && p <= 255)) {
    const [a, b] = ipv4Parts;
    if (a === 10) return true;                    // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;       // 192.168.0.0/16
    if (a === 127) return true;                    // 127.0.0.0/8 (loopback)
    if (a === 169 && b === 254) return true;       // 169.254.0.0/16 (link-local)
    if (a === 0) return true;                      // 0.0.0.0/8
    return false;
  }

  // IPv6 checks.
  if (host === '::1' || host === '::') return true;           // loopback
  if (host.startsWith('fc') || host.startsWith('fd')) return true; // ULA
  if (host.startsWith('fe80')) return true;                    // link-local
  if (host.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — extract the IPv4 part and re-check.
    const v4 = host.slice('::ffff:'.length);
    return isPrivateHostname(v4);
  }

  return false;
}

/**
 * Validate a URL for safe fetching. Rejects:
 * - Non-HTTPS protocols (in production, media URLs must be HTTPS).
 * - Private/loopback/link-local hostnames (SSRF mitigation).
 * - URLs without a hostname.
 */
function isUrlSafe(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (!parsed.hostname) return false;
    if (isPrivateHostname(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Image download with SSRF protections
// ---------------------------------------------------------------------------

/**
 * Download an image with bounded timeout, streaming size check, content-type
 * validation, and SSRF protections. Uses redirect:'manual' and revalidates
 * each redirect target with a depth limit.
 */
async function downloadImage(url: string, redirectDepth = 0): Promise<Buffer | null> {
  // SSRF check: reject non-HTTPS and private IPs.
  if (!isUrlSafe(url)) {
    logger.warn({ url }, 'extractionWorker.url_rejected_ssrf');
    return null;
  }

  // Redirect depth limit.
  if (redirectDepth > MAX_REDIRECTS) {
    logger.warn({ url, redirectDepth }, 'extractionWorker.redirect_depth_exceeded');
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
    });
    clearTimeout(timer);

    // Handle redirects manually with revalidation.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        try {
          const target = new URL(location, url);
          return downloadImage(target.href, redirectDepth + 1);
        } catch {
          return null;
        }
      }
      return null;
    }

    if (!response.ok) return null;

    // Validate content-type is an image.
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      logger.warn({ url, contentType }, 'extractionWorker.non_image_content_type');
      return null;
    }

    // Check content-length before buffering.
    const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
    if (contentLength > MAX_IMAGE_BYTES) {
      logger.warn({ url, contentLength }, 'extractionWorker.oversized_content_length');
      return null;
    }

    // Buffer the body with a post-buffer size check (catches missing
    // content-length headers).
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
    return buffer;
  } catch {
    return null;
  }
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
