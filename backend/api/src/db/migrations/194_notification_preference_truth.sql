-- 194: Notification preference and delivery truth convergence
--
-- Fixes P0 defects identified in report 18:
-- 1. Adds `auctionAlerts` to the push preference category CHECK constraint
-- 2. Adds `suppressed` event status and `suppression_reason` column so
--    preference suppression is durable and observable
-- 3. Adds `provider_ticket_ids` (JSONB) to store real Expo ticket IDs for
--    receipt reconciliation — replaces the fabricated `expo:${eventId}` ID
-- 4. Adds `revision` and `idempotency_key` to notification_preferences for
--    optimistic concurrency control and safe retry
-- 5. Adds `preview_policy` column for server-side preview enforcement
-- 6. Adds `quiet_hours` JSONB column for server-side quiet-hour enforcement
-- 7. Adds index for receipt reconciliation lookup

-- ── 1. Expand category CHECK to include auctionAlerts ──────────────────────
-- The old CHECK constraint only allowed 7 categories. We need to drop and
-- recreate it to add `auctionAlerts`.
ALTER TABLE notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_category_check;

ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_category_check
  CHECK (
    category IN (
      'messages', 'offers', 'wishlist', 'followers',
      'orderUpdates', 'priceDrops', 'auctionAlerts', 'news'
    )
  );

-- Backfill auctionAlerts defaults for existing users
INSERT INTO notification_preferences (user_id, category, enabled)
SELECT u.id, 'auctionAlerts', TRUE
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM notification_preferences np
  WHERE np.user_id = u.id AND np.category = 'auctionAlerts'
)
ON CONFLICT DO NOTHING;

-- ── 2. Notification event delivery truth columns ───────────────────────────

-- P0 CRITICAL FIX: Drop the old status CHECK constraint that only allowed
-- 'queued', 'sent', 'failed'. The new delivery state machine requires
-- 'ticketed' (Expo accepted, receipt pending) and 'suppressed' (preference/
-- quiet-hours suppressed). Without this, every UPDATE to 'ticketed' or
-- 'suppressed' would fail with a CHECK constraint violation.
ALTER TABLE notification_events
  DROP CONSTRAINT IF EXISTS notification_events_status_check;

ALTER TABLE notification_events
  ADD CONSTRAINT notification_events_status_check
  CHECK (status IN ('queued', 'ticketed', 'sent', 'suppressed', 'failed'));

ALTER TABLE notification_events
  ADD COLUMN IF NOT EXISTS suppression_reason TEXT,
  ADD COLUMN IF NOT EXISTS provider_ticket_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS receipt_status TEXT,
  ADD COLUMN IF NOT EXISTS receipt_checked_at TIMESTAMPTZ;

-- The status column previously used 'queued', 'sent', 'failed'.
-- We now distinguish:
--   queued    — event created, push job enqueued
--   ticketed  — Expo accepted the payload (ticket status=ok), receipt pending
--   sent      — receipt confirmed ok (provider accepted by APNs/FCM)
--   suppressed — preference/quiet-hours suppressed, no push sent
--   failed    — delivery failed (no device, ticket error, receipt error)
-- 'sent' is only set after receipt confirmation, not after HTTP 2xx.
-- Existing 'sent' rows are left as-is (they were set under the old semantics).

-- Index for receipt reconciliation: find ticketed events whose receipts
-- have not been checked yet.
CREATE INDEX IF NOT EXISTS notification_events_receipt_pending_idx
  ON notification_events (status, created_at)
  WHERE status = 'ticketed' AND receipt_checked_at IS NULL;

-- Index for suppressed events observability
CREATE INDEX IF NOT EXISTS notification_events_suppressed_idx
  ON notification_events (user_id, status, created_at DESC)
  WHERE status = 'suppressed';

-- ── 3. Preference revision and idempotency for safe retry ──────────────────
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS preview_policy TEXT NOT NULL DEFAULT 'full'
  CHECK (preview_policy IN ('full', 'sender_only', 'hidden'));

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours JSONB;

-- Unique constraint for preference idempotency key per user
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_idempotency_idx
  ON notification_preferences (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 4. Device token redaction support ──────────────────────────────────────
-- Add a redacted_label column so the API can return a human-friendly device
-- label without exposing the raw push token.
ALTER TABLE notification_devices
  ADD COLUMN IF NOT EXISTS redacted_label TEXT,
  ADD COLUMN IF NOT EXISTS token_status TEXT NOT NULL DEFAULT 'active'
  CHECK (token_status IN ('active', 'revoked', 'expired', 'not_registered'));

-- Backfill redacted labels for existing devices
UPDATE notification_devices
  SET redacted_label = CASE
    WHEN platform = 'ios' THEN 'iPhone'
    WHEN platform = 'android' THEN 'Android device'
    WHEN platform = 'web' THEN 'Web browser'
    ELSE 'Device'
  END
  WHERE redacted_label IS NULL;

-- Index for token_status reconciliation
CREATE INDEX IF NOT EXISTS notification_devices_status_idx
  ON notification_devices (user_id, token_status)
  WHERE is_active = TRUE;
