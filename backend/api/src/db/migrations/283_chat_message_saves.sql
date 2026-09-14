-- 283_chat_message_saves.sql
-- "Save in chat" — Snapchat-style negotiated persistence. Either
-- participant may save a message; the saved state is shared (both parties
-- see the marker) while per-user rows preserve attribution (savedBy).
-- Unsaving removes only the actor's row — the message stays saved while
-- any participant's save remains.

CREATE TABLE IF NOT EXISTS chat_message_saves (
  message_id      TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_message_saves_conversation_idx
  ON chat_message_saves (conversation_id);
