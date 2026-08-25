/**
 * Catalogue Import Publication Worker Handler
 *
 * Delegates to the publication saga module which handles the publishBatch
 * flow: creating draft listings from approved canonical candidates, enforcing
 * idempotency, and recording publication outcomes.
 *
 * On error, the handler logs structured details and re-throws so the queue
 * retry mechanism can apply its backoff strategy. The publication module
 * itself is responsible for per-item idempotency and outcome recording.
 *
 * @packageDocumentation
 */

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { publishBatch } from '../../domain/catalogImports/catalogImportPublication.js';
import { enqueueCatalogImportReconcileJob } from '../../lib/queues.js';

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

export interface CatalogImportPublicationJobData {
  batchId: string;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Processes a catalogue import publication job. Loads the batch to resolve
 * the user id, then delegates to publishBatch which handles the full saga.
 */
export async function processCatalogImportPublication(
  data: CatalogImportPublicationJobData,
): Promise<void> {
  const { batchId } = data;

  const batchResult = await db.query<{ user_id: string; status: string }>(
    `SELECT user_id, status FROM catalog_import_batches WHERE id = $1 LIMIT 1`,
    [batchId],
  );

  const batch = batchResult.rows[0];
  if (!batch) {
    logger.warn({ batchId }, 'catalogImportPublication.batch_not_found');
    return;
  }

  logger.info(
    { batchId, userId: batch.user_id, status: batch.status },
    'catalogImportPublication.start',
  );

  try {
    await publishBatch(batch.user_id, batchId);

    logger.info(
      { batchId, userId: batch.user_id },
      'catalogImportPublication.complete',
    );

    // Enqueue reconciliation jobs for any items whose publication outcome is
    // unknown (timeout during listing creation). The publicationKey is the
    // deterministic idempotency key derived from the batch approval revision,
    // matching the key publishBatch would have used for each item.
    const unknownResult = await db.query<{
      id: string;
      approval_revision: string;
    }>(
      `SELECT i.id, b.approval_revision
       FROM catalog_import_items i
       JOIN catalog_import_batches b ON b.id = i.batch_id
       WHERE i.batch_id = $1 AND i.publication_status = 'outcome_unknown'`,
      [batchId],
    );

    for (const row of unknownResult.rows) {
      const publicationKey = `pub_${row.id}_${row.approval_revision}`;
      await enqueueCatalogImportReconcileJob({
        itemId: row.id,
        publicationKey,
      });
    }

    if (unknownResult.rows.length > 0) {
      logger.info(
        { batchId, reconcileCount: unknownResult.rows.length },
        'catalogImportPublication.reconcile_enqueued',
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { batchId, userId: batch.user_id, err: message },
      'catalogImportPublication.failed',
    );
    throw err;
  }
}
