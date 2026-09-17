-- Rollback for 300_seller_reach_state.sql

DROP INDEX IF EXISTS idx_users_reach_state;

ALTER TABLE users DROP COLUMN IF EXISTS reach_set_at;
ALTER TABLE users DROP COLUMN IF EXISTS reach_reason;
ALTER TABLE users DROP COLUMN IF EXISTS reach_state;
