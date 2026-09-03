-- 233_user_blocks_reason.sql
-- Adds an optional reason column to user_blocks so the blocker can record
-- why they blocked a user. Backward-compatible: existing rows get NULL.

ALTER TABLE user_blocks
  ADD COLUMN IF NOT EXISTS reason TEXT;
