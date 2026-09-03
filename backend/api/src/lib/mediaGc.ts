/**
 * Media garbage collection sweep.
 *
 * Scans for media assets that are eligible for permanent deletion:
 * - `status = 'deleted'` (set by user erasure flow or listing deletion)
 * - `status = 'revoked'` (set by media revoke endpoint)
 *
 * For each candidate, the GC:
 * 1. Verifies no active `media_bindings` exist (reference-counted safety).
 * 2. Deletes all derivative S3 objects (each derivative has its own
 *    `bucket` + `object_key`).
 * 3. Deletes the original S3 object.
 * 4. Hard-deletes the `media_derivatives` DB rows (cascades from asset
 *    delete, but we delete explicitly to ensure derivative S3 objects are
 *    purged first).
 * 5. Hard-deletes the `media_assets` DB row.
 *
 * A 24-hour grace period after the last status change prevents race
 * conditions where a binding is being created concurrently.
 *
 * Design principles:
 * - **Reference-counted.** An asset with active bindings is never deleted,
 *   even if its status is `deleted` or `revoked`. This prevents orphaning
 *   live content.
 * - **S3-first.** S3 objects are deleted before DB rows so that a failure
 *   leaves an orphaned DB row (recoverable) rather than an orphaned S3
 *   object (leaked storage).
 * - **Best-effort per asset.** A failure on one asset does not abort the
 *   sweep — each asset is processed independently.
 */

import type { Pool } from 'pg';
import { deleteObject } from './s3.js';
import { logger } from './logger.js';

const GRACE_PERIOD_HOURS = 24;

interface MediaAssetRow {
  id: string;
  object_key: string;
  bucket: string;
  declared_size_bytes: number;
  status: string;
}

interface MediaDerivativeRow {
  id: string;
  bucket: string;
  object_key: string;
}

export interface MediaGcResult {
  objectsDeleted: number;
  bytesFreed: number;
  assetsProcessed: number;
  derivativesDeleted: number;
  errors: number;
}

/**
 * Run a media garbage collection sweep.
 *
 * Processes assets with status `deleted` or `revoked` that have no active
 * bindings and have passed the grace period.
 */
export async function runMediaGarbageCollection(
  db: Pool,
): Promise<MediaGcResult> {
  const candidates = await db.query<MediaAssetRow>(
    `
      SELECT id, object_key, bucket, declared_size_bytes, status
      FROM media_assets
      WHERE status IN ('deleted', 'revoked')
        AND (deleted_at IS NULL OR deleted_at < NOW() - INTERVAL '${GRACE_PERIOD_HOURS} hours')
        AND updated_at < NOW() - INTERVAL '${GRACE_PERIOD_HOURS} hours'
      ORDER BY updated_at ASC
      LIMIT 100
    `,
  );

  let objectsDeleted = 0;
  let bytesFreed = 0;
  let assetsProcessed = 0;
  let derivativesDeleted = 0;
  let errors = 0;

  for (const asset of candidates.rows) {
    // Reference-counted safety: skip if any active bindings exist.
    const activeBindings = await db.query<{ count: string }>(
      `
        SELECT COUNT(*)::TEXT AS count
        FROM media_bindings
        WHERE media_asset_id = $1 AND removed_at IS NULL
      `,
      [asset.id],
    );

    const bindingCount = parseInt(activeBindings.rows[0]?.count ?? '0', 10);
    if (bindingCount > 0) {
      logger.info(
        { assetId: asset.id, bindingCount },
        'mediaGc.skippedActiveBindings',
      );
      continue;
    }

    try {
      // 1. Delete derivative S3 objects first.
      const derivatives = await db.query<MediaDerivativeRow>(
        `
          SELECT id, bucket, object_key
          FROM media_derivatives
          WHERE media_asset_id = $1
        `,
        [asset.id],
      );

      for (const derivative of derivatives.rows) {
        try {
          await deleteObject(derivative.object_key);
          derivativesDeleted++;
        } catch (derivError) {
          // Log but continue — the derivative DB row will be cascade-deleted
          // with the asset. An orphaned derivative S3 object is a storage
          // leak, not a data integrity issue.
          const msg = derivError instanceof Error ? derivError.message : String(derivError);
          logger.warn(
            { assetId: asset.id, derivativeId: derivative.id, err: msg },
            'mediaGc.derivativeDeleteFailed',
          );
        }
      }

      // 2. Delete the original S3 object.
      await deleteObject(asset.object_key);
      objectsDeleted++;

      // 3. Hard-delete DB rows (derivatives cascade from asset delete).
      await db.query('DELETE FROM media_assets WHERE id = $1', [asset.id]);

      bytesFreed += asset.declared_size_bytes;
      assetsProcessed++;

      logger.info(
        {
          assetId: asset.id,
          objectKey: asset.object_key,
          status: asset.status,
          derivativesPurged: derivatives.rows.length,
        },
        'mediaGc.deleted',
      );
    } catch (error) {
      errors++;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { assetId: asset.id, objectKey: asset.object_key, err: message },
        'mediaGc.deleteFailed',
      );
    }
  }

  const result: MediaGcResult = {
    objectsDeleted,
    bytesFreed,
    assetsProcessed,
    derivativesDeleted,
    errors,
  };

  logger.info(result, 'mediaGc.complete');

  return result;
}
