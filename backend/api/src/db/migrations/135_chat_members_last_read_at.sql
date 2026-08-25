-- 135: Add last_read_at to chat_members for read-receipt tracking.
-- The GET /chat/conversations/:id/participants route already queries this
-- column; this migration makes it exist. Also used by the mark-as-read
-- endpoint (POST /chat/conversations/:id/read) to record the timestamp.

ALTER TABLE chat_members
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS chat_members_last_read_at_idx
  ON chat_members (conversation_id, last_read_at)
  WHERE last_read_at IS NOT NULL;
