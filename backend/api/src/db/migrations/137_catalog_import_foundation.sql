-- Migration 137: Catalogue Importer — foundation tables.
--
-- The ThryftVerse Concierge Catalogue Importer lets sellers bring their
-- listings in from external marketplaces (eBay, Depop, Vinted) or from a
-- ThryftVerse-authored seller package. The importer is a multi-stage saga:
-- discover -> hydrate -> ingest media -> normalise -> await review ->
-- approve -> publish -> reconcile.
--
-- This migration lays down the four core tables that model that saga:
--   * catalog_import_connections  — OAuth / upload source connections
--   * catalog_import_batches      — a single import run's lifecycle
--   * catalog_import_items        — individual discovered listings
--   * catalog_import_events       — append-only timeline of everything that
--                                   happens to a batch and its items
--
-- All tables use application-generated TEXT primary keys, soft-delete where
-- noted, and partial unique indexes to keep history while enforcing
-- live-row uniqueness. Encrypted credential columns hold envelope-encrypted
-- ciphertext only — the application never stores raw provider tokens.

-- ---------------------------------------------------------------------------
-- catalog_import_connections
-- ---------------------------------------------------------------------------
-- A connection represents a seller's authorised link to an external source.
-- For OAuth sources (eBay, Depop, Vinted) it holds envelope-encrypted access
-- and refresh tokens. For the seller_package source it records the uploaded
-- package manifest. Connections are soft-deletable; the partial unique index
-- keeps (user_id, source, external_account_id) unique among live rows only.

CREATE TABLE IF NOT EXISTS catalog_import_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL
    CHECK (source IN ('ebay', 'seller_package', 'depop', 'vinted')),
  external_account_id TEXT NOT NULL,
  external_display_name TEXT,
  -- Envelope-encrypted provider credentials. Never store raw tokens.
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  status TEXT NOT NULL DEFAULT 'pending_authorisation'
    CHECK (status IN (
      'pending_authorisation',
      'active',
      'reauthorisation_required',
      'revoked',
      'expired',
      'deleted'
    )),
  -- Human-readable reason for the current status (e.g. "seller_revoked",
  -- "token_expired", "admin_suspended"). NULL when the status is active.
  status_reason TEXT,
  -- Immutable copy of the consent version the seller agreed to at connect time.
  consent_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One live connection per (user, source, external account). Soft-deleted
-- rows are excluded so re-connecting after a delete is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS catalog_import_connections_live_uniq
  ON catalog_import_connections (user_id, source, external_account_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS catalog_import_connections_user_created_idx
  ON catalog_import_connections (user_id, created_at DESC);

-- Worker sweep index: find active connections per source for scheduled refresh.
CREATE INDEX IF NOT EXISTS catalog_import_connections_active_idx
  ON catalog_import_connections (source, status)
  WHERE status = 'active';

COMMENT ON TABLE catalog_import_connections IS
  'Authorised links between a seller and an external catalogue source (eBay, Depop, Vinted, or a ThryftVerse seller package). Holds envelope-encrypted OAuth tokens and consent provenance.';

-- ---------------------------------------------------------------------------
-- catalog_import_batches
-- ---------------------------------------------------------------------------
-- A batch is one import run against a connection (or a seller_package
-- upload, in which case connection_id is NULL). The status column drives the
-- saga state machine; checkpoint_json holds resume state (page cursors,
-- report offsets) so a paused or rate-limited batch can pick up exactly
-- where it left off.

CREATE TABLE IF NOT EXISTS catalog_import_batches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Nullable: seller_package imports are not bound to an OAuth connection.
  connection_id TEXT REFERENCES catalog_import_connections(id) ON DELETE SET NULL,
  source TEXT NOT NULL
    CHECK (source IN ('ebay', 'seller_package', 'depop', 'vinted')),
  mode TEXT NOT NULL DEFAULT 'one_time'
    CHECK (mode IN ('one_time')),
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN (
      'created',
      'discovering',
      'hydrating',
      'ingesting_media',
      'normalising',
      'awaiting_operator',
      'awaiting_seller',
      'approved',
      'publishing',
      'completed',
      'paused_rate_limit',
      'paused_reauth',
      'failed_recoverable',
      'cancelling',
      'cancelled'
    )),
  status_reason TEXT,
  -- Resume state: page cursors, report offsets, last-seen timestamps.
  checkpoint_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot_at TIMESTAMPTZ,
  discovered_count INTEGER NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  ready_count INTEGER NOT NULL DEFAULT 0 CHECK (ready_count >= 0),
  issue_count INTEGER NOT NULL DEFAULT 0 CHECK (issue_count >= 0),
  published_count INTEGER NOT NULL DEFAULT 0 CHECK (published_count >= 0),
  -- Frozen revision captured at operator/seller approval time.
  approval_revision TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  -- Retention enforcement: raw source payloads are purged after this time.
  raw_delete_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS catalog_import_batches_user_created_idx
  ON catalog_import_batches (user_id, created_at DESC);

-- Worker sweep: find in-flight batches that need attention.
CREATE INDEX IF NOT EXISTS catalog_import_batches_active_idx
  ON catalog_import_batches (status, updated_at)
  WHERE status NOT IN ('completed', 'cancelled');

CREATE INDEX IF NOT EXISTS catalog_import_batches_connection_idx
  ON catalog_import_batches (connection_id)
  WHERE connection_id IS NOT NULL;

COMMENT ON TABLE catalog_import_batches IS
  'Lifecycle record for a single catalogue import run. Drives the discover -> hydrate -> normalise -> approve -> publish saga with resumable checkpoint state.';

-- ---------------------------------------------------------------------------
-- catalog_import_items
-- ---------------------------------------------------------------------------
-- One row per discovered external listing within a batch. The readiness
-- column tracks how far this item has progressed through the pipeline;
-- blocking_issues records recoverable problems (missing field, media fetch
-- failure, etc.) as a JSONB array of {code, fieldName, message, recoveryHint}.
-- normalised_fields holds the canonical candidate fields that will become a
-- ThryftVerse listing once approved.

CREATE TABLE IF NOT EXISTS catalog_import_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES catalog_import_batches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_item_id TEXT NOT NULL,
  source TEXT NOT NULL
    CHECK (source IN ('ebay', 'seller_package', 'depop', 'vinted')),
  source_url TEXT,
  -- Mirror of the source listing's lifecycle state (active / sold / ended).
  source_state TEXT,
  source_updated_at TIMESTAMPTZ,
  -- Hash of the raw source payload; used for replay / change detection.
  source_checksum TEXT NOT NULL,
  -- Short-lived encrypted source payload; purged after raw_delete_after.
  raw_snapshot_ciphertext TEXT,
  normalised_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Optimistic concurrency: bumped whenever normalised fields change.
  field_revision TEXT NOT NULL DEFAULT '1',
  readiness TEXT NOT NULL DEFAULT 'discovered'
    CHECK (readiness IN (
      'discovered',
      'hydrated',
      'media_pending',
      'mapping_pending',
      'ready',
      'needs_input',
      'probable_duplicate',
      'excluded',
      'source_changed'
    )),
  blocking_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  duplicate_of_listing_id TEXT,
  duplicate_score NUMERIC(5, 4),
  seller_decision TEXT NOT NULL DEFAULT 'undecided'
    CHECK (seller_decision IN ('selected', 'excluded', 'undecided')),
  draft_listing_id TEXT,
  publication_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (publication_status IN (
      'pending',
      'approved',
      'draft_created',
      'publishing',
      'live',
      'failed_recoverable',
      'outcome_unknown',
      'reconciled',
      'excluded'
    )),
  publication_idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, external_item_id)
);

CREATE INDEX IF NOT EXISTS catalog_import_items_batch_readiness_idx
  ON catalog_import_items (batch_id, readiness, seller_decision);

CREATE INDEX IF NOT EXISTS catalog_import_items_batch_publication_idx
  ON catalog_import_items (batch_id, publication_status);

-- Cross-batch source identity: detect the same external listing across
-- multiple import runs for the same user.
CREATE INDEX IF NOT EXISTS catalog_import_items_source_identity_idx
  ON catalog_import_items (user_id, source, external_item_id);

CREATE INDEX IF NOT EXISTS catalog_import_items_draft_listing_idx
  ON catalog_import_items (draft_listing_id)
  WHERE draft_listing_id IS NOT NULL;

COMMENT ON TABLE catalog_import_items IS
  'Individual discovered listings within an import batch. Tracks readiness, blocking issues, duplicate detection, seller decision, and publication status through the import saga.';

-- ---------------------------------------------------------------------------
-- catalog_import_events
-- ---------------------------------------------------------------------------
-- Append-only timeline. Every state transition, worker action, operator
-- decision, and seller decision is recorded here as an immutable event.
-- item_id is nullable: batch-level events (e.g. "batch paused for rate
-- limit") have no item context.

CREATE TABLE IF NOT EXISTS catalog_import_events (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES catalog_import_batches(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES catalog_import_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_import_events_batch_created_idx
  ON catalog_import_events (batch_id, created_at);

CREATE INDEX IF NOT EXISTS catalog_import_events_item_created_idx
  ON catalog_import_events (item_id, created_at)
  WHERE item_id IS NOT NULL;

COMMENT ON TABLE catalog_import_events IS
  'Append-only timeline of every event in an import batch: state transitions, worker actions, operator and seller decisions, and publication outcomes.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
-- Per-table trigger functions following the established codebase pattern.
-- These keep updated_at in sync automatically on every UPDATE.

CREATE OR REPLACE FUNCTION update_catalog_import_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_import_connections_updated_at_trigger
  ON catalog_import_connections;
CREATE TRIGGER catalog_import_connections_updated_at_trigger
  BEFORE UPDATE ON catalog_import_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_catalog_import_connections_updated_at();

CREATE OR REPLACE FUNCTION update_catalog_import_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_import_batches_updated_at_trigger
  ON catalog_import_batches;
CREATE TRIGGER catalog_import_batches_updated_at_trigger
  BEFORE UPDATE ON catalog_import_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_catalog_import_batches_updated_at();

CREATE OR REPLACE FUNCTION update_catalog_import_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_import_items_updated_at_trigger
  ON catalog_import_items;
CREATE TRIGGER catalog_import_items_updated_at_trigger
  BEFORE UPDATE ON catalog_import_items
  FOR EACH ROW
  EXECUTE FUNCTION update_catalog_import_items_updated_at();
