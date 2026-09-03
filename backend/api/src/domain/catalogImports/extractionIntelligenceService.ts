/**
 * Extraction Intelligence — Domain Service
 *
 * Owns the lifecycle of ML-assisted extraction runs, field candidates, and
 * the revision-checked seller decision command that converges extraction
 * evidence into the canonical importer domain.
 *
 * This is the successor to importerExtractionService. The old service's
 * mutable extracted_fields blob, JSON field-state arrays, and false
 * completion semantics are replaced by:
 *   - catalog_import_extraction_runs (job_state + outcome)
 *   - catalog_import_field_candidates (per-field evidence)
 *   - catalog_import_field_decisions (revision-checked seller decisions)
 *
 * The atomic applyFieldDecision command writes, in one transaction:
 *   1. catalog_import_field_decisions row
 *   2. catalog_import_items.normalised_fields (revision-checked merge)
 *   3. catalog_import_items.field_revision (new revision)
 *   4. catalog_import_field_provenance (canonical audit row)
 *   5. catalog_import_events (decision event)
 *
 * This eliminates the authority conflict between extraction's
 * extracted_fields and the importer's normalised_fields. There is now one
 * provenance authority: catalog_import_field_provenance.
 *
 * Security (per flagship report §11):
 * - Media assets are resolved through catalog_import_media for the owned
 *   item, never via a global media_assets SELECT.
 * - Model identity is server-selected from model_artifacts. The client
 *   never supplies modelId/modelVersion.
 * - Outcomes are honest: unavailable_no_model / source_missing / partial
 *   are never recorded as 'completed'.
 */

import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { CatalogImportError } from './catalogImportTypes.js';
import type {
  ExtractionRunRow,
  FieldCandidateRow,
  FieldDecisionRow,
  ExtractionJobState,
  ExtractionOutcome,
  FieldCandidateDTO,
  ExtractionRunDTO,
  FieldDecisionDTO,
  FieldDecisionKind,
  CandidateValidationState,
  CandidateSourceModule,
  BulkFieldDecisionResult,
} from './extractionIntelligenceTypes.js';
import {
  EMPTY_OUTCOMES,
  PRODUCTIVE_OUTCOMES,
} from './extractionIntelligenceTypes.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The model_artifacts task identifier for catalogue import extraction. */
export const EXTRACTION_MODEL_TASK = 'catalogue_import' as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function computeRequestHash(
  itemId: string,
  inputRevision: string,
  modelBundleId: string,
  modelBundleVersion: string,
): string {
  const stable = JSON.stringify({
    itemId,
    inputRevision,
    modelBundleId,
    modelBundleVersion,
  });
  return crypto.createHash('sha256').update(stable).digest('hex');
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

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapRunRow(row: Record<string, unknown>): ExtractionRunRow {
  return {
    id: row.id as string,
    item_id: row.item_id as string,
    input_revision: row.input_revision as string,
    model_bundle_id: row.model_bundle_id as string,
    model_bundle_version: row.model_bundle_version as string,
    request_hash: row.request_hash as string,
    media_asset_id: (row.media_asset_id as string | null) ?? null,
    job_state: row.job_state as ExtractionJobState,
    outcome: (row.outcome as ExtractionOutcome | null) ?? null,
    attempt_count: Number(row.attempt_count ?? 0),
    error_code: (row.error_code as string | null) ?? null,
    idempotency_key: row.idempotency_key as string,
    started_at: (row.started_at as Date | null) ?? null,
    completed_at: (row.completed_at as Date | null) ?? null,
    created_at: row.created_at as Date,
  };
}

function mapCandidateRow(row: Record<string, unknown>): FieldCandidateRow {
  return {
    id: row.id as string,
    run_id: row.run_id as string,
    item_id: row.item_id as string,
    field_name: row.field_name as string,
    candidate_json: row.candidate_json,
    rank: Number(row.rank ?? 1),
    evidence_json: (row.evidence_json as Record<string, unknown>) ?? {},
    calibrated_confidence: (row.calibrated_confidence as number | null) ?? null,
    abstained: Boolean(row.abstained ?? false),
    validation_state: row.validation_state as CandidateValidationState,
    policy_flags: (row.policy_flags as string[]) ?? [],
    source_module: row.source_module as CandidateSourceModule,
    created_at: row.created_at as Date,
  };
}

function mapDecisionRow(row: Record<string, unknown>): FieldDecisionRow {
  return {
    id: row.id as string,
    item_id: row.item_id as string,
    candidate_id: (row.candidate_id as string | null) ?? null,
    run_id: row.run_id as string,
    field_name: row.field_name as string,
    actor_id: row.actor_id as string,
    decision: row.decision as FieldDecisionKind,
    final_value_json: row.final_value_json,
    base_field_revision: row.base_field_revision as string,
    applied_field_revision: (row.applied_field_revision as string | null) ?? null,
    idempotency_key: row.idempotency_key as string,
    applied_at: (row.applied_at as Date | null) ?? null,
    created_at: row.created_at as Date,
  };
}

function toCandidateDTO(row: FieldCandidateRow): FieldCandidateDTO {
  return {
    id: row.id,
    fieldName: row.field_name,
    value: row.candidate_json,
    rank: row.rank,
    calibratedConfidence: row.calibrated_confidence,
    abstained: row.abstained,
    validationState: row.validation_state,
    policyFlags: row.policy_flags,
    sourceModule: row.source_module,
    evidence: row.evidence_json,
  };
}

function toRunDTO(
  run: ExtractionRunRow,
  candidates: FieldCandidateRow[],
): ExtractionRunDTO {
  const candidateDTOs = candidates.map(toCandidateDTO);
  const covered = new Set<string>();
  const abstained = new Set<string>();
  const flagged = new Set<string>();

  for (const c of candidates) {
    if (c.abstained) {
      abstained.add(c.field_name);
    } else if (
      c.validation_state === 'invalid' ||
      c.validation_state === 'warning'
    ) {
      flagged.add(c.field_name);
    } else {
      covered.add(c.field_name);
    }
  }

  const isEmpty =
    run.outcome === null
      ? false
      : EMPTY_OUTCOMES.has(run.outcome) || candidateDTOs.length === 0;

  return {
    id: run.id,
    itemId: run.item_id,
    modelBundleId: run.model_bundle_id,
    modelBundleVersion: run.model_bundle_version,
    mediaAssetId: run.media_asset_id,
    jobState: run.job_state,
    outcome: run.outcome,
    errorCode: run.error_code,
    attemptCount: run.attempt_count,
    startedAt: run.started_at ? run.started_at.toISOString() : null,
    completedAt: run.completed_at ? run.completed_at.toISOString() : null,
    createdAt: run.created_at.toISOString(),
    candidates: candidateDTOs,
    coveredFields: [...covered],
    abstainedFields: [...abstained],
    flaggedFields: [...flagged],
    isEmpty,
  };
}

function toDecisionDTO(row: FieldDecisionRow): FieldDecisionDTO {
  return {
    id: row.id,
    itemId: row.item_id,
    candidateId: row.candidate_id,
    runId: row.run_id,
    fieldName: row.field_name,
    decision: row.decision,
    finalValue: row.final_value_json,
    appliedFieldRevision: row.applied_field_revision,
    appliedAt: row.applied_at ? row.applied_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Server-owned model selection
// ---------------------------------------------------------------------------

interface ModelBundleRow {
  model_id: string;
  model_version: string;
  status: string;
}

/**
 * Resolve the active model bundle for catalogue import extraction from
 * model_artifacts. The client never supplies model identity — the server
 * owns this selection from the capability registry.
 *
 * Returns null when no model is registered/active. The caller records this
 * as outcome='unavailable_no_model' — an honest "no model loaded" that does
 * NOT count as a successful extraction.
 */
export async function resolveActiveModelBundle(): Promise<ModelBundleRow | null> {
  const result = await db.query<ModelBundleRow>(
    `SELECT model_id, model_version, status
     FROM model_artifacts
     WHERE task = $1 AND status = 'active'
     ORDER BY model_version DESC, created_at DESC
     LIMIT 1`,
    [EXTRACTION_MODEL_TASK],
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

// ---------------------------------------------------------------------------
// Media asset binding (security fix for P0 cross-tenant defect)
// ---------------------------------------------------------------------------

interface BoundMediaAsset {
  media_asset_id: string;
  canonical_url: string | null;
  original_object_url: string | null;
  fetch_status: string;
  moderation_status: string | null;
  publishability: string | null;
}

/**
 * Resolve a media asset for extraction, BOUND through catalog_import_media
 * for the owned item. This replaces the old global SELECT on media_assets
 * (importerExtractionHandler.ts:107–112) which allowed any user who knew a
 * mediaAssetId to trigger extraction on another user's media.
 *
 * When mediaAssetId is null, the item's primary verified media is used.
 * The media must be verified and publishable — quarantined or failed media
 * is rejected.
 */
export async function resolveBoundMediaAsset(
  itemId: string,
  userId: string,
  mediaAssetId: string | null,
): Promise<BoundMediaAsset> {
  const client = await db.connect();
  try {
    // Verify item ownership first.
    const itemResult = await client.query<{ user_id: string; id: string }>(
      `SELECT id, user_id FROM catalog_import_items WHERE id = $1 LIMIT 1`,
      [itemId],
    );
    assertOwnsItem(itemResult.rows[0] ?? null, userId);

    if (mediaAssetId) {
      // Bind through catalog_import_media: the asset must belong to this item.
      const result = await client.query<BoundMediaAsset>(
        `SELECT m.media_asset_id, a.canonical_url, a.original_object_url,
                m.fetch_status, m.moderation_status, m.publishability
         FROM catalog_import_media m
         JOIN media_assets a ON a.id = m.media_asset_id
         WHERE m.import_item_id = $1 AND m.media_asset_id = $2
         LIMIT 1`,
        [itemId, mediaAssetId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new CatalogImportError(
          'validation_failed',
          'Media asset is not associated with this import item',
        );
      }
      return row;
    }

    // No specific asset — use the item's primary verified media.
    const result = await client.query<BoundMediaAsset>(
      `SELECT m.media_asset_id, a.canonical_url, a.original_object_url,
              m.fetch_status, m.moderation_status, m.publishability
       FROM catalog_import_media m
       JOIN media_assets a ON a.id = m.media_asset_id
       WHERE m.import_item_id = $1
         AND m.fetch_status = 'verified'
       ORDER BY m.position ASC
       LIMIT 1`,
      [itemId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new CatalogImportError(
        'validation_failed',
        'No verified media available for this item',
      );
    }
    return row;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ExtractionIntelligenceService {
  // -------------------------------------------------------------------------
  // Run lifecycle
  // -------------------------------------------------------------------------

  /**
   * Queue a new extraction run. Server selects the model bundle; the client
   * never supplies model identity. The run is bound to the item's current
   * field_revision — if the item changes, the run is superseded.
   *
   * Idempotent: a run with the same (item, input_revision, model_bundle)
   * already exists returns the existing row.
   */
  async queueRun(
    itemId: string,
    userId: string,
    mediaAssetId: string | null,
  ): Promise<ExtractionRunRow> {
    // 1. Verify item ownership and get current field_revision.
    const itemResult = await db.query<{ user_id: string; field_revision: string }>(
      `SELECT user_id, field_revision FROM catalog_import_items WHERE id = $1 LIMIT 1`,
      [itemId],
    );
    const item = itemResult.rows[0];
    assertOwnsItem(
      item ? { user_id: item.user_id, id: itemId } : null,
      userId,
    );
    const inputRevision = item.field_revision;

    // 2. Server-select the model bundle.
    const modelBundle = await resolveActiveModelBundle();

    // If no model is active, we still create the run but immediately mark
    // it terminal with outcome='unavailable_no_model'. This is honest: the
    // seller sees "extraction unavailable" and manual review remains fully
    // usable. We do NOT record a false 'completed'.
    if (!modelBundle) {
      return this.recordUnavailableRun(
        itemId,
        inputRevision,
        'placeholder-no-model',
        'v0',
        mediaAssetId,
      );
    }

    const modelBundleId = modelBundle.model_id;
    const modelBundleVersion = modelBundle.model_version;
    const requestHash = computeRequestHash(
      itemId,
      inputRevision,
      modelBundleId,
      modelBundleVersion,
    );
    const idempotencyKey = requestHash;
    const runId = createId('extr');

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Supersede any prior non-terminal runs for this item.
      await client.query(
        `UPDATE catalog_import_extraction_runs
         SET job_state = 'superseded'
         WHERE item_id = $1 AND job_state IN ('queued', 'running', 'retry_wait')`,
        [itemId],
      );

      // Insert the new run. If a run with the same (item, input_revision,
      // model_bundle) already exists (e.g. re-trigger), the INSERT is a no-op
      // and we re-query the existing row. We do NOT use DO UPDATE because the
      // prior run may have been superseded by the UPDATE above — DO UPDATE
      // would return the superseded row with job_state='superseded', causing
      // the route to enqueue a wasted worker job.
      const insertResult = await client.query(
        `INSERT INTO catalog_import_extraction_runs (
            id, item_id, input_revision,
            model_bundle_id, model_bundle_version, request_hash,
            media_asset_id, job_state, outcome,
            attempt_count, error_code, idempotency_key,
            started_at, completed_at, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', NULL,
                  0, NULL, $8, NULL, NULL, NOW())
          ON CONFLICT (item_id, input_revision, model_bundle_id, model_bundle_version)
          DO NOTHING
          RETURNING *`,
        [
          runId,
          itemId,
          inputRevision,
          modelBundleId,
          modelBundleVersion,
          requestHash,
          mediaAssetId,
          idempotencyKey,
        ],
      );

      let row: ExtractionRunRow;
      if (insertResult.rows.length > 0) {
        row = mapRunRow(insertResult.rows[0] as Record<string, unknown>);
      } else {
        // Conflict: a run with the same key already exists. Re-query it.
        const existing = await client.query(
          `SELECT * FROM catalog_import_extraction_runs
           WHERE item_id = $1 AND input_revision = $2
             AND model_bundle_id = $3 AND model_bundle_version = $4
           LIMIT 1`,
          [itemId, inputRevision, modelBundleId, modelBundleVersion],
        );
        row = mapRunRow(existing.rows[0] as Record<string, unknown>);
      }

      await client.query('COMMIT');

      logger.info(
        { runId: row.id, itemId, modelBundleId, modelBundleVersion, jobState: row.job_state },
        'extractionIntelligence.runQueued',
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
   * Record a run when no model is available. The run is immediately terminal
   * with outcome='unavailable_no_model'. This is the honest replacement for
   * the old false-completion placeholder.
   */
  private async recordUnavailableRun(
    itemId: string,
    inputRevision: string,
    modelBundleId: string,
    modelBundleVersion: string,
    mediaAssetId: string | null,
  ): Promise<ExtractionRunRow> {
    const requestHash = computeRequestHash(
      itemId,
      inputRevision,
      modelBundleId,
      modelBundleVersion,
    );
    const runId = createId('extr');

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE catalog_import_extraction_runs
         SET job_state = 'superseded'
         WHERE item_id = $1 AND job_state IN ('queued', 'running', 'retry_wait')`,
        [itemId],
      );

      const result = await client.query(
        `INSERT INTO catalog_import_extraction_runs (
            id, item_id, input_revision,
            model_bundle_id, model_bundle_version, request_hash,
            media_asset_id, job_state, outcome,
            attempt_count, error_code, idempotency_key,
            started_at, completed_at, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'terminal', 'unavailable_no_model',
                  0, 'no_active_model', $8, NOW(), NOW(), NOW())
          ON CONFLICT (item_id, input_revision, model_bundle_id, model_bundle_version)
          DO NOTHING
          RETURNING *`,
        [
          runId,
          itemId,
          inputRevision,
          modelBundleId,
          modelBundleVersion,
          requestHash,
          mediaAssetId,
          requestHash,
        ],
      );

      let row: ExtractionRunRow;
      if (result.rows.length > 0) {
        row = mapRunRow(result.rows[0] as Record<string, unknown>);
      } else {
        // Conflict: a run with the same key already exists. Re-query it.
        const existing = await client.query(
          `SELECT * FROM catalog_import_extraction_runs
           WHERE item_id = $1 AND input_revision = $2
             AND model_bundle_id = $3 AND model_bundle_version = $4
           LIMIT 1`,
          [itemId, inputRevision, modelBundleId, modelBundleVersion],
        );
        if (existing.rows.length === 0) {
          // Should not happen — the conflict was on a different constraint.
          // Fall back to the idempotency_key constraint.
          const fallback = await client.query(
            `SELECT * FROM catalog_import_extraction_runs
             WHERE item_id = $1 AND idempotency_key = $2 LIMIT 1`,
            [itemId, requestHash],
          );
          row = mapRunRow(fallback.rows[0] as Record<string, unknown>);
        } else {
          row = mapRunRow(existing.rows[0] as Record<string, unknown>);
        }
      }

      await client.query('COMMIT');

      logger.info(
        { runId: row.id, itemId, outcome: 'unavailable_no_model' },
        'extractionIntelligence.runUnavailableNoModel',
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
   * Transition a run's job_state. Validates the transition is legal.
   */
  async transitionRunState(
    runId: string,
    newJobState: ExtractionJobState,
    outcome?: ExtractionOutcome | null,
    errorCode?: string | null,
  ): Promise<ExtractionRunRow> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT * FROM catalog_import_extraction_runs WHERE id = $1 FOR UPDATE`,
        [runId],
      );
      const row = existing.rows.length > 0
        ? mapRunRow(existing.rows[0] as Record<string, unknown>)
        : null;

      if (!row) {
        throw new CatalogImportError('item_not_found', 'Extraction run not found');
      }

      if (row.job_state === 'superseded') {
        // A newer run has superseded this one; do not write results.
        await client.query('COMMIT');
        logger.info(
          { runId },
          'extractionIntelligence.transitionRunState.skipped_superseded',
        );
        return row;
      }

      const result = await client.query(
        `UPDATE catalog_import_extraction_runs
         SET job_state = $2,
             outcome = COALESCE($3, outcome),
             error_code = COALESCE($4, error_code),
             started_at = CASE WHEN $2 = 'running' AND started_at IS NULL THEN NOW() ELSE started_at END,
             completed_at = CASE WHEN $2 = 'terminal' THEN NOW() ELSE completed_at END,
             attempt_count = CASE WHEN $2 = 'running' THEN attempt_count + 1 ELSE attempt_count END
         WHERE id = $1
         RETURNING *`,
        [runId, newJobState, outcome ?? null, errorCode ?? null],
      );

      await client.query('COMMIT');

      return mapRunRow(result.rows[0] as Record<string, unknown>);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Candidate storage
  // -------------------------------------------------------------------------

  /**
   * Store the extraction result: transition the run to terminal with the
   * honest outcome, and insert field candidates.
   */
  async storeExtractionResult(
    runId: string,
    outcome: ExtractionOutcome,
    candidates: Array<{
      fieldName: string;
      value: unknown;
      rank?: number;
      evidence?: Record<string, unknown>;
      calibratedConfidence?: number | null;
      abstained?: boolean;
      validationState?: CandidateValidationState;
      policyFlags?: string[];
      sourceModule?: CandidateSourceModule;
    }>,
    errorCode?: string | null,
  ): Promise<ExtractionRunRow> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Lock and validate the run.
      const existing = await client.query(
        `SELECT * FROM catalog_import_extraction_runs WHERE id = $1 FOR UPDATE`,
        [runId],
      );
      const run = existing.rows.length > 0
        ? mapRunRow(existing.rows[0] as Record<string, unknown>)
        : null;

      if (!run) {
        throw new CatalogImportError('item_not_found', 'Extraction run not found');
      }

      if (run.job_state === 'superseded') {
        await client.query('COMMIT');
        logger.info(
          { runId },
          'extractionIntelligence.storeResult.skipped_superseded',
        );
        return run;
      }

      // Transition to terminal with the honest outcome.
      await client.query(
        `UPDATE catalog_import_extraction_runs
         SET job_state = 'terminal',
             outcome = $2,
             error_code = COALESCE($3, error_code),
             completed_at = NOW()
         WHERE id = $1`,
        [runId, outcome, errorCode ?? null],
      );

      // Insert candidates. Skip when outcome is an empty outcome (no
      // candidates to store — this is the honest behaviour for
      // unavailable_no_model / source_missing / failed).
      if (!EMPTY_OUTCOMES.has(outcome)) {
        for (const c of candidates) {
          const candidateId = createId('cand');
          await client.query(
            `INSERT INTO catalog_import_field_candidates (
                id, run_id, item_id, field_name,
                candidate_json, rank, evidence_json,
                calibrated_confidence, abstained,
                validation_state, policy_flags, source_module,
                created_at
              )
              VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb,
                      $8, $9, $10, $11::jsonb, $12, NOW())
              ON CONFLICT (run_id, field_name, rank) DO NOTHING`,
            [
              candidateId,
              runId,
              run.item_id,
              c.fieldName,
              JSON.stringify(c.value),
              c.rank ?? 1,
              JSON.stringify(c.evidence ?? {}),
              c.calibratedConfidence ?? null,
              c.abstained ?? false,
              c.validationState ?? 'unvalidated',
              JSON.stringify(c.policyFlags ?? []),
              c.sourceModule ?? 'unknown',
            ],
          );
        }
      }

      await client.query('COMMIT');

      logger.info(
        { runId, outcome, candidateCount: candidates.length },
        'extractionIntelligence.storeResult.stored',
      );

      return mapRunRow(
        (await client.query(
          `SELECT * FROM catalog_import_extraction_runs WHERE id = $1 LIMIT 1`,
          [runId],
        )).rows[0] as Record<string, unknown>,
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Read queries
  // -------------------------------------------------------------------------

  /**
   * Get the latest (non-superseded) extraction run for an item, with its
   * candidates.
   */
  async getLatestRunForItem(
    itemId: string,
  ): Promise<ExtractionRunDTO | null> {
    const runResult = await db.query(
      `SELECT * FROM catalog_import_extraction_runs
       WHERE item_id = $1 AND job_state != 'superseded'
       ORDER BY created_at DESC
       LIMIT 1`,
      [itemId],
    );
    if (runResult.rows.length === 0) return null;

    const run = mapRunRow(runResult.rows[0] as Record<string, unknown>);

    const candidateResult = await db.query(
      `SELECT * FROM catalog_import_field_candidates
       WHERE run_id = $1
       ORDER BY field_name, rank`,
      [run.id],
    );
    const candidates = candidateResult.rows.map((r) =>
      mapCandidateRow(r as Record<string, unknown>),
    );

    return toRunDTO(run, candidates);
  }

  /**
   * Get a specific run by ID, with its candidates.
   */
  async getRun(
    runId: string,
  ): Promise<ExtractionRunDTO | null> {
    const runResult = await db.query(
      `SELECT * FROM catalog_import_extraction_runs WHERE id = $1 LIMIT 1`,
      [runId],
    );
    if (runResult.rows.length === 0) return null;

    const run = mapRunRow(runResult.rows[0] as Record<string, unknown>);

    const candidateResult = await db.query(
      `SELECT * FROM catalog_import_field_candidates
       WHERE run_id = $1
       ORDER BY field_name, rank`,
      [runId],
    );
    const candidates = candidateResult.rows.map((r) =>
      mapCandidateRow(r as Record<string, unknown>),
    );

    return toRunDTO(run, candidates);
  }

  // -------------------------------------------------------------------------
  // Atomic field-decision command (the convergence)
  // -------------------------------------------------------------------------

  /**
   * Apply a seller's field decision. This is the single command that
   * bridges extraction candidates into the canonical importer domain.
   *
   * In ONE transaction under FOR UPDATE lock:
   *   1. Validates item ownership and field_revision (optimistic concurrency).
   *   2. Writes the catalog_import_field_decisions row.
   *   3. For accepted/edited: merges the final value into normalised_fields
   *      and bumps field_revision.
   *   4. For accepted/edited: writes a catalog_import_field_provenance row
   *      with source_kind='ai_suggestion' (the extraction candidate was the
   *      source; the seller accepted it).
   *   5. Writes a catalog_import_events row.
   *
   * Rejected decisions do not mutate normalised_fields — they only record
   * the seller's rejection for audit.
   *
   * Idempotent: a decision with the same (item, idempotency_key) returns
   * the existing decision.
   */
  async applyFieldDecision(input: {
    itemId: string;
    runId: string;
    candidateId: string | null;
    fieldName: string;
    actorId: string;
    decision: FieldDecisionKind;
    finalValue: unknown;
    baseFieldRevision: string;
    idempotencyKey: string;
  }): Promise<FieldDecisionDTO> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock the item and validate ownership + revision.
      const itemResult = await client.query<
        { id: string; user_id: string; field_revision: string; batch_id: string; normalised_fields: Record<string, unknown> | null }
      >(
        `SELECT id, user_id, field_revision, batch_id, normalised_fields
         FROM catalog_import_items WHERE id = $1 FOR UPDATE`,
        [input.itemId],
      );
      const item = itemResult.rows[0];
      if (!item) {
        throw new CatalogImportError('item_not_found', 'Item not found');
      }
      assertOwnsItem(
        { user_id: item.user_id, id: item.id },
        input.actorId,
      );

      // Optimistic concurrency: if the item changed since the seller last
      // read it, reject the decision with a revision conflict.
      if (item.field_revision !== input.baseFieldRevision) {
        await client.query('COMMIT');
        throw new CatalogImportError(
          'approval_revision_mismatch',
          'The item has been modified since you last read it. Please refresh and try again.',
        );
      }

      // 2. Idempotency check: if a decision with the same key exists,
      // return it.
      const existingDecision = await client.query(
        `SELECT * FROM catalog_import_field_decisions
         WHERE item_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [input.itemId, input.idempotencyKey],
      );
      if (existingDecision.rows.length > 0) {
        const row = mapDecisionRow(existingDecision.rows[0] as Record<string, unknown>);
        await client.query('COMMIT');
        return toDecisionDTO(row);
      }

      const decisionId = createId('fdec');
      let appliedFieldRevision: string | null = null;
      // We'll capture the inserted row via RETURNING * to avoid a
      // post-commit read on a separate connection (race condition).
      let insertedDecisionRow: Record<string, unknown> | null = null;

      if (input.decision === 'rejected') {
        // Rejected: record the decision but do NOT mutate normalised_fields.
        // Write an event for audit (rejections are part of the audit trail).
        const result = await client.query(
          `INSERT INTO catalog_import_field_decisions (
              id, item_id, candidate_id, run_id, field_name,
              actor_id, decision, final_value_json,
              base_field_revision, applied_field_revision,
              idempotency_key, applied_at, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'rejected', NULL,
                    $7, NULL, $8, NOW(), NOW())
            RETURNING *`,
          [
            decisionId,
            input.itemId,
            input.candidateId,
            input.runId,
            input.fieldName,
            input.actorId,
            input.baseFieldRevision,
            input.idempotencyKey,
          ],
        );
        insertedDecisionRow = result.rows[0] as Record<string, unknown>;

        // Write an event for audit — rejections are part of the audit trail.
        await client.query(
          `INSERT INTO catalog_import_events (id, batch_id, item_id, event_type, payload, created_at)
           VALUES ($1, $2, $3, 'extraction_field_decision', $4::jsonb, NOW())`,
          [
            createId('evt'),
            item.batch_id,
            input.itemId,
            JSON.stringify({
              decisionId,
              runId: input.runId,
              candidateId: input.candidateId,
              fieldName: input.fieldName,
              decision: 'rejected',
              appliedFieldRevision: null,
              actorId: input.actorId,
            }),
          ],
        );
      } else {
        // Accepted or edited: merge into normalised_fields, bump revision,
        // write provenance.
        appliedFieldRevision = createId('frev');
        const currentFields = item.normalised_fields ?? {};
        const mergedFields = {
          ...currentFields,
          [input.fieldName]: {
            value: input.finalValue,
            sourceKind: 'ai_suggestion',
            sourceValue: input.finalValue,
            confidence: 'high' as const,
            reasonCode: 'seller_accepted_extraction',
          },
        };

        await client.query(
          `UPDATE catalog_import_items
           SET normalised_fields = $2::jsonb,
               field_revision = $3,
               updated_at = NOW()
           WHERE id = $1`,
          [input.itemId, JSON.stringify(mergedFields), appliedFieldRevision],
        );

        // Write canonical provenance row.
        const provenanceId = `${input.itemId}:${input.fieldName}:${appliedFieldRevision}`;
        await client.query(
          `INSERT INTO catalog_import_field_provenance (
              id, import_item_id, field_name,
              source_kind, source_value_json, resolved_value_json,
              confidence, mapping_version, changed_by, changed_at, reason_code
            )
            VALUES ($1, $2, $3, 'ai_suggestion', $4::jsonb, $5::jsonb,
                    'high', NULL, $6, NOW(), 'seller_accepted_extraction')
            ON CONFLICT (id) DO NOTHING`,
          [
            provenanceId,
            input.itemId,
            input.fieldName,
            JSON.stringify(input.finalValue),
            JSON.stringify(input.finalValue),
            input.actorId,
          ],
        );

        // Write the decision row with RETURNING * to capture the row
        // inside the transaction (avoids a post-commit read race).
        const decisionResult = await client.query(
          `INSERT INTO catalog_import_field_decisions (
              id, item_id, candidate_id, run_id, field_name,
              actor_id, decision, final_value_json,
              base_field_revision, applied_field_revision,
              idempotency_key, applied_at, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb,
                    $9, $10, $11, NOW(), NOW())
            RETURNING *`,
          [
            decisionId,
            input.itemId,
            input.candidateId,
            input.runId,
            input.fieldName,
            input.actorId,
            input.decision,
            JSON.stringify(input.finalValue),
            input.baseFieldRevision,
            appliedFieldRevision,
            input.idempotencyKey,
          ],
        );
        insertedDecisionRow = decisionResult.rows[0] as Record<string, unknown>;

        // Write an event for audit.
        await client.query(
          `INSERT INTO catalog_import_events (id, batch_id, item_id, event_type, payload, created_at)
           VALUES ($1, $2, $3, 'extraction_field_decision', $4::jsonb, NOW())`,
          [
            createId('evt'),
            item.batch_id,
            input.itemId,
            JSON.stringify({
              decisionId,
              runId: input.runId,
              candidateId: input.candidateId,
              fieldName: input.fieldName,
              decision: input.decision,
              appliedFieldRevision,
              actorId: input.actorId,
            }),
          ],
        );
      }

      await client.query('COMMIT');

      const row = mapDecisionRow(insertedDecisionRow as Record<string, unknown>);

      logger.info(
        {
          decisionId,
          itemId: input.itemId,
          fieldName: input.fieldName,
          decision: input.decision,
          appliedFieldRevision,
        },
        'extractionIntelligence.fieldDecisionApplied',
      );

      return toDecisionDTO(row);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Apply multiple field decisions for a single item. Each accepted/edited
   * decision bumps the item's field_revision, so the baseFieldRevision is
   * updated after each successful apply to avoid revision conflicts on
   * subsequent decisions in the same batch. Rejected decisions do not bump
   * the revision. Conflicts (e.g. concurrent modification) are reported,
   * and prior decisions are retained — the seller must refresh and re-decide
   * only the conflicting fields.
   */
  async applyBulkFieldDecisions(
    itemId: string,
    actorId: string,
    baseFieldRevision: string,
    decisions: Array<{
      runId: string;
      candidateId: string | null;
      fieldName: string;
      decision: FieldDecisionKind;
      finalValue: unknown;
    }>,
  ): Promise<BulkFieldDecisionResult> {
    if (decisions.length === 0) {
      return { applied: 0, rejected: 0, conflicts: [] };
    }

    let applied = 0;
    let rejected = 0;
    let currentRevision = baseFieldRevision;
    const conflicts: BulkFieldDecisionResult['conflicts'] = [];

    for (const d of decisions) {
      const idempotencyKey = `${itemId}:${currentRevision}:${d.fieldName}:${d.decision}`;
      try {
        const result = await this.applyFieldDecision({
          itemId,
          runId: d.runId,
          candidateId: d.candidateId,
          fieldName: d.fieldName,
          actorId,
          decision: d.decision,
          finalValue: d.finalValue,
          baseFieldRevision: currentRevision,
          idempotencyKey,
        });
        if (result.decision === 'rejected') {
          rejected += 1;
        } else {
          applied += 1;
          // Accepted/edited decisions bump the revision. Update
          // currentRevision so the next decision in the batch uses the
          // fresh revision — otherwise it would conflict.
          if (result.appliedFieldRevision) {
            currentRevision = result.appliedFieldRevision;
          }
        }
      } catch (error) {
        if (error instanceof CatalogImportError && error.code === 'approval_revision_mismatch') {
          conflicts.push({
            itemId,
            fieldName: d.fieldName,
            reason: 'Item was modified since you last read it. Please refresh and re-decide this field.',
          });
        } else {
          throw error;
        }
      }
    }

    return { applied, rejected, conflicts };
  }

  // -------------------------------------------------------------------------
  // Decision history
  // -------------------------------------------------------------------------

  /**
   * Get all field decisions for an item, newest-first.
   */
  async getDecisionsForItem(
    itemId: string,
  ): Promise<FieldDecisionDTO[]> {
    const result = await db.query(
      `SELECT * FROM catalog_import_field_decisions
       WHERE item_id = $1
       ORDER BY created_at DESC`,
      [itemId],
    );
    return result.rows.map((r) =>
      toDecisionDTO(mapDecisionRow(r as Record<string, unknown>)),
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const extractionIntelligenceService = new ExtractionIntelligenceService();
