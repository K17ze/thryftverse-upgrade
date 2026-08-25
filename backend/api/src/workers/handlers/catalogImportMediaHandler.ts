/**
 * Catalogue Import Media Ingestion Worker Handler
 *
 * Fetches remote media referenced by an imported catalogue item, validates
 * it through the SSRF-safe remote import pipeline, uploads the verified
 * buffer to S3, creates the authoritative upload_finalization and media_asset
 * rows, and enqueues the existing media processing pipeline for derivative
 * generation and moderation.
 *
 * Security:
 * - Remote URLs are fetched through ingestRemoteMedia, which enforces
 *   HTTPS-only, DNS blocklist checks, redirect revalidation, content-length
 *   caps, and magic-byte MIME sniffing.
 * - SSRF blocks quarantine the media row; the source URL is never logged.
 *
 * Idempotency:
 * - If the media row is already 'verified', the handler is a no-op.
 * - upload_finalization and media_asset inserts use ON CONFLICT DO NOTHING /
 *   DO UPDATE so a replayed job does not duplicate authoritative rows.
 *
 * @packageDocumentation
 */

import crypto from 'node:crypto';

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { config } from '../../config.js';
import { putBinaryObject } from '../../lib/s3.js';
import { mediaKindForContentType } from '../../lib/mediaLifecycle.js';
import { enqueueMediaIngestJob } from '../../lib/queues.js';
import {
  ingestRemoteMedia,
  type IngestRemoteMediaResult,
} from '../../lib/media/remoteImport.js';
import type {
  CatalogImportMediaRow,
  MediaFetchStatus,
} from '../../domain/catalogImports/catalogImportTypes.js';

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

export interface CatalogImportMediaJobData {
  mediaId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FETCH_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Media row query
// ---------------------------------------------------------------------------

const MEDIA_SELECT_COLUMNS = `
  id, import_item_id, position, external_media_id,
  source_url_ciphertext, fetch_status,
  attempt_count, last_error_code,
  sha256, perceptual_hash, sniffed_mime_type,
  byte_size, width, height,
  media_asset_id, finalization_id,
  moderation_status, publishability,
  source_url_delete_after,
  created_at, updated_at
`;

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function isSsrfBlock(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('SSRF_BLOCKED');
}

// ---------------------------------------------------------------------------
// Fetch failure recording
// ---------------------------------------------------------------------------

async function recordFetchFailure(
  mediaId: string,
  currentAttempts: number,
  errorCode: string,
): Promise<void> {
  const newAttempts = currentAttempts + 1;
  const newStatus: MediaFetchStatus =
    newAttempts >= MAX_FETCH_ATTEMPTS ? 'quarantined' : 'failed';

  await db.query(
    `UPDATE catalog_import_media
     SET fetch_status = $2,
         attempt_count = $3,
         last_error_code = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [mediaId, newStatus, newAttempts, errorCode],
  );
}

async function recordSsrfQuarantine(mediaId: string): Promise<void> {
  await db.query(
    `UPDATE catalog_import_media
     SET fetch_status = 'quarantined',
         last_error_code = 'ssrf_blocked',
         updated_at = NOW()
     WHERE id = $1`,
    [mediaId],
  );
}

// ---------------------------------------------------------------------------
// Authoritative media creation
// ---------------------------------------------------------------------------

interface ItemContextRow {
  user_id: string;
  batch_id: string;
  external_item_id: string;
}

/**
 * Upload the verified buffer to S3, create the upload_finalization and
 * media_asset rows, link them back to the catalog_import_media row, and
 * enqueue the media processing pipeline.
 */
async function createAuthoritativeMedia(
  media: CatalogImportMediaRow,
  itemContext: ItemContextRow,
  result: IngestRemoteMediaResult,
): Promise<void> {
  const objectKey = `catalog-import/${itemContext.batch_id}/${media.import_item_id}/${media.id}`;
  const fileName = `${media.id}.${result.mimeType.split('/')[1] ?? 'bin'}`;

  // Upload to S3.
  const publicUrl = await putBinaryObject(
    objectKey,
    result.buffer,
    result.mimeType,
  );

  const finalizationId = `ufin_${crypto.randomUUID()}`;
  const mediaAssetId = `masset_${crypto.randomUUID()}`;
  const mediaKind = mediaKindForContentType(result.mimeType);

  // Create upload_finalization row.
  await db.query(
    `INSERT INTO upload_finalizations (
       id, object_key, bucket, owner_id, folder,
       file_name, content_type, size_bytes, public_url,
       status, scope, scope_ref_id,
       head_checked_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'finalized', 'listing_media', $10, NOW())
     ON CONFLICT DO NOTHING`,
    [
      finalizationId,
      objectKey,
      config.s3Bucket,
      itemContext.user_id,
      'catalog-import',
      fileName,
      result.mimeType,
      result.byteSize,
      publicUrl,
      media.import_item_id,
    ],
  );

  // Create media_asset row.
  await db.query(
    `INSERT INTO media_assets (
       id, upload_finalization_id, owner_id, bucket, object_key,
       file_name, intended_purpose, media_kind,
       declared_content_type, declared_size_bytes,
       detected_content_type, detected_size_bytes,
       checksum_sha256, original_object_url,
       status, scan_status, moderation_status, processing_status
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14,
       'integrity_verified', 'pending', 'pending', 'pending'
     )
     ON CONFLICT (upload_finalization_id)
     DO UPDATE SET
       intended_purpose = EXCLUDED.intended_purpose
     RETURNING id`,
    [
      mediaAssetId,
      finalizationId,
      itemContext.user_id,
      config.s3Bucket,
      objectKey,
      fileName,
      'catalog_import',
      mediaKind,
      result.mimeType,
      result.byteSize,
      result.mimeType,
      result.byteSize,
      result.sha256,
      publicUrl,
    ],
  );

  // Link the finalization back to the media asset.
  await db.query(
    `UPDATE upload_finalizations
     SET media_asset_id = $2
     WHERE id = $1 AND media_asset_id IS DISTINCT FROM $2`,
    [finalizationId, mediaAssetId],
  );

  // Update the catalog_import_media row.
  await db.query(
    `UPDATE catalog_import_media
     SET fetch_status = 'verified',
         sha256 = $2,
         sniffed_mime_type = $3,
         byte_size = $4,
         width = $5,
         height = $6,
         media_asset_id = $7,
         finalization_id = $8,
         moderation_status = 'pending',
         publishability = 'pending',
         updated_at = NOW()
     WHERE id = $1`,
    [
      media.id,
      result.sha256,
      result.mimeType,
      result.byteSize,
      result.width,
      result.height,
      mediaAssetId,
      finalizationId,
    ],
  );

  // Enqueue the media processing pipeline for derivatives + moderation.
  await enqueueMediaIngestJob({
    assetId: mediaAssetId,
    reason: 'catalog_import_media_verified',
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Processes a catalogue import media ingestion job. Fetches the remote media,
 * validates it, creates the authoritative media asset, and enqueues the
 * processing pipeline.
 */
export async function processCatalogImportMedia(
  data: CatalogImportMediaJobData,
): Promise<void> {
  const { mediaId } = data;

  const mediaResult = await db.query<CatalogImportMediaRow>(
    `SELECT ${MEDIA_SELECT_COLUMNS}
     FROM catalog_import_media
     WHERE id = $1
     LIMIT 1`,
    [mediaId],
  );

  const media = mediaResult.rows[0];
  if (!media) {
    logger.warn({ mediaId }, 'catalogImportMedia.media_not_found');
    return;
  }

  // Idempotency: skip if already verified.
  if (media.fetch_status === 'verified') {
    logger.info(
      { mediaId, fetchStatus: media.fetch_status },
      'catalogImportMedia.skipped_already_verified',
    );
    return;
  }

  // Quarantined media is not retried automatically.
  if (media.fetch_status === 'quarantined') {
    logger.info(
      { mediaId, fetchStatus: media.fetch_status },
      'catalogImportMedia.skipped_quarantined',
    );
    return;
  }

  const sourceUrl = media.source_url_ciphertext;
  if (!sourceUrl) {
    logger.warn(
      { mediaId },
      'catalogImportMedia.no_source_url',
    );
    await recordFetchFailure(mediaId, media.attempt_count, 'no_source_url');
    return;
  }

  // Load the item context for ownership.
  const itemResult = await db.query<ItemContextRow>(
    `SELECT i.user_id, i.batch_id, i.external_item_id
     FROM catalog_import_items i
     WHERE i.id = $1
     LIMIT 1`,
    [media.import_item_id],
  );

  const itemContext = itemResult.rows[0];
  if (!itemContext) {
    logger.warn(
      { mediaId, importItemId: media.import_item_id },
      'catalogImportMedia.item_not_found',
    );
    return;
  }

  // Mark as fetching.
  await db.query(
    `UPDATE catalog_import_media
     SET fetch_status = 'fetching',
         updated_at = NOW()
     WHERE id = $1
       AND fetch_status NOT IN ('verified', 'quarantined')`,
    [mediaId],
  );

  try {
    const result = await ingestRemoteMedia({
      url: sourceUrl,
      importMediaId: mediaId,
    });

    await createAuthoritativeMedia(media, itemContext, result);

    logger.info(
      {
        mediaId,
        importItemId: media.import_item_id,
        mimeType: result.mimeType,
        byteSize: result.byteSize,
        width: result.width,
        height: result.height,
        sha256Prefix: result.sha256.slice(0, 12),
      },
      'catalogImportMedia.verified',
    );
  } catch (err) {
    if (isSsrfBlock(err)) {
      await recordSsrfQuarantine(mediaId);
      logger.warn(
        { mediaId, importItemId: media.import_item_id },
        'catalogImportMedia.ssrf_blocked',
      );
      return;
    }

    const errorCode = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    await recordFetchFailure(mediaId, media.attempt_count, errorCode);

    logger.warn(
      {
        mediaId,
        importItemId: media.import_item_id,
        attemptCount: media.attempt_count + 1,
        errorCode,
      },
      'catalogImportMedia.fetch_failed',
    );
  }
}
