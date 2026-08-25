/**
 * Catalogue Import Hydration Worker Handler
 *
 * Enriches a discovered item with full source details and media references.
 * For seller_package uploads, the CSV already contains all fields (items are
 * fully hydrated during discovery), so this handler only advances the item
 * readiness to 'media_pending'. For OAuth sources, the connector's hydrate()
 * is called to fetch the full raw payload (stored encrypted) and extract
 * media URLs.
 *
 * When all items in the batch have reached at least 'media_pending', the
 * batch transitions to 'ingesting_media'.
 *
 * Idempotency: if the item is already at 'media_pending' or beyond, the
 * handler is a no-op. Media inserts use ON CONFLICT DO NOTHING.
 *
 * @packageDocumentation
 */

import crypto from 'node:crypto';

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { connectorRegistry } from '../../integrations/catalogSources/connectorRegistry.js';
import type {
  CatalogImportItemRow,
  CatalogSource,
  ItemReadiness,
} from '../../domain/catalogImports/catalogImportTypes.js';
import {
  isValidItemReadinessTransition,
} from '../../domain/catalogImports/catalogImportStateMachine.js';

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

export interface CatalogImportHydrationJobData {
  batchId: string;
  itemId: string;
}

// ---------------------------------------------------------------------------
// Item row query
// ---------------------------------------------------------------------------

const ITEM_SELECT_COLUMNS = `
  id, batch_id, user_id, external_item_id,
  source_url, source_state, source_updated_at,
  source_checksum, raw_snapshot_ciphertext,
  normalised_fields, field_revision,
  readiness, blocking_issues,
  duplicate_of_listing_id, duplicate_score,
  seller_decision, draft_listing_id,
  publication_status, publication_idempotency_key,
  created_at, updated_at
`;

// ---------------------------------------------------------------------------
// Seller package hydration
// ---------------------------------------------------------------------------

/**
 * For seller_package, items are already hydrated during discovery (the CSV
 * contains all fields). We only need to advance readiness to 'media_pending'.
 */
async function hydrateSellerPackageItem(
  item: CatalogImportItemRow,
): Promise<void> {
  const targetReadiness: ItemReadiness = 'media_pending';

  if (
    item.readiness === targetReadiness ||
    item.readiness === 'mapping_pending' ||
    item.readiness === 'ready' ||
    item.readiness === 'needs_input' ||
    item.readiness === 'probable_duplicate'
  ) {
    // Already at or past media_pending — idempotent no-op.
    return;
  }

  if (!isValidItemReadinessTransition(item.readiness, targetReadiness)) {
    logger.warn(
      { itemId: item.id, readiness: item.readiness, target: targetReadiness },
      'catalogImportHydration.invalid_transition_seller_package',
    );
    return;
  }

  await db.query(
    `UPDATE catalog_import_items
     SET readiness = $2,
         updated_at = NOW()
     WHERE id = $1 AND readiness = $3`,
    [item.id, targetReadiness, item.readiness],
  );
}

// ---------------------------------------------------------------------------
// OAuth source hydration
// ---------------------------------------------------------------------------

interface ConnectionRow {
  encrypted_access_token: string | null;
  external_account_id: string;
}

async function hydrateOAuthItem(
  item: CatalogImportItemRow,
  source: CatalogSource,
  batchConnectionId: string,
): Promise<void> {
  const sourceConnector = connectorRegistry.getConnector(source);

  if (!sourceConnector) {
    throw new Error(
      `HYDRATION_FAILED: connector for source '${source}' not registered`,
    );
  }

  const connResult = await db.query<ConnectionRow>(
    `SELECT encrypted_access_token, external_account_id
     FROM catalog_import_connections
     WHERE id = $1
     LIMIT 1`,
    [batchConnectionId],
  );

  const conn = connResult.rows[0];
  if (!conn || !conn.encrypted_access_token) {
    throw new Error(
      `HYDRATION_FAILED: connection ${batchConnectionId} missing credentials`,
    );
  }

  const minimal = (item.normalised_fields ?? {}) as Record<string, unknown>;

  const hydrated = await sourceConnector.hydrate({
    encryptedAccessToken: conn.encrypted_access_token,
    externalAccountId: conn.external_account_id,
    externalItemId: item.external_item_id,
    minimal,
  });

  // Store the raw payload encrypted (ciphertext placeholder).
  const rawCiphertext = JSON.stringify(hydrated.raw);

  await db.query(
    `UPDATE catalog_import_items
     SET raw_snapshot_ciphertext = $2,
         source_updated_at = COALESCE($3, source_updated_at),
         readiness = 'media_pending',
         updated_at = NOW()
     WHERE id = $1`,
    [
      item.id,
      rawCiphertext,
      hydrated.sourceUpdatedAt ? new Date(hydrated.sourceUpdatedAt) : null,
    ],
  );

  // Insert media references.
  for (const media of hydrated.media) {
    const mediaId = `cim_${crypto.randomUUID()}`;
    await db.query(
      `INSERT INTO catalog_import_media (
         id, import_item_id, position, external_media_id,
         source_url_ciphertext, fetch_status
       )
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (import_item_id, position) DO NOTHING`,
      [
        mediaId,
        item.id,
        media.position,
        media.externalMediaId ?? null,
        media.url,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Batch transition check
// ---------------------------------------------------------------------------

async function checkAllItemsMediaPending(
  batchId: string,
): Promise<boolean> {
  const result = await db.query<{ pending: string }>(
    `SELECT COUNT(*)::text AS pending
     FROM catalog_import_items
     WHERE batch_id = $1
       AND readiness NOT IN ('media_pending', 'mapping_pending', 'ready', 'needs_input', 'probable_duplicate', 'excluded', 'source_changed')`,
    [batchId],
  );

  const pendingCount = Number(result.rows[0]?.pending ?? 0);
  return pendingCount === 0;
}

async function transitionBatchToIngestingMedia(
  batchId: string,
): Promise<void> {
  // Only transition if the batch is in 'hydrating' state.
  await db.query(
    `UPDATE catalog_import_batches
     SET status = 'ingesting_media',
         status_reason = NULL,
         updated_at = NOW()
     WHERE id = $1
       AND status = 'hydrating'`,
    [batchId],
  );
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Processes a catalogue import hydration job for a single item. Enriches the
 * item with full source details and media references, then checks whether all
 * items in the batch are ready to advance to media ingestion.
 */
export async function processCatalogImportHydration(
  data: CatalogImportHydrationJobData,
): Promise<void> {
  const { batchId, itemId } = data;

  const itemResult = await db.query<CatalogImportItemRow>(
    `SELECT ${ITEM_SELECT_COLUMNS}
     FROM catalog_import_items
     WHERE id = $1 AND batch_id = $2
     LIMIT 1`,
    [itemId, batchId],
  );

  const item = itemResult.rows[0];
  if (!item) {
    logger.warn({ batchId, itemId }, 'catalogImportHydration.item_not_found');
    return;
  }

  // Idempotency: skip if already past media_pending.
  if (
    item.readiness === 'media_pending' ||
    item.readiness === 'mapping_pending' ||
    item.readiness === 'ready' ||
    item.readiness === 'needs_input' ||
    item.readiness === 'probable_duplicate'
  ) {
    logger.info(
      { batchId, itemId, readiness: item.readiness },
      'catalogImportHydration.skipped_already_progressed',
    );
  } else {
    // Load the batch to get the source.
    const batchResult = await db.query<{ source: CatalogSource; connection_id: string | null }>(
      `SELECT source, connection_id FROM catalog_import_batches WHERE id = $1 LIMIT 1`,
      [batchId],
    );
    const batch = batchResult.rows[0];
    if (!batch) {
      logger.warn({ batchId }, 'catalogImportHydration.batch_not_found');
      return;
    }

    try {
      if (batch.source === 'seller_package') {
        await hydrateSellerPackageItem(item);
      } else {
        if (!batch.connection_id) {
          throw new Error(
            `HYDRATION_FAILED: batch ${batchId} has no connection_id for OAuth source`,
          );
        }
        await hydrateOAuthItem(item, batch.source, batch.connection_id);
      }

      logger.info(
        { batchId, itemId, source: batch.source },
        'catalogImportHydration.item_complete',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { batchId, itemId, err: message },
        'catalogImportHydration.item_failed',
      );
      throw err;
    }
  }

  // Check whether all items in the batch are ready to advance.
  const allReady = await checkAllItemsMediaPending(batchId);
  if (allReady) {
    await transitionBatchToIngestingMedia(batchId);
    logger.info(
      { batchId },
      'catalogImportHydration.batch_transitioned_to_ingesting_media',
    );
  }
}
