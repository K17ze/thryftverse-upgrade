/**
 * Catalogue Import Discovery Worker Handler
 *
 * Extracts discovered listings from the source. For seller_package uploads,
 * the CSV/ZIP is parsed by the SellerPackageConnector. For OAuth sources
 * (eBay, Depop, Vinted), the connector's discover() async iterable is paged
 * through with checkpoint persistence so a paused batch can resume exactly
 * where it left off.
 *
 * Idempotency: item inserts use ON CONFLICT (batch_id, external_item_id)
 * DO NOTHING, so a replayed discovery job never duplicates rows. Media rows
 * use ON CONFLICT (import_item_id, position) DO NOTHING.
 *
 * Error handling maps provider failures to batch pause states:
 * - rate limit  -> paused_rate_limit
 * - auth failure -> paused_reauth
 * - other       -> failed_recoverable
 *
 * @packageDocumentation
 */

import crypto from 'node:crypto';

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { connectorRegistry } from '../../integrations/catalogSources/connectorRegistry.js';
import type {
  BatchState,
  CatalogImportBatchRow,
  CatalogSource,
} from '../../domain/catalogImports/catalogImportTypes.js';
import type {
  DiscoveryCheckpoint,
  DiscoveredSourceItem,
  HydratedSourceMedia,
  SellerPackageManifest,
} from '../../integrations/catalogSources/connector.js';

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

export interface CatalogImportDiscoveryJobData {
  batchId: string;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

interface ClassifiedError {
  kind: 'rate_limit' | 'auth' | 'other';
  message: string;
}

function classifyError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (
    lower.includes('rate_limit') ||
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('too many requests')
  ) {
    return { kind: 'rate_limit', message };
  }

  if (
    lower.includes('unauthor') ||
    lower.includes('401') ||
    lower.includes('invalid_token') ||
    lower.includes('token_expired') ||
    lower.includes('reauth')
  ) {
    return { kind: 'auth', message };
  }

  return { kind: 'other', message };
}

// ---------------------------------------------------------------------------
// Batch state transition helper
// ---------------------------------------------------------------------------

async function transitionBatch(
  batchId: string,
  fromStatus: BatchState,
  toStatus: BatchState,
  statusReason: string | null,
): Promise<void> {
  await db.query(
    `UPDATE catalog_import_batches
     SET status = $2,
         status_reason = $3,
         updated_at = NOW()
     WHERE id = $1
       AND status = $4`,
    [batchId, toStatus, statusReason, fromStatus],
  );
}

// ---------------------------------------------------------------------------
// Seller package discovery
// ---------------------------------------------------------------------------

interface UploadFinalizationRow {
  id: string;
  object_key: string;
  bucket: string;
  owner_id: string;
  file_name: string;
  content_type: string;
  size_bytes: string;
  public_url: string | null;
}

async function discoverSellerPackage(
  batch: CatalogImportBatchRow,
): Promise<number> {
  const checkpoint = batch.checkpoint_json ?? {};
  const packageId = checkpoint['packageId'];

  if (typeof packageId !== 'string' || packageId.length === 0) {
    throw new Error(
      `DISCOVERY_FAILED: batch ${batch.id} has no packageId in checkpoint_json`,
    );
  }

  const connector = connectorRegistry.getSellerPackageConnector('seller_package');
  if (!connector) {
    throw new Error('DISCOVERY_FAILED: seller_package connector not registered');
  }

  // Load the package finalization row to build the manifest.
  const finResult = await db.query<UploadFinalizationRow>(
    `SELECT id, object_key, bucket, owner_id, file_name,
            content_type, size_bytes::text, public_url
     FROM upload_finalizations
     WHERE id = $1
     LIMIT 1`,
    [packageId],
  );

  const finRow = finResult.rows[0];
  if (!finRow) {
    throw new Error(
      `DISCOVERY_FAILED: upload_finalization ${packageId} not found`,
    );
  }

  const manifest: SellerPackageManifest = {
    packageId: finRow.id,
    fileName: finRow.file_name,
    contentType: finRow.content_type,
    sizeBytes: Number(finRow.size_bytes),
    objectKey: finRow.object_key,
  };

  const extraction = await connector.extractPackage(manifest, finRow.object_key);

  let itemCount = 0;

  for (const item of extraction.items) {
    const itemId = `cii_${crypto.randomUUID()}`;
    const itemInsert = await db.query(
      `INSERT INTO catalog_import_items (
         id, batch_id, user_id, external_item_id,
         source_url, source_state, source_checksum,
         normalised_fields, readiness
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'discovered')
       ON CONFLICT (batch_id, external_item_id) DO NOTHING`,
      [
        itemId,
        batch.id,
        batch.user_id,
        item.externalItemId,
        item.sourceUrl ?? null,
        item.sourceState,
        item.sourceChecksum,
        JSON.stringify(item.minimal),
      ],
    );

    // If the row already existed (replay), fetch its id for media insertion.
    let resolvedItemId: string;
    if (itemInsert.rowCount && itemInsert.rowCount > 0) {
      resolvedItemId = itemId;
      itemCount += 1;
    } else {
      const existing = await db.query<{ id: string }>(
        `SELECT id FROM catalog_import_items
         WHERE batch_id = $1 AND external_item_id = $2
         LIMIT 1`,
        [batch.id, item.externalItemId],
      );
      resolvedItemId = existing.rows[0]?.id ?? itemId;
    }

    // Insert media references.
    const mediaEntries = extraction.mediaByItemRef.get(item.externalItemId);
    if (mediaEntries) {
      for (const media of mediaEntries) {
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
            resolvedItemId,
            media.position,
            media.externalMediaId ?? null,
            media.url, // stored as ciphertext placeholder; encryption applied at rest layer
          ],
        );
      }
    }
  }

  // Update discovered_count.
  await db.query(
    `UPDATE catalog_import_batches
     SET discovered_count = (
       SELECT COUNT(*)::int FROM catalog_import_items WHERE batch_id = $1
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [batch.id],
  );

  return itemCount;
}

// ---------------------------------------------------------------------------
// OAuth source discovery
// ---------------------------------------------------------------------------

async function discoverOAuthSource(
  batch: CatalogImportBatchRow,
): Promise<number> {
  const connector = connectorRegistry.getConnector(batch.source);
  if (!connector) {
    await transitionBatch(
      batch.id,
      batch.status,
      'paused_reauth',
      `Connector for source '${batch.source}' is not registered`,
    );
    logger.warn(
      { batchId: batch.id, source: batch.source },
      'catalogImportDiscovery.connector_unavailable',
    );
    return 0;
  }

  // Load the connection for credentials.
  if (!batch.connection_id) {
    throw new Error(
      `DISCOVERY_FAILED: batch ${batch.id} has no connection_id for OAuth source`,
    );
  }

  const connResult = await db.query<{
    encrypted_access_token: string | null;
    external_account_id: string;
    status: string;
  }>(
    `SELECT encrypted_access_token, external_account_id, status
     FROM catalog_import_connections
     WHERE id = $1
     LIMIT 1`,
    [batch.connection_id],
  );

  const conn = connResult.rows[0];
  if (!conn) {
    throw new Error(
      `DISCOVERY_FAILED: connection ${batch.connection_id} not found`,
    );
  }

  if (conn.status !== 'active' || !conn.encrypted_access_token) {
    await transitionBatch(
      batch.id,
      batch.status,
      'paused_reauth',
      'Connection requires reauthorisation',
    );
    logger.warn(
      { batchId: batch.id, connectionId: batch.connection_id },
      'catalogImportDiscovery.connection_not_active',
    );
    return 0;
  }

  const checkpointData = batch.checkpoint_json ?? {};
  const resumeCheckpoint = checkpointData['checkpoint'] as DiscoveryCheckpoint | undefined;

  let itemCount = 0;
  let lastCheckpoint: DiscoveryCheckpoint | undefined = resumeCheckpoint;

  const iterable = connector.discover({
    encryptedAccessToken: conn.encrypted_access_token,
    externalAccountId: conn.external_account_id,
    checkpoint: resumeCheckpoint,
  });

  for await (const page of iterable) {
    for (const item of page.items) {
      const itemId = `cii_${crypto.randomUUID()}`;
      const itemInsert = await db.query(
        `INSERT INTO catalog_import_items (
           id, batch_id, user_id, external_item_id,
           source_url, source_state, source_checksum,
           normalised_fields, readiness
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'discovered')
         ON CONFLICT (batch_id, external_item_id) DO NOTHING`,
        [
          itemId,
          batch.id,
          batch.user_id,
          item.externalItemId,
          item.sourceUrl ?? null,
          item.sourceState,
          item.sourceChecksum,
          JSON.stringify(item.minimal),
        ],
      );

      if (itemInsert.rowCount && itemInsert.rowCount > 0) {
        itemCount += 1;
      }
    }

    // Persist checkpoint after each page.
    lastCheckpoint = page.nextCheckpoint;
    await db.query(
      `UPDATE catalog_import_batches
       SET checkpoint_json = $2::jsonb,
           source_snapshot_at = COALESCE(source_snapshot_at, $3),
           updated_at = NOW()
       WHERE id = $1`,
      [
        batch.id,
        JSON.stringify({
          ...(batch.checkpoint_json ?? {}),
          checkpoint: lastCheckpoint,
        }),
        page.nextCheckpoint?.sourceSnapshotAt
          ? new Date(page.nextCheckpoint.sourceSnapshotAt)
          : null,
      ],
    );

    if (page.done) {
      break;
    }
  }

  // Update discovered_count.
  await db.query(
    `UPDATE catalog_import_batches
     SET discovered_count = (
       SELECT COUNT(*)::int FROM catalog_import_items WHERE batch_id = $1
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [batch.id],
  );

  return itemCount;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Processes a catalogue import discovery job. Extracts listings from the
 * source, inserts item and media rows, and transitions the batch to
 * 'hydrating' on success.
 */
export async function processCatalogImportDiscovery(
  data: CatalogImportDiscoveryJobData,
): Promise<void> {
  const { batchId } = data;

  const batchResult = await db.query<CatalogImportBatchRow>(
    `SELECT id, user_id, connection_id, source, mode, status,
            status_reason, checkpoint_json,
            source_snapshot_at,
            discovered_count, ready_count, issue_count, published_count,
            approval_revision, approved_at, approved_by,
            raw_delete_after, created_at, updated_at, completed_at
     FROM catalog_import_batches
     WHERE id = $1
     LIMIT 1`,
    [batchId],
  );

  const batch = batchResult.rows[0];
  if (!batch) {
    logger.warn({ batchId }, 'catalogImportDiscovery.batch_not_found');
    return;
  }

  // Idempotency: if the batch has already moved past discovering, skip.
  if (batch.status !== 'discovering' && batch.status !== 'created') {
    logger.info(
      { batchId, status: batch.status },
      'catalogImportDiscovery.skipped_already_progressed',
    );
    return;
  }

  const source: CatalogSource = batch.source;

  try {
    let itemCount: number;

    if (source === 'seller_package') {
      itemCount = await discoverSellerPackage(batch);
    } else {
      itemCount = await discoverOAuthSource(batch);
    }

    logger.info(
      { batchId, source, itemCount },
      'catalogImportDiscovery.complete',
    );

    // Transition batch to 'hydrating'.
    await transitionBatch(batchId, batch.status, 'hydrating', null);
  } catch (err) {
    const classified = classifyError(err);
    logger.error(
      { batchId, source, err: classified.message, errorKind: classified.kind },
      'catalogImportDiscovery.failed',
    );

    if (classified.kind === 'rate_limit') {
      await transitionBatch(
        batchId,
        batch.status,
        'paused_rate_limit',
        classified.message,
      );
    } else if (classified.kind === 'auth') {
      await transitionBatch(
        batchId,
        batch.status,
        'paused_reauth',
        classified.message,
      );
    } else {
      await transitionBatch(
        batchId,
        batch.status,
        'failed_recoverable',
        classified.message,
      );
    }

    throw err;
  }
}
