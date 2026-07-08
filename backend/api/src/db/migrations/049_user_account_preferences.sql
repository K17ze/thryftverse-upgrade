-- 049_user_account_preferences.sql
-- Account-level preferences persisted on the user row.
-- Backs PATCH /users/me/preferences and PATCH /users/me/postage.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS holiday_mode BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS private_profile BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS postage_carrier_key TEXT NOT NULL DEFAULT 'evri',
  ADD COLUMN IF NOT EXISTS postage_free_shipping BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS postage_bundle_discount BOOLEAN NOT NULL DEFAULT TRUE;
