-- 213: Add async DSAR export delivery columns to gdpr_requests.
--
-- UK-GDPR Art. 12(3) requires responding to access requests within one
-- month. For users with large histories, the synchronous export endpoint
-- may timeout. This migration adds columns to support async export
-- delivery via a signed S3 URL.
--
-- The async flow:
-- 1. POST /users/me/export creates a gdpr_requests row with status='processing'
--    and enqueues a background job.
-- 2. The worker generates the export, uploads to S3, generates a time-limited
--    signed URL, and updates the row with export_url + export_expires_at.
-- 3. GET /users/me/export/:requestId returns the status and signed URL.
--
-- The signed URL expires after 24 hours. The export bundle is retained in S3
-- for 7 days then automatically deleted by S3 lifecycle rules.
--
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE gdpr_requests
  ADD COLUMN IF NOT EXISTS export_url TEXT,
  ADD COLUMN IF NOT EXISTS export_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS export_object_key TEXT;

COMMENT ON COLUMN gdpr_requests.export_url IS
  'Time-limited signed S3 URL for async DSAR export delivery. NULL for synchronous exports or while processing.';
COMMENT ON COLUMN gdpr_requests.export_expires_at IS
  'When the signed export URL expires (typically 24 hours after generation).';
COMMENT ON COLUMN gdpr_requests.export_object_key IS
  'S3 object key for the export bundle. Used for cleanup after the retention period.';
