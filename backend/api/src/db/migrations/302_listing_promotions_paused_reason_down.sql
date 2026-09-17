-- Rollback for 302_listing_promotions_paused_reason.sql

ALTER TABLE listing_promotions
  DROP COLUMN IF EXISTS paused_reason;
