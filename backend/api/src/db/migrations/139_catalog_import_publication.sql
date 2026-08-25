-- Migration 139: Catalogue Importer — publication saga and batch receipts.
--
-- When an import batch is approved, each ready item is published to the
-- ThryftVerse catalogue as a draft or live listing. Publication must be
-- exactly-once and idempotent: a network failure mid-publish must not
-- create duplicate listings. This migration adds the two tables that make
-- that guarantee durable.
--
--   * catalog_import_publication_records — per-item idempotent publication
--     saga records. The (item_id, idempotency_key) unique constraint and the
--     frozen request_hash ensure a replayed publish either resumes the
--     in-flight attempt or returns the already-recorded outcome.
--   * catalog_import_batch_receipts — one immutable summary receipt per
--     batch, written once the batch reaches a terminal publication state.
--     Holds item-level outcome counts and the full results JSON for audit.

-- ---------------------------------------------------------------------------
-- catalog_import_publication_records
-- ---------------------------------------------------------------------------
-- One row per publication attempt for an import item. The idempotency_key
-- is derived from the batch + item + approval revision, so replaying a
-- publish after a crash hits the same row. request_hash is a sha256 of the
-- canonical publication payload frozen at approval time; if a replay's hash
-- differs the application rejects it rather than publishing a divergent
-- listing. status follows a small saga: pending -> processing ->
-- draft_created/succeeded/failed/unknown -> reconciled.

CREATE TABLE IF NOT EXISTS catalog_import_publication_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES catalog_import_batches(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES catalog_import_items(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  -- sha256 of the canonical publication payload, frozen at approval time.
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'processing',
      'draft_created',
      'succeeded',
      'failed',
      'unknown',
      'reconciled'
    )),
  -- The created draft or live listing ID once known.
  listing_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  last_error_code TEXT,
  -- Frozen publication payload captured at approval time.
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (item_id, idempotency_key),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS catalog_import_publication_records_batch_idx
  ON catalog_import_publication_records (batch_id, status);

-- Worker sweep: find pending, processing, or unknown-outcome records to
-- drive or reconcile.
CREATE INDEX IF NOT EXISTS catalog_import_publication_records_active_idx
  ON catalog_import_publication_records (status, updated_at)
  WHERE status IN ('pending', 'processing', 'unknown');

COMMENT ON TABLE catalog_import_publication_records IS
  'Idempotent publication saga records: one per import item publish attempt. The (item_id, idempotency_key) uniqueness and frozen request_hash guarantee exactly-once publication even across crashes and replays.';

-- ---------------------------------------------------------------------------
-- catalog_import_batch_receipts
-- ---------------------------------------------------------------------------
-- A single immutable summary receipt written once a batch reaches a
-- terminal publication state for a given approval revision. The count
-- columns give a quick dashboard view; receipt_json holds the full
-- item-level results array for audit and reconciliation. The
-- one-receipt-per-(batch, approval_revision) uniqueness is enforced by a
-- composite unique constraint.

CREATE TABLE IF NOT EXISTS catalog_import_batch_receipts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES catalog_import_batches(id) ON DELETE CASCADE,
  -- The approval revision this receipt was generated for. A batch that is
  -- re-approved and re-published will have multiple receipts, one per
  -- approval revision.
  approval_revision TEXT NOT NULL,
  live_count INTEGER NOT NULL DEFAULT 0,
  draft_count INTEGER NOT NULL DEFAULT 0,
  excluded_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  outcome_unknown_count INTEGER NOT NULL DEFAULT 0,
  -- Full item-level results: [{ itemId, externalItemId, status, listingId, error, ... }].
  receipt_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, approval_revision)
);

COMMENT ON TABLE catalog_import_batch_receipts IS
  'Immutable per-batch, per-approval-revision publication receipt: outcome counts and full item-level results JSON, written once when a batch reaches a terminal publication state for a given approval revision.';

-- ---------------------------------------------------------------------------
-- updated_at trigger for catalog_import_publication_records
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_catalog_import_publication_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_import_publication_records_updated_at_trigger
  ON catalog_import_publication_records;
CREATE TRIGGER catalog_import_publication_records_updated_at_trigger
  BEFORE UPDATE ON catalog_import_publication_records
  FOR EACH ROW
  EXECUTE FUNCTION update_catalog_import_publication_records_updated_at();
