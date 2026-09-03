-- Agent runs: durable execution records with state machine.
--
-- A run is a single execution instance of an agent. It tracks the trigger,
-- the pinned version, the deployment, the state machine transitions, usage,
-- and the final outcome. Runs survive process restarts.

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- Pinned version and deployment at execution time
  agent_version_id TEXT REFERENCES agent_versions(id) ON DELETE SET NULL,
  deployment_install_id TEXT,
  -- Trigger information
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('mention', 'command', 'always', 'manual', 'test')),
  trigger_message_id TEXT,
  -- State machine
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'waiting_for_approval', 'waiting_for_input',
    'succeeded', 'failed', 'timed_out', 'cancelled', 'unknown_outcome'
  )),
  -- Idempotency: unique trigger key prevents duplicate runs
  idempotency_key TEXT NOT NULL,
  -- Result
  result_message_id TEXT,
  result_text TEXT,
  error_message TEXT,
  -- Usage
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_microusd BIGINT NOT NULL DEFAULT 0,
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- One run per trigger per deployment
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS agent_runs_conversation_idx
  ON agent_runs (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_bot_idx
  ON agent_runs (bot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_status_idx
  ON agent_runs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_actor_idx
  ON agent_runs (actor_user_id, created_at DESC);

-- Agent run steps: individual spans within a run
CREATE TABLE IF NOT EXISTS agent_run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN (
    'model_call', 'tool_call', 'retrieval', 'guardrail', 'approval', 'retry', 'handoff'
  )),
  -- Span data
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  input_summary TEXT,
  output_summary TEXT,
  duration_ms INTEGER,
  tokens_used INTEGER,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, step_number)
);

CREATE INDEX IF NOT EXISTS agent_run_steps_run_idx
  ON agent_run_steps (run_id, step_number);

-- Audit event types for runs
ALTER TABLE chat_bot_audit_events
  DROP CONSTRAINT IF EXISTS chat_bot_audit_events_event_type_check;
ALTER TABLE chat_bot_audit_events
  ADD CONSTRAINT chat_bot_audit_events_event_type_check
  CHECK (event_type IN (
    'created', 'updated', 'deleted', 'deployed', 'removed', 'disabled',
    'command_attempted', 'execution_succeeded', 'execution_failed',
    'published', 'rolled_back', 'archived',
    'connection_created', 'connection_verified', 'connection_revoked', 'connection_deleted',
    'run_queued', 'run_started', 'run_succeeded', 'run_failed', 'run_cancelled'
  ));
