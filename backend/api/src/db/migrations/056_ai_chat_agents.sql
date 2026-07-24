-- Configurable AI agents and truthful per-chat deployments.
ALTER TABLE chat_bots
  ADD COLUMN IF NOT EXISTS agent_config JSONB NOT NULL DEFAULT '{
    "instructions": "",
    "model": "gpt-5.6-terra",
    "triggerMode": "mention",
    "responseLength": "balanced",
    "tone": "focused",
    "reasoningEffort": "medium",
    "historyLimit": 16,
    "starterPrompts": []
  }'::jsonb;

ALTER TABLE chat_bot_installs
  ADD COLUMN IF NOT EXISTS configuration_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE chat_bot_installs
  ALTER COLUMN permissions_snapshot SET DEFAULT '[]'::jsonb;

ALTER TABLE chat_bot_audit_events
  DROP CONSTRAINT IF EXISTS chat_bot_audit_events_event_type_check;

ALTER TABLE chat_bot_audit_events
  ADD CONSTRAINT chat_bot_audit_events_event_type_check
  CHECK (event_type IN (
    'created',
    'updated',
    'deleted',
    'deployed',
    'removed',
    'disabled',
    'command_attempted',
    'execution_succeeded',
    'execution_failed'
  ));

CREATE INDEX IF NOT EXISTS chat_bots_agent_runtime_idx
  ON chat_bots (runtime_mode, status)
  WHERE type = 'custom' AND is_active = TRUE;

-- Configuration-only legacy bots could only emit placeholder text. Require an
-- owner review before moving them onto the real AI runtime.
UPDATE chat_bots
SET runtime_mode = 'ai',
    status = 'available',
    is_draft = TRUE,
    updated_at = NOW()
WHERE type = 'custom'
  AND LENGTH(TRIM(COALESCE(agent_config->>'instructions', ''))) < 20;
