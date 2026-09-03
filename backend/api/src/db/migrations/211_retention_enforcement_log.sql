-- 211: Retention enforcement log + backup deletion manifest.
--
-- UK-GDPR Art. 30 (records of processing) requires evidence of retention
-- enforcement. This migration adds:
-- 1. retention_enforcement_log — audit trail for each retention sweep batch.
-- 2. backup_deletion_manifest — tracks erased user IDs that must be purged
--    from backup snapshots within 90 days (Art. 17 erasure propagation).
-- 3. Additional retention policies for listings and media_assets.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS retention_enforcement_log (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  data_class TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  rows_affected INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL CHECK (action IN ('anonymise', 'delete', 'drop_partition')),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS retention_enforcement_log_batch_idx
  ON retention_enforcement_log (batch_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS retention_enforcement_log_class_idx
  ON retention_enforcement_log (data_class, executed_at DESC);

-- Backup deletion manifest: tracks user IDs that have been erased and must
-- be purged from backup snapshots. The backup expiry worker checks this
-- manifest and ensures all backups containing the user's data are expired
-- within 90 days of erasure.
CREATE TABLE IF NOT EXISTS backup_deletion_manifest (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  erasure_regime TEXT NOT NULL CHECK (erasure_regime IN ('gdpr', 'ccpa')),
  erased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purge_deadline TIMESTAMPTZ NOT NULL,
  purged_at TIMESTAMPTZ,
  purge_verification TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS backup_deletion_manifest_pending_idx
  ON backup_deletion_manifest (purge_deadline)
  WHERE purged_at IS NULL;

-- Additional retention policies for listings and media assets.
-- Soft-deleted unsold listings are purged after 180 days.
-- Revoked/deleted media assets are purged after 90 days (the GC sweep
-- handles S3 deletion; this policy handles the DB row lifecycle).
INSERT INTO retention_policy (id, data_class, ttl_days, action, legal_basis) VALUES
  ('rp_listings_soft_deleted', 'listings_soft_deleted', 180, 'delete',
   'Legitimate interest — marketplace integrity (UK-GDPR Art. 6(1)(f))'),
  ('rp_media_assets_deleted', 'media_assets_deleted', 90, 'delete',
   'Legitimate interest — storage reclamation (UK-GDPR Art. 6(1)(f))'),
  ('rp_support_cases', 'support_cases', 730, 'delete',
   'Legal obligation — dispute resolution, 2-year retention (UK-GDPR Art. 6(1)(f))')
ON CONFLICT (data_class) DO NOTHING;
