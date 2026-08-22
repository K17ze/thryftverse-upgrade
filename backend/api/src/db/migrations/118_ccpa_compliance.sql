-- CCPA compliance: adds columns to the users table to track California
-- Consumer Privacy Act requests — opt-out of sale, data export requests,
-- and deletion requests.
--
-- Idempotent: uses IF NOT EXISTS on all column additions so re-running
-- the migration is safe.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ccpa_opt_out_sale BOOLEAN DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ccpa_data_export_requested_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ccpa_deletion_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN users.ccpa_opt_out_sale IS
  'Whether the user has opted out of the sale of their personal information under CCPA.';
COMMENT ON COLUMN users.ccpa_data_export_requested_at IS
  'Timestamp of the most recent CCPA data export (right to know) request.';
COMMENT ON COLUMN users.ccpa_deletion_requested_at IS
  'Timestamp of the most recent CCPA deletion (right to delete) request.';
