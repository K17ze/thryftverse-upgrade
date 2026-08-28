-- Agent versioning: immutable published versions with deployment pinning.
--
-- This migration introduces agent_versions as the immutable source of truth
-- for a published agent definition. Deployments pin a version so editing a
-- draft never silently changes running installations.

CREATE TABLE IF NOT EXISTS agent_versions (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES chat_bots(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  publisher_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- Immutable snapshot of the agent definition at publish time
  agent_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Checksums for reproducibility
  config_checksum TEXT NOT NULL,
  permissions_checksum TEXT NOT NULL,
  -- Metadata
  publish_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One version number per bot
  UNIQUE (bot_id, version_number)
);

CREATE INDEX IF NOT EXISTS agent_versions_bot_id_idx
  ON agent_versions (bot_id, version_number DESC);

-- Add version pinning to chat_bot_installs
ALTER TABLE chat_bot_installs
  ADD COLUMN IF NOT EXISTS agent_version_id TEXT REFERENCES agent_versions(id) ON DELETE SET NULL;

-- Add version tracking to chat_bots
ALTER TABLE chat_bots
  ADD COLUMN IF NOT EXISTS current_version_id TEXT REFERENCES agent_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1;

-- Backfill: create version 1 for existing published (non-draft) custom bots
-- so they have an immutable baseline. Draft bots skip this.
INSERT INTO agent_versions (id, bot_id, version_number, publisher_id, agent_config, permissions, config_checksum, permissions_checksum, publish_notes)
SELECT
  'ver_' || b.id || '_001',
  b.id,
  1,
  COALESCE(b.owner_id, (SELECT id FROM users LIMIT 1)),
  b.agent_config,
  b.permissions,
  md5(b.agent_config::text),
  md5(b.permissions::text),
  'Initial version from migration'
FROM chat_bots b
WHERE b.type = 'custom'
  AND b.is_draft = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM agent_versions av WHERE av.bot_id = b.id
  );

-- Link backfilled versions to their bots and installs
UPDATE chat_bots b
SET current_version_id = 'ver_' || b.id || '_001',
    revision_number = 1
WHERE b.type = 'custom'
  AND b.is_draft = FALSE
  AND b.current_version_id IS NULL
  AND EXISTS (SELECT 1 FROM agent_versions av WHERE av.bot_id = b.id AND av.version_number = 1);

UPDATE chat_bot_installs cbi
SET agent_version_id = 'ver_' || cbi.bot_id || '_001'
WHERE cbi.status = 'active'
  AND cbi.agent_version_id IS NULL
  AND EXISTS (
    SELECT 1 FROM agent_versions av
    WHERE av.bot_id = cbi.bot_id AND av.version_number = 1
  );

-- Audit event types for versioning
ALTER TABLE chat_bot_audit_events
  DROP CONSTRAINT IF EXISTS chat_bot_audit_events_event_type_check;
ALTER TABLE chat_bot_audit_events
  ADD CONSTRAINT chat_bot_audit_events_event_type_check
  CHECK (event_type IN (
    'created', 'updated', 'deleted', 'deployed', 'removed', 'disabled',
    'command_attempted', 'execution_succeeded', 'execution_failed',
    'published', 'rolled_back', 'archived'
  ));
