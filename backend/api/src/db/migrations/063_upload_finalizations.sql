-- Upload finalizations — durable record of completed S3 uploads.
-- Previously the backend issued a presigned URL and trusted the client's PUT
-- to succeed. There was no server-side confirmation that the object landed in
-- S3, no durable metadata, and no moderation/repair hook. This table records
-- finalized uploads so chat attachments, listing media and creator assets can
-- reference a verified, durable object key.

CREATE TABLE IF NOT EXISTS upload_finalizations (
  id TEXT PRIMARY KEY,
  -- The S3 object key returned by /uploads/presign.
  object_key TEXT NOT NULL,
  -- The bucket the object was presigned for. Defaults from app config when
  -- the finalize call omits it.
  bucket TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  -- publicUrl returned to the client after presign. Stored so other surfaces
  -- (chat, listings) can resolve the canonical URL without recomputing it.
  public_url TEXT NOT NULL,
  -- 'pending' until finalize is called, 'finalized' once the server confirms
  -- the object exists in S3, 'failed' if the head check fails.
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'finalized', 'failed')),
  -- Optional scope so we can query "all finalized attachments for this chat
  -- message" or "all finalized media for this listing".
  scope TEXT NOT NULL DEFAULT 'general'
    CHECK (scope IN ('general', 'chat_attachment', 'listing_media', 'avatar', 'cover', 'poster', 'look', 'evidence', 'review')),
  scope_ref_id TEXT,
  head_checked_at TIMESTAMPTZ,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bucket, object_key)
);

CREATE INDEX IF NOT EXISTS upload_finalizations_owner_idx
  ON upload_finalizations (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS upload_finalizations_scope_idx
  ON upload_finalizations (scope, scope_ref_id, created_at DESC);
CREATE INDEX IF NOT EXISTS upload_finalizations_status_idx
  ON upload_finalizations (status, created_at DESC);

CREATE OR REPLACE FUNCTION update_upload_finalizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS upload_finalizations_updated_at_trigger ON upload_finalizations;
CREATE TRIGGER upload_finalizations_updated_at_trigger
  BEFORE UPDATE ON upload_finalizations
  FOR EACH ROW
  EXECUTE FUNCTION update_upload_finalizations_updated_at();
