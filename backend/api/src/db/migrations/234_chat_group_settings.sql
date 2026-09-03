-- 234: Server-owned group governance controls.
--
-- These settings deliberately cover only capabilities that the API can
-- enforce today. Defaults preserve the existing behaviour: members can send
-- messages, while owners/admins control identity and membership.

CREATE TABLE IF NOT EXISTS chat_group_settings (
  conversation_id TEXT PRIMARY KEY REFERENCES chat_conversations(id) ON DELETE CASCADE,
  edit_group_info_scope TEXT NOT NULL DEFAULT 'admins'
    CHECK (edit_group_info_scope IN ('admins', 'everyone')),
  send_messages_scope TEXT NOT NULL DEFAULT 'everyone'
    CHECK (send_messages_scope IN ('admins', 'everyone')),
  add_members_scope TEXT NOT NULL DEFAULT 'admins'
    CHECK (add_members_scope IN ('admins', 'everyone')),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_group_settings_updated_idx
  ON chat_group_settings (updated_at DESC);
