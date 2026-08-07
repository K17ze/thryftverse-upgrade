-- AI usage accounting and policy evidence.
--
-- Redis enforces the hot hourly quota atomically. This table is the durable
-- audit/cost ledger used for reconciliation, support, and provider spend
-- analysis. It deliberately stores provider-reported token counts rather than
-- estimating them from message length.

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE RESTRICT,
  bot_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_request_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'quota_blocked')),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (
    total_tokens >= 0
    AND total_tokens >= input_tokens
    AND total_tokens >= output_tokens
  ),
  estimated_cost_microusd BIGINT NOT NULL DEFAULT 0 CHECK (estimated_cost_microusd >= 0),
  pricing_version TEXT NOT NULL,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_user_created_idx
  ON ai_usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_conversation_created_idx
  ON ai_usage_events (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_provider_request_idx
  ON ai_usage_events (provider_request_id)
  WHERE provider_request_id IS NOT NULL;

COMMENT ON TABLE ai_usage_events IS
  'Durable provider-reported AI usage and configured-pricing cost ledger; Redis remains the atomic hot quota boundary.';

