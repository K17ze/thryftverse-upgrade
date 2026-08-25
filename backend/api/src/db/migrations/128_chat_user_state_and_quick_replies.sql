-- 128: Per-user conversation state (mute, archive, request status) and quick replies.
-- Closes the gap where mute/archive/message-request mutations were store-only.

-- Per-user, per-conversation state that is private to each member.
-- A conversation can be muted by one member and not another; archived by
-- one and not another; and a message request can be accepted by one
-- participant while still pending for the other.
CREATE TABLE IF NOT EXISTS chat_conversation_user_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  request_status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (request_status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS chat_conv_user_state_archived_idx
  ON chat_conversation_user_state (user_id, is_archived)
  WHERE is_archived = TRUE;

CREATE INDEX IF NOT EXISTS chat_conv_user_state_muted_idx
  ON chat_conversation_user_state (user_id, is_muted)
  WHERE is_muted = TRUE;

CREATE INDEX IF NOT EXISTS chat_conv_user_state_pending_idx
  ON chat_conversation_user_state (user_id, request_status)
  WHERE request_status = 'pending';

-- Reusable message templates that persist across devices.
-- `role` distinguishes buyer-facing and seller-facing replies.
CREATE TABLE IF NOT EXISTS chat_quick_replies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'buyer'
    CHECK (role IN ('buyer', 'seller')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_quick_replies_user_role_idx
  ON chat_quick_replies (user_id, role, sort_order ASC);

-- Marketplace chat feature toggles — user-level preferences that control
-- whether offer cards and order-update cards render inside conversations.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS offers_in_chat_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS order_updates_in_chat_enabled BOOLEAN NOT NULL DEFAULT TRUE;
