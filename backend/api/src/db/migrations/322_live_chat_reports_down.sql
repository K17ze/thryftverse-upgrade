-- Rollback for migration 322.

ALTER TABLE live_shopping_chat_messages
  DROP COLUMN IF EXISTS moderation_state;

DROP TABLE IF EXISTS live_chat_reports;
