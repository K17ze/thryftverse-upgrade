-- 294_report_idempotency_keys.sql
--
-- Client idempotency for the consumer report endpoints. Migration 150
-- gave conversation_reports an idempotency_key so a retried submission
-- dedupes instead of double-filing; user_reports and listing_reports had
-- no equivalent — a dropped response followed by a retry created a second
-- report row and (via recordConsumerReport) a second safety notice.
--
-- The key is scoped per reporter: UNIQUE (reporter_id, idempotency_key)
-- WHERE the key is present, so clients may reuse short keys and rows
-- without a key (older clients, backfills) are unaffected.

ALTER TABLE user_reports
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE listing_reports
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS user_reports_idempotency_key_idx
  ON user_reports (reporter_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS listing_reports_idempotency_key_idx
  ON listing_reports (reporter_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN user_reports.idempotency_key IS
  'Client-supplied dedupe key; retried submissions resolve the original report row.';
COMMENT ON COLUMN listing_reports.idempotency_key IS
  'Client-supplied dedupe key; retried submissions resolve the original report row.';
