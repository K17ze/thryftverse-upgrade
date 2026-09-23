-- Agent memory: per-user long-term memory for AI agents.
--
-- Agents previously saw only the last N messages of the current conversation
-- (botRuntime/index.ts loadConversationHistory) — nothing persisted across
-- sessions. This migration introduces a governed per-user memory store:
--
--   agent_memory_settings — per-user controls (memory on/off, extraction
--     on/off). Rows are created lazily; absence means defaults (enabled).
--
--   agent_memories — typed memory records with provenance, temporal validity
--     and lifecycle status. Scoped per user, optionally per bot (bot_id NULL =
--     user-scope, shared across that user's agents). Kinds follow the
--     typed-record model (preference | fact | directive | episodic_summary),
--     not document chunks — this is agent memory, not a RAG corpus.
--
-- User control is first-class: every memory is listable and retractable via
-- API, and both tables cascade on user deletion (GDPR Art.17).
--
-- Embeddings are OPTIONAL and feature-detected: when pgvector is available an
-- embedding_vec column + HNSW index are added and recall ranks by cosine
-- similarity; otherwise recall degrades honestly to kind/recency ordering —
-- the same honest-degradation convention as media_embeddings (326).

CREATE TABLE IF NOT EXISTS agent_memory_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Master switch: when FALSE nothing is recalled and nothing is extracted.
  memory_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- When FALSE, memories are never written from agent runs (recall still
  -- honours memory_enabled; explicit store_memory calls are still allowed
  -- because the user asked for them in conversation).
  extraction_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- NULL = user scope (visible to every agent acting for this user);
  -- set = bound to one bot only.
  bot_id TEXT REFERENCES chat_bots(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('preference', 'fact', 'directive', 'episodic_summary')),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 2 AND 1000),
  -- Normalised content for cheap exact dedupe when embeddings are absent.
  content_key TEXT GENERATED ALWAYS AS (
    lower(btrim(regexp_replace(content, '\s+', ' ', 'g')))
  ) STORED,
  -- Provenance — where the memory came from.
  source_type TEXT NOT NULL CHECK (source_type IN ('conversation', 'tool_result', 'explicit', 'extraction')),
  source_conversation_id TEXT REFERENCES chat_conversations(id) ON DELETE SET NULL,
  source_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
  -- Lifecycle: active rows are recallable; retracted rows are retained for
  -- audit but never injected into prompts; expired rows passed their
  -- valid_to window.
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retracted', 'expired')),
  confidence REAL NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  -- Temporal validity (Zep-style): NULL valid_to = currently true.
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  -- Recall telemetry
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One memory per (user, bot-scope, normalised content). COALESCE makes the
-- NULL bot scope (user-scope memories) dedupe correctly.
CREATE UNIQUE INDEX IF NOT EXISTS agent_memories_dedupe_idx
  ON agent_memories (user_id, COALESCE(bot_id, ''), content_key);

CREATE INDEX IF NOT EXISTS agent_memories_user_recall_idx
  ON agent_memories (user_id, status, kind, last_used_at DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_memories_bot_idx
  ON agent_memories (bot_id)
  WHERE bot_id IS NOT NULL;

-- Optional vector column + ANN index, only where pgvector exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'vector'
  ) THEN
    RAISE NOTICE 'pgvector not available — agent_memories.embedding_vec skipped (recency/kind recall only)';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS vector;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'agent_memories'::regclass
      AND attname = 'embedding_vec'
  ) THEN
    ALTER TABLE agent_memories ADD COLUMN embedding_vec vector(1536);
  END IF;

  BEGIN
    CREATE INDEX IF NOT EXISTS agent_memories_embedding_vec_hnsw_idx
      ON agent_memories USING hnsw (embedding_vec vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'agent_memories HNSW index not created: %', SQLERRM;
  END;
END;
$$;

-- New agent tools: actor-scoped reads over the user's own data plus
-- governed memory operations. All remain policy-gated by
-- evaluateToolPolicy; execution lives in botRuntime/toolExecutors.ts.
INSERT INTO agent_tools (id, name, description, input_schema, risk, required_permission, is_enabled)
VALUES
  ('tool_get_my_listings', 'get_my_listings', 'List the acting user''s own listings (their items for sale). Returns id, title, price and status.', '{"type":"object","properties":{"status":{"type":"string","description":"Filter by listing status (e.g. active, sold)"},"maxResults":{"type":"number","description":"Maximum results","default":10}}}', 'read', NULL, TRUE),
  ('tool_get_my_orders', 'get_my_orders', 'List the acting user''s own orders as buyer or seller. Returns order id, listing title, total and status.', '{"type":"object","properties":{"role":{"type":"string","enum":["buyer","seller","any"],"default":"any"},"maxResults":{"type":"number","description":"Maximum results","default":10}}}', 'read', NULL, TRUE),
  ('tool_recall_memories', 'recall_memories', 'Search the acting user''s long-term memory for relevant facts, preferences and directives.', '{"type":"object","properties":{"query":{"type":"string","description":"What to recall"},"maxResults":{"type":"number","description":"Maximum memories","default":5}},"required":["query"]}', 'read', NULL, TRUE),
  ('tool_store_memory', 'store_memory', 'Store a durable fact, preference or directive about the acting user for future conversations. Only store what the user stated or clearly implied — never secrets, payment details or credentials.', '{"type":"object","properties":{"kind":{"type":"string","enum":["preference","fact","directive"],"description":"Memory kind"},"content":{"type":"string","description":"The memory text, one clear statement"}},"required":["kind","content"]}', 'reversible_write', NULL, TRUE),
  ('tool_forget_memory', 'forget_memory', 'Retract (forget) a previously stored memory for the acting user. Use when the user asks the agent to forget something.', '{"type":"object","properties":{"query":{"type":"string","description":"Text identifying the memory to forget"},"memoryId":{"type":"string","description":"Exact memory id when known"}}}', 'reversible_write', NULL, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Widen the audit event vocabulary for run waiting states and memory ops.
ALTER TABLE chat_bot_audit_events
  DROP CONSTRAINT IF EXISTS chat_bot_audit_events_event_type_check;
ALTER TABLE chat_bot_audit_events
  ADD CONSTRAINT chat_bot_audit_events_event_type_check
  CHECK (event_type IN (
    'created', 'updated', 'deleted', 'deployed', 'removed', 'disabled',
    'command_attempted', 'execution_succeeded', 'execution_failed',
    'published', 'rolled_back', 'archived',
    'connection_created', 'connection_verified', 'connection_revoked', 'connection_deleted',
    'run_queued', 'run_started', 'run_succeeded', 'run_failed', 'run_cancelled',
    'run_waiting_approval',
    'tool_called', 'tool_approved', 'tool_rejected', 'tool_denied',
    'memory_stored', 'memory_recalled', 'memory_retracted',
    'memory_cleared', 'memory_settings_updated'
  ));
