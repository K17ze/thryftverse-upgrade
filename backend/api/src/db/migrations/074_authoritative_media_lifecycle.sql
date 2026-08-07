-- Authoritative media lifecycle.
--
-- A successful object-storage HEAD request proves that bytes exist, but it
-- does not prove that those bytes are safe, correctly typed, processed, or
-- publishable. These tables separate durable upload receipt from publication
-- and provide a retryable worker contract for scanning, moderation, and
-- derivative generation.

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  upload_finalization_id TEXT NOT NULL UNIQUE
    REFERENCES upload_finalizations(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  intended_purpose TEXT NOT NULL,
  media_kind TEXT NOT NULL
    CHECK (media_kind IN ('image', 'video', 'document')),
  declared_content_type TEXT NOT NULL,
  detected_content_type TEXT,
  declared_size_bytes BIGINT NOT NULL CHECK (declared_size_bytes > 0),
  detected_size_bytes BIGINT CHECK (detected_size_bytes > 0),
  checksum_sha256 TEXT,
  original_object_url TEXT NOT NULL,
  canonical_url TEXT,
  status TEXT NOT NULL DEFAULT 'integrity_verified'
    CHECK (status IN (
      'created',
      'upload_authorised',
      'object_received',
      'integrity_verified',
      'scan_pending',
      'processing',
      'moderation_pending',
      'publishable',
      'published',
      'upload_expired',
      'integrity_failed',
      'quarantined',
      'rejected',
      'processing_failed',
      'revoked',
      'deleted'
    )),
  scan_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending', 'clean', 'infected', 'failed')),
  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'review', 'rejected', 'failed')),
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  blurhash TEXT,
  focal_x NUMERIC(6, 5) CHECK (focal_x IS NULL OR (focal_x >= 0 AND focal_x <= 1)),
  focal_y NUMERIC(6, 5) CHECK (focal_y IS NULL OR (focal_y >= 0 AND focal_y <= 1)),
  metadata_version INTEGER NOT NULL DEFAULT 1 CHECK (metadata_version > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  quarantine_reason TEXT,
  revocation_reason TEXT,
  publishable_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  quarantined_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bucket, object_key)
);

CREATE INDEX IF NOT EXISTS media_assets_owner_idx
  ON media_assets (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_status_idx
  ON media_assets (status, updated_at ASC);
CREATE INDEX IF NOT EXISTS media_assets_purpose_idx
  ON media_assets (intended_purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS media_derivatives (
  id TEXT PRIMARY KEY,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  media_kind TEXT NOT NULL
    CHECK (media_kind IN ('image', 'video', 'document')),
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  checksum_sha256 TEXT,
  canonical_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (media_asset_id, variant),
  UNIQUE (bucket, object_key)
);

CREATE INDEX IF NOT EXISTS media_derivatives_asset_idx
  ON media_derivatives (media_asset_id, variant);

CREATE TABLE IF NOT EXISTS media_bindings (
  id TEXT PRIMARY KEY,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL
    CHECK (target_type IN (
      'listing',
      'auction',
      'profile',
      'creator_document',
      'chat_message',
      'review',
      'support_ticket'
    )),
  target_ref_id TEXT NOT NULL,
  role TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  UNIQUE (media_asset_id, target_type, target_ref_id, role)
);

CREATE INDEX IF NOT EXISTS media_bindings_target_idx
  ON media_bindings (target_type, target_ref_id, sort_order)
  WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS media_processing_jobs (
  id TEXT PRIMARY KEY,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL
    CHECK (job_type IN ('inspect_scan_process_moderate', 'retry_processing', 'purge_derivatives')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry', 'completed', 'dead')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS media_processing_one_active_job_idx
  ON media_processing_jobs (media_asset_id)
  WHERE status IN ('pending', 'processing', 'retry');
CREATE INDEX IF NOT EXISTS media_processing_claim_idx
  ON media_processing_jobs (available_at, created_at)
  WHERE status IN ('pending', 'retry');

ALTER TABLE upload_finalizations
  ADD COLUMN IF NOT EXISTS media_asset_id TEXT
    REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS upload_finalizations_media_asset_idx
  ON upload_finalizations (media_asset_id)
  WHERE media_asset_id IS NOT NULL;

ALTER TABLE upload_intents
  ADD COLUMN IF NOT EXISTS cleanup_status TEXT NOT NULL DEFAULT 'not_due'
    CHECK (cleanup_status IN ('not_due', 'pending', 'processing', 'cleaned', 'failed')),
  ADD COLUMN IF NOT EXISTS cleanup_attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (cleanup_attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS cleanup_last_error TEXT,
  ADD COLUMN IF NOT EXISTS cleanup_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleanup_locked_by TEXT,
  ADD COLUMN IF NOT EXISTS cleaned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS upload_intents_orphan_cleanup_idx
  ON upload_intents (expires_at, created_at)
  WHERE finalized_at IS NULL AND cleanup_status IN ('not_due', 'pending', 'failed');

CREATE OR REPLACE FUNCTION update_media_lifecycle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS media_assets_updated_at_trigger ON media_assets;
CREATE TRIGGER media_assets_updated_at_trigger
  BEFORE UPDATE ON media_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_media_lifecycle_updated_at();

DROP TRIGGER IF EXISTS media_processing_jobs_updated_at_trigger ON media_processing_jobs;
CREATE TRIGGER media_processing_jobs_updated_at_trigger
  BEFORE UPDATE ON media_processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_media_lifecycle_updated_at();

