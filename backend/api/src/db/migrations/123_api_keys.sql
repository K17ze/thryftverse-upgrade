-- Migration 123: API keys for partner server-to-server access
--
-- Stores SHA-256 hashes of API keys (never the raw key). The raw key is
-- only returned once at creation time. key_prefix stores the first 8
-- characters of the key so admins can identify a key without exposing it.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT
-- EXISTS so re-running the migration is safe.

CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  key_hash      CHAR(64) NOT NULL,
  key_prefix    CHAR(8) NOT NULL,
  scopes        TEXT[] NOT NULL DEFAULT '{}',
  created_by    VARCHAR(120) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash
  ON api_keys (key_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix
  ON api_keys (key_prefix);

CREATE INDEX IF NOT EXISTS idx_api_keys_is_active
  ON api_keys (is_active);

COMMENT ON TABLE api_keys IS
  'API keys for partner server-to-server access. Only SHA-256 hashes are stored.';
COMMENT ON COLUMN api_keys.key_hash IS
  'SHA-256 hex digest of the raw API key. The raw key is never stored.';
COMMENT ON COLUMN api_keys.key_prefix IS
  'First 8 characters of the raw key, used to identify a key without exposing it.';
COMMENT ON COLUMN api_keys.scopes IS
  'Fine-grained permission scopes assigned to this API key.';
