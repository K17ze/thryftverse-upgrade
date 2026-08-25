-- Migration 138: Catalogue Importer — media and field provenance.
--
-- The importer must be auditable: for every imported listing we need to know
-- where each image came from, how it was verified, and where every
-- normalised field value originated (marketplace, seller, operator,
-- deterministic mapping, or AI suggestion). This migration adds the two
-- provenance tables that sit beneath catalog_import_items.
--
--   * catalog_import_media            — per-image acquisition and verification
--   * catalog_import_field_provenance — one row per material field/revision
--
-- Both tables cascade-delete with their parent import item. Short-lived
-- encrypted source URLs (source_url_ciphertext) are retained only until
-- source_url_delete_after, after which a retention worker purges them.

-- ---------------------------------------------------------------------------
-- catalog_import_media
-- ---------------------------------------------------------------------------
-- One row per image discovered on a source listing. The fetch_status state
-- machine tracks acquisition (pending -> fetching -> fetched -> verifying ->
-- verified), with failure and quarantine terminal states. Once an image is
-- verified it is linked to the authoritative media_assets table via
-- media_asset_id, and to the upload finalisation that created it via
-- finalization_id. Moderation and publishability are mirrored here for
-- quick worker filtering without joining media_assets.

CREATE TABLE IF NOT EXISTS catalog_import_media (
  id TEXT PRIMARY KEY,
  import_item_id TEXT NOT NULL REFERENCES catalog_import_items(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  external_media_id TEXT,
  -- Short-lived encrypted source URL; purged after source_url_delete_after.
  source_url_ciphertext TEXT,
  fetch_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (fetch_status IN (
      'pending',
      'fetching',
      'fetched',
      'verifying',
      'verified',
      'failed',
      'quarantined'
    )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  -- Integrity / dedup fingerprints.
  sha256 TEXT,
  perceptual_hash TEXT,
  sniffed_mime_type TEXT,
  byte_size BIGINT CHECK (byte_size IS NULL OR byte_size > 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  -- Links to the authoritative media lifecycle (migration 074).
  media_asset_id TEXT,
  finalization_id TEXT,
  -- Mirrored moderation / publishability for worker filtering.
  moderation_status TEXT
    CHECK (moderation_status IS NULL OR moderation_status IN (
      'pending', 'approved', 'review', 'rejected', 'failed'
    )),
  publishability TEXT
    CHECK (publishability IS NULL OR publishability IN (
      'pending', 'publishable', 'not_publishable'
    )),
  source_url_delete_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (import_item_id, position)
);

-- Worker sweep: find pending or failed media to (re)fetch.
CREATE INDEX IF NOT EXISTS catalog_import_media_fetch_idx
  ON catalog_import_media (fetch_status, updated_at)
  WHERE fetch_status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS catalog_import_media_asset_idx
  ON catalog_import_media (media_asset_id)
  WHERE media_asset_id IS NOT NULL;

-- Content-addressed dedup: find media by checksum across items.
CREATE INDEX IF NOT EXISTS catalog_import_media_sha256_idx
  ON catalog_import_media (sha256)
  WHERE sha256 IS NOT NULL;

COMMENT ON TABLE catalog_import_media IS
  'Per-image acquisition, verification, and moderation state for imported listings. Links short-lived source URLs to the authoritative media_assets lifecycle.';

-- ---------------------------------------------------------------------------
-- catalog_import_field_provenance
-- ---------------------------------------------------------------------------
-- One row per material field value, per revision. Whenever a normalised
-- field is set or changed, a provenance row records who or what supplied
-- the value (marketplace scrape, seller edit, operator edit, deterministic
-- mapping, or AI suggestion), the raw source value, the resolved value, the
-- confidence level, and the reason. This gives full auditability for every
-- field on every published listing.

CREATE TABLE IF NOT EXISTS catalog_import_field_provenance (
  id TEXT PRIMARY KEY,
  import_item_id TEXT NOT NULL REFERENCES catalog_import_items(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  source_kind TEXT NOT NULL
    CHECK (source_kind IN (
      'marketplace',
      'seller',
      'operator',
      'deterministic_map',
      'ai_suggestion'
    )),
  source_value_json JSONB,
  resolved_value_json JSONB,
  confidence TEXT NOT NULL
    CHECK (confidence IN ('high', 'medium', 'low')),
  mapping_version TEXT,
  changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason_code TEXT
);

-- Field history: newest-first per (item, field).
CREATE INDEX IF NOT EXISTS catalog_import_field_provenance_item_field_idx
  ON catalog_import_field_provenance (import_item_id, field_name, changed_at DESC);

-- Review queue: low-confidence fields needing operator attention.
CREATE INDEX IF NOT EXISTS catalog_import_field_provenance_low_confidence_idx
  ON catalog_import_field_provenance (source_kind, confidence)
  WHERE confidence = 'low';

COMMENT ON TABLE catalog_import_field_provenance IS
  'Immutable per-field provenance: records the source (marketplace, seller, operator, deterministic map, or AI), raw and resolved values, confidence, and reason for every normalised field revision on an imported item.';

-- ---------------------------------------------------------------------------
-- updated_at trigger for catalog_import_media
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_catalog_import_media_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_import_media_updated_at_trigger
  ON catalog_import_media;
CREATE TRIGGER catalog_import_media_updated_at_trigger
  BEFORE UPDATE ON catalog_import_media
  FOR EACH ROW
  EXECUTE FUNCTION update_catalog_import_media_updated_at();
