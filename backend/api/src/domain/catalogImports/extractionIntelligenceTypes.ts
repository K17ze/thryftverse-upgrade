/**
 * Importer Extraction Intelligence — Domain Types
 *
 * Canonical contracts for the converged extraction domain (migration 192).
 * Replaces the coarse pending/completed/failed/superseded status from the
 * old importerExtractionService with a two-dimensional job_state + outcome
 * model, per-flagship report §5.3.
 *
 * Design principles (per AGENTS.md and flagship report §6, §8):
 * - Extraction produces CANDIDATE EVIDENCE, not facts. The importer item
 *   domain owns accepted normalised fields.
 * - Seller acceptance calls one revision-checked command that writes
 *   normalised_fields + catalog_import_field_provenance + decision + event
 *   atomically. No competing review/provenance systems.
 * - Model identity is server-owned from model_artifacts. The client never
 *   supplies arbitrary modelId/modelVersion.
 * - Media assets are bound through catalog_import_media for the owned item.
 *   No global media asset resolution.
 * - Honest outcomes: unavailable_no_model / source_missing / partial are
 *   never recorded as 'completed'. A terminal job is not a success.
 * - Required fields are taxonomy-driven, not one hardcoded array.
 */

// ---------------------------------------------------------------------------
// Job lifecycle (report §5.3)
// ---------------------------------------------------------------------------

export type ExtractionJobState =
  | 'queued'
  | 'running'
  | 'retry_wait'
  | 'terminal'
  | 'superseded';

export const EXTRACTION_JOB_STATES: readonly ExtractionJobState[] = [
  'queued',
  'running',
  'retry_wait',
  'terminal',
  'superseded',
] as const;

/**
 * Intelligence outcome. NULL until job_state = 'terminal'.
 *
 * `completed` is workflow terminality, NOT intelligence success. A partial
 * run can contain valid candidates; an unavailable run contains none and
 * must not count as model success.
 */
export type ExtractionOutcome =
  | 'succeeded'
  | 'partial'
  | 'unavailable_no_model'
  | 'ineligible'
  | 'source_missing'
  | 'failed'
  | 'cancelled'
  | 'outcome_unknown';

export const EXTRACTION_OUTCOMES: readonly ExtractionOutcome[] = [
  'succeeded',
  'partial',
  'unavailable_no_model',
  'ineligible',
  'source_missing',
  'failed',
  'cancelled',
  'outcome_unknown',
] as const;

/** Outcomes that mean "the model produced no usable candidates". */
export const EMPTY_OUTCOMES: ReadonlySet<ExtractionOutcome> = new Set([
  'unavailable_no_model',
  'ineligible',
  'source_missing',
  'failed',
  'cancelled',
]);

/** Outcomes that mean "the model produced at least some valid candidates". */
export const PRODUCTIVE_OUTCOMES: ReadonlySet<ExtractionOutcome> = new Set([
  'succeeded',
  'partial',
]);

// ---------------------------------------------------------------------------
// Candidate validation state
// ---------------------------------------------------------------------------

export type CandidateValidationState =
  | 'unvalidated'
  | 'valid'
  | 'invalid'
  | 'warning'
  | 'abstained';

export type CandidateSourceModule =
  | 'unknown'
  | 'source_structured'
  | 'ocr'
  | 'barcode'
  | 'vision'
  | 'catalog_match'
  | 'deterministic_map'
  | 'copy_generation';

// ---------------------------------------------------------------------------
// Seller decision
// ---------------------------------------------------------------------------

export type FieldDecisionKind = 'accepted' | 'rejected' | 'edited';

// ---------------------------------------------------------------------------
// Persistence row shapes
// ---------------------------------------------------------------------------

export interface ExtractionRunRow {
  id: string;
  item_id: string;
  input_revision: string;
  model_bundle_id: string;
  model_bundle_version: string;
  request_hash: string;
  media_asset_id: string | null;
  job_state: ExtractionJobState;
  outcome: ExtractionOutcome | null;
  attempt_count: number;
  error_code: string | null;
  idempotency_key: string;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export interface FieldCandidateRow {
  id: string;
  run_id: string;
  item_id: string;
  field_name: string;
  candidate_json: unknown;
  rank: number;
  evidence_json: Record<string, unknown>;
  calibrated_confidence: number | null;
  abstained: boolean;
  validation_state: CandidateValidationState;
  policy_flags: string[];
  source_module: CandidateSourceModule;
  created_at: Date;
}

export interface FieldDecisionRow {
  id: string;
  item_id: string;
  candidate_id: string | null;
  run_id: string;
  field_name: string;
  actor_id: string;
  decision: FieldDecisionKind;
  final_value_json: unknown;
  base_field_revision: string;
  applied_field_revision: string | null;
  idempotency_key: string;
  applied_at: Date | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// API-facing DTOs (serialised for REST responses)
// ---------------------------------------------------------------------------

export interface FieldCandidateDTO {
  id: string;
  fieldName: string;
  value: unknown;
  rank: number;
  calibratedConfidence: number | null;
  abstained: boolean;
  validationState: CandidateValidationState;
  policyFlags: string[];
  sourceModule: CandidateSourceModule;
  evidence: Record<string, unknown>;
}

export interface ExtractionRunDTO {
  id: string;
  itemId: string;
  modelBundleId: string;
  modelBundleVersion: string;
  mediaAssetId: string | null;
  jobState: ExtractionJobState;
  outcome: ExtractionOutcome | null;
  errorCode: string | null;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  candidates: FieldCandidateDTO[];
  /** Fields with at least one non-abstained candidate. */
  coveredFields: string[];
  /** Fields the model abstained on (honest "I don't know"). */
  abstainedFields: string[];
  /** Fields with validation issues (invalid/warning). */
  flaggedFields: string[];
  /** True when the run produced no usable candidates. */
  isEmpty: boolean;
}

export interface FieldDecisionDTO {
  id: string;
  itemId: string;
  candidateId: string | null;
  runId: string;
  fieldName: string;
  decision: FieldDecisionKind;
  finalValue: unknown;
  appliedFieldRevision: string | null;
  appliedAt: string | null;
  createdAt: string;
}

export interface BulkFieldDecisionResult {
  applied: number;
  rejected: number;
  conflicts: Array<{ itemId: string; fieldName: string; reason: string }>;
}
