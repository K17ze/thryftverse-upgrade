-- seller_standards_appeals — moves the table out of the route's inline
-- CREATE TABLE IF NOT EXISTS (schema management must not run inside a hot
-- request path) and adds a partial unique index so a seller cannot file
-- duplicate open appeals for the same defect metric — the insert path
-- previously had no idempotency at all.

CREATE TABLE IF NOT EXISTS seller_standards_appeals (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  defect_metric TEXT NOT NULL,
  grounds TEXT NOT NULL CHECK (grounds IN ('factual_error', 'carrier_delay', 'system_error', 'mitigating_circumstance')),
  details TEXT NOT NULL,
  evidence_urls TEXT[],
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'upheld', 'overturned', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decision_rationale TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS seller_standards_appeals_open_uniq
  ON seller_standards_appeals (seller_id, defect_metric)
  WHERE status IN ('open', 'under_review');
