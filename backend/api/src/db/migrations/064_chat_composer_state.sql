-- Cross-device chat composer state persistence.
--
-- Previously the composer draft, reply target, and pending attachment
-- references lived only in React state on the device that opened the
-- conversation. Switching devices or reloading lost the in-progress
-- message. This table records per-user, per-conversation composer state
-- so the draft, reply context and pending attachments can be restored
-- on any device the user signs in on.
--
-- One row per (user_id, conversation_id) — the most recent state wins.

CREATE TABLE IF NOT EXISTS chat_composer_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  -- The in-progress draft text. Empty string is a valid, intentional clear.
  draft_text TEXT NOT NULL DEFAULT '',
  -- Optional message id being replied to. NULL when no reply context.
  reply_to_message_id TEXT,
  -- Pending attachment references (object keys / finalization ids / local
  -- uris). Stored as a JSONB array so the client can restore the preview
  -- strip without re-picking. The backend does not validate each entry —
  -- it only persists what the client commits.
  pending_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Optional agent/bot selection active in the composer when the draft
  -- was saved, so the user does not have to re-pick the assistant.
  active_bot_id TEXT,
  -- Optional linked listing context the user was discussing. Preserves
  -- the marketplace chat card across devices.
  linked_listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  -- Client-supplied schema version so future composer state shapes can
  -- migrate without silent corruption.
  schema_version INTEGER NOT NULL DEFAULT 1,
  -- Soft delete marker — when the user sends the draft, the row is
  -- marked cleared (draft_text = '', pending_attachments = '[]') rather
  -- than deleted, so the upsert path stays simple.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS chat_composer_state_user_updated_idx
  ON chat_composer_state (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION update_chat_composer_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_composer_state_updated_at_trigger ON chat_composer_state;
CREATE TRIGGER chat_composer_state_updated_at_trigger
  BEFORE UPDATE ON chat_composer_state
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_composer_state_updated_at();
