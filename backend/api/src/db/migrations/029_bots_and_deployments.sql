-- Extend chat_bots to support custom bots and richer metadata
ALTER TABLE chat_bots
  ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('system', 'custom')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'local-only', 'backend-required', 'disabled')),
  ADD COLUMN IF NOT EXISTS runtime_mode TEXT NOT NULL DEFAULT 'backend' CHECK (runtime_mode IN ('local', 'config-only', 'backend', 'ai')),
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS icon TEXT;

-- Add helpful indexes for custom bot lookups
CREATE INDEX IF NOT EXISTS chat_bots_owner_id_idx ON chat_bots (owner_id, type);
CREATE INDEX IF NOT EXISTS chat_bots_type_status_idx ON chat_bots (type, status, is_draft);

-- Extend chat_bot_installs to support deployment status and permission snapshots
ALTER TABLE chat_bot_installs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'removed')),
  ADD COLUMN IF NOT EXISTS permissions_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add updated_at trigger for chat_bot_installs
CREATE OR REPLACE FUNCTION update_chat_bot_installs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_bot_installs_updated_at_trigger ON chat_bot_installs;
CREATE TRIGGER chat_bot_installs_updated_at_trigger
  BEFORE UPDATE ON chat_bot_installs
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_bot_installs_updated_at();

-- Bot audit events table
CREATE TABLE IF NOT EXISTS chat_bot_audit_events (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES chat_bots(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES chat_conversations(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'deleted', 'deployed', 'removed', 'disabled', 'command_attempted')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_bot_audit_events_bot_id_idx
  ON chat_bot_audit_events (bot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_bot_audit_events_conversation_id_idx
  ON chat_bot_audit_events (conversation_id, created_at DESC);

-- Backfill existing system bots with explicit type
UPDATE chat_bots
SET type = 'system',
    status = 'available',
    runtime_mode = 'backend',
    is_draft = FALSE,
    permissions = '[]'::jsonb
WHERE type = 'system' OR type IS NULL;

-- Update chat_conversations.updated_at trigger if not present
CREATE OR REPLACE FUNCTION update_chat_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_conversations_updated_at_trigger ON chat_conversations;
CREATE TRIGGER chat_conversations_updated_at_trigger
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_conversations_updated_at();
