-- 294_report_idempotency_keys_down.sql

DROP INDEX IF EXISTS user_reports_idempotency_key_idx;
DROP INDEX IF EXISTS listing_reports_idempotency_key_idx;

ALTER TABLE user_reports
  DROP COLUMN IF EXISTS idempotency_key;

ALTER TABLE listing_reports
  DROP COLUMN IF EXISTS idempotency_key;
