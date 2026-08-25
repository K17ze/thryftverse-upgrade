-- Poster publication fidelity: persist the authored composition, bind each
-- media frame to authoritative upload evidence, and reconcile retries by a
-- stable payload hash.

ALTER TABLE poster_stories
  ADD COLUMN IF NOT EXISTS composition_document JSONB,
  ADD COLUMN IF NOT EXISTS publication_payload_hash TEXT;

ALTER TABLE posters
  ADD COLUMN IF NOT EXISTS upload_finalization_id TEXT
    REFERENCES upload_finalizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS media_asset_id TEXT
    REFERENCES media_assets(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS posters_media_asset_idx
  ON posters (media_asset_id)
  WHERE media_asset_id IS NOT NULL;

COMMENT ON COLUMN poster_stories.composition_document IS
  'Versioned CreatorDocument used for WYSIWYG Poster playback.';
COMMENT ON COLUMN poster_stories.publication_payload_hash IS
  'SHA-256 of the accepted create payload for idempotent replay detection.';
