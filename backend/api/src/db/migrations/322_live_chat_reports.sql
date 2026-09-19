-- 322: Live shopping chat reports + message moderation state.
--
-- Live stream chat previously had no report path, no block check, and no
-- moderation — a hard store-review requirement (UGC must be reportable and
-- moderatable). This adds:
--   1. live_chat_reports — durable report rows bridged into the safety case
--      graph via recordConsumerReport(kind='live_chat').
--   2. live_shopping_chat_messages.moderation_state — visible/quarantined/
--      denied, matching the chat_messages lifecycle convention (migration 314)
--      so quarantined content is filtered from read paths.

CREATE TABLE IF NOT EXISTS live_chat_reports (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES live_shopping_sessions(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES live_shopping_chat_messages(id) ON DELETE SET NULL,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'reviewing', 'actioned', 'dismissed')),
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reporter-side idempotent retries resolve to the original row.
CREATE UNIQUE INDEX IF NOT EXISTS live_chat_reports_idempotency_idx
  ON live_chat_reports (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- One report per reporter per message — repeat taps dedupe.
CREATE UNIQUE INDEX IF NOT EXISTS live_chat_reports_message_reporter_idx
  ON live_chat_reports (message_id, reporter_user_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS live_chat_reports_session_idx
  ON live_chat_reports (session_id, created_at DESC);

ALTER TABLE live_shopping_chat_messages
  ADD COLUMN IF NOT EXISTS moderation_state TEXT NOT NULL DEFAULT 'visible'
    CHECK (moderation_state IN ('visible', 'quarantined', 'denied'));
