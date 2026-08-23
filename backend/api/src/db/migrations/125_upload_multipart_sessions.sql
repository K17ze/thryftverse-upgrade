-- Migration 125: Upload multipart sessions
--
-- Tracks S3 multipart upload sessions for large video uploads that exceed
-- the single PUT presign size limit. Each row records the S3 upload id,
-- object key, owner, and session lifecycle (active → completed/aborted).
--
-- The unique constraint on (bucket, object_key, owner_id) makes initiation
-- idempotent: a repeated initiate for the same key and owner replaces the
-- prior active session rather than creating a duplicate.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT
-- EXISTS so re-running the migration is safe.

CREATE TABLE IF NOT EXISTS upload_multipart_sessions (
  id TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  bucket TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  folder TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  part_count INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(bucket, object_key, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_upload_multipart_sessions_owner
  ON upload_multipart_sessions (owner_id);

CREATE INDEX IF NOT EXISTS idx_upload_multipart_sessions_status
  ON upload_multipart_sessions (status);

CREATE INDEX IF NOT EXISTS idx_upload_multipart_sessions_expires_at
  ON upload_multipart_sessions (expires_at);

COMMENT ON TABLE upload_multipart_sessions IS
  'Tracks S3 multipart upload sessions for large media uploads.';
COMMENT ON COLUMN upload_multipart_sessions.upload_id IS
  'The S3 multipart upload id returned by CreateMultipartUpload.';
COMMENT ON COLUMN upload_multipart_sessions.status IS
  'Session lifecycle: active, completed, or aborted.';
COMMENT ON COLUMN upload_multipart_sessions.expires_at IS
  'When the presigned part URLs and the session expire.';
