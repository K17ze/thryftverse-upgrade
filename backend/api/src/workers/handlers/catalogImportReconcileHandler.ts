/**
 * Catalogue Import Reconciliation Worker Handler
 *
 * Reconciles items whose publication outcome is unknown (timeout during
 * listing creation). Delegates to the publication saga's
 * `reconcileOutcomeUnknown` which queries the listing by draft_listing_id,
 * compares the request_hash, and either adopts the committed result or
 * resets the item so publication can be retried.
 *
 * The `publicationKey` is the deterministic idempotency key
 * (`pub_{itemId}_{approvalRevision}`) used both for job deduplication and to
 * prove which publication attempt is being reconciled.
 *
 * Idempotency: `reconcileOutcomeUnknown` is a no-op when the item is no
 * longer in the 'outcome_unknown' state, so replayed jobs are safe.
 *
 * @packageDocumentation
 */

import { logger } from '../../lib/logger.js';
import { reconcileOutcomeUnknown } from '../../domain/catalogImports/catalogImportPublication.js';

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

export interface CatalogImportReconcileJobData {
  itemId: string;
  publicationKey: string;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Processes a catalogue import reconciliation job for a single item whose
 * publication outcome is unknown. Adopts the committed listing if it exists
 * and the request hash matches, otherwise resets the item for a publication
 * retry.
 */
export async function processCatalogImportReconcile(
  data: CatalogImportReconcileJobData,
): Promise<void> {
  const { itemId, publicationKey } = data;

  logger.info({ itemId, publicationKey }, 'catalogImportReconcile.start');

  try {
    await reconcileOutcomeUnknown(itemId);

    logger.info(
      { itemId, publicationKey },
      'catalogImportReconcile.complete',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { itemId, publicationKey, err: message },
      'catalogImportReconcile.failed',
    );
    throw err;
  }
}
