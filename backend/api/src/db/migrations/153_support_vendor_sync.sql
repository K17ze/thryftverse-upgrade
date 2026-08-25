-- Migration 153: Support vendor sync (outbox/inbox)
--
-- ThryftVerse owns canonical conversation/case state. A vendor (Intercom,
-- Zendesk) may own the initial human inbox presentation. Sync is performed
-- through an idempotent outbox/inbox state machine, not by holding database
-- transactions open across network calls.
--
-- A vendor outage must not lose the customer's message or case.

-- ── Vendor mappings: link canonical IDs to vendor IDs ──

CREATE TABLE IF NOT EXISTS support_vendor_mappings (
  id TEXT PRIMARY KEY,
  canonical_type TEXT NOT NULL,      -- 'conversation' | 'case' | 'message' | 'handoff'
  canonical_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,         -- 'intercom' | 'zendesk' | ...
  vendor_id TEXT NOT NULL,           -- ID in the vendor system
  vendor_url TEXT,                   -- Direct link in the vendor console
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canonical_type, canonical_id, vendor_name)
);

CREATE INDEX IF NOT EXISTS support_vendor_mappings_canonical_idx
  ON support_vendor_mappings (canonical_type, canonical_id);

CREATE INDEX IF NOT EXISTS support_vendor_mappings_vendor_idx
  ON support_vendor_mappings (vendor_name, vendor_id);

-- ── Vendor outbox: events to push to the vendor ──

CREATE TABLE IF NOT EXISTS support_vendor_outbox (
  id TEXT PRIMARY KEY,
  canonical_type TEXT NOT NULL,      -- 'conversation' | 'case' | 'message' | 'handoff'
  canonical_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  event_type TEXT NOT NULL,          -- 'create' | 'update' | 'message' | 'resolve' | 'handoff'
  payload JSONB NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'delivering' | 'delivered' | 'failed' | 'skipped'
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_vendor_outbox_pending_idx
  ON support_vendor_outbox (state, created_at)
  WHERE state IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS support_vendor_outbox_canonical_idx
  ON support_vendor_outbox (canonical_type, canonical_id);

-- ── Vendor inbox: incoming events from vendor webhooks ──

CREATE TABLE IF NOT EXISTS support_vendor_inbox (
  id TEXT PRIMARY KEY,
  vendor_name TEXT NOT NULL,
  vendor_event_id TEXT NOT NULL,     -- ID from the vendor webhook/event
  event_type TEXT NOT NULL,          -- 'reply' | 'status_change' | 'assignment' | 'note'
  vendor_conversation_id TEXT,
  vendor_ticket_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  signature_valid BOOLEAN NOT NULL DEFAULT TRUE,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_name, vendor_event_id)
);

CREATE INDEX IF NOT EXISTS support_vendor_inbox_unprocessed_idx
  ON support_vendor_inbox (created_at)
  WHERE processed_at IS NULL;

COMMENT ON TABLE support_vendor_mappings IS 'Links canonical ThryftVerse support IDs to vendor system IDs';
COMMENT ON TABLE support_vendor_outbox IS 'Outbox queue for pushing canonical events to a vendor inbox';
COMMENT ON TABLE support_vendor_inbox IS 'Inbox for receiving vendor webhook events idempotently';
