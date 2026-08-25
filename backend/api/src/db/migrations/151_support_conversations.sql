-- 150: Support conversation, case, and event foundation
--
-- Phase 0 of the agentic support upgrade (see .devin/reports/agentic-help-support-flagship-analysis-2026-08-25.md).
-- Introduces durable support conversations, messages, cases, events, assignments,
-- action proposals, agent runs, handoffs, feedback, and SLA policies.
--
-- Design principles:
--  - The model never owns policy and never adjudicates money, fraud, counterfeit,
--    account suspension, moderation appeals, auction disputes or Co-Own rights.
--  - A support case is the structured work record; a conversation is communication.
--  - Operational state is separate from resolution disposition.
--  - General support cases are possible without a fake order relation.
--  - Every decision/action has a trace and policy version.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

-- ── Support conversations ──

CREATE TABLE IF NOT EXISTS support_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context_kind TEXT NOT NULL CHECK (context_kind IN (
    'general', 'order', 'listing', 'payout', 'report',
    'auction', 'coown_asset', 'catalog_import', 'media_job'
  )),
  context_id TEXT,
  ownership_state TEXT NOT NULL DEFAULT 'ai_active' CHECK (ownership_state IN (
    'ai_active', 'human_queued', 'human_active',
    'awaiting_customer', 'resolved', 'closed'
  )),
  title TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_conversations_user_idx
  ON support_conversations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_conversations_context_idx
  ON support_conversations (context_kind, context_id)
  WHERE context_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_conversations_ownership_idx
  ON support_conversations (ownership_state, updated_at DESC);

-- ── Support participants ──

CREATE TABLE IF NOT EXISTS support_participants (
  conversation_id TEXT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'agent_ai', 'agent_human', 'system')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id, role)
);

-- ── Support messages ──

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('customer', 'agent_ai', 'agent_human', 'system')),
  body TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_messages_conversation_idx
  ON support_messages (conversation_id, created_at ASC);

-- ── Support message attachments ──

CREATE TABLE IF NOT EXISTS support_message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  scan_state TEXT NOT NULL DEFAULT 'pending' CHECK (scan_state IN ('pending', 'clean', 'flagged', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_message_attachments_message_idx
  ON support_message_attachments (message_id);

-- ── Support cases (structured work records) ──

CREATE TABLE IF NOT EXISTS support_cases (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES support_conversations(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL,
  requested_outcome TEXT,
  operational_state TEXT NOT NULL DEFAULT 'new' CHECK (operational_state IN (
    'new', 'triaged', 'awaiting_customer', 'queued',
    'in_review', 'awaiting_external', 'resolved', 'closed'
  )),
  resolution_disposition TEXT CHECK (resolution_disposition IN (
    'information_provided', 'customer_withdrew', 'seller_resolved',
    'refund_approved', 'refund_denied', 'return_approved', 'not_eligible',
    'no_violation', 'violation_actioned', 'duplicate', 'merged',
    'external_dispute', 'unable_to_resolve'
  )),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_team TEXT,
  assigned_operator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  policy_version_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_cases_user_idx
  ON support_cases (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_cases_state_idx
  ON support_cases (operational_state, updated_at DESC);

CREATE INDEX IF NOT EXISTS support_cases_team_idx
  ON support_cases (assigned_team, operational_state, priority DESC)
  WHERE assigned_team IS NOT NULL;

-- ── Support case links (context objects) ──

CREATE TABLE IF NOT EXISTS support_case_links (
  case_id TEXT NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  context_kind TEXT NOT NULL CHECK (context_kind IN (
    'order', 'listing', 'payout', 'report',
    'auction', 'coown_asset', 'catalog_import', 'media_job'
  )),
  context_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (case_id, context_kind, context_id)
);

CREATE INDEX IF NOT EXISTS support_case_links_context_idx
  ON support_case_links (context_kind, context_id);

-- ── Support case events (event-sourced timeline) ──

CREATE TABLE IF NOT EXISTS support_case_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('customer', 'agent_ai', 'agent_human', 'system', 'operator')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_case_events_case_idx
  ON support_case_events (case_id, created_at ASC);

CREATE INDEX IF NOT EXISTS support_case_events_public_idx
  ON support_case_events (case_id, created_at ASC)
  WHERE is_public = TRUE;

-- ── Support assignments ──

CREATE TABLE IF NOT EXISTS support_assignments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  operator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  team TEXT,
  assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'transferred', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_assignments_case_idx
  ON support_assignments (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_assignments_operator_idx
  ON support_assignments (operator_id, state)
  WHERE operator_id IS NOT NULL;

-- ── Support SLA policies ──

CREATE TABLE IF NOT EXISTS support_sla_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  issue_type TEXT,
  priority TEXT CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  first_response_seconds INTEGER NOT NULL,
  next_response_seconds INTEGER,
  resolution_seconds INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Support action proposals (immutable, server-authoritative) ──

CREATE TABLE IF NOT EXISTS support_action_proposals (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES support_cases(id) ON DELETE SET NULL,
  run_id TEXT,
  tool_name TEXT NOT NULL,
  canonical_arguments JSONB NOT NULL,
  arguments_hash TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  consequence_summary TEXT NOT NULL,
  policy_decision_id TEXT,
  resource_version TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  state TEXT NOT NULL DEFAULT 'proposed' CHECK (state IN (
    'proposed', 'confirmed', 'rejected', 'executing',
    'succeeded', 'failed', 'unknown_outcome'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_action_proposals_conversation_idx
  ON support_action_proposals (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_action_proposals_state_idx
  ON support_action_proposals (state, updated_at DESC);

-- ── Support action executions ──

CREATE TABLE IF NOT EXISTS support_action_executions (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES support_action_proposals(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  executed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  result_state TEXT NOT NULL CHECK (result_state IN ('succeeded', 'failed', 'unknown_outcome')),
  result_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_action_executions_proposal_idx
  ON support_action_executions (proposal_id);

-- ── Support agent runs (trace per turn) ──

CREATE TABLE IF NOT EXISTS support_agent_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,
  agent_version TEXT NOT NULL,
  model_provider TEXT,
  model_snapshot TEXT,
  prompt_config_checksum TEXT,
  procedure_version TEXT,
  policy_version_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  knowledge_version_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  validator_outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms INTEGER,
  cost_micros INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_agent_runs_conversation_idx
  ON support_agent_runs (conversation_id, created_at DESC);

-- ── Support agent citations ──

CREATE TABLE IF NOT EXISTS support_agent_citations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES support_agent_runs(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,
  article_id TEXT,
  article_version_id TEXT,
  article_title TEXT,
  section_anchor TEXT,
  effective_date TIMESTAMPTZ,
  jurisdiction TEXT,
  audience TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_agent_citations_run_idx
  ON support_agent_citations (run_id);

CREATE INDEX IF NOT EXISTS support_agent_citations_message_idx
  ON support_agent_citations (message_id);

-- ── Support handoffs ──

CREATE TABLE IF NOT EXISTS support_handoffs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES support_cases(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN (
    'user_request', 'risk_rule', 'procedure_failure',
    'clarification_exhausted', 'negative_resolution',
    'integration_unavailable', 'attachment_unprocessable', 'manual'
  )),
  handoff_bundle JSONB NOT NULL DEFAULT '{}'::jsonb,
  queue_team TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_handoffs_conversation_idx
  ON support_handoffs (conversation_id, created_at DESC);

-- ── Support feedback ──

CREATE TABLE IF NOT EXISTS support_feedback (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES support_messages(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('helpful', 'unhelpful')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_feedback_conversation_idx
  ON support_feedback (conversation_id, created_at DESC);

-- ── Support knowledge articles ──

CREATE TABLE IF NOT EXISTS support_articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  product_area TEXT NOT NULL,
  owner_team TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'public' CHECK (audience IN ('public', 'seller', 'buyer', 'internal')),
  default_locale TEXT NOT NULL DEFAULT 'en',
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_articles_area_idx
  ON support_articles (product_area, state);

-- ── Support article versions ──

CREATE TABLE IF NOT EXISTS support_article_versions (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES support_articles(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  jurisdiction TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_article_versions_article_idx
  ON support_article_versions (article_id, version DESC);

CREATE INDEX IF NOT EXISTS support_article_versions_effective_idx
  ON support_article_versions (article_id, effective_from DESC)
  WHERE effective_to IS NULL;

-- ── Support article chunks (for lexical search) ──

CREATE TABLE IF NOT EXISTS support_article_chunks (
  id TEXT PRIMARY KEY,
  article_version_id TEXT NOT NULL REFERENCES support_article_versions(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  search_vec tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(text, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_article_chunks_search_idx
  ON support_article_chunks USING GIN (search_vec);

CREATE INDEX IF NOT EXISTS support_article_chunks_version_idx
  ON support_article_chunks (article_version_id, ordinal);

-- ── Support procedures (versioned deterministic procedures) ──

CREATE TABLE IF NOT EXISTS support_procedures (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  version INTEGER NOT NULL,
  jurisdiction TEXT,
  audience TEXT NOT NULL DEFAULT 'public' CHECK (audience IN ('public', 'seller', 'buyer', 'internal')),
  risk_tier TEXT NOT NULL CHECK (risk_tier IN ('s0', 's1', 's2', 's3', 's4', 's5')),
  definition_json JSONB NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published', 'archived')),
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (key, version)
);

CREATE INDEX IF NOT EXISTS support_procedures_key_idx
  ON support_procedures (key, version DESC);

CREATE INDEX IF NOT EXISTS support_procedures_effective_idx
  ON support_procedures (key, effective_from DESC)
  WHERE effective_to IS NULL AND state = 'published';

-- ── Support policy decisions (eligibility engine records) ──

CREATE TABLE IF NOT EXISTS support_policy_decisions (
  id TEXT PRIMARY KEY,
  procedure_key TEXT NOT NULL,
  procedure_version INTEGER NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  inputs_hash TEXT NOT NULL,
  result_code TEXT NOT NULL,
  explanation_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_policy_decisions_subject_idx
  ON support_policy_decisions (subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_policy_decisions_procedure_idx
  ON support_policy_decisions (procedure_key, procedure_version, created_at DESC);

-- ── Backfill: migrate existing support_tickets to the new case model ──
-- Existing tickets remain in support_tickets for backward compatibility during
-- the mobile release window. A support_case is created for each existing ticket
-- with a case_link to the original order context. This is idempotent.

INSERT INTO support_cases (id, conversation_id, user_id, issue_type, requested_outcome, operational_state, priority, created_at, updated_at)
SELECT
  'case_' || t.id,
  NULL,
  t.user_id,
  t.topic_id,
  t.details,
  CASE t.status
    WHEN 'open' THEN 'queued'
    WHEN 'resolved' THEN 'resolved'
    WHEN 'closed' THEN 'closed'
    ELSE 'queued'
  END,
  'normal',
  t.created_at,
  t.updated_at
FROM support_tickets t
WHERE NOT EXISTS (SELECT 1 FROM support_cases c WHERE c.id = 'case_' || t.id);

INSERT INTO support_case_links (case_id, context_kind, context_id)
SELECT
  'case_' || t.id,
  'order',
  t.order_id
FROM support_tickets t
WHERE NOT EXISTS (
  SELECT 1 FROM support_case_links l
  WHERE l.case_id = 'case_' || t.id AND l.context_kind = 'order' AND l.context_id = t.order_id
);

-- ── Comments for auditability ──

COMMENT ON TABLE support_conversations IS 'Durable support conversation thread with AI/human ownership state';
COMMENT ON TABLE support_cases IS 'Structured work record separate from conversation; operational state and resolution disposition are independent';
COMMENT ON TABLE support_case_events IS 'Event-sourced timeline for case audit and user-facing timeline projection';
COMMENT ON TABLE support_action_proposals IS 'Immutable server-authoritative action proposals with expiring approvals and unknown-outcome protocol';
COMMENT ON TABLE support_agent_runs IS 'Full trace per agent turn: model, tools, citations, policy versions, tokens, latency';
COMMENT ON TABLE support_articles IS 'Governed knowledge articles with audience, jurisdiction, and version control';
COMMENT ON TABLE support_article_chunks IS 'Text chunks with tsvector generated column for lexical search via GIN index';
COMMENT ON TABLE support_procedures IS 'Versioned deterministic procedures with risk tiers and effective intervals';
COMMENT ON TABLE support_policy_decisions IS 'Eligibility engine records: deterministic decisions with hashed inputs and explanation data';
