/**
 * Catalogue Import Retention Worker Handler
 *
 * Delegates to the retention enforcement module which purges expired raw
 * source data (encrypted snapshots, source URL ciphertext) after the
 * retention window has elapsed. This ensures the importer does not retain
 * raw provider payloads longer than necessary for audit and reprocessing.
 *
 * @packageDocumentation
 */

import { logger } from '../../lib/logger.js';
import { enforceRetention } from '../../domain/catalogImports/catalogImportRetention.js';

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

export interface CatalogImportRetentionJobData {
  batchId: string;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Processes a catalogue import retention enforcement job. Purges expired raw
 * data for the batch after the retention window has elapsed.
 */
export async function processCatalogImportRetention(
  data: CatalogImportRetentionJobData,
): Promise<void> {
  const { batchId } = data;

  logger.info({ batchId }, 'catalogImportRetention.start');

  try {
    const result = await enforceRetention(batchId);

    logger.info(
      {
        batchId,
        purgedSnapshots: result.deletedRawSnapshots,
        purgedSourceUrls: result.deletedSourceUrls,
      },
      'catalogImportRetention.complete',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { batchId, err: message },
      'catalogImportRetention.failed',
    );
    throw err;
  }
}
