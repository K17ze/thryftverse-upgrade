-- Persist the risk-decision outcome on chat_messages so read paths can
-- honor it. Previously evaluateRisk ran after INSERT and only suppressed
-- fan-out — the row stayed recipient-visible in GET /messages, the inbox
-- last-message preview, media listing, and search, making 'quarantine' and
-- 'deny' decisions cosmetic.
--
-- Semantics:
--   visible      — normal delivery (default; 'allow' + pending_review states)
--   quarantined  — sender-visible, hidden from all other participants
--   denied       — hidden from everyone, including the sender on refetch
--
-- messageState in the send response still reports the live decision; this
-- column is what read paths filter on.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS moderation_state TEXT NOT NULL DEFAULT 'visible'
    CHECK (moderation_state IN ('visible', 'quarantined', 'denied'));

CREATE INDEX IF NOT EXISTS chat_messages_moderation_state_idx
  ON chat_messages (conversation_id, moderation_state)
  WHERE moderation_state <> 'visible';
