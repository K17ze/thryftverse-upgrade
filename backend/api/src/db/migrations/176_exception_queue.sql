-- 176_exception_queue.sql
-- Gate 13: Exception queue infrastructure with named owners, deadlines,
-- and SLO enforcement. No unowned P0 event should exist beyond SLO.

CREATE TYPE exception_severity AS ENUM ('p0', 'p1', 'p2', 'p3');

CREATE TABLE IF NOT EXISTS exception_queue (
  id TEXT PRIMARY KEY DEFAULT ('exq_' || encode(gen_random_bytes(12), 'hex')),
  -- What and where
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  -- Severity and SLO
  severity exception_severity NOT NULL DEFAULT 'p2',
  -- SLO deadlines (server-derived from severity)
  slo_deadline_at TIMESTAMPTZ,
  -- Ownership
  owner_team TEXT NOT NULL DEFAULT 'unowned',
  owner_user_id TEXT,
  assigned_at TIMESTAMPTZ,
  -- Resolution
  status TEXT NOT NULL DEFAULT 'open',
  -- 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'wont_fix'
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  -- Escalation
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exception_queue_status
  ON exception_queue(status, severity, created_at);
CREATE INDEX IF NOT EXISTS idx_exception_queue_owner
  ON exception_queue(owner_team, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_exception_queue_entity
  ON exception_queue(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_exception_queue_slo
  ON exception_queue(slo_deadline_at)
  WHERE status IN ('open', 'acknowledged', 'in_progress');

-- SLO configuration per severity
-- p0: 1 hour to acknowledge, 4 hours to resolve
-- p1: 4 hours to acknowledge, 24 hours to resolve
-- p2: 24 hours to acknowledge, 72 hours to resolve
-- p3: 72 hours to acknowledge, 7 days to resolve
