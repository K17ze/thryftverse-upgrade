/**
 * Catalogue Import — Retention Enforcement
 *
 * Enforces the raw-data retention policy for catalogue imports. Raw source
 * snapshots and source URLs are retained for 30 days (the retention window
 * set at batch creation) to allow reprocessing and dispute resolution, then
 * are permanently deleted. Normalised fields, provenance, and the created
 * listings are retained indefinitely.
 *
 * For GDPR deletion requests, `deleteBatchData` performs a full deletion of
 * raw data, media references, and provenance — but does NOT delete the
 * created listings (those are owned by the seller's listings domain and must
 * be deleted through the standard listing deletion flow).
 *
 * Design principles (per blueprint §14):
 * - Raw data has a retention window; normalised data does not.
 * - Deletion is irreversible and logged.
 * - The retention clock starts at batch creation, not at completion.
 */

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';

// ---------------------------------------------------------------------------
// Retention enforcement
// ---------------------------------------------------------------------------

/**
 * Enforce retention for a single batch. If the raw_delete_after timestamp has
 * passed and raw data has not yet been cleaned, this function:
 * - Deletes raw_snapshot_ciphertext from all items in the batch.
 * - Deletes source_url_ciphertext from all media rows for items in the batch.
 *
 * Returns the counts of deleted rows. Keeps normalised_fields, provenance,
 * and the listing data.
 *
 * The "raw data hasn't been cleaned yet" check is performed by testing
 * whether raw_snapshot_ciphertext IS NOT NULL — once cleaned, all rows will
 * have NULL and this function becomes a no-op.
 */
export async function enforceRetention(
  batchId: string,
): Promise<{ deletedRawSnapshots: number; deletedSourceUrls: number }> {
  // Verify the batch exists and the retention window has passed.
  const batchResult = await db.query<{
    raw_delete_after: Date | null;
  }>(
    `SELECT raw_delete_after FROM catalog_import_batches WHERE id = $1 LIMIT 1`,
    [batchId],
  );

  if (batchResult.rows.length === 0) {
    logger.warn(
      { batchId },
      'catalogImport.enforceRetention.batchNotFound',
    );
    return { deletedRawSnapshots: 0, deletedSourceUrls: 0 };
  }

  const rawDeleteAfter = batchResult.rows[0].raw_delete_after;
  if (!rawDeleteAfter) {
    // No retention window set — nothing to enforce.
    return { deletedRawSnapshots: 0, deletedSourceUrls: 0 };
  }

  const now = new Date();
  if (rawDeleteAfter > now) {
    // Retention window has not yet expired.
    return { deletedRawSnapshots: 0, deletedSourceUrls: 0 };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Delete raw snapshots from items — only those that still have data.
    const rawResult = await client.query<{ count: number }>(
      `WITH deleted AS (
         UPDATE catalog_import_items
         SET raw_snapshot_ciphertext = NULL,
             updated_at = NOW()
         WHERE batch_id = $1 AND raw_snapshot_ciphertext IS NOT NULL
         RETURNING id
       )
       SELECT COUNT(*) AS count FROM deleted`,
      [batchId],
    );

    // Delete source URLs from media rows for items in this batch.
    const mediaResult = await client.query<{ count: number }>(
      `WITH deleted AS (
         UPDATE catalog_import_media
         SET source_url_ciphertext = NULL,
             updated_at = NOW()
         WHERE import_item_id IN (
           SELECT id FROM catalog_import_items WHERE batch_id = $1
         )
         AND source_url_ciphertext IS NOT NULL
         RETURNING id
       )
       SELECT COUNT(*) AS count FROM deleted`,
      [batchId],
    );

    await client.query('COMMIT');

    const deletedRawSnapshots = Number(rawResult.rows[0]?.count ?? 0);
    const deletedSourceUrls = Number(mediaResult.rows[0]?.count ?? 0);

    logger.info(
      { batchId, deletedRawSnapshots, deletedSourceUrls },
      'catalogImport.enforceRetention.complete',
    );

    return { deletedRawSnapshots, deletedSourceUrls };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Full batch data deletion (GDPR)
// ---------------------------------------------------------------------------

/**
 * Perform a full deletion of all import data for a batch. This is used for
 * GDPR deletion requests. It deletes:
 * - Raw snapshot ciphertext from items.
 * - Source URL ciphertext from media rows.
 * - All media reference rows for items in the batch.
 * - All field provenance rows for items in the batch.
 * - All catalog import events for the batch.
 *
 * It does NOT delete:
 * - The created listings (those belong to the seller's listings domain and
 *   must be deleted through the standard listing deletion flow).
 * - The batch row itself (retained for audit, with status indicating the
 *   data has been purged).
 * - The normalised_fields on items (retained as the canonical record of what
 *   was published, unless the caller explicitly requests their deletion).
 *
 * This operation is irreversible.
 */
export async function deleteBatchData(batchId: string): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Delete field provenance rows.
    await client.query(
      `DELETE FROM catalog_import_field_provenance
       WHERE import_item_id IN (
         SELECT id FROM catalog_import_items WHERE batch_id = $1
       )`,
      [batchId],
    );

    // Delete media reference rows.
    await client.query(
      `DELETE FROM catalog_import_media
       WHERE import_item_id IN (
         SELECT id FROM catalog_import_items WHERE batch_id = $1
       )`,
      [batchId],
    );

    // Purge raw data from items.
    await client.query(
      `UPDATE catalog_import_items
       SET raw_snapshot_ciphertext = NULL,
           source_url = NULL,
           updated_at = NOW()
       WHERE batch_id = $1`,
      [batchId],
    );

    // Delete catalog import events for the batch.
    await client.query(
      `DELETE FROM catalog_import_events WHERE batch_id = $1`,
      [batchId],
    );

    // Delete publication records for the batch.
    await client.query(
      `DELETE FROM catalog_import_publication_records WHERE batch_id = $1`,
      [batchId],
    );

    // Mark the batch as having its data purged. We keep the batch row for
    // audit but clear the raw_delete_after since the data is already gone.
    await client.query(
      `UPDATE catalog_import_batches
       SET raw_delete_after = NULL,
           status_reason = 'data_purged_gdpr',
           updated_at = NOW()
       WHERE id = $1`,
      [batchId],
    );

    await client.query('COMMIT');

    logger.info(
      { batchId },
      'catalogImport.deleteBatchData.complete',
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Expired batch discovery
// ---------------------------------------------------------------------------

/**
 * Find all batches where the raw retention window has expired and raw data
 * has not yet been cleaned. The "not yet cleaned" check is performed by
 * testing whether any item in the batch still has a non-NULL
 * raw_snapshot_ciphertext AND raw_delete_after < NOW().
 *
 * Returns the batch IDs that need retention enforcement.
 */
export async function findExpiredBatches(): Promise<string[]> {
  const result = await db.query<{ id: string }>(
    `SELECT DISTINCT b.id
     FROM catalog_import_batches b
     INNER JOIN catalog_import_items i ON i.batch_id = b.id
     WHERE b.raw_delete_after IS NOT NULL
       AND b.raw_delete_after < NOW()
       AND i.raw_snapshot_ciphertext IS NOT NULL`,
  );

  return result.rows.map((r) => r.id);
}
