-- P0-MSG-2: Stable clientMessageId for chat message idempotency.
--
-- The client generates an optimistic local ID; the backend generates a new
-- server ID. A dropped response followed by a retry created a second row
-- because there was no stable clientMessageId to deduplicate against.
--
-- This migration adds a `client_message_id` column to `chat_messages` and a
-- partial unique constraint on `(conversation_id, sender_user_id,
-- client_message_id)` so a retried send replays the original message instead
-- of duplicating it. The constraint is partial: system/bot messages and
-- legacy rows never carry a client_message_id, so they must be excluded to
-- avoid a single NULL bucket violating uniqueness.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS client_message_id TEXT;

-- Partial unique index — only enforced when client_message_id is present.
-- Different users could theoretically generate the same id, so sender_user_id
-- is part of the key.
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_client_message_id_uniq
  ON chat_messages (conversation_id, sender_user_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
