-- Looks publication fidelity: bind the primary authored media to a verified
-- upload and make create retries safe after a lost network response.

ALTER TABLE looks
  ADD COLUMN IF NOT EXISTS upload_finalization_id TEXT
    REFERENCES upload_finalizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS media_asset_id TEXT
    REFERENCES media_assets(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS publication_payload_hash TEXT;

-- Looks are first-class publication targets. Reusing creator_document here
-- would create bindings whose target_ref_id cannot be authorized against the
-- creator_documents table.
ALTER TABLE media_bindings
  DROP CONSTRAINT IF EXISTS media_bindings_target_type_check;

ALTER TABLE media_bindings
  ADD CONSTRAINT media_bindings_target_type_check
  CHECK (target_type IN (
    'listing',
    'auction',
    'profile',
    'creator_document',
    'look',
    'chat_message',
    'review',
    'support_ticket'
  ));

CREATE INDEX IF NOT EXISTS looks_media_asset_idx
  ON looks (media_asset_id)
  WHERE media_asset_id IS NOT NULL;

COMMENT ON COLUMN looks.publication_payload_hash IS
  'SHA-256 of the accepted create payload for idempotent replay detection.';
