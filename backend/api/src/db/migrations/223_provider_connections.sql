-- Provider connections: server-side credential vault for AI agent execution.
--
-- Connections are opaque references to provider credentials. The actual secret
-- is stored encrypted (or via a KMS/vault reference) — never in plaintext columns
-- visible to the model or query results. The runtime resolves a connection to
-- obtain the actual key at execution time.
--
-- This table stores the connection METADATA and an encrypted key reference.
-- The encryption key is derived from the server's ENCRYPTION_KEY env var.

CREATE TABLE IF NOT EXISTS provider_connections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Provider identity
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'gemini', 'custom')),
  -- Human-readable label for this connection (e.g. "Work OpenAI", "Personal")
  label TEXT NOT NULL DEFAULT 'Default',
  -- Environment: production, staging, development
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'development')),
  -- Encrypted API key (AES-256-GCM). The key is encrypted with a server-side key.
  -- Never returned in API responses — only the masked version is returned.
  encrypted_key TEXT NOT NULL,
  -- Optional custom base URL (for custom/OpenAI-compatible providers)
  base_url TEXT,
  -- Connection health state
  health_status TEXT NOT NULL DEFAULT 'unverified' CHECK (health_status IN ('unverified', 'healthy', 'degraded', 'expired', 'revoked', 'failed')),
  -- ISO timestamp of last successful verification
  last_verified_at TIMESTAMPTZ,
  -- ISO timestamp of last failure
  last_failed_at TIMESTAMPTZ,
  -- Error message from last failure
  last_error TEXT,
  -- Discovered models from last verification (cached)
  discovered_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS provider_connections_owner_idx
  ON provider_connections (owner_id, is_active);

CREATE INDEX IF NOT EXISTS provider_connections_provider_idx
  ON provider_connections (provider, health_status);

-- Add connection binding to chat_bots
ALTER TABLE chat_bots
  ADD COLUMN IF NOT EXISTS provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE SET NULL;

-- Audit event types for connections
ALTER TABLE chat_bot_audit_events
  DROP CONSTRAINT IF EXISTS chat_bot_audit_events_event_type_check;
ALTER TABLE chat_bot_audit_events
  ADD CONSTRAINT chat_bot_audit_events_event_type_check
  CHECK (event_type IN (
    'created', 'updated', 'deleted', 'deployed', 'removed', 'disabled',
    'command_attempted', 'execution_succeeded', 'execution_failed',
    'published', 'rolled_back', 'archived',
    'connection_created', 'connection_verified', 'connection_revoked', 'connection_deleted'
  ));

-- Updated_at trigger for provider_connections
CREATE OR REPLACE FUNCTION update_provider_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS provider_connections_updated_at_trigger ON provider_connections;
CREATE TRIGGER provider_connections_updated_at_trigger
  BEFORE UPDATE ON provider_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_provider_connections_updated_at();
