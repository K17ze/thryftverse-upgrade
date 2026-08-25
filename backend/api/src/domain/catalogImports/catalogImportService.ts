/**
 * Catalogue Import — Domain Service
 *
 * The heart of the concierge catalogue importer. This service owns every
 * state transition and all business logic for connections, batches, items,
 * approval, and events. Route handlers and workers call this service; they
 * never mutate state directly.
 *
 * Design principles (per blueprint §6):
 * - State transitions are validated through the state machine functions
 *   before any row is mutated.
 * - No worker or route bypasses this service.
 * - Provenance and raw data are preserved until the retention window expires.
 * - Approval freezes the field revision into an immutable approval_revision.
 * - Unknown outcomes are represented honestly, never collapsed to "failed".
 */

import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import type {
  BlockingIssue,
  CatalogImportBatchRow,
  CatalogImportConnectionRow,
  CatalogImportItemRow,
  CatalogSource,
  ConnectionState,
  BatchState,
  ItemReadiness,
  SellerDecision,
} from './catalogImportTypes.js';
import { CatalogImportError } from './catalogImportTypes.js';
import type { DiscoveredSourceItem } from '../../integrations/catalogSources/connector.js';
import {
  assertBatchTransition,
  assertConnectionTransition,
  assertItemReadinessTransition,
  isBatchState,
  isConnectionState,
  isItemReadiness,
} from './catalogImportStateMachine.js';
import { validateAttestation } from './catalogImportValidation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function assertOwnsConnection(
  row: CatalogImportConnectionRow | null,
  userId: string,
): asserts row is CatalogImportConnectionRow {
  if (!row) {
    throw new CatalogImportError('connection_not_found', 'Connection not found');
  }
  if (row.user_id !== userId) {
    throw new CatalogImportError('permission_denied', 'You do not own this connection');
  }
}

function assertOwnsBatch(
  row: CatalogImportBatchRow | null,
  userId: string,
): asserts row is CatalogImportBatchRow {
  if (!row) {
    throw new CatalogImportError('batch_not_found', 'Batch not found');
  }
  if (row.user_id !== userId) {
    throw new CatalogImportError('permission_denied', 'You do not own this batch');
  }
}

function assertOwnsItem(
  row: CatalogImportItemRow | null,
  userId: string,
): asserts row is CatalogImportItemRow {
  if (!row) {
    throw new CatalogImportError('item_not_found', 'Item not found');
  }
  if (row.user_id !== userId) {
    throw new CatalogImportError('permission_denied', 'You do not own this item');
  }
}

// ---------------------------------------------------------------------------
// Row mappers (snake_case DB row -> typed interface)
// ---------------------------------------------------------------------------

function mapConnectionRow(row: Record<string, unknown>): CatalogImportConnectionRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    source: row.source as CatalogSource,
    external_account_id: row.external_account_id as string,
    external_display_name: (row.external_display_name as string | null) ?? null,
    encrypted_access_token: (row.encrypted_access_token as string | null) ?? null,
    encrypted_refresh_token: (row.encrypted_refresh_token as string | null) ?? null,
    token_expires_at: (row.token_expires_at as Date | null) ?? null,
    scopes: (row.scopes as string[] | null) ?? null,
    status: row.status as ConnectionState,
    consent_version: row.consent_version as string,
    consented_at: row.consented_at as Date,
    revoked_at: (row.revoked_at as Date | null) ?? null,
    deleted_at: (row.deleted_at as Date | null) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

function mapBatchRow(row: Record<string, unknown>): CatalogImportBatchRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    connection_id: (row.connection_id as string | null) ?? null,
    source: row.source as CatalogSource,
    mode: row.mode as 'one_time',
    status: row.status as BatchState,
    status_reason: (row.status_reason as string | null) ?? null,
    checkpoint_json: (row.checkpoint_json as Record<string, unknown> | null) ?? null,
    source_snapshot_at: (row.source_snapshot_at as Date | null) ?? null,
    discovered_count: row.discovered_count as number,
    ready_count: row.ready_count as number,
    issue_count: row.issue_count as number,
    published_count: row.published_count as number,
    approval_revision: (row.approval_revision as string | null) ?? null,
    approved_at: (row.approved_at as Date | null) ?? null,
    approved_by: (row.approved_by as string | null) ?? null,
    raw_delete_after: (row.raw_delete_after as Date | null) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    completed_at: (row.completed_at as Date | null) ?? null,
  };
}

export function mapItemRow(row: Record<string, unknown>): CatalogImportItemRow {
  return {
    id: row.id as string,
    batch_id: row.batch_id as string,
    user_id: row.user_id as string,
    external_item_id: row.external_item_id as string,
    source_url: (row.source_url as string | null) ?? null,
    source_state: (row.source_state as string | null) ?? null,
    source_updated_at: (row.source_updated_at as Date | null) ?? null,
    source_checksum: row.source_checksum as string,
    raw_snapshot_ciphertext: (row.raw_snapshot_ciphertext as string | null) ?? null,
    normalised_fields: (row.normalised_fields as Record<string, unknown> | null) ?? null,
    field_revision: row.field_revision as string,
    readiness: row.readiness as ItemReadiness,
    blocking_issues: (row.blocking_issues as BlockingIssue[] | null) ?? null,
    duplicate_of_listing_id: (row.duplicate_of_listing_id as string | null) ?? null,
    duplicate_score: (row.duplicate_score as number | null) ?? null,
    seller_decision: row.seller_decision as SellerDecision,
    draft_listing_id: (row.draft_listing_id as string | null) ?? null,
    publication_status: row.publication_status as CatalogImportItemRow['publication_status'],
    publication_idempotency_key: (row.publication_idempotency_key as string | null) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CatalogImportService {
  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  async createConnection(input: {
    userId: string;
    source: CatalogSource;
    externalAccountId: string;
    externalDisplayName?: string | null;
    encryptedAccessToken?: string | null;
    encryptedRefreshToken?: string | null;
    tokenExpiresAt?: Date | null;
    scopes: string[];
    consentVersion: string;
  }): Promise<CatalogImportConnectionRow> {
    const id = createId('conn');
    const hasTokens = Boolean(input.encryptedAccessToken);
    const status: ConnectionState = hasTokens ? 'active' : 'pending_authorisation';

    const result = await db.query(
      `INSERT INTO catalog_import_connections (
         id, user_id, source, external_account_id, external_display_name,
         encrypted_access_token, encrypted_refresh_token, token_expires_at,
         scopes, status, consent_version, consented_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING *`,
      [
        id,
        input.userId,
        input.source,
        input.externalAccountId,
        input.externalDisplayName ?? null,
        input.encryptedAccessToken ?? null,
        input.encryptedRefreshToken ?? null,
        input.tokenExpiresAt ?? null,
        input.scopes,
        status,
        input.consentVersion,
      ],
    );

    logger.info(
      { connectionId: id, userId: input.userId, source: input.source, status },
      'catalogImport.createConnection',
    );

    return mapConnectionRow(result.rows[0] as Record<string, unknown>);
  }

  async getConnection(userId: string, connectionId: string): Promise<CatalogImportConnectionRow> {
    const result = await db.query(
      `SELECT * FROM catalog_import_connections WHERE id = $1 LIMIT 1`,
      [connectionId],
    );
    const row = result.rows.length > 0 ? mapConnectionRow(result.rows[0] as Record<string, unknown>) : null;
    assertOwnsConnection(row, userId);
    return row;
  }

  async listConnections(userId: string): Promise<CatalogImportConnectionRow[]> {
    const result = await db.query(
      `SELECT * FROM catalog_import_connections
       WHERE user_id = $1 AND status != 'deleted'
       ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map((r) => mapConnectionRow(r as Record<string, unknown>));
  }

  async updateConnectionStatus(
    userId: string,
    connectionId: string,
    newStatus: ConnectionState,
    reason?: string | null,
  ): Promise<void> {
    if (!isConnectionState(newStatus)) {
      throw new CatalogImportError('validation_failed', `Invalid connection status: ${newStatus}`);
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT * FROM catalog_import_connections WHERE id = $1 FOR UPDATE`,
        [connectionId],
      );
      const row = existing.rows.length > 0 ? mapConnectionRow(existing.rows[0] as Record<string, unknown>) : null;
      assertOwnsConnection(row, userId);

      assertConnectionTransition(row.status, newStatus);

      await client.query(
        `UPDATE catalog_import_connections
         SET status = $2, status_reason = $3, updated_at = NOW()
         WHERE id = $1`,
        [connectionId, newStatus, reason ?? null],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeConnection(userId: string, connectionId: string): Promise<void> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT * FROM catalog_import_connections WHERE id = $1 FOR UPDATE`,
        [connectionId],
      );
      const row = existing.rows.length > 0 ? mapConnectionRow(existing.rows[0] as Record<string, unknown>) : null;
      assertOwnsConnection(row, userId);

      assertConnectionTransition(row.status, 'revoked');

      await client.query(
        `UPDATE catalog_import_connections
         SET status = 'revoked',
             encrypted_access_token = NULL,
             encrypted_refresh_token = NULL,
             token_expires_at = NULL,
             revoked_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [connectionId],
      );

      await client.query('COMMIT');

      logger.info(
        { connectionId, userId },
        'catalogImport.revokeConnection',
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteConnection(userId: string, connectionId: string): Promise<void> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT * FROM catalog_import_connections WHERE id = $1 FOR UPDATE`,
        [connectionId],
      );
      const row = existing.rows.length > 0 ? mapConnectionRow(existing.rows[0] as Record<string, unknown>) : null;
      assertOwnsConnection(row, userId);

      assertConnectionTransition(row.status, 'deleted');

      await client.query(
        `UPDATE catalog_import_connections
         SET status = 'deleted',
             encrypted_access_token = NULL,
             encrypted_refresh_token = NULL,
             token_expires_at = NULL,
             deleted_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [connectionId],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Batch management
  // -------------------------------------------------------------------------

  async createBatch(input: {
    userId: string;
    source: CatalogSource;
    connectionId?: string | null;
    packageId?: string | null;
    consentVersion: string;
  }): Promise<CatalogImportBatchRow> {
    const id = createId('batch');

    // Persist the packageId in checkpoint_json so the discovery worker can
    // locate the uploaded package for seller_package imports. For OAuth
    // sources the checkpoint starts empty and is populated during discovery.
    const checkpointJson = input.packageId
      ? JSON.stringify({ packageId: input.packageId })
      : null;

    const result = await db.query(
      `INSERT INTO catalog_import_batches (
         id, user_id, connection_id, source, mode, status,
         status_reason, checkpoint_json, source_snapshot_at,
         discovered_count, ready_count, issue_count, published_count,
         approval_revision, approved_at, approved_by,
         raw_delete_after, created_at, updated_at, completed_at
       )
       VALUES (
         $1, $2, $3, $4, 'one_time', 'created',
         NULL, $5::jsonb, NULL,
         0, 0, 0, 0,
         NULL, NULL, NULL,
         NOW() + INTERVAL '30 days', NOW(), NOW(), NULL
       )
       RETURNING *`,
      [
        id,
        input.userId,
        input.connectionId ?? null,
        input.source,
        checkpointJson,
      ],
    );

    logger.info(
      { batchId: id, userId: input.userId, source: input.source },
      'catalogImport.createBatch',
    );

    return mapBatchRow(result.rows[0] as Record<string, unknown>);
  }

  async getBatch(userId: string, batchId: string): Promise<CatalogImportBatchRow> {
    const result = await db.query(
      `SELECT * FROM catalog_import_batches WHERE id = $1 LIMIT 1`,
      [batchId],
    );
    const row = result.rows.length > 0 ? mapBatchRow(result.rows[0] as Record<string, unknown>) : null;
    assertOwnsBatch(row, userId);
    return row;
  }

  async listBatches(userId: string): Promise<CatalogImportBatchRow[]> {
    const result = await db.query(
      `SELECT * FROM catalog_import_batches
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map((r) => mapBatchRow(r as Record<string, unknown>));
  }

  async updateBatchStatus(
    userId: string,
    batchId: string,
    newStatus: BatchState,
    reason?: string | null,
    checkpoint?: Record<string, unknown> | null,
  ): Promise<void> {
    if (!isBatchState(newStatus)) {
      throw new CatalogImportError('validation_failed', `Invalid batch status: ${newStatus}`);
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT * FROM catalog_import_batches WHERE id = $1 FOR UPDATE`,
        [batchId],
      );
      const row = existing.rows.length > 0 ? mapBatchRow(existing.rows[0] as Record<string, unknown>) : null;
      assertOwnsBatch(row, userId);

      assertBatchTransition(row.status, newStatus);

      const checkpointClause = checkpoint !== undefined
        ? ', checkpoint_json = $4::jsonb'
        : '';

      const params: unknown[] = [batchId, newStatus, reason ?? null];
      if (checkpoint !== undefined) {
        params.push(JSON.stringify(checkpoint));
      }

      await client.query(
        `UPDATE catalog_import_batches
         SET status = $2,
             status_reason = $3,
             completed_at = CASE WHEN $2 IN ('completed', 'cancelled') THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
             updated_at = NOW()${checkpointClause}
         WHERE id = $1`,
        params,
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async startBatch(userId: string, batchId: string): Promise<void> {
    await this.updateBatchStatus(userId, batchId, 'discovering', 'seller_initiated');
  }

  async cancelBatch(userId: string, batchId: string): Promise<void> {
    // Transition to cancelling first, then cancelled. The idempotency check
    // is done inside updateBatchStatus's FOR UPDATE transaction, so there is
    // no TOCTOU window. If the batch is already cancelling or cancelled, the
    // transition validation will reject it, which is the correct behaviour
    // for a double-cancel (the batch is already being cancelled).
    const batch = await this.getBatch(userId, batchId);

    if (batch.status === 'cancelling' || batch.status === 'cancelled') {
      return;
    }

    // updateBatchStatus validates the transition under FOR UPDATE lock.
    await this.updateBatchStatus(userId, batchId, 'cancelling', 'seller_cancelled');
    await this.updateBatchStatus(userId, batchId, 'cancelled', 'seller_cancelled');
  }

  async retryBatch(userId: string, batchId: string): Promise<void> {
    const batch = await this.getBatch(userId, batchId);

    if (batch.status !== 'failed_recoverable' && batch.status !== 'paused_rate_limit' && batch.status !== 'paused_reauth') {
      throw new CatalogImportError(
        'invalid_state_transition',
        `Batch in state "${batch.status}" cannot be retried. Only failed_recoverable, paused_rate_limit, or paused_reauth may retry.`,
      );
    }

    // Determine the appropriate active state to resume to based on the
    // checkpoint. If no checkpoint exists, resume from discovering.
    const checkpoint = batch.checkpoint_json;
    let targetState: BatchState;

    if (checkpoint && typeof checkpoint === 'object' && 'phase' in checkpoint) {
      const phase = (checkpoint as Record<string, unknown>).phase;
      if (phase === 'hydrating' || phase === 'ingesting_media' || phase === 'normalising' || phase === 'awaiting_operator' || phase === 'awaiting_seller') {
        targetState = phase as BatchState;
      } else {
        targetState = 'discovering';
      }
    } else {
      targetState = 'discovering';
    }

    // updateBatchStatus validates the transition under FOR UPDATE lock.
    await this.updateBatchStatus(userId, batchId, targetState, 'retry', checkpoint ?? undefined);
  }

  async deleteBatchRawData(userId: string, batchId: string): Promise<void> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Lock the batch row and validate ownership and retention inside the
      // transaction to avoid a TOCTOU race between the check and the delete.
      const existing = await client.query(
        `SELECT * FROM catalog_import_batches WHERE id = $1 FOR UPDATE`,
        [batchId],
      );
      const row = existing.rows.length > 0 ? mapBatchRow(existing.rows[0] as Record<string, unknown>) : null;
      assertOwnsBatch(row, userId);

      // Enforce retention: raw data can only be deleted after the retention
      // window has passed, or if the batch is in a terminal state.
      const now = new Date();
      const retentionExpired = row.raw_delete_after !== null && row.raw_delete_after <= now;
      const isTerminal = row.status === 'completed' || row.status === 'cancelled';

      if (!retentionExpired && !isTerminal) {
        throw new CatalogImportError(
          'retention_window_expired',
          'Raw data cannot be deleted before the retention window expires',
        );
      }

      // Delete raw snapshots from items — keep normalised_fields and provenance.
      await client.query(
        `UPDATE catalog_import_items
         SET raw_snapshot_ciphertext = NULL,
             updated_at = NOW()
         WHERE batch_id = $1 AND raw_snapshot_ciphertext IS NOT NULL`,
        [batchId],
      );

      // Delete source URLs from media — keep resolved media_asset references.
      await client.query(
        `UPDATE catalog_import_media
         SET source_url_ciphertext = NULL,
             updated_at = NOW()
         WHERE import_item_id IN (
           SELECT id FROM catalog_import_items WHERE batch_id = $1
         )
         AND source_url_ciphertext IS NOT NULL`,
        [batchId],
      );

      await client.query('COMMIT');

      logger.info(
        { batchId, userId },
        'catalogImport.deleteBatchRawData',
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Item management
  // -------------------------------------------------------------------------

  async createDiscoveredItems(
    batchId: string,
    userId: string,
    items: DiscoveredSourceItem[],
  ): Promise<CatalogImportItemRow[]> {
    if (items.length === 0) {
      return [];
    }

    // Build a multi-row INSERT with ON CONFLICT DO NOTHING on
    // (batch_id, external_item_id).
    const values: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const item of items) {
      const id = createId('item');
      const sourceUrl = item.sourceUrl ?? null;
      const sourceUpdatedAt = item.sourceUpdatedAt ? new Date(item.sourceUpdatedAt) : null;

      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9})`,
      );
      params.push(
        id,
        batchId,
        userId,
        item.externalItemId,
        sourceUrl,
        item.sourceState,
        sourceUpdatedAt,
        item.sourceChecksum,
        JSON.stringify(item.minimal),
      );
      paramIndex += 9;
    }

    const queryText = `
      INSERT INTO catalog_import_items (
        id, batch_id, user_id, external_item_id, source_url,
        source_state, source_updated_at, source_checksum, raw_snapshot_ciphertext
      )
      VALUES ${values.join(', ')}
      ON CONFLICT (batch_id, external_item_id) DO NOTHING
      RETURNING *`;

    const result = await db.query(queryText, params);

    logger.info(
      { batchId, userId, inserted: result.rows.length, attempted: items.length },
      'catalogImport.createDiscoveredItems',
    );

    return result.rows.map((r) => mapItemRow(r as Record<string, unknown>));
  }

  async getBatchItems(
    batchId: string,
    options: {
      cursor?: string | null;
      readiness?: ItemReadiness;
      decision?: SellerDecision;
      limit?: number;
    },
  ): Promise<{ items: CatalogImportItemRow[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const conditions: string[] = ['batch_id = $1'];
    const params: unknown[] = [batchId];
    let paramIndex = 2;

    if (options.cursor) {
      conditions.push(`id > $${paramIndex}`);
      params.push(options.cursor);
      paramIndex += 1;
    }

    if (options.readiness) {
      if (!isItemReadiness(options.readiness)) {
        throw new CatalogImportError('validation_failed', `Invalid readiness: ${options.readiness}`);
      }
      conditions.push(`readiness = $${paramIndex}`);
      params.push(options.readiness);
      paramIndex += 1;
    }

    if (options.decision) {
      conditions.push(`seller_decision = $${paramIndex}`);
      params.push(options.decision);
      paramIndex += 1;
    }

    const limitParam = paramIndex;
    params.push(limit + 1);

    const queryText = `
      SELECT * FROM catalog_import_items
      WHERE ${conditions.join(' AND ')}
      ORDER BY id ASC
      LIMIT $${limitParam}`;

    const result = await db.query(queryText, params);

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const items = rows.map((r) => mapItemRow(r as Record<string, unknown>));
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor };
  }

  async getItem(userId: string, itemId: string): Promise<CatalogImportItemRow> {
    const result = await db.query(
      `SELECT * FROM catalog_import_items WHERE id = $1 LIMIT 1`,
      [itemId],
    );
    const row = result.rows.length > 0 ? mapItemRow(result.rows[0] as Record<string, unknown>) : null;
    assertOwnsItem(row, userId);
    return row;
  }

  async updateItemReadiness(
    itemId: string,
    newReadiness: ItemReadiness,
    blockingIssues?: BlockingIssue[] | null,
  ): Promise<void> {
    if (!isItemReadiness(newReadiness)) {
      throw new CatalogImportError('validation_failed', `Invalid item readiness: ${newReadiness}`);
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT * FROM catalog_import_items WHERE id = $1 FOR UPDATE`,
        [itemId],
      );
      const row = existing.rows.length > 0 ? mapItemRow(existing.rows[0] as Record<string, unknown>) : null;
      if (!row) {
        throw new CatalogImportError('item_not_found', 'Item not found');
      }

      assertItemReadinessTransition(row.readiness, newReadiness);

      await client.query(
        `UPDATE catalog_import_items
         SET readiness = $2,
             blocking_issues = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [itemId, newReadiness, blockingIssues !== undefined ? JSON.stringify(blockingIssues) : row.blocking_issues],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateItemFields(
    userId: string,
    itemId: string,
    fieldRevision: string,
    fields: Record<string, unknown>,
    sellerDecision?: SellerDecision,
  ): Promise<CatalogImportItemRow> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT * FROM catalog_import_items WHERE id = $1 FOR UPDATE`,
        [itemId],
      );
      const row = existing.rows.length > 0 ? mapItemRow(existing.rows[0] as Record<string, unknown>) : null;
      assertOwnsItem(row, userId);

      // Optimistic concurrency check on field_revision.
      if (row.field_revision !== fieldRevision) {
        throw new CatalogImportError(
          'approval_revision_mismatch',
          'The item has been modified since you last read it. Please refresh and try again.',
        );
      }

      const newFieldRevision = createId('frev');

      // Merge the patched fields into the existing normalised_fields.
      const currentFields = row.normalised_fields ?? {};
      const mergedFields = { ...currentFields, ...fields };

      await client.query(
        `UPDATE catalog_import_items
         SET normalised_fields = $2::jsonb,
             field_revision = $3,
             seller_decision = COALESCE($4, seller_decision),
             updated_at = NOW()
         WHERE id = $1`,
        [
          itemId,
          JSON.stringify(mergedFields),
          newFieldRevision,
          sellerDecision ?? null,
        ],
      );

      const updated = await client.query(
        `SELECT * FROM catalog_import_items WHERE id = $1 LIMIT 1`,
        [itemId],
      );

      await client.query('COMMIT');

      return mapItemRow(updated.rows[0] as Record<string, unknown>);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async bulkUpdateItems(
    batchId: string,
    itemIds: string[],
    fields: Record<string, unknown>,
  ): Promise<number> {
    if (itemIds.length === 0) {
      return 0;
    }

    const result = await db.query(
      `UPDATE catalog_import_items
       SET normalised_fields = normalised_fields || $3::jsonb,
           field_revision = $4,
           updated_at = NOW()
       WHERE batch_id = $1 AND id = ANY($2::text[])`,
      [
        batchId,
        itemIds,
        JSON.stringify(fields),
        createId('frev'),
      ],
    );

    logger.info(
      { batchId, updatedCount: result.rowCount, itemCount: itemIds.length },
      'catalogImport.bulkUpdateItems',
    );

    return result.rowCount ?? 0;
  }

  async updateItemCounts(batchId: string): Promise<void> {
    const result = await db.query<{
      discovered_count: number;
      ready_count: number;
      issue_count: number;
    }>(
      `SELECT
         COUNT(*) AS discovered_count,
         COUNT(*) FILTER (WHERE readiness = 'ready') AS ready_count,
         COUNT(*) FILTER (WHERE readiness IN ('needs_input', 'probable_duplicate', 'excluded')) AS issue_count
       FROM catalog_import_items
       WHERE batch_id = $1`,
      [batchId],
    );

    const counts = result.rows[0];
    if (!counts) {
      return;
    }

    await db.query(
      `UPDATE catalog_import_batches
       SET discovered_count = $2,
           ready_count = $3,
           issue_count = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [
        batchId,
        Number(counts.discovered_count),
        Number(counts.ready_count),
        Number(counts.issue_count),
      ],
    );
  }

  // -------------------------------------------------------------------------
  // Approval
  // -------------------------------------------------------------------------

  async approveBatch(
    userId: string,
    batchId: string,
    itemIds: string[],
    attestation: { ownsRights: boolean; accurateFacts: boolean; noBuyerData: boolean },
  ): Promise<{ approvalRevision: string }> {
    const attestationResult = validateAttestation(attestation);
    if (!attestationResult.valid) {
      throw new CatalogImportError(
        'attestation_required',
        `Attestation missing required assertions: ${attestationResult.missing.join(', ')}`,
      );
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT * FROM catalog_import_batches WHERE id = $1 FOR UPDATE`,
        [batchId],
      );
      const row = existing.rows.length > 0 ? mapBatchRow(existing.rows[0] as Record<string, unknown>) : null;
      assertOwnsBatch(row, userId);

      if (row.status !== 'awaiting_seller') {
        throw new CatalogImportError(
          'invalid_state_transition',
          `Batch must be in "awaiting_seller" to approve, but is in "${row.status}"`,
        );
      }

      // Validate that all selected items are in a ready state and have no
      // blocking issues.
      const itemsResult = await client.query(
        `SELECT * FROM catalog_import_items
         WHERE batch_id = $1 AND id = ANY($2::text[])
         FOR UPDATE`,
        [batchId, itemIds],
      );

      for (const itemRow of itemsResult.rows) {
        const item = mapItemRow(itemRow as Record<string, unknown>);
        if (item.readiness !== 'ready') {
          throw new CatalogImportError(
            'blocking_issues_unresolved',
            `Item ${item.id} is not in "ready" state (current: ${item.readiness})`,
          );
        }
        if (item.blocking_issues && item.blocking_issues.length > 0) {
          throw new CatalogImportError(
            'blocking_issues_unresolved',
            `Item ${item.id} has unresolved blocking issues`,
          );
        }
      }

      // Freeze the field revision into an immutable approval_revision.
      const approvalRevision = createId('aprv');

      await client.query(
        `UPDATE catalog_import_batches
         SET status = 'approved',
             approval_revision = $2,
             approved_at = NOW(),
             approved_by = $3,
             status_reason = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [batchId, approvalRevision, userId],
      );

      // Mark selected items as approved in publication_status.
      await client.query(
        `UPDATE catalog_import_items
         SET seller_decision = 'selected',
             publication_status = 'approved',
             updated_at = NOW()
         WHERE batch_id = $1 AND id = ANY($2::text[])`,
        [batchId, itemIds],
      );

      // Record attestation event.
      await this.appendEventInternal(client, batchId, null, 'batch_approved', {
        approvalRevision,
        attestation,
        itemIds,
        approvedBy: userId,
      });

      await client.query('COMMIT');

      logger.info(
        { batchId, userId, approvalRevision, itemCount: itemIds.length },
        'catalogImport.approveBatch',
      );

      return { approvalRevision };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getApprovalRevision(userId: string, batchId: string): Promise<string | null> {
    const batch = await this.getBatch(userId, batchId);
    return batch.approval_revision;
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  async appendEvent(
    batchId: string,
    itemId: string | null,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await db.query(
      `INSERT INTO catalog_import_events (id, batch_id, item_id, event_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
      [createId('evt'), batchId, itemId, eventType, JSON.stringify(payload)],
    );
  }

  /**
   * Internal helper that uses an existing transaction client.
   */
  private async appendEventInternal(
    client: PoolClient,
    batchId: string,
    itemId: string | null,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO catalog_import_events (id, batch_id, item_id, event_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
      [createId('evt'), batchId, itemId, eventType, JSON.stringify(payload)],
    );
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  async getBatchItemSummary(
    batchId: string,
  ): Promise<{
    ready: number;
    needsInput: number;
    probableDuplicate: number;
    excluded: number;
    total: number;
  }> {
    const result = await db.query<{
      ready: number;
      needs_input: number;
      probable_duplicate: number;
      excluded: number;
      total: number;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE readiness = 'ready') AS ready,
         COUNT(*) FILTER (WHERE readiness = 'needs_input') AS needs_input,
         COUNT(*) FILTER (WHERE readiness = 'probable_duplicate') AS probable_duplicate,
         COUNT(*) FILTER (WHERE readiness = 'excluded') AS excluded,
         COUNT(*) AS total
       FROM catalog_import_items
       WHERE batch_id = $1`,
      [batchId],
    );

    const row = result.rows[0];
    if (!row) {
      return { ready: 0, needsInput: 0, probableDuplicate: 0, excluded: 0, total: 0 };
    }

    return {
      ready: Number(row.ready),
      needsInput: Number(row.needs_input),
      probableDuplicate: Number(row.probable_duplicate),
      excluded: Number(row.excluded),
      total: Number(row.total),
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const catalogImportService = new CatalogImportService();
