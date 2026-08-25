/**
 * Catalogue Import — Draft-First Publication Saga
 *
 * Implements the publication phase of the catalogue import pipeline. After a
 * batch is approved, the saga creates draft listings (NOT active) for each
 * selected, ready item. Draft-first means the seller can review the final
 * listing before it goes live.
 *
 * Design principles (per blueprint §13):
 * - "Activation should be a transaction per listing, not one database
 *   transaction for forty media-heavy items."
 * - Each listing creation is its own transaction with its own idempotency key.
 * - Unknown outcomes (timeout) are represented as 'outcome_unknown', never
 *   collapsed to 'failed' or 'live'.
 * - The request_hash is computed from the frozen normalised_fields so
 *   reconciliation can prove whether the committed result matches the
 *   intended request.
 */

import crypto from 'node:crypto';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { CatalogImportService, mapItemRow } from './catalogImportService.js';
import type {
  CatalogImportItemRow,
  ItemPublicationStatus,
  PublicationReceiptDTO,
  PublicationReceiptItemDTO,
} from './catalogImportTypes.js';
import { CatalogImportError } from './catalogImportTypes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * Compute a deterministic SHA-256 hash of the frozen normalised_fields. This
 * is stored on the publication record so reconciliation can compare the
 * committed result against the intended request.
 */
function computeRequestHash(normalisedFields: Record<string, unknown>): string {
  const stable = JSON.stringify(normalisedFields, Object.keys(normalisedFields).sort());
  return crypto.createHash('sha256').update(stable).digest('hex');
}

/**
 * Extract the listing-relevant fields from the normalised_fields JSON. The
 * normalised_fields follow the canonical schema shape produced by
 * serialiseCanonicalCandidate.
 */
interface ListingFields {
  title: string;
  description: string;
  priceGbp: number;
  category: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
}

/**
 * Safely extract the `value` property from a canonical listing field stored
 * in the normalised_fields JSONB. Returns the fallback when the field is
 * absent or the value does not match the expected type.
 */
function fieldStringValue(
  fields: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const field = fields[key];
  if (typeof field === 'object' && field !== null && 'value' in field) {
    const value = (field as Record<string, unknown>).value;
    if (typeof value === 'string') {
      return value;
    }
  }
  return fallback;
}

function fieldNumberValue(
  fields: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const field = fields[key];
  if (typeof field === 'object' && field !== null && 'value' in field) {
    const value = (field as Record<string, unknown>).value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return fallback;
}

function fieldNullableStringValue(
  fields: Record<string, unknown>,
  key: string,
): string | null {
  const field = fields[key];
  if (typeof field === 'object' && field !== null && 'value' in field) {
    const value = (field as Record<string, unknown>).value;
    if (value === null || typeof value === 'string') {
      return value;
    }
  }
  return null;
}

function extractListingFields(
  normalisedFields: Record<string, unknown>,
): ListingFields {
  return {
    title: fieldStringValue(normalisedFields, 'title', ''),
    description: fieldStringValue(normalisedFields, 'description', ''),
    priceGbp: fieldNumberValue(normalisedFields, 'price_gbp', 0),
    category: fieldNullableStringValue(normalisedFields, 'category'),
    brand: fieldNullableStringValue(normalisedFields, 'brand'),
    size: fieldNullableStringValue(normalisedFields, 'size'),
    condition: fieldNullableStringValue(normalisedFields, 'condition'),
  };
}

// ---------------------------------------------------------------------------
// Publication saga
// ---------------------------------------------------------------------------

const service = new CatalogImportService();

/**
 * Publish a batch of approved items as draft listings.
 *
 * Steps:
 * 1. Validate the batch is in 'approved' state.
 * 2. Transition the batch to 'publishing'.
 * 3. For each selected, ready item:
 *    a. Create a publication record with a deterministic idempotency key.
 *    b. Compute the request_hash from the frozen normalised_fields.
 *    c. Create a draft listing (status='draft') in its own transaction.
 *    d. Update the item's publication_status to 'draft_created'.
 *    e. On failure: record the error and set 'failed_recoverable'.
 *    f. On ambiguous outcome (timeout): set 'outcome_unknown'.
 * 4. Create a batch receipt with the counts.
 * 5. Transition the batch to 'completed'.
 * 6. Return the receipt DTO.
 */
export async function publishBatch(
  userId: string,
  batchId: string,
): Promise<PublicationReceiptDTO> {
  const batch = await service.getBatch(userId, batchId);

  if (batch.status !== 'approved') {
    throw new CatalogImportError(
      'approval_required_before_publish',
      `Batch must be in "approved" state to publish, but is in "${batch.status}"`,
    );
  }

  const approvalRevision = batch.approval_revision;
  if (!approvalRevision) {
    throw new CatalogImportError(
      'approval_required_before_publish',
      'Batch has no approval revision — cannot publish without a frozen field revision',
    );
  }

  // Transition to publishing.
  await service.updateBatchStatus(userId, batchId, 'publishing', 'publication_started');

  // Fetch all selected, ready items.
  const itemsToPublish: CatalogImportItemRow[] = [];
  let cursor: string | null = null;
  do {
    const page = await service.getBatchItems(batchId, {
      cursor,
      readiness: 'ready',
      decision: 'selected',
      limit: 100,
    });
    itemsToPublish.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);

  const receiptItems: PublicationReceiptItemDTO[] = [];
  let draftCount = 0;
  let failedCount = 0;
  let outcomeUnknownCount = 0;
  let excludedCount = 0;

  for (const item of itemsToPublish) {
    const idempotencyKey = `pub_${item.id}_${approvalRevision}`;

    if (!item.normalised_fields) {
      receiptItems.push({
        itemId: item.id,
        externalItemId: item.external_item_id,
        publicationStatus: 'failed_recoverable',
        draftListingId: null,
        reason: 'No normalised fields to publish',
      });
      failedCount += 1;
      continue;
    }

    const requestHash = computeRequestHash(item.normalised_fields);
    const fields = extractListingFields(item.normalised_fields);

    try {
      const draftListingId = await createDraftListing(
        batchId,
        item,
        idempotencyKey,
        requestHash,
        fields,
      );

      receiptItems.push({
        itemId: item.id,
        externalItemId: item.external_item_id,
        publicationStatus: 'draft_created',
        draftListingId,
        reason: null,
      });
      draftCount += 1;
    } catch (error) {
      const isTimeout = isTimeoutError(error);
      const pubStatus = isTimeout ? 'outcome_unknown' : 'failed_recoverable';
      const reason = error instanceof Error ? error.message : String(error);

      // Record the error on the item.
      await db.query(
        `UPDATE catalog_import_items
         SET publication_status = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [item.id, pubStatus],
      );

      receiptItems.push({
        itemId: item.id,
        externalItemId: item.external_item_id,
        publicationStatus: pubStatus,
        draftListingId: null,
        reason,
      });

      if (isTimeout) {
        outcomeUnknownCount += 1;
      } else {
        failedCount += 1;
      }

      logger.error(
        { batchId, itemId: item.id, err: error, pubStatus },
        'catalogImport.publishBatch.itemFailed',
      );
    }
  }

  // Count items that were not selected for publication as excluded. This
  // includes items the seller explicitly excluded and items that were not
  // ready (needs_input, probable_duplicate, etc.).
  const allItemsSummary = await service.getBatchItemSummary(batchId);
  excludedCount = allItemsSummary.total - itemsToPublish.length;

  // Create the batch receipt.
  const receiptId = createId('rcpt');
  await db.query(
    `INSERT INTO catalog_import_batch_receipts (
       id, batch_id, approval_revision,
       draft_count, failed_count, outcome_unknown_count, excluded_count,
       created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (batch_id, approval_revision) DO NOTHING`,
    [
      receiptId,
      batchId,
      approvalRevision,
      draftCount,
      failedCount,
      outcomeUnknownCount,
      excludedCount,
    ],
  );

  // Transition batch to completed.
  await service.updateBatchStatus(userId, batchId, 'completed', 'publication_complete');

  const receipt: PublicationReceiptDTO = {
    batchId,
    liveCount: 0,
    draftCount,
    excludedCount,
    failedCount,
    outcomeUnknownCount,
    items: receiptItems,
    publishedAt: new Date().toISOString(),
  };

  logger.info(
    { batchId, userId, receiptId, draftCount, failedCount, outcomeUnknownCount },
    'catalogImport.publishBatch.complete',
  );

  return receipt;
}

/**
 * Create a single draft listing in its own transaction. Per blueprint §13,
 * each listing creation is a separate transaction so a failure on one item
 * does not roll back the others.
 */
async function createDraftListing(
  batchId: string,
  item: CatalogImportItemRow,
  idempotencyKey: string,
  requestHash: string,
  fields: ListingFields,
): Promise<string> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Insert the publication record with idempotency. The idempotency_key
    // has a unique constraint so a replayed publish hits the same row.
    const pubRecordId = createId('pubrec');
    const listingId = createId('listing');

    const pubResult = await client.query<{ id: string }>(
      `INSERT INTO catalog_import_publication_records (
         id, batch_id, item_id, idempotency_key, request_hash,
         status, listing_id, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'draft_created', $6, NOW(), NOW())
       ON CONFLICT (idempotency_key) DO UPDATE
         SET updated_at = catalog_import_publication_records.updated_at
       RETURNING id`,
      [pubRecordId, batchId, item.id, idempotencyKey, requestHash, listingId],
    );

    // Create the draft listing in the listings table.
    await client.query(
      `INSERT INTO listings (
         id, seller_id, title, description, price_gbp,
         status, category, brand, size, condition,
         created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, NOW(), NOW())`,
      [
        listingId,
        item.user_id,
        fields.title,
        fields.description,
        fields.priceGbp,
        fields.category,
        fields.brand,
        fields.size,
        fields.condition,
      ],
    );

    // Update the item to reflect the draft listing.
    await client.query(
      `UPDATE catalog_import_items
       SET publication_status = 'draft_created',
           draft_listing_id = $2,
           publication_idempotency_key = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [item.id, listingId, idempotencyKey],
    );

    await client.query('COMMIT');

    logger.info(
      { batchId, itemId: item.id, listingId, pubRecordId: pubResult.rows[0]?.id },
      'catalogImport.createDraftListing',
    );

    return listingId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Determine whether an error represents a timeout / ambiguous outcome rather
 * than a definitive failure. Timeouts produce 'outcome_unknown' because we
 * cannot know whether the listing was created.
 */
function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('timeout') || message.includes('timed out')) {
      return true;
    }
    // pg query_timeout produces a code property on some error shapes.
    const code = (error as { code?: string }).code;
    if (code === '57014' || code === 'QUERY_TIMEOUT') {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Reconcile an item whose publication outcome is unknown (timeout during
 * listing creation). Queries the listing by draft_listing_id, compares the
 * request_hash, and adopts the committed result if it matches.
 *
 * If the listing exists and the hash matches: adopt it (set 'reconciled').
 * If the listing is proven absent: retry the publication.
 * If the listing exists but the hash does not match: leave as
 * 'outcome_unknown' and log a warning (possible race or corruption).
 */
export async function reconcileOutcomeUnknown(itemId: string): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT * FROM catalog_import_items WHERE id = $1 FOR UPDATE LIMIT 1`,
      [itemId],
    );

    const row = result.rows.length > 0 ? mapItemRow(result.rows[0] as Record<string, unknown>) : null;
    if (!row) {
      throw new CatalogImportError('item_not_found', 'Item not found');
    }

    if (row.publication_status !== 'outcome_unknown') {
      logger.info(
        { itemId, status: row.publication_status },
        'catalogImport.reconcileOutcomeUnknown.skipped',
      );
      await client.query('COMMIT');
      return;
    }

    // If a draft_listing_id was set before the timeout, check whether the
    // listing actually exists.
    if (row.draft_listing_id) {
      const listingResult = await client.query<{ id: string }>(
        `SELECT id FROM listings WHERE id = $1 LIMIT 1`,
        [row.draft_listing_id],
      );

      if (listingResult.rows.length > 0) {
        // The listing exists — verify the request_hash matches.
        const pubRecordResult = await client.query<{ request_hash: string }>(
          `SELECT request_hash FROM catalog_import_publication_records
           WHERE item_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [itemId],
        );

        const storedHash = pubRecordResult.rows[0]?.request_hash;
        const currentHash = row.normalised_fields
          ? computeRequestHash(row.normalised_fields)
          : null;

        if (storedHash && currentHash && storedHash === currentHash) {
          // Adopt the committed result.
          await client.query(
            `UPDATE catalog_import_items
             SET publication_status = 'reconciled',
                 updated_at = NOW()
             WHERE id = $1`,
            [itemId],
          );

          logger.info(
            { itemId, draftListingId: row.draft_listing_id },
            'catalogImport.reconcileOutcomeUnknown.adopted',
          );
          await client.query('COMMIT');
          return;
        }

        // Hash mismatch — do not adopt, leave as outcome_unknown for manual
        // investigation.
        logger.warn(
          { itemId, draftListingId: row.draft_listing_id, storedHash, currentHash },
          'catalogImport.reconcileOutcomeUnknown.hashMismatch',
        );
        await client.query('COMMIT');
        return;
      }
    }

    // The listing is proven absent — retry the publication.
    logger.info(
      { itemId },
      'catalogImport.reconcileOutcomeUnknown.retry',
    );

    // Reset to approved so the publication can be retried.
    await client.query(
      `UPDATE catalog_import_items
       SET publication_status = 'approved',
           draft_listing_id = NULL,
           publication_idempotency_key = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [itemId],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Receipt retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieve the publication receipt for a batch. Returns null if no receipt
 * has been created yet.
 */
export async function getPublicationReceipt(
  userId: string,
  batchId: string,
): Promise<PublicationReceiptDTO | null> {
  // Ownership check via the service.
  const batch = await service.getBatch(userId, batchId);

  const receiptResult = await db.query<{
    id: string;
    batch_id: string;
    approval_revision: string;
    draft_count: number;
    failed_count: number;
    outcome_unknown_count: number;
    excluded_count: number;
    created_at: Date;
  }>(
    `SELECT * FROM catalog_import_batch_receipts
     WHERE batch_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [batchId],
  );

  if (receiptResult.rows.length === 0) {
    return null;
  }

  const receiptRow = receiptResult.rows[0];

  // Fetch item-level receipt details.
  const itemsResult = await db.query<{
    id: string;
    external_item_id: string;
    publication_status: string;
    draft_listing_id: string | null;
  }>(
    `SELECT id, external_item_id, publication_status, draft_listing_id
     FROM catalog_import_items
     WHERE batch_id = $1
     ORDER BY id ASC`,
    [batchId],
  );

  const items: PublicationReceiptItemDTO[] = itemsResult.rows.map((r) => ({
    itemId: r.id,
    externalItemId: r.external_item_id,
    publicationStatus: r.publication_status as ItemPublicationStatus,
    draftListingId: r.draft_listing_id,
    reason: null,
  }));

  // Count live listings (status='active' or 'draft' that have been activated).
  const liveResult = await db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM catalog_import_items
     WHERE batch_id = $1 AND publication_status = 'live'`,
    [batchId],
  );
  const liveCount = Number(liveResult.rows[0]?.count ?? 0);

  return {
    batchId: receiptRow.batch_id,
    liveCount,
    draftCount: Number(receiptRow.draft_count),
    excludedCount: Number(receiptRow.excluded_count),
    failedCount: Number(receiptRow.failed_count),
    outcomeUnknownCount: Number(receiptRow.outcome_unknown_count),
    items,
    publishedAt: receiptRow.created_at.toISOString(),
  };
}
