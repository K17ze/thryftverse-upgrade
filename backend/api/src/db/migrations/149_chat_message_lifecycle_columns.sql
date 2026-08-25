-- 149: Chat message lifecycle columns — reply, edit, delete, attachments, reactions, read receipts.
--
-- Closes the schema gaps identified in the Message Department Flagship Research
-- (P0.1, P0.5, P0.7, P0.8, P0.9, P0.12). These columns and tables make
-- replies, soft-delete, reactions, per-message read receipts and attachment
-- identity canonical database state instead of untyped JSON metadata or
-- client-only local mutations.

-- ── reply_to ──────────────────────────────────────────────────────────────
-- P0.8: Reply context was set on the optimistic message only and never sent
-- to the backend. This column makes reply targeting canonical.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT
    REFERENCES chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_messages_reply_to_idx
  ON chat_messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

-- ── edit tracking ─────────────────────────────────────────────────────────
-- Signal edit history. The prior version bodies live in chat_message_revisions.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS edit_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- ── soft delete ───────────────────────────────────────────────────────────
-- P0.5: Delete message had no backend route. P0.6: "delete conversation"
-- actually left the conversation. These columns support both delete-for-me
-- (per-user tombstone) and delete-for-everyone (sender/admin, time-windowed).
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS deleted_for_everyone_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_messages_deleted_for_everyone_idx
  ON chat_messages (conversation_id, deleted_for_everyone_at)
  WHERE deleted_for_everyone_at IS NOT NULL;

-- ── per-user delete-for-me tombstones ─────────────────────────────────────
-- A message can be deleted for one user but still visible to others.
CREATE TABLE IF NOT EXISTS chat_message_deletions (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

-- ── message reactions ─────────────────────────────────────────────────────
-- P0.9: Reactions were local store mutations with no backend. This table
-- makes them canonical and synchronizable via realtime.
CREATE TABLE IF NOT EXISTS chat_message_reactions (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS chat_message_reactions_message_idx
  ON chat_message_reactions (message_id);

-- ── per-message read receipts ─────────────────────────────────────────────
-- P0.7: chat_members.last_read_at (migration 135) gives conversation-level
-- read cursors. This table gives per-message read state for receipt display
-- and supports the "who read this message" detail view.
CREATE TABLE IF NOT EXISTS chat_message_read_receipts (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_message_read_receipts_message_idx
  ON chat_message_read_receipts (message_id);
CREATE INDEX IF NOT EXISTS chat_message_read_receipts_user_idx
  ON chat_message_read_receipts (user_id, read_at DESC);

-- ── message attachments ───────────────────────────────────────────────────
-- P0.4: Media was sent as a raw file:/// URI stored in metadata JSONB.
-- This table binds messages to canonical media assets with foreign keys,
-- so recipients and second devices can actually read the media.
CREATE TABLE IF NOT EXISTS chat_message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  media_asset_id TEXT,
  kind TEXT NOT NULL DEFAULT 'image'
    CHECK (kind IN ('image', 'video', 'audio', 'document')),
  canonical_url TEXT NOT NULL,
  thumbnail_url TEXT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_message_attachments_message_idx
  ON chat_message_attachments (message_id, sort_order);

-- ── conversation user state: pin + marked unread ──────────────────────────
-- P0.12: Pinning and manual mark-unread were local-only. These columns
-- extend chat_conversation_user_state (migration 128) for cross-device sync.
ALTER TABLE chat_conversation_user_state
  ADD COLUMN IF NOT EXISTS pinned_rank INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marked_unread_message_id TEXT;

CREATE INDEX IF NOT EXISTS chat_conv_user_state_pinned_idx
  ON chat_conversation_user_state (user_id, pinned_rank)
  WHERE pinned_rank > 0;

-- ── conversation reports ──────────────────────────────────────────────────
-- P0.11: Long-press report fabricated success; full screen called an
-- unregistered route. This table backs the canonical report workflow.
CREATE TABLE IF NOT EXISTS conversation_reports (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'reviewing', 'actioned', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversation_reports_conversation_idx
  ON conversation_reports (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS conversation_reports_reporter_idx
  ON conversation_reports (reporter_user_id, created_at DESC);

