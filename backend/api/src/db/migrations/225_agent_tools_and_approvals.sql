-- Agent tools and approvals: typed tool registry and durable approval checkpoints.
--
-- Tools are typed server-side operations the model can propose. The server policy
-- engine decides whether each tool call is allowed, requires approval, or is denied.
-- Approvals are durable — they survive process restarts and are single-use.

-- Tool definitions (server-side registry, not per-agent)
CREATE TABLE IF NOT EXISTS agent_tools (
  id TEXT PRIMARY KEY,
  -- Stable tool name (e.g. 'search_listings', 'read_conversation_history')
  name TEXT NOT NULL UNIQUE,
  -- Tool description for the model
  description TEXT NOT NULL,
  -- JSON Schema for the tool input parameters
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Risk classification
  risk TEXT NOT NULL CHECK (risk IN ('read', 'reversible_write', 'consequential_write', 'destructive')),
  -- Required backend permission (e.g. 'read_messages', 'reply_in_chat')
  required_permission TEXT,
  -- Whether this tool is enabled
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version TEXT NOT NULL DEFAULT '1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent-tool bindings (which tools an agent has access to)
CREATE TABLE IF NOT EXISTS agent_tool_bindings (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES chat_bots(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL REFERENCES agent_tools(name) ON DELETE CASCADE,
  -- Per-binding policy: automatic, ask_once, ask_each_time, blocked
  policy TEXT NOT NULL DEFAULT 'automatic' CHECK (policy IN ('automatic', 'ask_once', 'ask_each_time', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bot_id, tool_name)
);

CREATE INDEX IF NOT EXISTS agent_tool_bindings_bot_idx
  ON agent_tool_bindings (bot_id);

-- Durable approval requests
CREATE TABLE IF NOT EXISTS agent_approval_requests (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- The canonical tool call that needs approval
  tool_name TEXT NOT NULL,
  tool_arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Bounded continuation token (for resuming the run after approval)
  continuation_token TEXT NOT NULL,
  -- Approval state
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'superseded')),
  -- Who decided
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  -- Edited arguments (if the user edited before approving)
  edited_arguments JSONB,
  -- Expiry
  expires_at TIMESTAMPTZ,
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_approval_requests_run_idx
  ON agent_approval_requests (run_id, status);

CREATE INDEX IF NOT EXISTS agent_approval_requests_pending_idx
  ON agent_approval_requests (status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS agent_approval_requests_actor_idx
  ON agent_approval_requests (actor_user_id, status, created_at DESC);

-- Seed initial read-only tools
INSERT INTO agent_tools (id, name, description, input_schema, risk, required_permission, is_enabled)
VALUES
  ('tool_search_listings', 'search_listings', 'Search marketplace listings by keyword, category, price range, or condition. Returns matching listings with title, price, and seller.', '{"type":"object","properties":{"query":{"type":"string","description":"Search query"},"maxResults":{"type":"number","description":"Maximum results to return","default":10},"minPrice":{"type":"number","description":"Minimum price in GBP"},"maxPrice":{"type":"number","description":"Maximum price in GBP"}},"required":["query"]}', 'read', NULL, TRUE),
  ('tool_read_conversation', 'read_conversation', 'Read recent messages from the current conversation. Returns the last N messages with author and text.', '{"type":"object","properties":{"maxMessages":{"type":"number","description":"Maximum messages to read","default":20}}}', 'read', 'read_messages', TRUE),
  ('tool_draft_reply', 'draft_reply', 'Draft a reply message for the conversation. The draft is NOT sent automatically — it requires approval or the reply_in_chat permission.', '{"type":"object","properties":{"text":{"type":"string","description":"The draft reply text"}},"required":["text"]}', 'reversible_write', 'reply_in_chat', TRUE),
  ('tool_get_listing_details', 'get_listing_details', 'Get detailed information about a specific listing including description, condition, images, and seller info.', '{"type":"object","properties":{"listingId":{"type":"string","description":"The listing ID"}},"required":["listingId"]}', 'read', NULL, TRUE),
  ('tool_check_price_history', 'check_price_history', 'Check recent sold prices for similar items to help with price comparison.', '{"type":"object","properties":{"query":{"type":"string","description":"Item search query"},"days":{"type":"number","description":"Look back N days","default":30}},"required":["query"]}', 'read', NULL, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Audit event types for tools and approvals
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
    'tool_called', 'tool_approved', 'tool_rejected', 'tool_denied'
  ));
