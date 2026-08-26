-- Migration 192: Catalogue Import Extraction — Convergence & Honest Outcomes
--
-- Rebuilds the extraction boundary per flagship report §8.3, §5.3, §11.
--
-- The old catalog_import_extractions table (migration 146) had three P0
-- defects:
--   1. Client-supplied model identity (spoofed provenance).
--   2. Global media asset resolution with no owner/finalization check.
--   3. False completion: empty placeholder and missing media recorded as
--      'completed', inflating success metrics.
--
-- This migration introduces the canonical extraction domain that converges
-- seller decisions into the existing catalog_import_field_provenance and
-- catalog_import_items.normalised_fields, replacing the mutable
-- extracted_fields blob and JSON field-state arrays.
--
-- Three new tables:
--   catalog_import_extraction_runs     — one per (item, input_revision, model_bundle)
--   catalog_import_field_candidates    — per-field candidate evidence from a run
--   catalog_import_field_decisions     — seller accept/reject/edit, revision-checked
--
-- The old table is retained as a compatibility read model (legacy rows are
-- backfilled as legacy_placeholder/legacy_result). New code writes only to
-- the new tables.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- catalog_import_extraction_runs
-- ---------------------------------------------------------------------------
-- Replaces the single-row-per-run model in catalog_import_extractions.
-- Separates job lifecycle (job_state) from intelligence outcome (outcome)
-- so a terminal job is not confused with a successful extraction.

CREATE TABLE IF NOT EXISTS catalog_import_extraction_runs (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  item_id TEXT NOT NULL REFERENCES catalog_import_items(id) ON DELETE CASCADE,
  -- The item's field_revision at queue time. If the item's fields change
  -- after the run is queued, the run is superseded — candidates are evidence
  -- against a specific input revision, not a live item state.
  input_revision TEXT NOT NULL,
  -- Server-selected model bundle identity. The client never supplies this.
  -- Resolved from model_artifacts WHERE task = 'catalogue_import' AND
  -- status = 'active' (or a shadow/candidate for evaluation).
  model_bundle_id TEXT NOT NULL,
  model_bundle_version TEXT NOT NULL,
  -- Deterministic request hash for idempotency: SHA-256 of
  -- (item_id, input_revision, model_bundle_id, model_bundle_version).
  request_hash TEXT NOT NULL,
  -- The media asset used as input, bound through catalog_import_media for
  -- the owned item. NULL means "use the item's primary verified media".
  media_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  -- Job lifecycle (report §5.3).
  job_state TEXT NOT NULL DEFAULT 'queued'
    CHECK (job_state IN (
      'queued', 'running', 'retry_wait', 'terminal', 'superseded'
    )),
  -- Intelligence outcome (report §5.3). NULL until the job is terminal.
  outcome TEXT
    CHECK (outcome IS NULL OR outcome IN (
      'succeeded',           -- model returned valid candidates
      'partial',             -- some candidates valid, some abstained/failed
      'unavailable_no_model',-- no model registered/active for this task
      'ineligible',          -- item/media not eligible for extraction
      'source_missing',      -- media asset not found or no URL
      'failed',              -- model error
      'cancelled',           -- seller/operator cancelled
      'outcome_unknown'      -- timeout / ambiguous
    )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_code TEXT,
  -- Idempotency: one active run per (item, input_revision, model_bundle).
  idempotency_key TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (item_id, input_revision, model_bundle_id, model_bundle_version),
  UNIQUE (item_id, idempotency_key)
);

-- Latest run per item (the primary access path).
CREATE INDEX IF NOT EXISTS catalog_import_extraction_runs_item_idx
  ON catalog_import_extraction_runs (item_id, created_at DESC)
  WHERE job_state != 'superseded';

-- Worker sweep: find queued runs.
CREATE INDEX IF NOT EXISTS catalog_import_extraction_runs_queued_idx
  ON catalog_import_extraction_runs (job_state, created_at)
  WHERE job_state = 'queued';

-- Model lineage lookup.
CREATE INDEX IF NOT EXISTS catalog_import_extraction_runs_model_idx
  ON catalog_import_extraction_runs (model_bundle_id, model_bundle_version);

COMMENT ON TABLE catalog_import_extraction_runs IS
  'Extraction run lifecycle: one per (item, input_revision, model_bundle). Separates job_state (queued/running/terminal/superseded) from outcome (succeeded/partial/unavailable_no_model/ineligible/source_missing/failed/cancelled/outcome_unknown) so a terminal job is never confused with a successful extraction.';
COMMENT ON COLUMN catalog_import_extraction_runs.input_revision IS
  'The catalog_import_items.field_revision at queue time. If the item changes after queueing, the run is superseded — candidates are evidence against a specific input revision.';
COMMENT ON COLUMN catalog_import_extraction_runs.model_bundle_id IS
  'Server-selected model identity from model_artifacts WHERE task = ''catalogue_import''. The client never supplies this.';
COMMENT ON COLUMN catalog_import_extraction_runs.outcome IS
  'Intelligence outcome. succeeded = valid candidates returned; partial = some valid, some abstained; unavailable_no_model = no active model; source_missing = media not found; failed = model error; outcome_unknown = timeout. NULL until job_state = terminal.';

-- ---------------------------------------------------------------------------
-- catalog_import_field_candidates
-- ---------------------------------------------------------------------------
-- Per-field candidate evidence from an extraction run. A run may produce
-- multiple candidates per field (ranked), or a single candidate with
-- abstention. This replaces the flat extracted_fields JSONB blob.

CREATE TABLE IF NOT EXISTS catalog_import_field_candidates (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  run_id TEXT NOT NULL REFERENCES catalog_import_extraction_runs(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES catalog_import_items(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  -- The candidate value (typed JSON: string, number, object, etc.).
  candidate_json JSONB NOT NULL,
  -- Rank within the field: 1 = top candidate, 2 = alternate, etc.
  rank INTEGER NOT NULL DEFAULT 1 CHECK (rank >= 1),
  -- Evidence supporting this candidate: OCR text regions, barcode rects,
  -- catalog match metadata, vision bounding boxes. Opaque to the review
  -- UI but available in the evidence sheet.
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Calibrated confidence in [0.0, 1.0]. This is the model's raw confidence
  -- calibrated against evaluation data — NOT a generic "AI score".
  calibrated_confidence DOUBLE PRECISION
    CHECK (calibrated_confidence IS NULL OR
           (calibrated_confidence >= 0.0 AND calibrated_confidence <= 1.0)),
  -- True when the model deliberately abstained (no candidate for this field).
  abstained BOOLEAN NOT NULL DEFAULT FALSE,
  -- Validation state: the candidate may be invalid (e.g. bad GTIN checksum)
  -- before the seller ever sees it.
  validation_state TEXT NOT NULL DEFAULT 'unvalidated'
    CHECK (validation_state IN (
      'unvalidated', 'valid', 'invalid', 'warning', 'abstained'
    )),
  -- Policy flags: e.g. ['high_risk_field', 'no_bulk_confirm'].
  policy_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The origin/module that produced this candidate.
  source_module TEXT NOT NULL DEFAULT 'unknown'
    CHECK (source_module IN (
      'unknown', 'source_structured', 'ocr', 'barcode', 'vision',
      'catalog_match', 'deterministic_map', 'copy_generation'
    )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (run_id, field_name, rank)
);

-- Candidates by run (the primary access path for the review UI).
CREATE INDEX IF NOT EXISTS catalog_import_field_candidates_run_idx
  ON catalog_import_field_candidates (run_id, field_name, rank);

-- Candidates by item (cross-run view: "what do we know about this field?").
CREATE INDEX IF NOT EXISTS catalog_import_field_candidates_item_idx
  ON catalog_import_field_candidates (item_id, field_name, created_at DESC);

COMMENT ON TABLE catalog_import_field_candidates IS
  'Per-field candidate evidence from an extraction run. Replaces the flat extracted_fields JSONB. Each candidate carries calibrated confidence, evidence (OCR regions, barcode rects, catalog metadata), validation state, and policy flags.';
COMMENT ON COLUMN catalog_import_field_candidates.abstained IS
  'True when the model deliberately abstained — no candidate for this field. An abstained field is NOT a failure; it is an honest "I don''t know" that leaves manual review fully usable.';
COMMENT ON COLUMN catalog_import_field_candidates.validation_state IS
  'Validated before the seller sees it: valid (e.g. GTIN checksum passes), invalid (checksum fails — do not surface as a suggestion), warning (possible issue), abstained (model declined).';
COMMENT ON COLUMN catalog_import_field_candidates.policy_flags IS
  'Policy constraints: e.g. high_risk_field (condition, authenticity — never bulk-confirm), no_bulk_confirm, source_authoritative (structured source data wins over vision).';

-- ---------------------------------------------------------------------------
-- catalog_import_field_decisions
-- ---------------------------------------------------------------------------
-- Seller accept/reject/edit of a candidate. Revision-checked: the decision
-- references the item's field_revision at decision time, and the atomic
-- apply command writes normalised_fields + catalog_import_field_provenance
-- + this decision row + an event in one transaction.

CREATE TABLE IF NOT EXISTS catalog_import_field_decisions (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  item_id TEXT NOT NULL REFERENCES catalog_import_items(id) ON DELETE CASCADE,
  candidate_id TEXT REFERENCES catalog_import_field_candidates(id) ON DELETE SET NULL,
  run_id TEXT NOT NULL REFERENCES catalog_import_extraction_runs(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  -- The actor (seller) who made the decision.
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL
    CHECK (decision IN ('accepted', 'rejected', 'edited')),
  -- The final value the seller approved (for accepted: the candidate value;
  -- for edited: the seller's edited value; for rejected: NULL).
  final_value_json JSONB,
  -- The item's field_revision at decision time. The atomic apply command
  -- checks this under FOR UPDATE lock — if the item changed since the seller
  -- last read it, the decision is rejected with a revision conflict.
  base_field_revision TEXT NOT NULL,
  -- The new field_revision after the apply (NULL if rejected, which does not
  -- mutate normalised_fields).
  applied_field_revision TEXT,
  -- Idempotency: one decision per (item, idempotency_key).
  idempotency_key TEXT NOT NULL,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (item_id, idempotency_key)
);

-- Decisions by item (the review history).
CREATE INDEX IF NOT EXISTS catalog_import_field_decisions_item_idx
  ON catalog_import_field_decisions (item_id, field_name, created_at DESC);

-- Decisions by run (run-level summary: how many accepted/rejected/edited).
CREATE INDEX IF NOT EXISTS catalog_import_field_decisions_run_idx
  ON catalog_import_field_decisions (run_id, decision);

COMMENT ON TABLE catalog_import_field_decisions IS
  'Seller accept/reject/edit of an extraction candidate. Revision-checked: the atomic apply command writes normalised_fields + catalog_import_field_provenance + this decision row + an event in one transaction under FOR UPDATE lock.';
COMMENT ON COLUMN catalog_import_field_decisions.base_field_revision IS
  'The catalog_import_items.field_revision at decision time. If the item changed since the seller last read it, the decision is rejected with a revision conflict — the seller must refresh and re-decide.';
COMMENT ON COLUMN catalog_import_field_decisions.applied_field_revision IS
  'The new field_revision after the apply. NULL for rejected decisions (which do not mutate normalised_fields).';

-- ---------------------------------------------------------------------------
-- Backfill: mark old extraction rows as legacy
-- ---------------------------------------------------------------------------
-- Old rows in catalog_import_extractions are retained as a compatibility
-- read model. We do not invent success: rows with empty extracted_fields
-- and placeholder=true are marked as legacy_placeholder; rows with actual
-- fields are legacy_result. The new code never writes to the old table.

-- Add a legacy marker column to the old table if it does not exist.
ALTER TABLE catalog_import_extractions
  ADD COLUMN IF NOT EXISTS legacy_marker TEXT
  CHECK (legacy_marker IS NULL OR legacy_marker IN (
    'legacy_placeholder', 'legacy_result', 'migrated'
  ));

-- Backfill: empty extracted_fields -> legacy_placeholder, else legacy_result.
UPDATE catalog_import_extractions
  SET legacy_marker = 'legacy_placeholder'
  WHERE legacy_marker IS NULL
    AND extracted_fields = '{}'::jsonb;

UPDATE catalog_import_extractions
  SET legacy_marker = 'legacy_result'
  WHERE legacy_marker IS NULL
    AND extracted_fields != '{}'::jsonb;

-- Catch-all for any NULL extracted_fields (defensive — the column is NOT NULL
-- with DEFAULT '{}'::jsonb, but this protects against corrupted rows).
UPDATE catalog_import_extractions
  SET legacy_marker = 'legacy_placeholder'
  WHERE legacy_marker IS NULL
    AND extracted_fields IS NULL;

COMMENT ON COLUMN catalog_import_extractions.legacy_marker IS
  'Migration 192 marker: legacy_placeholder (empty extracted_fields, was falsely recorded as completed), legacy_result (had fields), migrated (ported to new tables). New code writes only to catalog_import_extraction_runs / _field_candidates / _field_decisions.';

-- ---------------------------------------------------------------------------
-- Constraint hardening (per audit)
-- ---------------------------------------------------------------------------

-- A terminal run MUST have an outcome — NULL outcome with terminal state
-- violates the documented invariant.
ALTER TABLE catalog_import_extraction_runs
  ADD CONSTRAINT IF NOT EXISTS terminal_requires_outcome
  CHECK (job_state != 'terminal' OR outcome IS NOT NULL);

-- A terminal run MUST have a completed_at timestamp.
ALTER TABLE catalog_import_extraction_runs
  ADD CONSTRAINT IF NOT EXISTS terminal_requires_completed_at
  CHECK (job_state != 'terminal' OR completed_at IS NOT NULL);

-- Rejected decisions MUST NOT have a final_value (they don't mutate fields).
ALTER TABLE catalog_import_field_decisions
  ADD CONSTRAINT IF NOT EXISTS rejected_has_null_final_value
  CHECK (decision != 'rejected' OR final_value_json IS NULL);

-- Accepted/edited decisions MUST have a final_value.
ALTER TABLE catalog_import_field_decisions
  ADD CONSTRAINT IF NOT EXISTS accepted_edited_has_final_value
  CHECK (decision = 'rejected' OR final_value_json IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Additional indexes (per audit)
-- ---------------------------------------------------------------------------

-- Decisions by actor (audit queries: "what did this seller decide?").
CREATE INDEX IF NOT EXISTS catalog_import_field_decisions_actor_idx
  ON catalog_import_field_decisions (actor_id, created_at DESC);

-- Decisions by candidate (FK ON DELETE SET NULL support).
CREATE INDEX IF NOT EXISTS catalog_import_field_decisions_candidate_idx
  ON catalog_import_field_decisions (candidate_id)
  WHERE candidate_id IS NOT NULL;

-- Terminal runs by outcome (dashboard queries: success/failure rates).
CREATE INDEX IF NOT EXISTS catalog_import_extraction_runs_outcome_idx
  ON catalog_import_extraction_runs (outcome)
  WHERE job_state = 'terminal';
