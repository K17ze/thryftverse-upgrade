-- 235_chat_pinned_messages.sql
-- Per-conversation message pinning. A pinned message is surfaced at the
-- top of the chat via a PinnedMessageBar and can be jumped to.
-- Only group admins/owners can pin (enforced at the API layer).

CREATE TABLE IF NOT EXISTS chat_pinned_messages (
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  message_id      TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  pinned_by       TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  pinned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, message_id)
);

-- One pinned message per conversation at a time (latest pin wins).
-- We use a UNIQUE on conversation_id so only one row exists per conversation.
-- Pinning a new message replaces the old one.
CREATE UNIQUE INDEX IF NOT EXISTS chat_pinned_messages_one_per_conversation
  ON chat_pinned_messages(conversation_id);
