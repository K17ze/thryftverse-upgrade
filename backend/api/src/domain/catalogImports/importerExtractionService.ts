/**
 * Importer Assisted Extraction — Domain Service
 *
 * Owns the lifecycle of ML-assisted structured extraction from catalogue
 * photos and the human confirmation gate that guards publication.
 *
 * Design principles (per ML flagship report §6.5, §9.5 and AGENTS.md):
 * - ML extraction is advisory only. No field enters a listing draft without
 *   explicit seller confirmation. The ML never auto-publishes.
 * - Every extracted field carries a confidence score so the seller can see
 *   which fields to scrutinise, but confidence never gates publication on
 *   its own — the human confirmation gate is the only publication guard.
 * - Seller edits are recorded as append-only revisions so an auditor can
 *   trace every change from model output to final confirmed value.
 * - The placeholder is honest: when no model is loaded, extracted_fields is
 *   empty and the status is 'completed' with a logged "no model loaded"
 *   message. No "AI-powered import" claims are made — this is "assisted
 *   extraction".
 *
 * The required fields for publication are the material listing fields that
 * cannot be empty: brand, category, condition, size, and
 * estimated_price_range. A field is considered "resolved" when it is either
 * seller-confirmed or seller-edited. Rejected fields do not count. Only when
 * every required field is resolved may the item be published to a draft.
 */

import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { CatalogImportService } from './catalogImportService.js';
import { CatalogImportError } from './catalogImportTypes.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The material listing fields that must be seller-confirmed or seller-edited
 * before an extraction can be published to a listing draft. These are the
 * fields the extraction model is expected to populate from catalogue photos.
 */
export const REQUIRED_EXTRACTION_FIELDS: readonly string[] = [
  'brand',
  'category',
  'condition',
  'size',
  'estimated_price_range',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The lifecycle status of an extraction run. */
export type ExtractionStatus = 'pending' | 'completed' | 'failed' | 'superseded';

/** A single seller edit revision, preserved in field_revisions. */
export interface FieldRevision {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  editedAt: string;
  sellerUserId: string;
}

/** The persisted row shape for catalog_import_extractions. */
export interface CatalogImportExtractionRow {
  id: string;
  item_id: string;
  media_asset_id: string | null;
  extraction_model_id: string;
  extraction_model_version: string;
  extracted_fields: Record<string, unknown>;
  confidence_scores: Record<string, number>;
  field_revisions: FieldRevision[];
  seller_confirmed_fields: string[];
  seller_rejected_fields: string[];
  seller_edited_fields: string[];
  extraction_status: ExtractionStatus;
  error_message: string | null;
  extracted_at: Date | null;
  confirmed_at: Date | null;
  created_at: Date;
}

/** DTO returned to the API layer. */
export interface ExtractionSummaryDTO {
  id: string;
  itemId: string;
  mediaAssetId: string | null;
  extractionModelId: string;
  extractionModelVersion: string;
  extractionStatus: ExtractionStatus;
  extractedFields: Record<string, unknown>;
  confidenceScores: Record<string, number>;
  fieldRevisions: FieldRevision[];
  sellerConfirmedFields: string[];
  sellerRejectedFields: string[];
  sellerEditedFields: string[];
  errorMessage: string | null;
  extractedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  /** True only when every required field is confirmed or edited. */
  readyForPublication: boolean;
  /** Required fields not yet confirmed or edited. */
  pendingRequiredFields: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function assertOwnsItem(
  row: { user_id: string; id: string } | null,
  userId: string,
): asserts row is { user_id: string; id: string } {
  if (!row) {
    throw new CatalogImportError('item_not_found', 'Item not found');
  }
  if (row.user_id !== userId) {
    throw new CatalogImportError('permission_denied', 'You do not own this item');
  }
}

function mapExtractionRow(row: Record<string, unknown>): CatalogImportExtractionRow {
  return {
    id: row.id as string,
    item_id: row.item_id as string,
    media_asset_id: (row.media_asset_id as string | null) ?? null,
    extraction_model_id: row.extraction_model_id as string,
    extraction_model_version: row.extraction_model_version as string,
    extracted_fields: (row.extracted_fields as Record<string, unknown>) ?? {},
    confidence_scores: (row.confidence_scores as Record<string, number>) ?? {},
    field_revisions: (row.field_revisions as FieldRevision[]) ?? [],
    seller_confirmed_fields: (row.seller_confirmed_fields as string[]) ?? [],
    seller_rejected_fields: (row.seller_rejected_fields as string[]) ?? [],
    seller_edited_fields: (row.seller_edited_fields as string[]) ?? [],
    extraction_status: row.extraction_status as ExtractionStatus,
    error_message: (row.error_message as string | null) ?? null,
    extracted_at: (row.extracted_at as Date | null) ?? null,
    confirmed_at: (row.confirmed_at as Date | null) ?? null,
    created_at: row.created_at as Date,
  };
}

function toSummaryDTO(row: CatalogImportExtractionRow): ExtractionSummaryDTO {
  const resolved = new Set<string>([
    ...row.seller_confirmed_fields,
    ...row.seller_edited_fields,
  ]);
  const pendingRequired = REQUIRED_EXTRACTION_FIELDS.filter(
    (f) => !resolved.has(f),
  );

  return {
    id: row.id,
    itemId: row.item_id,
    mediaAssetId: row.media_asset_id,
    extractionModelId: row.extraction_model_id,
    extractionModelVersion: row.extraction_model_version,
    extractionStatus: row.extraction_status,
    extractedFields: row.extracted_fields,
    confidenceScores: row.confidence_scores,
    fieldRevisions: row.field_revisions,
    sellerConfirmedFields: row.seller_confirmed_fields,
    sellerRejectedFields: row.seller_rejected_fields,
    sellerEditedFields: row.seller_edited_fields,
    errorMessage: row.error_message,
    extractedAt: row.extracted_at ? row.extracted_at.toISOString() : null,
    confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    readyForPublication: pendingRequired.length === 0,
    pendingRequiredFields: pendingRequired,
  };
}

/**
 * Compute which required fields are not yet resolved (confirmed or edited).
 * A field that was extracted but then rejected is NOT resolved — the seller
 * must either edit it or confirm a re-extracted value.
 */
function computePendingRequired(row: CatalogImportExtractionRow): string[] {
  const resolved = new Set<string>([
    ...row.seller_confirmed_fields,
    ...row.seller_edited_fields,
  ]);
  return REQUIRED_EXTRACTION_FIELDS.filter((f) => !resolved.has(f));
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const catalogImportService = new CatalogImportService();

export class ImporterExtractionService {
  // -------------------------------------------------------------------------
  // Queue + result storage
  // -------------------------------------------------------------------------

  /**
   * Create a pending extraction row and queue the extraction job. The caller
   * (route handler) is responsible for verifying item ownership before
   * calling this — the service performs a defensive ownership check too.
   *
   * Any previous non-superseded extraction for this item is marked
   * 'superseded' so only the latest run is active.
   */
  async queueExtraction(
    itemId: string,
    mediaAssetId: string | null,
    modelId: string,
    modelVersion: string,
    sellerUserId: string,
  ): Promise<CatalogImportExtractionRow> {
    // Defensive ownership check.
    await catalogImportService.getItem(sellerUserId, itemId);

    const extractionId = createId('extr');

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Supersede any prior active extraction for this item.
      await client.query(
        `UPDATE catalog_import_extractions
         SET extraction_status = 'superseded'
         WHERE item_id = $1
           AND extraction_status IN ('pending', 'completed')`,
        [itemId],
      );

      const result = await client.query(
        `INSERT INTO catalog_import_extractions (
           id, item_id, media_asset_id,
           extraction_model_id, extraction_model_version,
           extracted_fields, confidence_scores,
           field_revisions, seller_confirmed_fields,
           seller_rejected_fields, seller_edited_fields,
           extraction_status, created_at
         )
         VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, '{}'::jsonb,
                 '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
                 'pending', NOW())
         RETURNING *`,
        [extractionId, itemId, mediaAssetId, modelId, modelVersion],
      );

      await client.query('COMMIT');

      const row = mapExtractionRow(result.rows[0] as Record<string, unknown>);

      logger.info(
        { extractionId, itemId, mediaAssetId, modelId, modelVersion },
        'importerExtraction.queued',
      );

      return row;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Store the extraction result produced by the worker. Marks the extraction
   * as 'completed' (or 'failed' when an error is supplied). Idempotent: if
   * the extraction is already 'completed' with the same fields, this is a
   * no-op.
   */
  async processExtractionResult(
    extractionId: string,
    extractedFields: Record<string, unknown>,
    confidenceScores: Record<string, number>,
    errorMessage?: string | null,
  ): Promise<CatalogImportExtractionRow> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT * FROM catalog_import_extractions WHERE id = $1 FOR UPDATE`,
        [extractionId],
      );
      const row = existing.rows.length > 0
        ? mapExtractionRow(existing.rows[0] as Record<string, unknown>)
        : null;

      if (!row) {
        throw new CatalogImportError('item_not_found', 'Extraction not found');
      }

      // Idempotency: skip if already completed with the same fields.
      if (
        row.extraction_status === 'completed' &&
        JSON.stringify(row.extracted_fields) === JSON.stringify(extractedFields)
      ) {
        await client.query('COMMIT');
        return row;
      }

      if (row.extraction_status === 'superseded') {
        // A newer run has superseded this one; do not write results.
        await client.query('COMMIT');
        logger.info(
          { extractionId },
          'importerExtraction.processResult.skipped_superseded',
        );
        return row;
      }

      const status: ExtractionStatus = errorMessage ? 'failed' : 'completed';

      const result = await client.query(
        `UPDATE catalog_import_extractions
         SET extracted_fields = $2::jsonb,
             confidence_scores = $3::jsonb,
             extraction_status = $4,
             error_message = $5,
             extracted_at = CASE WHEN $4 = 'completed' THEN NOW() ELSE extracted_at END,
             created_at = created_at
         WHERE id = $1
         RETURNING *`,
        [
          extractionId,
          JSON.stringify(extractedFields),
          JSON.stringify(confidenceScores),
          status,
          errorMessage ?? null,
        ],
      );

      await client.query('COMMIT');

      const updated = mapExtractionRow(result.rows[0] as Record<string, unknown>);

      logger.info(
        { extractionId, status, fieldCount: Object.keys(extractedFields).length },
        'importerExtraction.processResult.stored',
      );

      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Seller confirmation gate
  // -------------------------------------------------------------------------

  /**
   * Mark a field as seller-confirmed. The field must exist in
   * extracted_fields (the model must have produced a value for it). A
   * confirmed field is removed from rejected/edited arrays to keep the
   * state consistent.
   */
  async confirmField(
    extractionId: string,
    fieldName: string,
    sellerUserId: string,
  ): Promise<CatalogImportExtractionRow> {
    return this.mutateFieldState(
      extractionId,
      fieldName,
      sellerUserId,
      'confirm',
      undefined,
    );
  }

  /**
   * Mark a field as seller-rejected. A rejected field will not enter the
   * listing draft. The seller may later edit it to provide a value.
   */
  async rejectField(
    extractionId: string,
    fieldName: string,
    sellerUserId: string,
  ): Promise<CatalogImportExtractionRow> {
    return this.mutateFieldState(
      extractionId,
      fieldName,
      sellerUserId,
      'reject',
      undefined,
    );
  }

  /**
   * Update a field with a seller edit. Records the revision (old value, new
   * value, timestamp, seller) in field_revisions, updates extracted_fields
   * with the new value, and marks the field as edited. An edited field is
   * treated as confirmed for publication purposes.
   */
  async editField(
    extractionId: string,
    fieldName: string,
    newValue: unknown,
    sellerUserId: string,
  ): Promise<CatalogImportExtractionRow> {
    return this.mutateFieldState(
      extractionId,
      fieldName,
      sellerUserId,
      'edit',
      newValue,
    );
  }

  /**
   * Internal helper that performs the field-state mutation under a row lock.
   * Validates item ownership through the extraction's item_id.
   */
  private async mutateFieldState(
    extractionId: string,
    fieldName: string,
    sellerUserId: string,
    action: 'confirm' | 'reject' | 'edit',
    newValue: unknown,
  ): Promise<CatalogImportExtractionRow> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT * FROM catalog_import_extractions WHERE id = $1 FOR UPDATE`,
        [extractionId],
      );
      const row = existing.rows.length > 0
        ? mapExtractionRow(existing.rows[0] as Record<string, unknown>)
        : null;

      if (!row) {
        throw new CatalogImportError('item_not_found', 'Extraction not found');
      }

      if (row.extraction_status !== 'completed') {
        throw new CatalogImportError(
          'validation_failed',
          `Extraction is not completed (status: ${row.extraction_status}). Cannot modify fields.`,
        );
      }

      // Validate item ownership.
      const itemResult = await client.query<{ user_id: string; id: string }>(
        `SELECT id, user_id FROM catalog_import_items WHERE id = $1 LIMIT 1`,
        [row.item_id],
      );
      assertOwnsItem(itemResult.rows[0] ?? null, sellerUserId);

      if (action === 'edit') {
        // Record the revision.
        const oldValue = row.extracted_fields[fieldName] ?? null;
        const revision: FieldRevision = {
          field: fieldName,
          oldValue,
          newValue,
          editedAt: new Date().toISOString(),
          sellerUserId,
        };
        const revisions = [...row.field_revisions, revision];

        // Update extracted_fields with the new value.
        const updatedFields = { ...row.extracted_fields, [fieldName]: newValue };

        // Mark as edited; remove from confirmed/rejected.
        const edited = new Set(row.seller_edited_fields);
        edited.add(fieldName);
        const confirmed = new Set(row.seller_confirmed_fields);
        confirmed.delete(fieldName);
        const rejected = new Set(row.seller_rejected_fields);
        rejected.delete(fieldName);

        const result = await client.query(
          `UPDATE catalog_import_extractions
           SET extracted_fields = $2::jsonb,
               field_revisions = $3::jsonb,
               seller_confirmed_fields = $4::jsonb,
               seller_rejected_fields = $5::jsonb,
               seller_edited_fields = $6::jsonb,
               confirmed_at = COALESCE(confirmed_at, NOW())
           WHERE id = $1
           RETURNING *`,
          [
            extractionId,
            JSON.stringify(updatedFields),
            JSON.stringify(revisions),
            JSON.stringify([...confirmed]),
            JSON.stringify([...rejected]),
            JSON.stringify([...edited]),
          ],
        );

        await client.query('COMMIT');

        logger.info(
          { extractionId, fieldName, action, sellerUserId },
          'importerExtraction.fieldEdited',
        );

        return mapExtractionRow(result.rows[0] as Record<string, unknown>);
      }

      // confirm or reject
      const confirmed = new Set(row.seller_confirmed_fields);
      const rejected = new Set(row.seller_rejected_fields);
      const edited = new Set(row.seller_edited_fields);

      if (action === 'confirm') {
        // The field must have been extracted by the model.
        if (!(fieldName in row.extracted_fields)) {
          throw new CatalogImportError(
            'validation_failed',
            `Field "${fieldName}" was not extracted by the model. Edit it to provide a value.`,
          );
        }
        confirmed.add(fieldName);
        rejected.delete(fieldName);
        edited.delete(fieldName);
      } else {
        // reject
        rejected.add(fieldName);
        confirmed.delete(fieldName);
        edited.delete(fieldName);
      }

      const result = await client.query(
        `UPDATE catalog_import_extractions
         SET seller_confirmed_fields = $2::jsonb,
             seller_rejected_fields = $3::jsonb,
             seller_edited_fields = $4::jsonb,
             confirmed_at = COALESCE(confirmed_at, NOW())
         WHERE id = $1
         RETURNING *`,
        [
          extractionId,
          JSON.stringify([...confirmed]),
          JSON.stringify([...rejected]),
          JSON.stringify([...edited]),
        ],
      );

      await client.query('COMMIT');

      logger.info(
        { extractionId, fieldName, action, sellerUserId },
        action === 'confirm'
          ? 'importerExtraction.fieldConfirmed'
          : 'importerExtraction.fieldRejected',
      );

      return mapExtractionRow(result.rows[0] as Record<string, unknown>);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Read + publication gate
  // -------------------------------------------------------------------------

  /**
   * Return the extraction with all fields, confidences, seller actions, and
   * the publication-readiness assessment.
   */
  async getExtractionSummary(
    extractionId: string,
  ): Promise<ExtractionSummaryDTO> {
    const result = await db.query(
      `SELECT * FROM catalog_import_extractions WHERE id = $1 LIMIT 1`,
      [extractionId],
    );
    const row = result.rows.length > 0
      ? mapExtractionRow(result.rows[0] as Record<string, unknown>)
      : null;

    if (!row) {
      throw new CatalogImportError('item_not_found', 'Extraction not found');
    }

    return toSummaryDTO(row);
  }

  /**
   * Return the latest (non-superseded) extraction for an item.
   */
  async getLatestExtractionForItem(
    itemId: string,
  ): Promise<CatalogImportExtractionRow | null> {
    const result = await db.query(
      `SELECT * FROM catalog_import_extractions
       WHERE item_id = $1 AND extraction_status != 'superseded'
       ORDER BY created_at DESC
       LIMIT 1`,
      [itemId],
    );
    return result.rows.length > 0
      ? mapExtractionRow(result.rows[0] as Record<string, unknown>)
      : null;
  }

  /**
   * The publication gate. Returns true only when every required field is
   * seller-confirmed or seller-edited. Rejected fields do not count. The
   * extraction must be in 'completed' status.
   *
   * This is the non-negotiable human confirmation gate: no field enters the
   * listing draft without seller sign-off.
   */
  async isReadyForPublication(extractionId: string): Promise<boolean> {
    const result = await db.query(
      `SELECT * FROM catalog_import_extractions WHERE id = $1 LIMIT 1`,
      [extractionId],
    );
    const row = result.rows.length > 0
      ? mapExtractionRow(result.rows[0] as Record<string, unknown>)
      : null;

    if (!row) {
      return false;
    }

    if (row.extraction_status !== 'completed') {
      return false;
    }

    const pending = computePendingRequired(row);
    return pending.length === 0;
  }

  /**
   * Return the confirmed/edited fields as a plain record, suitable for
   * merging into a listing draft. Only fields that are seller-confirmed or
   * seller-edited are included — rejected and unconfirmed fields are
   * excluded. This is the single function that bridges extraction results
   * into the listing draft, and it enforces the confirmation gate.
   */
  async getConfirmedFields(
    extractionId: string,
  ): Promise<Record<string, unknown>> {
    const result = await db.query(
      `SELECT * FROM catalog_import_extractions WHERE id = $1 LIMIT 1`,
      [extractionId],
    );
    const row = result.rows.length > 0
      ? mapExtractionRow(result.rows[0] as Record<string, unknown>)
      : null;

    if (!row) {
      throw new CatalogImportError('item_not_found', 'Extraction not found');
    }

    const allowed = new Set<string>([
      ...row.seller_confirmed_fields,
      ...row.seller_edited_fields,
    ]);

    const confirmed: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(row.extracted_fields)) {
      if (allowed.has(field)) {
        confirmed[field] = value;
      }
    }

    return confirmed;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const importerExtractionService = new ImporterExtractionService();
